"""Shared helpers used across routes."""
from datetime import date, datetime, timezone
from typing import Any
import uuid

EXPIRING_WINDOW_DAYS = 30
REMINDER_INTERVALS = [30, 14, 7]


def uid() -> str:
    return str(uuid.uuid4())


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def compute_compliance_status(exp_iso: str) -> str:
    """Return 'active' | 'expiring' | 'expired' from an ISO date string."""
    if not exp_iso:
        return "active"
    try:
        exp = date.fromisoformat(exp_iso[:10])
    except Exception:
        return "active"
    today = date.today()
    if exp < today:
        return "expired"
    if (exp - today).days <= EXPIRING_WINDOW_DAYS:
        return "expiring"
    return "active"


def strip_mongo(doc: dict) -> dict:
    """Remove Mongo's _id if present. In-place safe."""
    if isinstance(doc, dict):
        doc.pop("_id", None)
    return doc
