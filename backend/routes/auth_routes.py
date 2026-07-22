from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import logging
import os
import uuid

from db import db
from models import (
    SignupRequest,
    LoginRequest,
    VendorPublic,
    AuthResponse,
    VendorUpdate,
    OnboardingFlagsUpdate,
)
from auth import hash_password, verify_password, issue_token, get_current_vendor
from checklists import seed_getting_started_for_vendor

router = APIRouter(prefix='/auth', tags=['auth'])
logger = logging.getLogger(__name__)


def _public(v: dict) -> dict:
    return {
        'id': v['id'],
        'email': v['email'],
        'business_name': v['business_name'],
        'owner_name': v.get('owner_name'),
        'phone': v.get('phone'),
        'category': v.get('category', 'mixed'),
        'tier': v.get('tier', 'free'),
        'created_at': v['created_at'],
        'city': v.get('city'),
        'primary_market_type': v.get('primary_market_type'),
        'expected_markets_count': v.get('expected_markets_count'),
        'welcome_dismissed': bool(v.get('welcome_dismissed', True)),
        'tour_completed': bool(v.get('tour_completed', True)),
        'onboarding_completed': bool(v.get('onboarding_completed', True)),
        'checklist_dismissed': bool(v.get('checklist_dismissed', True)),
    }


@router.post('/signup', response_model=AuthResponse)
async def signup(body: SignupRequest):
    email = body.email.lower().strip()
    exists = await db.vendors.find_one({'email': email})
    if exists:
        raise HTTPException(status_code=409, detail='Email already registered')
    vid = str(uuid.uuid4())
    doc = {
        'id': vid,
        'email': email,
        'password_hash': hash_password(body.password),
        'business_name': body.business_name,
        'owner_name': body.owner_name,
        'phone': body.phone,
        'category': body.category,
        'tier': 'free',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'city': body.city,
        'primary_market_type': body.primary_market_type,
        'expected_markets_count': body.expected_markets_count,
        'welcome_dismissed': False,
        'tour_completed': False,
        'onboarding_completed': False,
        'checklist_dismissed': False,
    }
    await db.vendors.insert_one(doc)

    # Seed getting-started checklist. Failure here shouldn't block signup.
    try:
        await seed_getting_started_for_vendor(vid)
    except Exception:
        logger.exception('Failed to seed getting-started checklist for vendor %s', vid)

    token = issue_token(vid)
    return {'token': token, 'vendor': _public(doc)}


@router.post('/login', response_model=AuthResponse)
async def login(body: LoginRequest):
    email = body.email.lower().strip()
    v = await db.vendors.find_one({'email': email})
    if not v or not verify_password(body.password, v.get('password_hash', '')):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    token = issue_token(v['id'])
    return {'token': token, 'vendor': _public(v)}


@router.get('/me', response_model=VendorPublic)
async def me(vendor=Depends(get_current_vendor)):
    return _public(vendor)


@router.patch('/me', response_model=VendorPublic)
async def update_me(body: VendorUpdate, vendor=Depends(get_current_vendor)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if update:
        await db.vendors.update_one({'id': vendor['id']}, {'$set': update})
    v = await db.vendors.find_one({'id': vendor['id']}, {'_id': 0})
    return _public(v)


@router.patch('/me/onboarding', response_model=VendorPublic)
async def update_onboarding_flags(body: OnboardingFlagsUpdate, vendor=Depends(get_current_vendor)):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if update:
        await db.vendors.update_one({'id': vendor['id']}, {'$set': update})
    v = await db.vendors.find_one({'id': vendor['id']}, {'_id': 0})
    return _public(v)


def _require_dev_tier_toggle() -> None:
    """Dev-only tier toggle — no real billing is wired in. Gated off by default;
    set ENABLE_DEV_TIER_TOGGLE=true in the environment to enable it."""
    if os.environ.get('ENABLE_DEV_TIER_TOGGLE', '').lower() != 'true':
        raise HTTPException(status_code=404, detail='Not found')


@router.post('/me/upgrade', response_model=VendorPublic)
async def upgrade(vendor=Depends(get_current_vendor)):
    _require_dev_tier_toggle()
    await db.vendors.update_one({'id': vendor['id']}, {'$set': {'tier': 'paid'}})
    v = await db.vendors.find_one({'id': vendor['id']}, {'_id': 0})
    return _public(v)


@router.post('/me/downgrade', response_model=VendorPublic)
async def downgrade(vendor=Depends(get_current_vendor)):
    _require_dev_tier_toggle()
    await db.vendors.update_one({'id': vendor['id']}, {'$set': {'tier': 'free'}})
    v = await db.vendors.find_one({'id': vendor['id']}, {'_id': 0})
    return _public(v)
