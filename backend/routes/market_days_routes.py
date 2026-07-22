from fastapi import APIRouter, Depends, HTTPException

from db import db
from models import MarketDay, MarketDayCreate
from auth import get_current_vendor
from utils import uid, iso_now

router = APIRouter(prefix='/market-days', tags=['market-days'])


async def upsert_market_day_for(vendor_id: str, market: dict, market_date: str, booth_fee=None, notes=None) -> dict:
    """Create or update the market_day for (vendor_id, market_id, market_date).

    If `booth_fee` is None and no existing row exists, inherit from
    `markets.default_booth_fee`. If `booth_fee` is None and a row exists,
    keep the existing fee.
    """
    existing = await db.market_days.find_one({
        'vendor_id': vendor_id,
        'market_id': market['id'],
        'market_date': market_date,
    }, {'_id': 0})

    if existing:
        update = {}
        if booth_fee is not None:
            update['booth_fee'] = float(booth_fee)
        if notes is not None:
            update['notes'] = notes
        if update:
            await db.market_days.update_one({'id': existing['id']}, {'$set': update})
            existing.update(update)
        return existing

    fee = booth_fee
    if fee is None:
        fee = market.get('default_booth_fee')
    doc = {
        'id': uid(),
        'vendor_id': vendor_id,
        'market_id': market['id'],
        'market_date': market_date,
        'booth_fee': float(fee) if fee is not None else None,
        'notes': notes,
        'created_at': iso_now(),
    }
    await db.market_days.insert_one(doc)
    doc.pop('_id', None)
    return doc


@router.post('', response_model=MarketDay)
async def upsert_market_day(body: MarketDayCreate, vendor=Depends(get_current_vendor)):
    market = await db.markets.find_one({'id': body.market_id, 'vendor_id': vendor['id']}, {'_id': 0})
    if not market:
        raise HTTPException(status_code=404, detail='Market not found')
    return await upsert_market_day_for(vendor['id'], market, body.market_date, body.booth_fee, body.notes)
