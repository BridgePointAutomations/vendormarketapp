from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from db import db
from models import Market, MarketCreate, MarketUpdate
from auth import get_current_vendor
from utils import generate_weekly_dates
from routes.market_days_routes import upsert_market_day_for

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


@router.post('/clone-active', response_model=List[Market])
async def clone_active_markets(vendor=Depends(get_current_vendor)):
    """Clone every currently enrolled market (status in {approved, active}, not a candidate)
    into a fresh **candidate** entry for the next season. Useful at season kickoff so
    vendors don't re-enter recurring markets by hand.

    - Skips markets that already have a same-named candidate (avoids duplicates on repeat clicks).
    - Preserves recurrence/day-of-week/category info; strips season dates so vendor can update.
    - Returns only the newly created candidate rows.
    """
    active = await db.markets.find({
        'vendor_id': vendor['id'],
        'is_candidate': False,
        'status': {'$in': ['approved', 'active']},
    }, {'_id': 0}).to_list(500)

    existing_candidate_names = {
        m['name'].strip().lower()
        for m in await db.markets.find(
            {'vendor_id': vendor['id'], 'is_candidate': True}, {'_id': 0, 'name': 1}
        ).to_list(500)
    }

    now = datetime.now(timezone.utc).isoformat()
    new_docs: list = []
    for m in active:
        name_key = (m.get('name') or '').strip().lower()
        if not name_key or name_key in existing_candidate_names:
            continue
        new_doc = {
            'id': str(uuid.uuid4()),
            'vendor_id': vendor['id'],
            'name': m['name'],
            'address': m.get('address'),
            'day_of_week': m.get('day_of_week'),
            'recurrence_pattern': m.get('recurrence_pattern'),
            'season_start': None,  # user fills in new season
            'season_end': None,
            'category_focus': m.get('category_focus'),
            'is_candidate': True,
            'status': 'considering',
            'default_booth_fee': m.get('default_booth_fee'),
            'created_at': now,
        }
        new_docs.append(new_doc)
        existing_candidate_names.add(name_key)

    if new_docs:
        await db.markets.insert_many(new_docs)
        for d in new_docs:
            d.pop('_id', None)
    return new_docs


@router.post('/{mid}/generate-season-days')
async def generate_season_days(mid: str, vendor=Depends(get_current_vendor)):
    """Bulk-create market_days rows for every matching weekday between
    a weekly market's season_start and season_end.

    Never deletes existing rows. Dates already covered are left untouched
    (their booth_fee/notes are not overwritten); existing market_days rows
    for this market that fall outside the computed range are reported back
    so the vendor can review/remove them manually via DELETE /market-days.
    """
    market = await db.markets.find_one({'id': mid, 'vendor_id': vendor['id']}, {'_id': 0})
    if not market:
        raise HTTPException(status_code=404, detail='Market not found')
    if market.get('recurrence_pattern') != 'weekly':
        raise HTTPException(status_code=400, detail='Market must be recurring (weekly) to generate season dates')
    if not market.get('day_of_week') or not market.get('season_start') or not market.get('season_end'):
        raise HTTPException(status_code=400, detail='Market must have day_of_week, season_start, and season_end set')

    try:
        dates = generate_weekly_dates(market['day_of_week'], market['season_start'], market['season_end'])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    existing_rows = await db.market_days.find(
        {'vendor_id': vendor['id'], 'market_id': mid}, {'_id': 0},
    ).to_list(500)
    existing_dates = {r['market_date'] for r in existing_rows}

    created = []
    skipped_existing = []
    for d in dates:
        if d in existing_dates:
            skipped_existing.append(d)
            continue
        await upsert_market_day_for(vendor['id'], market, d)
        created.append(d)

    date_set = set(dates)
    outside_range = sorted(r['market_date'] for r in existing_rows if r['market_date'] not in date_set)

    return {'created': created, 'skipped_existing': skipped_existing, 'outside_range': outside_range}


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
