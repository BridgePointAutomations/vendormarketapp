from fastapi import APIRouter, Depends
from datetime import date, timedelta
from collections import defaultdict

from db import db
from auth import get_current_vendor
from routes.compliance_routes import _compute_status

router = APIRouter(prefix='/dashboard', tags=['dashboard'])


@router.get('')
async def dashboard(vendor=Depends(get_current_vendor)):
    vid = vendor['id']
    today = date.today()
    week_end = today + timedelta(days=7)

    # markets this vendor has
    markets = await db.markets.find({'vendor_id': vid, 'is_candidate': False}, {'_id': 0}).to_list(200)
    market_map = {m['id']: m for m in markets}

    # allocations upcoming
    allocs = await db.allocations.find({'vendor_id': vid}, {'_id': 0}).to_list(500)
    upcoming_allocs = []
    for a in allocs:
        try:
            d = date.fromisoformat(a['market_date'][:10])
            if today <= d <= week_end:
                upcoming_allocs.append(a)
        except Exception:
            continue

    # compliance
    compliance = await db.compliance_items.find({'vendor_id': vid}, {'_id': 0}).to_list(500)
    for c in compliance:
        c['status'] = _compute_status(c.get('expiration_date', ''))

    action_needed_items = [c for c in compliance if c['status'] in ('expiring', 'expired')]

    # products (for name lookup + low stock check)
    products = await db.products.find({'vendor_id': vid}, {'_id': 0}).to_list(500)
    product_map = {p['id']: p for p in products}

    # per-market: ready or action needed based on linked compliance + vendor-wide
    vendor_wide_active = all(c['status'] == 'active' for c in compliance if c.get('market_id') in (None, ''))
    market_cards = []
    for m in markets:
        linked = [c for c in compliance if c.get('market_id') == m['id']]
        market_ready = vendor_wide_active and all(c['status'] == 'active' for c in linked)
        # upcoming allocations for this market
        m_allocs = [a for a in upcoming_allocs if a['market_id'] == m['id']]
        # low stock warnings
        warnings = []
        for a in m_allocs:
            p = product_map.get(a['product_id'])
            if p and a.get('allocated_qty', 0) < (p.get('low_stock_threshold') or 0):
                warnings.append({
                    'product_id': p['id'],
                    'name': p['name'],
                    'allocated_qty': a['allocated_qty'],
                    'threshold': p['low_stock_threshold'],
                })
        # next date for this market from allocations
        next_dates = sorted([a['market_date'] for a in m_allocs])
        market_cards.append({
            'id': m['id'],
            'name': m['name'],
            'day_of_week': m.get('day_of_week'),
            'status_label': m.get('status'),
            'ready': market_ready,
            'address': m.get('address'),
            'next_date': next_dates[0] if next_dates else None,
            'upcoming_alloc_count': len(m_allocs),
            'warnings': warnings,
            'compliance_issues': [
                {'id': c['id'], 'name': c['name'], 'status': c['status']}
                for c in linked if c['status'] != 'active'
            ],
        })

    # projected revenue rollup (sum of cached upcoming projections in the week)
    proj_rows = await db.revenue_projections.find({'vendor_id': vid}, {'_id': 0}).to_list(500)
    week_revenue = 0.0
    for r in proj_rows:
        try:
            d = date.fromisoformat(r.get('market_date', '')[:10])
            if today <= d <= week_end:
                week_revenue += r.get('projected_revenue', 0) or 0
        except Exception:
            continue

    # reminders (unread — sent in last 30 days)
    reminders = await db.reminders_log.find({'vendor_id': vid}, {'_id': 0}).sort('sent_at', -1).limit(10).to_list(10)

    return {
        'stats': {
            'markets_this_week': len({a['market_id'] for a in upcoming_allocs}),
            'action_needed_count': len(action_needed_items),
            'projected_week_revenue': round(week_revenue, 2),
            'total_markets': len(markets),
        },
        'market_cards': market_cards,
        'action_needed': [
            {
                'id': c['id'],
                'name': c['name'],
                'type': c['type'],
                'expiration_date': c['expiration_date'],
                'status': c['status'],
                'market_id': c.get('market_id'),
            }
            for c in action_needed_items
        ],
        'reminders': reminders,
        'tier': vendor.get('tier', 'free'),
    }
