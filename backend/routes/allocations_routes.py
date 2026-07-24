from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from db import db
from models import Allocation, AllocationCreate, AllocationUpdate
from auth import get_current_vendor
from utils import apply_stock_delta

router = APIRouter(prefix='/allocations', tags=['allocations'])


async def _sync_stock_for_sold_change(vendor_id: str, product_id: str, allocation_id: str,
                                       old_sold: Optional[float], new_sold: Optional[float]):
    """Apply the incremental stock effect of actual_units_sold changing from old_sold to new_sold."""
    old_v = float(old_sold or 0)
    new_v = float(new_sold or 0)
    delta = -(new_v - old_v)
    if delta == 0:
        return
    reason = 'sale' if delta < 0 else 'sale_reversal'
    await apply_stock_delta(db, vendor_id, product_id, delta, reason, allocation_id=allocation_id)


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
    if doc.get('actual_units_sold') is not None:
        await _sync_stock_for_sold_change(
            vendor['id'], doc['product_id'], doc['id'], old_sold=0, new_sold=doc['actual_units_sold'],
        )
    return doc


@router.patch('/{aid}', response_model=Allocation)
async def update_allocation(aid: str, body: AllocationUpdate, vendor=Depends(get_current_vendor)):
    raw = body.model_dump(exclude_unset=True)
    # actual_units_sold keeps explicit nulls (clearing a recorded sale) so stock can be reversed;
    # other fields drop nulls to preserve prior no-op-on-null behavior.
    update = {
        k: v for k, v in raw.items()
        if v is not None or k == 'actual_units_sold'
    }
    old_doc = await db.allocations.find_one({'id': aid, 'vendor_id': vendor['id']}, {'_id': 0})
    if old_doc is None:
        raise HTTPException(404, 'Allocation not found')
    if update:
        await db.allocations.update_one({'id': aid, 'vendor_id': vendor['id']}, {'$set': update})
    if 'actual_units_sold' in update:
        await _sync_stock_for_sold_change(
            vendor['id'], old_doc['product_id'], aid,
            old_sold=old_doc.get('actual_units_sold'), new_sold=update['actual_units_sold'],
        )
    doc = await db.allocations.find_one({'id': aid}, {'_id': 0})
    return doc


@router.delete('/{aid}')
async def delete_allocation(aid: str, vendor=Depends(get_current_vendor)):
    doc = await db.allocations.find_one({'id': aid, 'vendor_id': vendor['id']}, {'_id': 0})
    if doc is None:
        raise HTTPException(404, 'Allocation not found')
    if doc.get('actual_units_sold'):
        await _sync_stock_for_sold_change(
            vendor['id'], doc['product_id'], aid, old_sold=doc['actual_units_sold'], new_sold=0,
        )
    await db.allocations.delete_one({'id': aid, 'vendor_id': vendor['id']})
    return {'ok': True}
