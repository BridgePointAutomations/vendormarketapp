from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from db import ensure_indexes  # noqa: E402
from routes.auth_routes import router as auth_router  # noqa: E402
from routes.products_routes import router as products_router  # noqa: E402
from routes.markets_routes import router as markets_router  # noqa: E402
from routes.allocations_routes import router as allocations_router  # noqa: E402
from routes.compliance_routes import router as compliance_router  # noqa: E402
from routes.ai_routes import router as ai_router  # noqa: E402
from routes.dashboard_routes import router as dashboard_router  # noqa: E402
from routes.seed_routes import router as seed_router  # noqa: E402
from routes.market_days_routes import router as market_days_router  # noqa: E402
from routes.pnl_routes import router as pnl_router  # noqa: E402

app = FastAPI(title='MarketOps API')
api_router = APIRouter(prefix='/api')


@api_router.get('/')
async def root():
    return {'service': 'marketops', 'status': 'ok'}


@api_router.get('/health')
async def health():
    return {'status': 'ok'}


api_router.include_router(auth_router)
api_router.include_router(products_router)
api_router.include_router(markets_router)
api_router.include_router(allocations_router)
api_router.include_router(compliance_router)
api_router.include_router(ai_router)
api_router.include_router(dashboard_router)
api_router.include_router(seed_router)
api_router.include_router(market_days_router)
api_router.include_router(pnl_router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=['*'],
    allow_headers=['*'],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event('startup')
async def _startup():
    try:
        await ensure_indexes()
    except Exception as e:
        logger.warning(f'index creation issue: {e}')
