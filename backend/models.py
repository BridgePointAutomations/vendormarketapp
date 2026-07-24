from pydantic import BaseModel, Field, EmailStr, ConfigDict, model_validator
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
    city: Optional[str] = None
    primary_market_type: Optional[str] = None
    expected_markets_count: Optional[int] = None
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
    unit_price: float = Field(0, ge=0)
    unit_cost: Optional[float] = Field(default=None, ge=0)  # estimated COGS per unit (optional)
    current_stock: float = Field(0, ge=0)
    low_stock_threshold: float = Field(0, ge=0)


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    unit: Optional[str] = None
    unit_price: Optional[float] = Field(default=None, ge=0)
    unit_cost: Optional[float] = Field(default=None, ge=0)
    low_stock_threshold: Optional[float] = Field(default=None, ge=0)
    # current_stock is intentionally not editable here — use POST /products/{id}/stock-adjustment


class Product(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    vendor_id: str
    name: str
    sku: Optional[str] = None
    unit: Optional[str] = None
    unit_price: float = Field(0, ge=0)
    unit_cost: Optional[float] = None
    current_stock: float = Field(0, ge=0)
    low_stock_threshold: float = Field(0, ge=0)
    created_at: str


# ---------- Stock adjustments / audit ----------
StockChangeReason = Literal['restock', 'recount', 'sale', 'sale_reversal']


class StockAdjustment(BaseModel):
    mode: Literal['add', 'set']  # add: delta restock; set: absolute recount
    quantity: float
    reason: Optional[str] = None

    @model_validator(mode='after')
    def _check_quantity(self):
        if self.mode == 'add' and self.quantity <= 0:
            raise ValueError('quantity must be > 0 when mode is "add"')
        if self.mode == 'set' and self.quantity < 0:
            raise ValueError('quantity must be >= 0 when mode is "set"')
        return self


class StockEvent(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    vendor_id: str
    product_id: str
    change: float  # signed delta actually applied
    resulting_stock: Optional[float] = None
    reason: StockChangeReason
    note: Optional[str] = None
    allocation_id: Optional[str] = None
    created_at: str


# ---------- Markets ----------
MarketStatus = Literal['considering', 'applied', 'approved', 'active']


class MarketCreate(BaseModel):
    name: str
    address: Optional[str] = None
    day_of_week: Optional[str] = None
    recurrence_pattern: Optional[str] = None  # 'weekly' (recurring) | 'one_off' | None (treated as one-off)
    season_start: Optional[str] = None
    season_end: Optional[str] = None
    category_focus: Optional[str] = None
    is_candidate: bool = False
    status: MarketStatus = 'considering'
    default_booth_fee: Optional[float] = None  # estimated booth fee per market day


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
    default_booth_fee: Optional[float] = None


class Market(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    vendor_id: str
    name: str
    address: Optional[str] = None
    day_of_week: Optional[str] = None
    recurrence_pattern: Optional[str] = None  # 'weekly' (recurring) | 'one_off' | None (treated as one-off)
    season_start: Optional[str] = None
    season_end: Optional[str] = None
    category_focus: Optional[str] = None
    is_candidate: bool = False
    status: MarketStatus = 'considering'
    default_booth_fee: Optional[float] = None
    created_at: str


# ---------- Allocations ----------
class AllocationCreate(BaseModel):
    market_id: str
    product_id: str
    allocated_qty: float = Field(ge=0)
    market_date: str  # ISO date
    remaining_qty: Optional[float] = Field(default=None, ge=0)
    actual_units_sold: Optional[float] = Field(default=None, ge=0)


class AllocationUpdate(BaseModel):
    allocated_qty: Optional[float] = Field(default=None, ge=0)
    remaining_qty: Optional[float] = Field(default=None, ge=0)
    actual_units_sold: Optional[float] = Field(default=None, ge=0)


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


# ---------- Market Days (booth fee override + notes per specific date) ----------
class MarketDayCreate(BaseModel):
    market_id: str
    market_date: str  # ISO date YYYY-MM-DD
    booth_fee: Optional[float] = None  # if None on create, inherits market.default_booth_fee
    notes: Optional[str] = None


class MarketDay(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    vendor_id: str
    market_id: str
    market_date: str
    booth_fee: Optional[float] = None
    notes: Optional[str] = None
    created_at: str


# ---------- Compliance ----------
ComplianceType = Literal['permit', 'license', 'insurance', 'tax']
ComplianceStatus = Literal['active', 'expiring', 'expired']


class ComplianceCreate(BaseModel):
    type: ComplianceType
    name: str
    market_id: Optional[str] = None
    issue_date: Optional[str] = None
    expiration_date: str
    document_base64: Optional[str] = None
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
    market_date: str


class AIMarketFitRequest(BaseModel):
    market_id: str


class AIRevenueRequest(BaseModel):
    market_id: str
    market_date: str
    suggested: Optional[List[Dict[str, Any]]] = None
