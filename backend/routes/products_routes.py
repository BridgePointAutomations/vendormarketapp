from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime, timezone
import uuid

from pymongo.errors import DuplicateKeyError

from db import db
from models import Product, ProductCreate, ProductUpdate, StockAdjustment
from auth import get_current_vendor
from utils import apply_stock_delta

router = APIRouter(prefix='/products', tags=['products'])


def _normalize_sku(sku):
    if sku is None:
        return None
    sku = sku.strip()
    return sku or None


@router.get('', response_model=List[Product])
async def list_products(vendor=Depends(get_current_vendor)):
    items = await db.products.find({'vendor_id': vendor['id']}, {'_id': 0}).sort('name', 1).to_list(500)
    return items


@router.post('', response_model=Product)
async def create_product(body: ProductCreate, vendor=Depends(get_current_vendor)):
    doc = body.model_dump()
    doc['sku'] = _normalize_sku(doc.get('sku'))
    doc.update({
        'id': str(uuid.uuid4()),
        'vendor_id': vendor['id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
    })
    try:
        await db.products.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail='SKU already in use')
    doc.pop('_id', None)
    return doc


@router.patch('/{pid}', response_model=Product)
async def update_product(pid: str, body: ProductUpdate, vendor=Depends(get_current_vendor)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if 'sku' in update:
        update['sku'] = _normalize_sku(update['sku'])
    try:
        r = await db.products.update_one({'id': pid, 'vendor_id': vendor['id']}, {'$set': update})
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail='SKU already in use')
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='Product not found')
    doc = await db.products.find_one({'id': pid}, {'_id': 0})
    return doc


@router.post('/{pid}/stock-adjustment', response_model=Product)
async def adjust_stock(pid: str, body: StockAdjustment, vendor=Depends(get_current_vendor)):
    existing = await db.products.find_one({'id': pid, 'vendor_id': vendor['id']}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Product not found')
    delta = body.quantity if body.mode == 'add' else body.quantity - float(existing.get('current_stock') or 0)
    reason = 'restock' if body.mode == 'add' else 'recount'
    doc = await apply_stock_delta(db, vendor['id'], pid, delta, reason, note=body.reason)
    return doc


@router.delete('/{pid}')
async def delete_product(pid: str, vendor=Depends(get_current_vendor)):
    r = await db.products.delete_one({'id': pid, 'vendor_id': vendor['id']})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Product not found')
    await db.allocations.delete_many({'product_id': pid, 'vendor_id': vendor['id']})
    return {'ok': True}
