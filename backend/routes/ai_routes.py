from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone, date
import json
import uuid

from db import db
from models import AIRestockRequest, AIMarketFitRequest, AIRevenueRequest
from auth import require_paid
from ai_client import ask_claude

router = APIRouter(prefix='/ai', tags=['ai'])


async def _load_market(vendor_id: str, market_id: str):
    m = await db.markets.find_one({'id': market_id, 'vendor_id': vendor_id}, {'_id': 0})
    if not m:
        raise HTTPException(404, 'Market not found')
    return m


@router.post('/restock')
async def restock(body: AIRestockRequest, vendor=Depends(require_paid)):
    market = await _load_market(vendor['id'], body.market_id)
    products = await db.products.find({'vendor_id': vendor['id']}, {'_id': 0}).to_list(200)
    history = await db.allocations.find({
        'vendor_id': vendor['id'],
        'market_id': body.market_id,
    }, {'_id': 0}).sort('market_date', -1).to_list(60)

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
            }
            for h in history
        ],
    }
    prompt = (
        'Suggest how many units of each product to allocate for the next market day.\n'
        'Return a JSON array (one object per product) with EXACT keys:\n'
        '[{"product_id": str, "suggested_qty": int, "rationale": str, '
        '"confidence": "low"|"medium"|"high"}]\n'
        f'CONTEXT:\n{json.dumps(payload)}'
    )
    result = await ask_claude(prompt, session_hint=f"restock-{body.market_id}")
    if not isinstance(result, list):
        raise HTTPException(500, 'AI returned invalid shape')
    return {'market_id': body.market_id, 'market_date': body.market_date, 'suggestions': result}


@router.post('/market-fit')
async def market_fit(body: AIMarketFitRequest, vendor=Depends(require_paid)):
    candidate = await _load_market(vendor['id'], body.market_id)
    current = await db.markets.find({
        'vendor_id': vendor['id'],
        'id': {'$ne': body.market_id},
        'status': {'$in': ['approved', 'active']},
    }, {'_id': 0}).to_list(50)
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
    return result


@router.post('/revenue')
async def revenue(body: AIRevenueRequest, vendor=Depends(require_paid)):
    market = await _load_market(vendor['id'], body.market_id)
    products = await db.products.find({'vendor_id': vendor['id']}, {'_id': 0}).to_list(200)
    price_map = {p['id']: p.get('unit_price', 0) for p in products}
    history = await db.allocations.find({
        'vendor_id': vendor['id'],
        'market_id': body.market_id,
    }, {'_id': 0}).sort('market_date', -1).to_list(60)

    # sell-through per product
    sell_through = {}
    for h in history:
        pid = h.get('product_id')
        alloc = h.get('allocated_qty') or 0
        rem = h.get('remaining_qty') or 0
        if alloc > 0:
            sold_frac = max(0.0, min(1.0, (alloc - rem) / alloc))
            sell_through.setdefault(pid, []).append(round(sold_frac, 2))

    if body.suggested:
        product_rows = [
            {
                'product_id': s.get('product_id'),
                'unit_price': price_map.get(s.get('product_id'), 0),
                'suggested_qty': s.get('suggested_qty', 0),
            }
            for s in body.suggested
        ]
    else:
        product_rows = [
            {
                'product_id': p['id'],
                'unit_price': p.get('unit_price', 0),
                'suggested_qty': p.get('current_stock', 0),
            }
            for p in products
        ]

    payload = {
        'market': {'market_id': market['id'], 'name': market['name']},
        'market_date': body.market_date,
        'products': product_rows,
        'history_sell_through': sell_through,
    }
    prompt = (
        'Project total revenue for this market day using the suggested quantities, '
        'unit prices, and historical sell-through rates.\n'
        'Return a JSON object with EXACT keys:\n'
        '{"market_id": str, "market_date": str (YYYY-MM-DD), '
        '"projected_revenue": number, "rationale": str, '
        '"confidence": "low"|"medium"|"high"}\n'
        f'CONTEXT:\n{json.dumps(payload)}'
    )
    result = await ask_claude(prompt, session_hint=f"rev-{body.market_id}")
    if not isinstance(result, dict):
        raise HTTPException(500, 'AI returned invalid shape')

    # Upsert cache
    result['id'] = str(uuid.uuid4())
    result['vendor_id'] = vendor['id']
    result['generated_at'] = datetime.now(timezone.utc).isoformat()
    await db.revenue_projections.update_one(
        {'vendor_id': vendor['id'], 'market_id': body.market_id, 'market_date': body.market_date},
        {'$set': result},
        upsert=True,
    )
    result.pop('_id', None)
    return result


@router.get('/revenue/rollup/{market_id}')
async def revenue_rollup(market_id: str, vendor=Depends(require_paid)):
    await _load_market(vendor['id'], market_id)
    rows = await db.revenue_projections.find({
        'vendor_id': vendor['id'], 'market_id': market_id
    }, {'_id': 0}).sort('market_date', 1).to_list(200)
    if not rows:
        return {'market_id': market_id, 'avg_per_visit': 0, 'total': 0, 'visits': 0, 'trend': 'flat', 'series': []}
    values = [r.get('projected_revenue', 0) for r in rows]
    total = sum(values)
    avg = total / len(values)
    trend = 'flat'
    if len(values) >= 2:
        first_half = sum(values[:len(values)//2]) / max(1, len(values)//2)
        second_half = sum(values[len(values)//2:]) / max(1, len(values) - len(values)//2)
        if second_half > first_half * 1.05:
            trend = 'up'
        elif second_half < first_half * 0.95:
            trend = 'down'
    return {
        'market_id': market_id,
        'avg_per_visit': round(avg, 2),
        'total': round(total, 2),
        'visits': len(values),
        'trend': trend,
        'series': [{'date': r.get('market_date'), 'value': r.get('projected_revenue', 0)} for r in rows],
    }
