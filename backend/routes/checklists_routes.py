from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from typing import Optional, List
from datetime import date, timedelta
import csv
import io

from db import db
from auth import get_current_vendor
from utils import uid, iso_now, safe_csv_filename, resolve_next_market_date
from checklists import (
    seed_getting_started_for_vendor,
    seed_packing_for_market,
)

from pydantic import BaseModel, Field


router = APIRouter(prefix='/checklists', tags=['checklists'])


# ---------- Local Pydantic bodies ----------
class ItemCreate(BaseModel):
    label: str = Field(min_length=1)
    hint: Optional[str] = None
    sort_order: Optional[int] = None
    compliance_item_id: Optional[str] = None


class ItemUpdate(BaseModel):
    label: Optional[str] = None
    hint: Optional[str] = None
    sort_order: Optional[int] = None
    checked: Optional[bool] = None  # for getting-started items only
    compliance_item_id: Optional[str] = None
    clear_compliance_link: Optional[bool] = None  # true => set compliance_item_id null


class PackingCheckToggle(BaseModel):
    item_id: str
    market_date: str  # YYYY-MM-DD
    checked: bool


# ---------- Helpers ----------
async def _items_for(checklist_id: str, vendor_id: str) -> List[dict]:
    return await db.checklist_items.find(
        {'checklist_id': checklist_id, 'vendor_id': vendor_id}, {'_id': 0}
    ).sort('sort_order', 1).to_list(500)


async def _load_checklist_or_404(cid: str, vendor_id: str) -> dict:
    c = await db.checklists.find_one({'id': cid, 'vendor_id': vendor_id}, {'_id': 0})
    if not c:
        raise HTTPException(status_code=404, detail='Checklist not found')
    return c


def _today_iso() -> str:
    return date.today().isoformat()


# ---------- Getting-started ----------
@router.get('/getting-started')
async def get_getting_started(vendor=Depends(get_current_vendor)):
    """Lazily create the checklist if the vendor doesn't already have one."""
    doc = await seed_getting_started_for_vendor(vendor['id'])
    items = await _items_for(doc['id'], vendor['id'])
    return {**doc, 'items': items}


# ---------- Packing ----------
@router.get('/packing')
async def get_packing(
    market_id: str = Query(...),
    market_date: Optional[str] = Query(None),  # if provided, includes checks for that date
    vendor=Depends(get_current_vendor),
):
    # Ensure market belongs to vendor
    market = await db.markets.find_one({'id': market_id, 'vendor_id': vendor['id']}, {'_id': 0})
    if not market:
        raise HTTPException(status_code=404, detail='Market not found')
    doc = await seed_packing_for_market(vendor['id'], market_id)
    items = await _items_for(doc['id'], vendor['id'])

    # Compute checks. Convention: checks are per market_date.
    # A check row's presence means checked=true for (item, date). Reset happens
    # naturally because we filter checks by market_date >= today.
    checked_ids: List[str] = []
    if market_date:
        today = _today_iso()
        # If the requested date is in the past, treat as reset (no checks displayed).
        if market_date >= today:
            rows = await db.packing_checks.find({
                'vendor_id': vendor['id'],
                'checklist_id': doc['id'],
                'market_date': market_date,
            }, {'_id': 0}).to_list(500)
            checked_ids = [r['item_id'] for r in rows]
    return {
        **doc,
        'market_id': market_id,
        'market_name': market.get('name'),
        'market_date': market_date,
        'items': items,
        'checked_item_ids': checked_ids,
    }


@router.get('/packing/export')
async def export_packing(
    market_id: str = Query(...),
    market_date: Optional[str] = Query(None),
    vendor=Depends(get_current_vendor),
):
    """CSV export of the packing checklist — printable for the truck.
    Rows: item label, hint, checked (✓/○). Includes a header with market name + date."""
    market = await db.markets.find_one({'id': market_id, 'vendor_id': vendor['id']}, {'_id': 0})
    if not market:
        raise HTTPException(status_code=404, detail='Market not found')
    doc = await seed_packing_for_market(vendor['id'], market_id)
    items = await _items_for(doc['id'], vendor['id'])

    checked_ids: set = set()
    if market_date and market_date >= _today_iso():
        rows = await db.packing_checks.find({
            'vendor_id': vendor['id'],
            'checklist_id': doc['id'],
            'market_date': market_date,
        }, {'_id': 0}).to_list(500)
        checked_ids = {r['item_id'] for r in rows}

    buf = io.StringIO()
    writer = csv.writer(buf)
    header_line = f"Packing checklist — {market.get('name')}"
    if market_date:
        header_line += f" — {market_date}"
    writer.writerow([header_line])
    writer.writerow([])
    writer.writerow(['Done', 'Item', 'Notes'])
    for it in items:
        checked = 'X' if it['id'] in checked_ids else ''
        writer.writerow([checked, it.get('label', ''), it.get('hint', '') or ''])

    csv_data = buf.getvalue()
    suffix = (f"_{market_date}" if market_date else '') + '.csv'
    filename = safe_csv_filename(market.get('name') or 'market', 'marketops_packing_', suffix)
    return StreamingResponse(
        iter([csv_data]),
        media_type='text/csv',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )


