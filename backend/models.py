from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Optional, Literal, List, Dict, Any
from datetime import datetime, timezone
import uuid


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid() -> str:
    return str(uuid.uuid4())


MarketTypeLiteral = Literal['farmers', 'flea', 'popup', 'craft', 'mixed']


# ---------- Vendor / Auth ----------
class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    business_name: str = Field(min_length=1)
    owner_name: Optional[str] = None
    phone: Optional[str] = None
    category: Literal['food', 'craft', 'mixed'] = 'mixed'
    # New onboarding profile fields (all optional to keep API tolerant)
    city: Optional[str] = None
    primary_market_type: Optional[MarketTypeLiteral] = None
    expected_markets_count: Optional[int] = Field(default=None, ge=0, le=500)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class VendorPublic(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    email: str
    business_name: str
    owner_name: Optional[str] = None
    phone: Optional[str] = None
    category: str
    tier: Literal['free', 'paid'] = 'free'
    created_at: str
    # Onboarding profile fields
    city: Optional[str] = None
    primary_market_type: Optional[str] = None
    expected_markets_count: Optional[int] = None
    # Onboarding UX flags
    welcome_dismissed: bool = True
    tour_completed: bool = True
    onboarding_completed: bool = True
    checklist_dismissed: bool = True


class VendorUpdate(BaseModel):
    business_name: Optional[str] = None
    owner_name: Optional[str] = None
    phone: Optional[str] = None
    category: Optional[Literal['food', 'craft', 'mixed']] = None
    city: Optional[str] = None
    primary_market_type: Optional[MarketTypeLiteral] = None
    expected_markets_count: Optional[int] = Field(default=None, ge=0, le=500)


class OnboardingFlagsUpdate(BaseModel):
    welcome_dismissed: Optional[bool] = None
    tour_completed: Optional[bool] = None
    onboarding_completed: Optional[bool] = None
    checklist_dismissed: Optional[bool] = None


class AuthResponse(BaseModel):
    token: str
    vendor: VendorPublic


# ---------- Products ----------
class ProductCreate(BaseModel):
    name: str
    sku: Optional[str] = None
    unit: Optional[str] = None  # loaf, jar, piece
    unit_price: float = 0
    current_stock: float = 0
    low_stock_threshold: float = 0


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    unit: Optional[str] = None
    unit_price: Optional[float] = None
    current_stock: Optional[float] = None
    low_stock_threshold: Optional[float] = None


class Product(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    vendor_id: str
    name: str
    sku: Optional[str] = None
    unit: Optional[str] = None
    unit_price: float = 0
    current_stock: float = 0
    low_stock_threshold: float = 0
    created_at: str


# ---------- Markets ----------
MarketStatus = Literal['considering', 'applied', 'approved', 'active']


class MarketCreate(BaseModel):
    name: str
    address: Optional[str] = None
    day_of_week: Optional[str] = None  # Saturday
    recurrence_pattern: Optional[str] = None  # weekly, biweekly
    season_start: Optional[str] = None  # ISO date
    season_end: Optional[str] = None
    category_focus: Optional[str] = None
    is_candidate: bool = False
    status: MarketStatus = 'considering'


class MarketUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    day_of_week: Optional[str] = None
    recurrence_pattern: Optional[str] = None
    season_start: Optional[str] = None
    season_end: Optional[str] = None
    category_focus: Optional[str] = None
    is_candidate: Optional[bool] = None
    status: Optional[MarketStatus] = None


class Market(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    vendor_id: str
    name: str
    address: Optional[str] = None
    day_of_week: Optional[str] = None
    recurrence_pattern: Optional[str] = None
    season_start: Optional[str] = None
    season_end: Optional[str] = None
    category_focus: Optional[str] = None
    is_candidate: bool = False
    status: MarketStatus = 'considering'
    created_at: str


# ---------- Allocations ----------
class AllocationCreate(BaseModel):
    market_id: str
    product_id: str
    allocated_qty: float
    market_date: str  # ISO date
    remaining_qty: Optional[float] = None
    actual_units_sold: Optional[float] = None


class AllocationUpdate(BaseModel):
    allocated_qty: Optional[float] = None
    remaining_qty: Optional[float] = None
    actual_units_sold: Optional[float] = None


class Allocation(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    vendor_id: str
    market_id: str
    product_id: str
    allocated_qty: float
    remaining_qty: Optional[float] = None
    actual_units_sold: Optional[float] = None
    market_date: str
    created_at: str


# ---------- Compliance ----------
ComplianceType = Literal['permit', 'license', 'insurance', 'tax']
ComplianceStatus = Literal['active', 'expiring', 'expired']


class ComplianceCreate(BaseModel):
    type: ComplianceType
    name: str
    market_id: Optional[str] = None  # None = vendor-wide
    issue_date: Optional[str] = None
    expiration_date: str
    document_base64: Optional[str] = None  # data:mime;base64,...
    document_filename: Optional[str] = None
    notes: Optional[str] = None


class ComplianceUpdate(BaseModel):
    type: Optional[ComplianceType] = None
    name: Optional[str] = None
    market_id: Optional[str] = None
    issue_date: Optional[str] = None
    expiration_date: Optional[str] = None
    document_base64: Optional[str] = None
    document_filename: Optional[str] = None
    notes: Optional[str] = None


class ComplianceItem(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    vendor_id: str
    type: ComplianceType
    name: str
    market_id: Optional[str] = None
    issue_date: Optional[str] = None
    expiration_date: str
    document_base64: Optional[str] = None
    document_filename: Optional[str] = None
    notes: Optional[str] = None
    status: ComplianceStatus = 'active'
    created_at: str


# ---------- AI ----------
class AIRestockRequest(BaseModel):
    market_id: str
    market_date: str  # ISO date


class AIMarketFitRequest(BaseModel):
    market_id: str


class AIRevenueRequest(BaseModel):
    market_id: str
    market_date: str
    suggested: Optional[List[Dict[str, Any]]] = None  # optional override from restock
