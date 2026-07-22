from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import Any, Optional
import json
import hashlib
import uuid

from db import db
from models import AIRestockRequest, AIMarketFitRequest, AIRevenueRequest
from auth import require_paid
from ai_client import ask_claude
from utils import resolve_booth_fee

router = APIRouter(prefix='/ai', tags=['ai'])

# Minimum distinct market dates required before AI restock/revenue will make
# projections. Below this threshold we return an explicit `insufficient_history`
# state instead of asking Claude (which would otherwise guess).
MIN_HISTORY_DATES = 3


async def _load_market(vendor_id: str, market_id: str):
    m = await db.markets.find_one({'id': market_id, 'vendor_id': vendor_id}, {'_id': 0})
    if not m:
        raise HTTPException(404, 'Market not found')
    return m


async def _history_fingerprint(vendor_id: str, market_id: str) -> str:
    """A stable short fingerprint of vendor+market's tracked data. When the
    underlying allocations / market_days / products change, this fingerprint
    changes and any cached AI result is invalidated on next request."""
    n_alloc = await db.allocations.count_documents({'vendor_id': vendor_id, 'market_id': market_id})
    n_md = await db.market_days.count_documents({'vendor_id': vendor_id, 'market_id': market_id})
    n_prod = await db.products.count_documents({'vendor_id': vendor_id})
    latest_alloc = await db.allocations.find_one(
        {'vendor_id': vendor_id, 'market_id': market_id},
        {'_id': 0, 'created_at': 1}, sort=[('created_at', -1)],
    )
    latest_md = await db.market_days.find_one(
        {'vendor_id': vendor_id, 'market_id': market_id},
        {'_id': 0, 'created_at': 1}, sort=[('created_at', -1)],
    )
    parts = [
        str(n_alloc), str(n_md), str(n_prod),
        (latest_alloc or {}).get('created_at', ''),
        (latest_md or {}).get('created_at', ''),
    ]
    raw = '|'.join(parts).encode()
    return hashlib.md5(raw).hexdigest()[:12]


async def _cache_get(endpoint: str, key: dict, fingerprint: str) -> Optional[dict]:
    doc = await db.ai_cache.find_one({'endpoint': endpoint, **key}, {'_id': 0})
    if not doc:
        return None
    if doc.get('fingerprint') != fingerprint:
        return None
    return doc.get('payload')


