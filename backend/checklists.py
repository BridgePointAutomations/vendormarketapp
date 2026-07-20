"""Checklist domain helpers: schema seeding, defaults, and shared logic.

Separating this here keeps auth_routes small and lets other routes (dashboard,
checklists_routes) share the same seeding logic for both new signups and
legacy vendors that pre-date this feature.
"""
from typing import List, Dict, Any

from db import db
from utils import uid, iso_now


# Generic orientation items — explicitly not jurisdiction-specific and not legal advice.
GETTING_STARTED_ITEMS: List[Dict[str, Any]] = [
    {
        'label': 'Register or apply for a vendor license',
        'hint': 'Most cities/states require vendors to hold a general or specific vendor license.',
    },
    {
        'label': 'Obtain general liability insurance',
        'hint': 'Markets frequently require proof of liability insurance before you can sell.',
    },
    {
        'label': 'Submit market applications',
        'hint': 'Apply to each market individually — fees, jury, and season windows vary.',
    },
    {
        'label': 'Register for sales tax collection',
        'hint': 'Sales tax registration is usually a separate step from your business license.',
    },
    {
        'label': 'Prep basic equipment',
        'hint': 'Tent, weights, table, signage, cash box, POS/reader, receipt pad, extension cord.',
    },
]

# Default packing template items — seeded on first access of a market's packing checklist.
PACKING_DEFAULT_ITEMS: List[str] = [
    'Tent',
    'Tent weights',
    'Table + tablecloth',
    'Signage / price cards',
    'Cash box + change',
    'Card reader / POS device (charged)',
    'Product inventory',
    'Receipt pad / bags',
    'Permit printout',
    'Water + snacks for the day',
]


async def seed_getting_started_for_vendor(vendor_id: str) -> Dict[str, Any]:
    """Idempotent-ish seeder: creates the getting-started checklist for a vendor if
    it doesn't already exist. Returns the checklist doc (whether new or existing).

    We don't add missing items to an existing checklist — users may have deleted them
    intentionally.
    """
    existing = await db.checklists.find_one({
        'vendor_id': vendor_id, 'type': 'getting_started', 'market_id': None,
    }, {'_id': 0})
    if existing:
        return existing

    cid = uid()
    now = iso_now()
    doc = {
        'id': cid,
        'vendor_id': vendor_id,
        'market_id': None,
        'type': 'getting_started',
        'name': 'Getting started',
        'created_at': now,
    }
    await db.checklists.insert_one(doc)
    doc.pop('_id', None)
    items = [
        {
            'id': uid(),
            'checklist_id': cid,
            'vendor_id': vendor_id,
            'label': it['label'],
            'hint': it.get('hint'),
            'sort_order': i,
            'checked': False,
            'compliance_item_id': None,
            'created_at': now,
        }
        for i, it in enumerate(GETTING_STARTED_ITEMS)
    ]
    if items:
        await db.checklist_items.insert_many(items)
    return doc


async def seed_packing_for_market(vendor_id: str, market_id: str) -> Dict[str, Any]:
    """Idempotent-ish seeder for a per-market packing checklist. Creates the checklist
    and default packing items if they don't already exist for this (vendor, market).
    """
    existing = await db.checklists.find_one({
        'vendor_id': vendor_id, 'type': 'packing', 'market_id': market_id,
    }, {'_id': 0})
    if existing:
        return existing

    cid = uid()
    now = iso_now()
    doc = {
        'id': cid,
        'vendor_id': vendor_id,
        'market_id': market_id,
        'type': 'packing',
        'name': 'Packing list',
        'created_at': now,
    }
    await db.checklists.insert_one(doc)
    doc.pop('_id', None)
    items = [
        {
            'id': uid(),
            'checklist_id': cid,
            'vendor_id': vendor_id,
            'label': label,
            'hint': None,
            'sort_order': i,
            'checked': False,  # unused for packing type (checks tracked in packing_checks)
            'compliance_item_id': None,
            'created_at': now,
        }
        for i, label in enumerate(PACKING_DEFAULT_ITEMS)
    ]
    if items:
        await db.checklist_items.insert_many(items)
    return doc
