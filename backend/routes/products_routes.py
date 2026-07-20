from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime, timezone
import uuid

from db import db
from models import Product, ProductCreate, ProductUpdate
from auth import get_current_vendor

router = APIRouter(prefix='/products', tags=['products'])


@router.get('', response_model=List[Product])
async def list_products(vendor=Depends(get_current_vendor)):
    items = await db.products.find({'vendor_id': vendor['id']}, {'_id': 0}).sort('name', 1).to_list(500)
    return items


@router.post('', response_model=Product)
async def create_product(body: ProductCreate, vendor=Depends(get_current_vendor)):
    doc = body.model_dump()
    doc.update({
        'id': str(uuid.uuid4()),
        'vendor_id': vendor['id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
    })
    await db.products.insert_one(doc)
    doc.pop('_id', None)
    return doc


@router.patch('/{pid}', response_model=Product)
async def update_product(pid: str, body: ProductUpdate, vendor=Depends(get_current_vendor)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    r = await db.products.update_one({'id': pid, 'vendor_id': vendor['id']}, {'$set': update})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='Product not found')
    doc = await db.products.find_one({'id': pid}, {'_id': 0})
    return doc


@router.delete('/{pid}')
async def delete_product(pid: str, vendor=Depends(get_current_vendor)):
    r = await db.products.delete_one({'id': pid, 'vendor_id': vendor['id']})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Product not found')
    await db.allocations.delete_many({'product_id': pid, 'vendor_id': vendor['id']})
    return {'ok': True}