# ---------- Items CRUD (works for both types) ----------
@router.post('/{cid}/items')
async def add_item(cid: str, body: ItemCreate, vendor=Depends(get_current_vendor)):
    checklist = await _load_checklist_or_404(cid, vendor['id'])
    existing = await _items_for(cid, vendor['id'])
    sort_order = body.sort_order if body.sort_order is not None else (existing[-1]['sort_order'] + 1 if existing else 0)
    doc = {
        'id': uid(),
        'checklist_id': cid,
        'vendor_id': vendor['id'],
        'label': body.label,
        'hint': body.hint,
        'sort_order': sort_order,
        'checked': False,
        'compliance_item_id': body.compliance_item_id,
        'created_at': iso_now(),
    }
    await db.checklist_items.insert_one(doc)
    doc.pop('_id', None)
    return doc


@router.patch('/items/{item_id}')
async def update_item(item_id: str, body: ItemUpdate, vendor=Depends(get_current_vendor)):
    payload = body.model_dump(exclude_unset=True)
    clear_link = payload.pop('clear_compliance_link', False)
    update = {k: v for k, v in payload.items() if v is not None}
    if clear_link:
        update['compliance_item_id'] = None
    if not update:
        item = await db.checklist_items.find_one({'id': item_id, 'vendor_id': vendor['id']}, {'_id': 0})
        if not item:
            raise HTTPException(status_code=404, detail='Item not found')
        return item
    r = await db.checklist_items.update_one(
        {'id': item_id, 'vendor_id': vendor['id']}, {'$set': update}
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='Item not found')
    item = await db.checklist_items.find_one({'id': item_id}, {'_id': 0})
    return item


@router.delete('/items/{item_id}')
async def delete_item(item_id: str, vendor=Depends(get_current_vendor)):
    r = await db.checklist_items.delete_one({'id': item_id, 'vendor_id': vendor['id']})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Item not found')
    await db.packing_checks.delete_many({'item_id': item_id, 'vendor_id': vendor['id']})
    return {'ok': True}


# ---------- Packing checks (toggle) ----------
@router.post('/{cid}/checks')
async def toggle_packing_check(cid: str, body: PackingCheckToggle, vendor=Depends(get_current_vendor)):
    checklist = await _load_checklist_or_404(cid, vendor['id'])
    if checklist.get('type') != 'packing':
        raise HTTPException(status_code=400, detail='Only packing checklists support per-date checks')
    # Verify item belongs to this checklist
    item = await db.checklist_items.find_one({
        'id': body.item_id, 'checklist_id': cid, 'vendor_id': vendor['id'],
    }, {'_id': 0})
    if not item:
        raise HTTPException(status_code=404, detail='Item not found')
    if body.checked:
        # Upsert the check row.
        await db.packing_checks.update_one(
            {
                'vendor_id': vendor['id'],
                'checklist_id': cid,
                'item_id': body.item_id,
                'market_date': body.market_date,
            },
            {
                '$setOnInsert': {
                    'id': uid(),
                    'created_at': iso_now(),
                },
            },
            upsert=True,
        )
    else:
        await db.packing_checks.delete_one({
            'vendor_id': vendor['id'],
            'checklist_id': cid,
            'item_id': body.item_id,
            'market_date': body.market_date,
        })
    return {'ok': True, 'item_id': body.item_id, 'market_date': body.market_date, 'checked': body.checked}


# ---------- Dashboard surface ----------
@router.get('/packing/next-day')
async def packing_next_day(vendor=Depends(get_current_vendor)):
    """Return packing status for the vendor's next upcoming market date.

    Resolution order:
    1. Nearest future (>= today) date from `market_days` records.
    2. Fall back to nearest future date from allocations.
    3. Otherwise None.
    """
    next_market = await resolve_next_market_date(db, vendor['id'], _today_iso())
    if not next_market:
        return {'has_upcoming': False}
    market_id = next_market['market_id']
    market_date = next_market['market_date']

    market = await db.markets.find_one({'id': market_id, 'vendor_id': vendor['id']}, {'_id': 0})
    checklist = await seed_packing_for_market(vendor['id'], market_id)
    items = await _items_for(checklist['id'], vendor['id'])
    rows = await db.packing_checks.find({
        'vendor_id': vendor['id'],
        'checklist_id': checklist['id'],
        'market_date': market_date,
    }, {'_id': 0}).to_list(500)
    checked_ids = {r['item_id'] for r in rows}

    return {
        'has_upcoming': True,
        'market_id': market_id,
        'market_name': market.get('name') if market else None,
        'market_date': market_date,
        'day_of_week': market.get('day_of_week') if market else None,
        'checklist_id': checklist['id'],
        'total': len(items),
        'checked': len(checked_ids),
    }