async def _cache_set(endpoint: str, key: dict, fingerprint: str, payload: Any) -> None:
    await db.ai_cache.update_one(
        {'endpoint': endpoint, **key},
        {'$set': {
            'endpoint': endpoint,
            **key,
            'fingerprint': fingerprint,
            'payload': payload,
            'cached_at': datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )


def _distinct_dates(history: list) -> set:
    return {h.get('market_date') for h in history if h.get('market_date')}


# ------------------------------ Restock ------------------------------
@router.post('/restock')
async def restock(body: AIRestockRequest, vendor=Depends(require_paid)):
    market = await _load_market(vendor['id'], body.market_id)
    products = await db.products.find({'vendor_id': vendor['id']}, {'_id': 0}).to_list(200)
    history = await db.allocations.find({
        'vendor_id': vendor['id'],
        'market_id': body.market_id,
    }, {'_id': 0}).sort('market_date', -1).to_list(60)

    distinct_dates = _distinct_dates(history)

    # Phase C: explicit insufficient-history state (no AI call, no guessing)
    if len(distinct_dates) < MIN_HISTORY_DATES:
        return {
            'market_id': body.market_id,
            'market_date': body.market_date,
            'insufficient_history': True,
            'history_dates_logged': len(distinct_dates),
            'min_required_dates': MIN_HISTORY_DATES,
            'message': (
                f"Not enough history yet — log at least {MIN_HISTORY_DATES} market days "
                f"at this market before AI restock suggestions become reliable. "
                f"You currently have {len(distinct_dates)} logged."
            ),
            'suggestions': [],
        }

    # DB cache check (fingerprint auto-invalidates on new data)
    fp = await _history_fingerprint(vendor['id'], body.market_id)
    cache_key = {
        'vendor_id': vendor['id'],
        'market_id': body.market_id,
        'market_date': body.market_date,
    }
    cached = await _cache_get('restock', cache_key, fp)
    if cached:
        return {**cached, 'cached': True}

    payload = {
        'vendor': {
            'business_name': vendor.get('business_name'),
            'category': vendor.get('category'),
        },
        'market': {'name': market['name'], 'day': market.get('day_of_week')},
        'upcoming_market_date': body.market_date,
        'products': [
            {
                'product_id': p['id'],
                'name': p['name'],
                'unit_price': p.get('unit_price', 0),
                'unit_cost': p.get('unit_cost'),
                'low_stock_threshold': p.get('low_stock_threshold', 0),
            }
            for p in products
        ],
        'history': [
            {
                'date': h.get('market_date'),
                'product_id': h.get('product_id'),
                'allocated': h.get('allocated_qty'),
                'remaining': h.get('remaining_qty'),
                'actual_units_sold': h.get('actual_units_sold'),
            }
            for h in history
        ],
        'history_dates_logged': len(distinct_dates),
    }
    prompt = (
        'Suggest how many units of each product to allocate for the next market day. '
        'Use only the actual history provided. Do NOT invent numbers. '
        'If a specific product has no history, set confidence="low" and use the '
        'low_stock_threshold as a floor.\n'
        'Return a JSON array (one object per product) with EXACT keys:\n'
        '[{"product_id": str, "suggested_qty": int, "rationale": str, '
        '"confidence": "low"|"medium"|"high"}]\n'
        f'CONTEXT:\n{json.dumps(payload)}'
    )
    result = await ask_claude(prompt, session_hint=f"restock-{body.market_id}")
    if not isinstance(result, list):
        raise HTTPException(500, 'AI returned invalid shape')

    response = {
        'market_id': body.market_id,
        'market_date': body.market_date,
        'insufficient_history': False,
        'history_dates_logged': len(distinct_dates),
        'suggestions': result,
    }
    await _cache_set('restock', cache_key, fp, response)
    return response


# ------------------------------ Market Fit ------------------------------
@router.post('/market-fit')
async def market_fit(body: AIMarketFitRequest, vendor=Depends(require_paid)):
    candidate = await _load_market(vendor['id'], body.market_id)
    current = await db.markets.find({
        'vendor_id': vendor['id'],
        'id': {'$ne': body.market_id},
        'status': {'$in': ['approved', 'active']},
    }, {'_id': 0}).to_list(50)

    # Cache: keyed on vendor + candidate market + fingerprint of current markets
    current_ids = sorted(m['id'] for m in current)
    ctx_hash = hashlib.md5(
        (candidate.get('id', '') + '|' + ','.join(current_ids)).encode()
    ).hexdigest()[:12]
    cache_key = {'vendor_id': vendor['id'], 'market_id': body.market_id}
    cached = await _cache_get('market_fit', cache_key, ctx_hash)
    if cached:
        return {**cached, 'cached': True}

    days = list({m.get('day_of_week') for m in current if m.get('day_of_week')})
    payload = {
        'vendor': {
            'business_name': vendor.get('business_name'),
            'category': vendor.get('category'),
            'current_markets': [
                {'name': m['name'], 'day': m.get('day_of_week')}
                for m in current
            ],
            'days_committed': days,
        },
        'candidate_market': {
            'market_id': candidate['id'],
            'name': candidate['name'],
            'day_of_week': candidate.get('day_of_week'),
            'season_start': candidate.get('season_start'),
            'season_end': candidate.get('season_end'),
            'category_focus': candidate.get('category_focus'),
            'address': candidate.get('address'),
        },
    }
    prompt = (
        'Evaluate whether this candidate market is a good fit for the vendor.\n'
        'Return a JSON object with EXACT keys:\n'
        '{"market_id": str, "fit_assessment": "strong_fit"|"possible_fit"|"poor_fit", '
        '"reason": str, "confidence": "low"|"medium"|"high"}\n'
        f'CONTEXT:\n{json.dumps(payload)}'
    )
    result = await ask_claude(prompt, session_hint=f"mfit-{body.market_id}")
    if not isinstance(result, dict):
        raise HTTPException(500, 'AI returned invalid shape')

    await _cache_set('market_fit', cache_key, ctx_hash, result)
    return result


# ------------------------------ Revenue ------------------------------
@router.post('/revenue')
async def revenue(body: AIRevenueRequest, vendor=Depends(require_paid)):
    market = await _load_market(vendor['id'], body.market_id)
    products = await db.products.find({'vendor_id': vendor['id']}, {'_id': 0}).to_list(200)
    product_by_id = {p['id']: p for p in products}
    price_map = {p['id']: float(p.get('unit_price') or 0) for p in products}
    cost_map = {p['id']: (float(p['unit_cost']) if p.get('unit_cost') is not None else None) for p in products}

    history = await db.allocations.find({
        'vendor_id': vendor['id'],
        'market_id': body.market_id,
    }, {'_id': 0}).sort('market_date', -1).to_list(60)

    distinct_dates = _distinct_dates(history)
    booth_fee = await resolve_booth_fee(db, vendor['id'], body.market_id, body.market_date, market) or 0.0

    # sell-through per product across all history
    sell_through: dict = {}
    for h in history:
        pid = h.get('product_id')
        alloc = h.get('allocated_qty') or 0
        rem = h.get('remaining_qty') or 0
        if alloc > 0:
            sold_frac = max(0.0, min(1.0, (alloc - rem) / alloc))
            sell_through.setdefault(pid, []).append(round(sold_frac, 2))

    # Build product_rows from suggested (if provided) OR current stock fallback
    if body.suggested:
        product_rows = [
            {
                'product_id': s.get('product_id'),
                'name': product_by_id.get(s.get('product_id'), {}).get('name'),
                'unit_price': price_map.get(s.get('product_id'), 0),
                'unit_cost': cost_map.get(s.get('product_id')),
                'suggested_qty': s.get('suggested_qty', 0),
            }
            for s in body.suggested
        ]
    else:
        product_rows = [
            {
                'product_id': p['id'],
                'name': p['name'],
                'unit_price': float(p.get('unit_price') or 0),
                'unit_cost': (float(p['unit_cost']) if p.get('unit_cost') is not None else None),
                'suggested_qty': p.get('current_stock', 0),
            }
            for p in products
        ]

    # Phase C: insufficient-history state — no AI call, no guessing.
    if len(distinct_dates) < MIN_HISTORY_DATES:
        return {
            'market_id': body.market_id,
            'market_date': body.market_date,
            'insufficient_history': True,
            'history_dates_logged': len(distinct_dates),
            'min_required_dates': MIN_HISTORY_DATES,
            'booth_fee': round(booth_fee, 2),
            'message': (
                f"Not enough history yet — log at least {MIN_HISTORY_DATES} market days "
                f"at this market before AI projections become reliable. "
                f"You currently have {len(distinct_dates)} logged."
            ),
            'projected_revenue': None,
            'projected_cogs': None,
            'projected_profit': None,
            'confidence': 'low',
            'rationale': 'AI projection skipped because history is too sparse.',
        }

    # DB cache check
    fp = await _history_fingerprint(vendor['id'], body.market_id)
    # Include suggested quantities in the key so different scenarios don't collide
    sug_fp = hashlib.md5(json.dumps([
        (r['product_id'], r['suggested_qty']) for r in sorted(product_rows, key=lambda x: x['product_id'] or '')
    ], default=str).encode()).hexdigest()[:8]
    combined_fp = f"{fp}-{sug_fp}"
    cache_key = {
        'vendor_id': vendor['id'],
        'market_id': body.market_id,
        'market_date': body.market_date,
    }
    cached = await _cache_get('revenue', cache_key, combined_fp)
    if cached:
        return {**cached, 'cached': True}

    payload = {
        'market': {'market_id': market['id'], 'name': market['name']},
        'market_date': body.market_date,
        'booth_fee': round(booth_fee, 2),
        'products': product_rows,
        'history_sell_through': sell_through,
        'history_dates_logged': len(distinct_dates),
    }
    prompt = (
        'Project revenue AND profit for this market day using only the provided '
        'quantities, prices, costs, booth fee, and historical sell-through.\n'
        'projected_revenue = sum(unit_price × expected_units_sold_per_product).\n'
        'projected_cogs = sum(unit_cost × expected_units_sold_per_product) — treat missing unit_cost as 0.\n'
        'projected_profit = projected_revenue − projected_cogs − booth_fee.\n'
        'Never invent numbers; base everything on history_sell_through.\n'
        'Return a JSON object with EXACT keys:\n'
        '{"market_id": str, "market_date": str, '
        '"projected_revenue": number, "projected_cogs": number, '
        '"projected_booth_fee": number, "projected_profit": number, '
        '"rationale": str, "confidence": "low"|"medium"|"high"}\n'
        f'CONTEXT:\n{json.dumps(payload)}'
    )
    result = await ask_claude(prompt, session_hint=f"rev-{body.market_id}")
    if not isinstance(result, dict):
        raise HTTPException(500, 'AI returned invalid shape')

    # Guarantee shape (backfill defaults if AI omits a field)
    result.setdefault('projected_booth_fee', round(booth_fee, 2))
    if result.get('projected_profit') is None:
        try:
            rev_v = float(result.get('projected_revenue') or 0)
            cogs_v = float(result.get('projected_cogs') or 0)
            fee_v = float(result.get('projected_booth_fee') or booth_fee or 0)
            result['projected_profit'] = round(rev_v - cogs_v - fee_v, 2)
        except (TypeError, ValueError):
            result['projected_profit'] = None
    result['insufficient_history'] = False
    result['history_dates_logged'] = len(distinct_dates)

    # Persist in the legacy revenue_projections collection (for rollups) AND ai_cache
    row = {
        **result,
        'id': str(uuid.uuid4()),
        'vendor_id': vendor['id'],
        'market_id': body.market_id,
        'market_date': body.market_date,
        'generated_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.revenue_projections.update_one(
        {'vendor_id': vendor['id'], 'market_id': body.market_id, 'market_date': body.market_date},
        {'$set': row},
        upsert=True,
    )
    row.pop('_id', None)
    await _cache_set('revenue', cache_key, combined_fp, row)
    return row


# ------------------------------ Rollup ------------------------------
@router.get('/revenue/rollup/{market_id}')
async def revenue_rollup(market_id: str, vendor=Depends(require_paid)):
    await _load_market(vendor['id'], market_id)
    rows = await db.revenue_projections.find({
        'vendor_id': vendor['id'], 'market_id': market_id
    }, {'_id': 0}).sort('market_date', 1).to_list(200)
    if not rows:
        return {
            'market_id': market_id,
            'avg_per_visit': 0, 'total': 0, 'visits': 0,
            'avg_profit_per_visit': 0, 'total_profit': 0,
            'trend': 'flat', 'series': [],
        }
    revenues = [float(r.get('projected_revenue') or 0) for r in rows]
    profits = [float(r.get('projected_profit') or 0) for r in rows]
    total_rev = sum(revenues)
    total_profit = sum(profits)
    avg_rev = total_rev / len(revenues)
    avg_profit = total_profit / len(profits) if profits else 0.0
    trend = 'flat'
    if len(revenues) >= 2:
        half = len(revenues) // 2
        first_half = sum(revenues[:half]) / max(1, half)
        second_half = sum(revenues[half:]) / max(1, len(revenues) - half)
        if second_half > first_half * 1.05:
            trend = 'up'
        elif second_half < first_half * 0.95:
            trend = 'down'
    return {
        'market_id': market_id,
        'avg_per_visit': round(avg_rev, 2),
        'total': round(total_rev, 2),
        'avg_profit_per_visit': round(avg_profit, 2),
        'total_profit': round(total_profit, 2),
        'visits': len(revenues),
        'trend': trend,
        'series': [
            {
                'date': r.get('market_date'),
                'value': float(r.get('projected_revenue') or 0),
                'profit': float(r.get('projected_profit') or 0),
            }
            for r in rows
        ],
    }
