from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from db import db
from models import Market, MarketCreate, MarketUpdate
from auth import get_current_vendor

router = APIRouter(prefix='/markets', tags=['markets'])


@router.get('', response_model=List[Market])
async def list_markets(
    is_candidate: Optional[bool] = Query(None),
    vendor=Depends(get_current_vendor),
):
    q = {'vendor_id': vendor['id']}
    if is_candidate is not None:
        q['is_candidate'] = is_candidate
    items = await db.markets.find(q, {'_id': 0}).sort('name', 1).to_list(500)
    return items


@router.post('', response_model=Market)
async def create_market(body: MarketCreate, vendor=Depends(get_current_vendor)):
    doc = body.model_dump()
    doc.update({
        'id': str(uuid.uuid4()),
        'vendor_id': vendor['id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
    })
    await db.markets.insert_one(doc)
    doc.pop('_id', None)
    return doc


@router.patch('/{mid}', response_model=Market)
async def update_market(mid: str, body: MarketUpdate, vendor=Depends(get_current_vendor)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    r = await db.markets.update_one({'id': mid, 'vendor_id': vendor['id']}, {'$set': update})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='Market not found')
    doc = await db.markets.find_one({'id': mid}, {'_id': 0})
    return doc


@router.delete('/{mid}')
async def delete_market(mid: str, vendor=Depends(get_current_vendor)):
    r = await db.markets.delete_one({'id': mid, 'vendor_id': vendor['id']})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Market not found')
    await db.allocations.delete_many({'market_id': mid, 'vendor_id': vendor['id']})
    await db.compliance_items.update_many(
        {'market_id': mid, 'vendor_id': vendor['id']},
        {'$set': {'market_id': None}},
    )
    await db.revenue_projections.delete_many({'market_id': mid, 'vendor_id': vendor['id']})
    return {'ok': True}
