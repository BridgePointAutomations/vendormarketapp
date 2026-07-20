from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from collections import defaultdict

from db import db
from auth import get_current_vendor
from utils import compute_pnl, units_sold_for

router = APIRouter(prefix='/pnl', tags=['pnl'])


async def _load_products_map(vendor_id: str) -> dict:
    products = await db.products.find({'vendor_id': vendor_id}, {'_id': 0}).to_list(500)
    return {p['id']: p for p in products}


async def _resolve_booth_fee(vendor_id: str, market_id: str, market_date: str) -> Optional[float]:
    """Return booth fee for a specific market date.

    Priority: explicit market_days.booth_fee > markets.default_booth_fee > None (0).
    """
    md = await db.market_days.find_one({
        'vendor_id': vendor_id, 'market_id': market_id, 'market_date': market_date,
    }, {'_id': 0})
    if md is not None and md.get('booth_fee') is not None:
        return float(md['booth_fee'])
    market = await db.markets.find_one({'id': market_id, 'vendor_id': vendor_id}, {'_id': 0})
    if market and market.get('default_booth_fee') is not None:
        return float(market['default_booth_fee'])
    return None


@router.get('/day')
async def pnl_day(
    market_id: str = Query(...),
    market_date: str = Query(...),
    vendor=Depends(get_current_vendor),
):
    """Estimated P&L for a specific (market, date). All figures are estimates."""
    market = await db.markets.find_one({'id': market_id, 'vendor_id': vendor['id']}, {'_id': 0})
    if not market:
        raise HTTPException(status_code=404, detail='Market not found')
    product_map = await _load_products_map(vendor['id'])
    allocations = await db.allocations.find({
        'vendor_id': vendor['id'], 'market_id': market_id, 'market_date': market_date,
    }, {'_id': 0}).to_list(500)

    booth_fee = await _resolve_booth_fee(vendor['id'], market_id, market_date) or 0.0
    pnl = compute_pnl(allocations, product_map, booth_fee)
    return {
        'market_id': market_id,
        'market_date': market_date,
        **pnl,
    }


@router.get('/season/{market_id}')
async def pnl_season(market_id: str, vendor=Depends(get_current_vendor)):
    """Estimated season P&L: aggregate net profit across every market date with any
    logged allocation for this market. All figures are estimates."""
    market = await db.markets.find_one({'id': market_id, 'vendor_id': vendor['id']}, {'_id': 0})
    if not market:
        raise HTTPException(status_code=404, detail='Market not found')

    product_map = await _load_products_map(vendor['id'])
    all_allocs = await db.allocations.find({
        'vendor_id': vendor['id'], 'market_id': market_id,
    }, {'_id': 0}).sort('market_date', 1).to_list(2000)

    # Group by market_date
    grouped: dict = defaultdict(list)
    for a in all_allocs:
        grouped[a.get('market_date')].append(a)

    # Preload all market_days once
    md_rows = await db.market_days.find({
        'vendor_id': vendor['id'], 'market_id': market_id,
    }, {'_id': 0}).to_list(500)
    md_by_date = {r['market_date']: r for r in md_rows}
    default_fee = market.get('default_booth_fee')

    days_out: List[dict] = []
    totals = {'revenue': 0.0, 'cogs': 0.0, 'booth_fee': 0.0, 'net_profit': 0.0, 'units_sold': 0.0}
    days_with_actuals = 0

    for market_date in sorted(grouped.keys()):
        allocs = grouped[market_date]
        md = md_by_date.get(market_date)
        booth_fee = None
        if md is not None and md.get('booth_fee') is not None:
            booth_fee = float(md['booth_fee'])
        elif default_fee is not None:
            booth_fee = float(default_fee)
        pnl = compute_pnl(allocs, product_map, booth_fee or 0.0)
        for k in ('revenue', 'cogs', 'booth_fee', 'net_profit', 'units_sold'):
            totals[k] += pnl[k]
        if pnl['has_actuals']:
            days_with_actuals += 1
        days_out.append({
            'market_date': market_date,
            'revenue': pnl['revenue'],
            'cogs': pnl['cogs'],
            'booth_fee': pnl['booth_fee'],
            'net_profit': pnl['net_profit'],
            'units_sold': pnl['units_sold'],
            'has_actuals': pnl['has_actuals'],
        })

    days_logged = len(days_out)
    avg_net = round(totals['net_profit'] / days_logged, 2) if days_logged else 0.0

    return {
        'market_id': market_id,
        'market_name': market.get('name'),
        'days_logged': days_logged,
        'days_with_actuals': days_with_actuals,
        'totals': {k: round(v, 2) for k, v in totals.items()},
        'avg_net_per_day': avg_net,
        'days': days_out,
        'is_estimate': True,
    }


@router.get('/dashboard-summary')
async def pnl_dashboard_summary(vendor=Depends(get_current_vendor)):
    """Small rollup for dashboard tiles: net profit last 7 days across all markets."""
    from datetime import date, timedelta
    today = date.today()
    seven_ago = today - timedelta(days=7)

    allocs = await db.allocations.find({
        'vendor_id': vendor['id'],
        'market_date': {'$gte': seven_ago.isoformat(), '$lte': today.isoformat()},
    }, {'_id': 0}).to_list(2000)
    if not allocs:
        return {'net_profit_7d': 0.0, 'days_logged': 0, 'is_estimate': True}

    product_map = await _load_products_map(vendor['id'])

    # Preload market default fees + market_days for the relevant dates
    market_ids = list({a.get('market_id') for a in allocs})
    markets = await db.markets.find({'id': {'$in': market_ids}, 'vendor_id': vendor['id']}, {'_id': 0}).to_list(500)
    default_fee_by_market = {m['id']: m.get('default_booth_fee') for m in markets}

    dates = list({a.get('market_date') for a in allocs})
    md_rows = await db.market_days.find({
        'vendor_id': vendor['id'],
        'market_id': {'$in': market_ids},
        'market_date': {'$in': dates},
    }, {'_id': 0}).to_list(2000)
    md_map = {(r['market_id'], r['market_date']): r for r in md_rows}

    grouped: dict = defaultdict(list)
    for a in allocs:
        grouped[(a.get('market_id'), a.get('market_date'))].append(a)

    net = 0.0
    days_logged = 0
    for (mid, mdate), rows in grouped.items():
        md = md_map.get((mid, mdate))
        fee = None
        if md is not None and md.get('booth_fee') is not None:
            fee = float(md['booth_fee'])
        else:
            df = default_fee_by_market.get(mid)
            fee = float(df) if df is not None else 0.0
        pnl = compute_pnl(rows, product_map, fee)
        net += pnl['net_profit']
        days_logged += 1
    return {'net_profit_7d': round(net, 2), 'days_logged': days_logged, 'is_estimate': True}
