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
from routes.checklists_routes import router as checklists_router  # noqa: E402

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
api_router.include_router(checklists_router)

app.include_router(api_router)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# CORS: default to a safe, empty list rather than '*'.
# Provide `CORS_ORIGINS` in backend/.env as a comma-separated list of allowed origins.
_raw_cors = os.environ.get('CORS_ORIGINS', '').strip()
if _raw_cors == '*':
    logger.warning(
        "CORS_ORIGINS is set to '*' — this is unsafe with allow_credentials=True. "
        "Configure specific allowed origins in backend/.env."
    )
    _allowed = ['*']
    _allow_creds = False  # browsers reject credentials with wildcard anyway
elif _raw_cors:
    _allowed = [o.strip() for o in _raw_cors.split(',') if o.strip()]
    _allow_creds = True
else:
    _allowed = []
    _allow_creds = True
    logger.warning(
        "CORS_ORIGINS is empty; no cross-origin requests will be allowed. "
        "Set CORS_ORIGINS in backend/.env to the frontend origin(s)."
    )

app.add_middleware(
    CORSMiddleware,
    allow_credentials=_allow_creds,
    allow_origins=_allowed,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.on_event('startup')
async def _startup():
    try:
        await ensure_indexes()
    except Exception as e:
        logger.warning(f'index creation issue: {e}')
