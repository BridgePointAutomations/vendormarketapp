import os
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

from db import db

JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALG = os.environ.get('JWT_ALGORITHM', 'HS256')
JWT_EXPIRE_HOURS = int(os.environ.get('JWT_EXPIRE_HOURS', 168))

bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def issue_token(vendor_id: str) -> str:
    payload = {
        'sub': vendor_id,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        'iat': datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> Optional[str]:
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return data.get('sub')
    except Exception:
        return None


async def get_current_vendor(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail='Not authenticated')
    vendor_id = decode_token(creds.credentials)
    if not vendor_id:
        raise HTTPException(status_code=401, detail='Invalid or expired token')
    vendor = await db.vendors.find_one({'id': vendor_id}, {'_id': 0, 'password_hash': 0})
    if not vendor:
        raise HTTPException(status_code=401, detail='Vendor not found')
    return vendor


async def require_paid(vendor=Depends(get_current_vendor)):
    if vendor.get('tier') != 'paid':
        raise HTTPException(status_code=402, detail='Paid tier required for AI features')
    return vendor
