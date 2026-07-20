from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
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

router = APIRouter(prefix='/auth', tags=['auth'])


def _public(v: dict) -> dict:
    """Serialize a vendor doc for the API.

    Backward compat: for existing vendors that predate onboarding flags,
    default the flags to True so we don't nag them. New signups explicitly
    persist False for these flags.
    """
    return {
        'id': v['id'],
        'email': v['email'],
        'business_name': v['business_name'],
        'owner_name': v.get('owner_name'),
        'phone': v.get('phone'),
        'category': v.get('category', 'mixed'),
        'tier': v.get('tier', 'free'),
        'created_at': v['created_at'],
        # Profile fields (may be None on legacy accounts)
        'city': v.get('city'),
        'primary_market_type': v.get('primary_market_type'),
        'expected_markets_count': v.get('expected_markets_count'),
        # Onboarding UX flags — default True for legacy vendors (do not nag)
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
        # New profile fields
        'city': body.city,
        'primary_market_type': body.primary_market_type,
        'expected_markets_count': body.expected_markets_count,
        # Onboarding UX flags — brand-new vendors get the nudges
        'welcome_dismissed': False,
        'tour_completed': False,
        'onboarding_completed': False,
        'checklist_dismissed': False,
    }
    await db.vendors.insert_one(doc)
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
    """Toggle any subset of onboarding UX flags.

    Frontend sends only the flags it wants to change. Booleans are respected
    even when False, so this uses exclude_none=True instead of exclude_unset.
    """
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if update:
        await db.vendors.update_one({'id': vendor['id']}, {'$set': update})
    v = await db.vendors.find_one({'id': vendor['id']}, {'_id': 0})
    return _public(v)


@router.post('/me/upgrade', response_model=VendorPublic)
async def upgrade(vendor=Depends(get_current_vendor)):
    await db.vendors.update_one({'id': vendor['id']}, {'$set': {'tier': 'paid'}})
    v = await db.vendors.find_one({'id': vendor['id']}, {'_id': 0})
    return _public(v)


@router.post('/me/downgrade', response_model=VendorPublic)
async def downgrade(vendor=Depends(get_current_vendor)):
    await db.vendors.update_one({'id': vendor['id']}, {'$set': {'tier': 'free'}})
    v = await db.vendors.find_one({'id': vendor['id']}, {'_id': 0})
    return _public(v)
