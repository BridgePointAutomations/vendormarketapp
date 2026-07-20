from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone, date, timedelta
import uuid

from db import db
from auth import hash_password, issue_token

router = APIRouter(prefix='/seed', tags=['seed'])

DEMO_EMAIL = 'demo@marketops.app'
DEMO_PASSWORD = 'DemoVendor2025!'


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _u() -> str:
    return str(uuid.uuid4())


@router.post('/demo')
async def seed_demo():
    """Idempotent: rebuild demo vendor and full dataset every call."""
    existing = await db.vendors.find_one({'email': DEMO_EMAIL})
    if existing:
        vid = existing['id']
        await db.products.delete_many({'vendor_id': vid})
        await db.markets.delete_many({'vendor_id': vid})
        await db.allocations.delete_many({'vendor_id': vid})
        await db.compliance_items.delete_many({'vendor_id': vid})
        await db.reminders_log.delete_many({'vendor_id': vid})
        await db.revenue_projections.delete_many({'vendor_id': vid})
        await db.vendors.update_one({'id': vid}, {'$set': {
            'password_hash': hash_password(DEMO_PASSWORD),
            'business_name': 'Cuyahoga Craft Bakery',
            'owner_name': 'Marla Bloom',
            'phone': '216-555-0142',
            'category': 'food',
            'tier': 'paid',
        }})
    else:
        vid = _u()
        await db.vendors.insert_one({
            'id': vid,
            'email': DEMO_EMAIL,
            'password_hash': hash_password(DEMO_PASSWORD),
            'business_name': 'Cuyahoga Craft Bakery',
            'owner_name': 'Marla Bloom',
            'phone': '216-555-0142',
            'category': 'food',
            'tier': 'paid',
            'created_at': _iso_now(),
        })

    today = date.today()

    # Products
    products_seed = [
        {'name': 'Sourdough Loaf', 'sku': 'SD-01', 'unit': 'loaf', 'unit_price': 9.0, 'current_stock': 40, 'low_stock_threshold': 12},
        {'name': 'Rosemary Focaccia', 'sku': 'FC-01', 'unit': 'piece', 'unit_price': 7.0, 'current_stock': 22, 'low_stock_threshold': 8},
        {'name': 'Cookie 6-pack', 'sku': 'CK-06', 'unit': 'pack', 'unit_price': 12.0, 'current_stock': 6, 'low_stock_threshold': 10},
        {'name': 'Honey Jar (8oz)', 'sku': 'HN-08', 'unit': 'jar', 'unit_price': 14.0, 'current_stock': 18, 'low_stock_threshold': 6},
        {'name': 'Cinnamon Roll', 'sku': 'CN-01', 'unit': 'piece', 'unit_price': 5.0, 'current_stock': 30, 'low_stock_threshold': 12},
        {'name': 'Seasonal Pie', 'sku': 'PI-01', 'unit': 'piece', 'unit_price': 22.0, 'current_stock': 4, 'low_stock_threshold': 6},
    ]
    prod_ids = {}
    for p in products_seed:
        pid = _u()
        prod_ids[p['name']] = pid
        await db.products.insert_one({
            'id': pid, 'vendor_id': vid, **p, 'created_at': _iso_now(),
        })

    # Markets
    markets_seed = [
        {
            'name': 'Shaker Square Farmers Market', 'address': '13000 Shaker Sq, Cleveland OH',
            'day_of_week': 'Saturday', 'recurrence_pattern': 'weekly',
            'season_start': str(date(today.year, 5, 1)), 'season_end': str(date(today.year, 10, 31)),
            'category_focus': 'food', 'is_candidate': False, 'status': 'active',
        },
        {
            'name': 'Coit Road Farmers Market', 'address': '15000 Woodworth Rd, East Cleveland OH',
            'day_of_week': 'Wednesday', 'recurrence_pattern': 'weekly',
            'season_start': str(date(today.year, 5, 1)), 'season_end': str(date(today.year, 11, 30)),
            'category_focus': 'food', 'is_candidate': False, 'status': 'active',
        },
        {
            'name': 'Ohio City Winter Market', 'address': 'W 25th, Cleveland OH',
            'day_of_week': 'Saturday', 'recurrence_pattern': 'weekly',
            'season_start': str(date(today.year, 11, 1)), 'season_end': str(date(today.year + 1, 3, 31)),
            'category_focus': 'mixed', 'is_candidate': False, 'status': 'approved',
        },
        {
            'name': 'Beachwood Holiday Craft Fair', 'address': 'Beachwood Community Ctr, OH',
            'day_of_week': 'Saturday', 'recurrence_pattern': 'monthly',
            'season_start': str(date(today.year, 11, 29)), 'season_end': str(date(today.year, 12, 20)),
            'category_focus': 'craft', 'is_candidate': True, 'status': 'considering',
        },
    ]
    market_ids = {}
    for m in markets_seed:
        mid = _u()
        market_ids[m['name']] = mid
        await db.markets.insert_one({
            'id': mid, 'vendor_id': vid, **m, 'created_at': _iso_now(),
        })

    # Allocations — historical (last 3 weeks) + upcoming (this week)
    def alloc(mid, pid, date_, qty, remaining):
        return {
            'id': _u(), 'vendor_id': vid, 'market_id': mid, 'product_id': pid,
            'allocated_qty': qty, 'remaining_qty': remaining,
            'market_date': str(date_), 'created_at': _iso_now(),
        }
    shaker = market_ids['Shaker Square Farmers Market']
    coit = market_ids['Coit Road Farmers Market']
    def d(days): return today + timedelta(days=days)

    historic = [
        alloc(shaker, prod_ids['Sourdough Loaf'], d(-21), 30, 2),
        alloc(shaker, prod_ids['Sourdough Loaf'], d(-14), 32, 4),
        alloc(shaker, prod_ids['Sourdough Loaf'], d(-7), 34, 1),
        alloc(shaker, prod_ids['Rosemary Focaccia'], d(-21), 20, 8),
        alloc(shaker, prod_ids['Rosemary Focaccia'], d(-14), 18, 5),
        alloc(shaker, prod_ids['Rosemary Focaccia'], d(-7), 16, 2),
        alloc(shaker, prod_ids['Cookie 6-pack'], d(-21), 25, 0),
        alloc(shaker, prod_ids['Cookie 6-pack'], d(-14), 28, 3),
        alloc(shaker, prod_ids['Cookie 6-pack'], d(-7), 30, 4),
        alloc(coit, prod_ids['Sourdough Loaf'], d(-18), 20, 3),
        alloc(coit, prod_ids['Sourdough Loaf'], d(-11), 22, 2),
        alloc(coit, prod_ids['Sourdough Loaf'], d(-4), 24, 5),
        alloc(coit, prod_ids['Honey Jar (8oz)'], d(-18), 10, 2),
        alloc(coit, prod_ids['Honey Jar (8oz)'], d(-11), 12, 4),
    ]
    # upcoming this week
    upcoming_days = 3 if today.weekday() < 3 else 6
    upcoming = [
        alloc(shaker, prod_ids['Sourdough Loaf'], d(upcoming_days), 34, 34),
        alloc(shaker, prod_ids['Rosemary Focaccia'], d(upcoming_days), 18, 18),
        alloc(shaker, prod_ids['Cookie 6-pack'], d(upcoming_days), 8, 8),  # will trigger low-stock (threshold 10)
        alloc(coit, prod_ids['Sourdough Loaf'], d(2), 22, 22),
    ]
    for a in historic + upcoming:
        await db.allocations.insert_one(a)

    # Compliance items
    compliance_seed = [
        {'type': 'permit', 'name': 'Cuyahoga County Vendor Permit', 'market_id': None,
         'issue_date': str(today - timedelta(days=300)), 'expiration_date': str(today + timedelta(days=65)),
         'notes': 'Renew online before expiration.'},
        {'type': 'insurance', 'name': 'General Liability (COI)', 'market_id': None,
         'issue_date': str(today - timedelta(days=200)), 'expiration_date': str(today + timedelta(days=18))},
        {'type': 'license', 'name': 'ODA Cottage Food Registration', 'market_id': None,
         'issue_date': str(today - timedelta(days=400)), 'expiration_date': str(today + timedelta(days=120))},
        {'type': 'permit', 'name': 'Shaker Sq Booth Permit', 'market_id': shaker,
         'issue_date': str(today - timedelta(days=150)), 'expiration_date': str(today + timedelta(days=6))},
        {'type': 'permit', 'name': 'Coit Road Vendor Permit', 'market_id': coit,
         'issue_date': str(today - timedelta(days=150)), 'expiration_date': str(today + timedelta(days=45))},
        {'type': 'tax', 'name': 'Ohio Sales Tax Registration', 'market_id': None,
         'issue_date': str(today - timedelta(days=500)), 'expiration_date': str(today - timedelta(days=3))},
    ]
    from routes.compliance_routes import _compute_status
    for c in compliance_seed:
        await db.compliance_items.insert_one({
            'id': _u(), 'vendor_id': vid,
            **c, 'status': _compute_status(c['expiration_date']),
            'created_at': _iso_now(),
        })

    token = issue_token(vid)
    return {
        'message': 'Demo vendor seeded',
        'email': DEMO_EMAIL,
        'password': DEMO_PASSWORD,
        'token': token,
        'vendor_id': vid,
    }
