from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime, timezone, date
import uuid

from db import db
from models import ComplianceItem, ComplianceCreate, ComplianceUpdate
from auth import get_current_vendor
from utils import compute_compliance_status as _compute_status, REMINDER_INTERVALS

router = APIRouter(prefix='/compliance', tags=['compliance'])


async def _hydrate_status(items):
    for it in items:
        it['status'] = _compute_status(it.get('expiration_date', ''))
    return items


@router.get('', response_model=List[ComplianceItem])
async def list_items(vendor=Depends(get_current_vendor)):
    items = await db.compliance_items.find({'vendor_id': vendor['id']}, {'_id': 0}).sort('expiration_date', 1).to_list(500)
    return await _hydrate_status(items)


@router.post('', response_model=ComplianceItem)
async def create_item(body: ComplianceCreate, vendor=Depends(get_current_vendor)):
    doc = body.model_dump()
    doc.update({
        'id': str(uuid.uuid4()),
        'vendor_id': vendor['id'],
        'status': _compute_status(body.expiration_date),
        'created_at': datetime.now(timezone.utc).isoformat(),
    })
    await db.compliance_items.insert_one(doc)
    doc.pop('_id', None)
    return doc


@router.patch('/{cid}', response_model=ComplianceItem)
async def update_item(cid: str, body: ComplianceUpdate, vendor=Depends(get_current_vendor)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if 'expiration_date' in update:
        update['status'] = _compute_status(update['expiration_date'])
    r = await db.compliance_items.update_one({'id': cid, 'vendor_id': vendor['id']}, {'$set': update})
    if r.matched_count == 0:
        raise HTTPException(404, 'Compliance item not found')
    doc = await db.compliance_items.find_one({'id': cid}, {'_id': 0})
    doc['status'] = _compute_status(doc.get('expiration_date', ''))
    return doc


@router.delete('/{cid}')
async def delete_item(cid: str, vendor=Depends(get_current_vendor)):
    r = await db.compliance_items.delete_one({'id': cid, 'vendor_id': vendor['id']})
    if r.deleted_count == 0:
        raise HTTPException(404, 'Compliance item not found')
    await db.reminders_log.delete_many({'compliance_item_id': cid, 'vendor_id': vendor['id']})
    return {'ok': True}


@router.post('/sweep')
async def sweep(vendor=Depends(get_current_vendor)):
    """Emit reminder-log entries at 30/14/7 days before expiration. In-app only."""
    today = date.today()
    items = await db.compliance_items.find({'vendor_id': vendor['id']}, {'_id': 0}).to_list(500)
    new_reminders = []
    for it in items:
        try:
            exp = date.fromisoformat(it.get('expiration_date', '')[:10])
        except Exception:
            continue
        days_out = (exp - today).days
        for interval in REMINDER_INTERVALS:
            if 0 <= days_out <= interval:
                existing = await db.reminders_log.find_one({
                    'compliance_item_id': it['id'],
                    'days_before': interval,
                })
                if not existing:
                    entry = {
                        'id': str(uuid.uuid4()),
                        'vendor_id': vendor['id'],
                        'compliance_item_id': it['id'],
                        'compliance_name': it.get('name'),
                        'days_before': interval,
                        'sent_at': datetime.now(timezone.utc).isoformat(),
                        'channel': 'in_app',
                    }
                    await db.reminders_log.insert_one(entry)
                    new_reminders.append(entry)
                break
    logs = await db.reminders_log.find({'vendor_id': vendor['id']}, {'_id': 0}).sort('sent_at', -1).limit(50).to_list(50)
    return {'new': len(new_reminders), 'log': logs}
