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
    await db.markets.create_index('vendor_id')
    await db.allocations.create_index([('vendor_id', 1), ('market_id', 1), ('market_date', 1)])
    await db.compliance_items.create_index('vendor_id')
    await db.reminders_log.create_index([('compliance_item_id', 1), ('days_before', 1)], unique=True)
    await db.revenue_projections.create_index([('vendor_id', 1), ('market_id', 1), ('market_date', 1)], unique=True)
    # Market days: one doc per (vendor, market, date)
    await db.market_days.create_index(
        [('vendor_id', 1), ('market_id', 1), ('market_date', 1)], unique=True
    )
