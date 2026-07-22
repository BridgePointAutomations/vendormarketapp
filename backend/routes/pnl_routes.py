from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import Optional, List
from collections import defaultdict
import csv
import io

from db import db
from auth import get_current_vendor
from utils import compute_pnl, units_sold_for, resolve_booth_fee, pick_booth_fee, safe_csv_filename

router = APIRouter(prefix='/pnl', tags=['pnl'])


async def _load_products_map(vendor_id: str) -> dict:
    products = await db.products.find({'vendor_id': vendor_id}, {'_id': 0}).to_list(500)
    return {p['id']: p for p in products}


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

    booth_fee = await resolve_booth_fee(db, vendor['id'], market_id, market_date, market) or 0.0
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
        booth_fee = pick_booth_fee(md, default_fee)
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


@router.get('/season/{market_id}/export')
async def pnl_season_export(market_id: str, vendor=Depends(get_current_vendor)):
    """CSV export of the Season P&L for one market — one row per market date
    plus a totals footer. Use for tax records or spreadsheets."""
    market = await db.markets.find_one({'id': market_id, 'vendor_id': vendor['id']}, {'_id': 0})
    if not market:
        raise HTTPException(status_code=404, detail='Market not found')

    product_map = await _load_products_map(vendor['id'])
    all_allocs = await db.allocations.find({
        'vendor_id': vendor['id'], 'market_id': market_id,
    }, {'_id': 0}).sort('market_date', 1).to_list(2000)
    md_rows = await db.market_days.find({
        'vendor_id': vendor['id'], 'market_id': market_id,
    }, {'_id': 0}).to_list(500)
    md_by_date = {r['market_date']: r for r in md_rows}
    default_fee = market.get('default_booth_fee')

    grouped: dict = defaultdict(list)
    for a in all_allocs:
        grouped[a.get('market_date')].append(a)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        f"MarketOps Season P&L — {market.get('name')} — All figures are ESTIMATES based on your entries."
    ])
    writer.writerow([])
    writer.writerow(['Market Date', 'Units Sold', 'Revenue', 'COGS', 'Booth Fee', 'Net Profit', 'Has Actuals'])

    totals = {'units_sold': 0.0, 'revenue': 0.0, 'cogs': 0.0, 'booth_fee': 0.0, 'net_profit': 0.0}
    for market_date in sorted(grouped.keys()):
        allocs = grouped[market_date]
        md = md_by_date.get(market_date)
        fee = pick_booth_fee(md, default_fee) or 0.0
        pnl = compute_pnl(allocs, product_map, fee)
        for k in totals:
            totals[k] += pnl[k]
        writer.writerow([
            market_date,
            f"{pnl['units_sold']:.2f}",
            f"{pnl['revenue']:.2f}",
            f"{pnl['cogs']:.2f}",
            f"{pnl['booth_fee']:.2f}",
            f"{pnl['net_profit']:.2f}",
            'yes' if pnl['has_actuals'] else 'no',
        ])
    writer.writerow([])
    writer.writerow([
        'TOTAL',
        f"{totals['units_sold']:.2f}",
        f"{totals['revenue']:.2f}",
        f"{totals['cogs']:.2f}",
        f"{totals['booth_fee']:.2f}",
        f"{totals['net_profit']:.2f}",
        '',
    ])

    csv_data = buf.getvalue()
    filename = safe_csv_filename(market.get('name') or 'market', 'marketops_season_pnl_')
    return StreamingResponse(
        iter([csv_data]),
        media_type='text/csv',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )


@router.get('/compare')
async def pnl_compare(vendor=Depends(get_current_vendor)):
    """Rank the vendor's enrolled markets by estimated season net profit.

    Returns each market's total revenue, cogs, booth fees, net profit, days logged,
    and average net per day — computed from every allocation across all logged
    market dates. Used by the Dashboard quick-compare widget and future
    "which markets to keep next season" decisions.
    """
    markets = await db.markets.find({
        'vendor_id': vendor['id'], 'is_candidate': False,
    }, {'_id': 0}).to_list(500)
    if not markets:
        return {'markets': [], 'best_id': None, 'worst_id': None, 'is_estimate': True}

    product_map = await _load_products_map(vendor['id'])
    all_allocs = await db.allocations.find({
        'vendor_id': vendor['id'],
    }, {'_id': 0}).to_list(5000)

    # Preload every market_day for this vendor
    md_rows = await db.market_days.find({'vendor_id': vendor['id']}, {'_id': 0}).to_list(2000)
    md_by_key = {(r['market_id'], r['market_date']): r for r in md_rows}

    # Group allocations by (market_id, market_date)
    grouped: dict = defaultdict(list)
    for a in all_allocs:
        grouped[(a.get('market_id'), a.get('market_date'))].append(a)

    rows = []
    for m in markets:
        market_totals = {'revenue': 0.0, 'cogs': 0.0, 'booth_fee': 0.0, 'net_profit': 0.0, 'units_sold': 0.0}
        dates_logged: set = set()
        days_with_actuals = 0
        default_fee = m.get('default_booth_fee')
        for (mid, mdate), allocs in grouped.items():
            if mid != m['id']:
                continue
            dates_logged.add(mdate)
            md = md_by_key.get((mid, mdate))
            fee = pick_booth_fee(md, default_fee) or 0.0
            pnl = compute_pnl(allocs, product_map, fee)
            for k in market_totals:
                market_totals[k] += pnl[k]
            if pnl['has_actuals']:
                days_with_actuals += 1
        days = len(dates_logged)
        avg_net = round(market_totals['net_profit'] / days, 2) if days else 0.0
        rows.append({
            'market_id': m['id'],
            'market_name': m['name'],
            'day_of_week': m.get('day_of_week'),
            'days_logged': days,
            'days_with_actuals': days_with_actuals,
            'revenue': round(market_totals['revenue'], 2),
            'cogs': round(market_totals['cogs'], 2),
            'booth_fee': round(market_totals['booth_fee'], 2),
            'net_profit': round(market_totals['net_profit'], 2),
            'avg_net_per_day': avg_net,
        })

    # Sort by net_profit desc
    rows.sort(key=lambda r: r['net_profit'], reverse=True)
    ranked = [r for r in rows if r['days_logged'] > 0]
    return {
        'markets': rows,  # includes 0-day markets so UI can show "not tracked yet"
        'best_id': ranked[0]['market_id'] if ranked else None,
        'worst_id': ranked[-1]['market_id'] if ranked else None,
        'ranked_count': len(ranked),
        'is_estimate': True,
    }
