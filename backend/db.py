import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ.get('DB_NAME', 'marketops')

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


async def ensure_indexes():
    await db.vendors.create_index('email', unique=True)
    await db.products.create_index('vendor_id')
    await db.products.create_index(
        [('vendor_id', 1), ('sku', 1)],
        unique=True,
        partialFilterExpression={'sku': {'$type': 'string'}},
        name='uniq_vendor_sku',
    )
    await db.stock_events.create_index([('vendor_id', 1), ('product_id', 1), ('created_at', -1)])
    await db.stock_events.create_index([('allocation_id', 1)])
    await db.markets.create_index('vendor_id')
    await db.allocations.create_index([('vendor_id', 1), ('market_id', 1), ('market_date', 1)])
    await db.compliance_items.create_index('vendor_id')
    await db.reminders_log.create_index([('compliance_item_id', 1), ('days_before', 1)], unique=True)
    await db.revenue_projections.create_index([('vendor_id', 1), ('market_id', 1), ('market_date', 1)], unique=True)
    await db.market_days.create_index(
        [('vendor_id', 1), ('market_id', 1), ('market_date', 1)], unique=True
    )
    # Checklists
    await db.checklists.create_index([('vendor_id', 1), ('type', 1), ('market_id', 1)])
    await db.checklist_items.create_index([('checklist_id', 1), ('sort_order', 1)])
    await db.checklist_items.create_index('vendor_id')
    await db.packing_checks.create_index(
        [('vendor_id', 1), ('checklist_id', 1), ('item_id', 1), ('market_date', 1)],
        unique=True,
    )
    await db.packing_checks.create_index([('vendor_id', 1), ('market_date', 1)])
