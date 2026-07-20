from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from db import db
from models import Allocation, AllocationCreate, AllocationUpdate
from auth import get_current_vendor

router = APIRouter(prefix='/allocations', tags=['allocations'])


@router.get('', response_model=List[Allocation])
async def list_allocations(
    market_id: Optional[str] = Query(None),
    market_date: Optional[str] = Query(None),
    vendor=Depends(get_current_vendor),
):
    q = {'vendor_id': vendor['id']}
    if market_id:
        q['market_id'] = market_id
    if market_date:
        q['market_date'] = market_date
    items = await db.allocations.find(q, {'_id': 0}).sort('market_date', -1).to_list(1000)
    return items


@router.post('', response_model=Allocation)
async def create_allocation(body: AllocationCreate, vendor=Depends(get_current_vendor)):
    # verify market + product ownership
    m = await db.markets.find_one({'id': body.market_id, 'vendor_id': vendor['id']})
    if not m:
        raise HTTPException(404, 'Market not found')
    p = await db.products.find_one({'id': body.product_id, 'vendor_id': vendor['id']})
    if not p:
        raise HTTPException(404, 'Product not found')
    doc = body.model_dump()
    if doc.get('remaining_qty') is None:
        doc['remaining_qty'] = body.allocated_qty
    doc.update({
        'id': str(uuid.uuid4()),
        'vendor_id': vendor['id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
    })
    await db.allocations.insert_one(doc)
    doc.pop('_id', None)
    return doc


@router.patch('/{aid}', response_model=Allocation)
async def update_allocation(aid: str, body: AllocationUpdate, vendor=Depends(get_current_vendor)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    r = await db.allocations.update_one({'id': aid, 'vendor_id': vendor['id']}, {'$set': update})
    if r.matched_count == 0:
        raise HTTPException(404, 'Allocation not found')
    doc = await db.allocations.find_one({'id': aid}, {'_id': 0})
    return doc


@router.delete('/{aid}')
async def delete_allocation(aid: str, vendor=Depends(get_current_vendor)):
    r = await db.allocations.delete_one({'id': aid, 'vendor_id': vendor['id']})
    if r.deleted_count == 0:
        raise HTTPException(404, 'Allocation not found')
    return {'ok': True}
