"""Shared helpers used across routes."""
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Dict, Any, Optional
import uuid

from pymongo import ReturnDocument

EXPIRING_WINDOW_DAYS = 30
REMINDER_INTERVALS = [30, 14, 7]
MAX_GENERATED_DATES = 104  # ~2 years of weekly dates

WEEKDAY_INDEX = {
    'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3,
    'Friday': 4, 'Saturday': 5, 'Sunday': 6,
}


def generate_weekly_dates(day_of_week: str, season_start: str, season_end: str) -> list:
    """Return every ISO date matching `day_of_week` in [season_start, season_end], inclusive.

    Raises ValueError if inputs are missing/unparseable or the range would
    produce more than MAX_GENERATED_DATES dates.
    """
    if not day_of_week or day_of_week not in WEEKDAY_INDEX:
        raise ValueError('day_of_week must be a valid weekday name')
    try:
        start = date.fromisoformat((season_start or '')[:10])
        end = date.fromisoformat((season_end or '')[:10])
    except Exception:
        raise ValueError('season_start and season_end must be valid ISO dates')
    if end < start:
        raise ValueError('season_end must be on or after season_start')

    target = WEEKDAY_INDEX[day_of_week]
    offset = (target - start.weekday()) % 7
    current = start + timedelta(days=offset)

    dates = []
    while current <= end:
        dates.append(current.isoformat())
        if len(dates) > MAX_GENERATED_DATES:
            raise ValueError(f'Range too large — exceeds {MAX_GENERATED_DATES} dates')
        current += timedelta(days=7)
    return dates


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


def pick_booth_fee(market_day: Optional[dict], default_fee) -> Optional[float]:
    """Priority: market_day.booth_fee override > default_fee > None.

    Pure/no-DB-call variant of `resolve_booth_fee`, for call sites that already
    bulk-preload `market_days` rows and just need the priority branch applied.
    """
    if market_day is not None and market_day.get('booth_fee') is not None:
        return float(market_day['booth_fee'])
    if default_fee is not None:
        return float(default_fee)
    return None


async def resolve_booth_fee(db, vendor_id: str, market_id: str, market_date: str, market: Optional[dict] = None) -> Optional[float]:
    """Booth fee priority: market_days override > market.default_booth_fee > None.

    Accepts an optional pre-fetched `market` dict to avoid a redundant query
    when the caller already loaded it.
    """
    md = await db.market_days.find_one({
        'vendor_id': vendor_id, 'market_id': market_id, 'market_date': market_date,
    }, {'_id': 0})
    if market is None:
        market = await db.markets.find_one({'id': market_id, 'vendor_id': vendor_id}, {'_id': 0})
    default_fee = market.get('default_booth_fee') if market else None
    return pick_booth_fee(md, default_fee)


async def resolve_next_market_date(db, vendor_id: str, today_iso: Optional[str] = None) -> Optional[dict]:
    """Return the vendor's single next upcoming (market_id, market_date), or None.

    Resolution order:
    1. Nearest future (>= today) date from `market_days` records.
    2. Fall back to nearest future date from allocations.
    """
    today_iso = today_iso or date.today().isoformat()
    md = await db.market_days.find_one(
        {'vendor_id': vendor_id, 'market_date': {'$gte': today_iso}},
        {'_id': 0}, sort=[('market_date', 1)],
    )
    if md:
        return {'market_id': md['market_id'], 'market_date': md['market_date']}
    alloc = await db.allocations.find_one(
        {'vendor_id': vendor_id, 'market_date': {'$gte': today_iso}},
        {'_id': 0}, sort=[('market_date', 1)],
    )
    if alloc:
        return {'market_id': alloc['market_id'], 'market_date': alloc['market_date']}
    return None


def safe_csv_filename(name: str, prefix: str, suffix: str = '.csv') -> str:
    """Sanitize a name for use in a Content-Disposition filename."""
    safe_name = ''.join(c if c.isalnum() or c in '-_ ' else '_' for c in (name or '')).strip().replace(' ', '_')
    return f"{prefix}{safe_name}{suffix}"


