from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional

from db import db
from models import MarketDay, MarketDayCreate, MarketDayUpdate
from auth import get_current_vendor
from utils import uid, iso_now

router = APIRouter(prefix='/market-days', tags=['market-days'])


@router.get('', response_model=List[MarketDay])
async def list_market_days(
    market_id: Optional[str] = Query(None),
    market_date: Optional[str] = Query(None),
    vendor=Depends(get_current_vendor),
):
    q = {'vendor_id': vendor['id']}
    if market_id:
        q['market_id'] = market_id
    if market_date:
        q['market_date'] = market_date
    rows = await db.market_days.find(q, {'_id': 0}).sort('market_date', 1).to_list(500)
    return rows


@router.post('', response_model=MarketDay)
async def upsert_market_day(body: MarketDayCreate, vendor=Depends(get_current_vendor)):
    """Create or update the market_day for (vendor_id, market_id, market_date).

    If `booth_fee` is None and no existing row exists, inherit from
    `markets.default_booth_fee`. If `booth_fee` is None and a row exists,
    keep the existing fee.
    """
    market = await db.markets.find_one({'id': body.market_id, 'vendor_id': vendor['id']}, {'_id': 0})
    if not market:
        raise HTTPException(status_code=404, detail='Market not found')

    existing = await db.market_days.find_one({
        'vendor_id': vendor['id'],
        'market_id': body.market_id,
        'market_date': body.market_date,
    }, {'_id': 0})

    if existing:
        update = {}
        if body.booth_fee is not None:
            update['booth_fee'] = float(body.booth_fee)
        if body.notes is not None:
            update['notes'] = body.notes
        if update:
            await db.market_days.update_one({'id': existing['id']}, {'$set': update})
            existing.update(update)
        return existing

    booth_fee = body.booth_fee
    if booth_fee is None:
        booth_fee = market.get('default_booth_fee')
    doc = {
        'id': uid(),
        'vendor_id': vendor['id'],
        'market_id': body.market_id,
        'market_date': body.market_date,
        'booth_fee': float(booth_fee) if booth_fee is not None else None,
        'notes': body.notes,
        'created_at': iso_now(),
    }
    await db.market_days.insert_one(doc)
    doc.pop('_id', None)
    return doc


@router.patch('/{mdid}', response_model=MarketDay)
async def update_market_day(mdid: str, body: MarketDayUpdate, vendor=Depends(get_current_vendor)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        doc = await db.market_days.find_one({'id': mdid, 'vendor_id': vendor['id']}, {'_id': 0})
        if not doc:
            raise HTTPException(status_code=404, detail='Market day not found')
        return doc
    r = await db.market_days.update_one({'id': mdid, 'vendor_id': vendor['id']}, {'$set': update})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='Market day not found')
    doc = await db.market_days.find_one({'id': mdid}, {'_id': 0})
    return doc


@router.delete('/{mdid}')
async def delete_market_day(mdid: str, vendor=Depends(get_current_vendor)):
    r = await db.market_days.delete_one({'id': mdid, 'vendor_id': vendor['id']})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Market day not found')
    return {'ok': True}