def units_sold_for(allocation: Dict[str, Any]) -> float:
    """Estimate units sold for a single allocation.

    Preference order:
    1) Explicit `actual_units_sold` if provided (>= 0).
    2) Fallback to `allocated_qty - remaining_qty` (clamped at 0).
    """
    if not allocation:
        return 0.0
    actual = allocation.get('actual_units_sold')
    if actual is not None:
        try:
            v = float(actual)
            if v >= 0:
                return v
        except (TypeError, ValueError):
            pass
    allocated = float(allocation.get('allocated_qty') or 0)
    remaining = float(allocation.get('remaining_qty') or 0)
    return max(0.0, allocated - remaining)


async def apply_stock_delta(
    db,
    vendor_id: str,
    product_id: str,
    delta: float,
    reason: str,
    allocation_id: Optional[str] = None,
    note: Optional[str] = None,
) -> Optional[dict]:
    """Atomically apply a signed stock delta to a product's current_stock via $inc,
    clamping at 0 if the decrement would go negative, and log a StockEvent for audit.

    Returns the updated product doc (without _id), or None if the product doesn't exist.
    """
    if delta == 0:
        return await db.products.find_one({'id': product_id, 'vendor_id': vendor_id}, {'_id': 0})

    applied_note = note
    if delta >= 0:
        doc = await db.products.find_one_and_update(
            {'id': product_id, 'vendor_id': vendor_id},
            {'$inc': {'current_stock': delta}},
            projection={'_id': 0},
            return_document=ReturnDocument.AFTER,
        )
    else:
        doc = await db.products.find_one_and_update(
            {'id': product_id, 'vendor_id': vendor_id, 'current_stock': {'$gte': -delta}},
            {'$inc': {'current_stock': delta}},
            projection={'_id': 0},
            return_document=ReturnDocument.AFTER,
        )
        if doc is None:
            existing = await db.products.find_one({'id': product_id, 'vendor_id': vendor_id})
            if existing is None:
                return None
            shortfall = -delta - float(existing.get('current_stock') or 0)
            doc = await db.products.find_one_and_update(
                {'id': product_id, 'vendor_id': vendor_id},
                {'$set': {'current_stock': 0}},
                projection={'_id': 0},
                return_document=ReturnDocument.AFTER,
            )
            applied_note = (
                f'clamped at 0: requested decrement of {-delta}, only '
                f'{float(existing.get("current_stock") or 0)} available (short by {shortfall})'
            )

    if doc is None:
        return None

    event = {
        'id': uid(),
        'vendor_id': vendor_id,
        'product_id': product_id,
        'change': delta,
        'resulting_stock': doc.get('current_stock'),
        'reason': reason,
        'note': applied_note,
        'allocation_id': allocation_id,
        'created_at': iso_now(),
    }
    await db.stock_events.insert_one(event)
    return doc


def compute_pnl(
    allocations: Iterable[Dict[str, Any]],
    product_map: Dict[str, Dict[str, Any]],
    booth_fee: float = 0.0,
) -> Dict[str, Any]:
    """Return an estimated P&L dict for a set of allocations.

    Returned keys: revenue, cogs, booth_fee, net_profit, units_sold, has_actuals,
    lines (per-product breakdown).
    All numbers are estimates based on vendor-entered inputs.
    """
    revenue = 0.0
    cogs = 0.0
    units_total = 0.0
    has_actuals = False
    lines = []
    for a in allocations:
        pid = a.get('product_id')
        p = product_map.get(pid) or {}
        price = float(p.get('unit_price') or 0)
        cost = p.get('unit_cost')
        cost_val = float(cost) if cost is not None else 0.0
        sold = units_sold_for(a)
        if a.get('actual_units_sold') is not None:
            has_actuals = True
        line_rev = round(sold * price, 2)
        line_cogs = round(sold * cost_val, 2)
        revenue += line_rev
        cogs += line_cogs
        units_total += sold
        lines.append({
            'product_id': pid,
            'product_name': p.get('name'),
            'units_sold': sold,
            'unit_price': price,
            'unit_cost': cost_val if cost is not None else None,
            'revenue': line_rev,
            'cogs': line_cogs,
            'net': round(line_rev - line_cogs, 2),
        })
    fee = float(booth_fee or 0)
    net = revenue - fee - cogs
    return {
        'revenue': round(revenue, 2),
        'cogs': round(cogs, 2),
        'booth_fee': round(fee, 2),
        'net_profit': round(net, 2),
        'units_sold': round(units_total, 2),
        'has_actuals': has_actuals,
        'lines': lines,
        'is_estimate': True,
    }
