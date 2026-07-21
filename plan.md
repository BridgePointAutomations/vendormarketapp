# Plan — Onboarding (Complete) + V2 Core Features (P&L + Checklists + AI Refinements)

## 1) Objectives

### Onboarding (v1 UX)
- Collect richer vendor profile data via a lower-friction **2-step signup**.
- Use **optional, persistent nudges** (no hard gates):
  - **Welcome modal** shown once per session until vendor dismisses.
  - **Dashboard “Set up your stall” checklist** (whole-card dismiss).
  - **Optional setup wizard** accessible anytime.
  - **Optional guided tour** user-initiated and replayable.
- Preserve backward compatibility: existing vendors should **not be nagged**.
- Maintain MarketOps stamp/paper aesthetic and avoid new UI libraries.

### V2 Core Tracking (Free tier)
- Add basic profitability clarity:
  - **Per-market-day estimated P&L** answering: *“Did I make money at this market today?”*
  - **Season view per market**: total estimated net profit across logged dates.
- Add habit-forming workflows:
  - **Getting-started checklist** for new vendors (generic orientation, no legal advice).
  - **Packing checklist per market** with per-date reset after market date passes.

### AI Refinements (Paid tier only)
- Improve AI outputs while keeping tracking features fully functional without Claude:
  - Explicit **insufficient-history** state (no low-confidence guessing).
  - Include booth fee + unit cost context for projected profit.
  - Cache AI outputs to avoid recomputation.
  - Use **prompt caching** if supported by the current Anthropic integration; otherwise rely on DB result caching.

**Status / progress so far**
- ✅ Onboarding refinement is fully implemented and manually verified via screenshots:
  - 2-step signup with profile fields
  - Welcome modal (once/session + persistent dismissal)
  - Dashboard onboarding checklist
  - Optional guided tour overlay
  - Optional setup wizard at `/onboarding`
  - Settings: replay tour, run wizard, restore checklist, re-show welcome
- ✅ Backend supports onboarding flags via `PATCH /auth/me/onboarding`.
- ⏳ V2 work has started:
  - **Phase A: Per-market-day P&L** — **COMPLETED**
  - **Phase B: Checklists** — **COMPLETED**
  - **Phase C: AI Refinements** — **COMPLETED**

---

## 2) Implementation Steps

### Phase 1 — Onboarding (COMPLETE)
**Delivered**
- Backend
  - Vendor profile fields: `city`, `primary_market_type`, `expected_markets_count`
  - Onboarding UX flags: `welcome_dismissed`, `tour_completed`, `onboarding_completed`, `checklist_dismissed`
  - Endpoint: `PATCH /auth/me/onboarding`
  - Backfill defaults for legacy vendors to avoid nagging
- Frontend
  - 2-step Signup UI
  - Welcome modal (once per session)
  - Dashboard checklist (whole-card dismiss)
  - Optional guided tour overlay
  - Optional wizard (`/onboarding`) with required fields inside steps
  - Settings controls for onboarding UX

**Verification**
- Manual verification via screenshots:
  - Welcome modal shows once per session
  - Checklist updates and can be dismissed
  - Tour spotlights sidebar nav elements
  - Wizard stepper and validations work
  - Existing/demo vendors are not interrupted

---

### Phase A — Per-Market-Day P&L (Free tier) — IN PROGRESS
**Purpose**
- Answer: *“Did I make money at this market today?”* using vendor-entered estimated inputs.

**User stories**
1. As a vendor, I can set a **default booth fee** on a market.
2. As a vendor, I can override booth fee per specific market date.
3. As a vendor, I can optionally track **unit cost** per product.
4. As a vendor, after logging remaining stock / units sold, I can see an estimated market-day P&L.
5. As a vendor, I can see season-to-date estimated profit per market.

**Schema additions (Mongo collections / fields)**
- Products: add optional `unit_cost` (numeric).
- Markets: add optional `default_booth_fee` (numeric).
- New collection: `market_days`
  - `id`, `vendor_id`, `market_id`, `market_date` (YYYY-MM-DD)
  - `booth_fee` (numeric; default from market)
  - `notes` (optional)
  - `created_at`
  - Unique constraint: `(vendor_id, market_id, market_date)` (enforced via index).

**Business logic**
- P&L (all labeled **Estimate**; no accounting/tax claims):
  - `units_sold` per allocation:
    - prefer `actual_units_sold` if present
    - else fallback to `max(0, allocated_qty - remaining_qty)`
  - `revenue = Σ(units_sold × unit_price)`
  - `cogs = Σ(units_sold × unit_cost)` (unit_cost optional → treat missing as 0)
  - `net = revenue − booth_fee − cogs`

**API additions**
- `GET /market-days` (filter by `market_id`, `market_date`)
- `POST /market-days` (create/upsert by `(vendor_id, market_id, market_date)`)
- `PATCH /market-days/{id}`
- `GET /pnl/day` (params: `market_id`, `market_date`) → returns itemized revenue/cogs/booth_fee/net + per-product breakdown
- `GET /pnl/season/{market_id}` → totals across all market dates that have logged allocations/actuals

**UI changes**
- Allocate page:
  - Booth fee input for selected market/date:
    - auto-inherit from `market.default_booth_fee` for new market day rows
    - allow override per date
  - Estimated P&L card visible when allocations exist (and/or when any actuals/remaining are logged)
  - Copy: “All figures are estimates based on what you enter. Not tax or accounting advice.”
- Markets page:
  - Add `default_booth_fee` field in market modal
  - Season snapshot modal for each enrolled market (season net profit)

**Phase A test pass**
- Market default booth fee saves and is returned.
- Market day booth fee inherits and can override.
- Product unit cost saves and is used in P&L.
- P&L computation matches formula and uses correct units_sold priority.

---

### Phase B — Checklists (Free tier) — COMPLETED
**Purpose**
- Help new vendors set up correctly and create a weekly “packing” habit.

**User stories**
1. As a new vendor, I get a seeded **getting-started** checklist.
2. As a vendor, I can create a reusable **packing template** per market.
3. As a vendor, before each market day I can check items off; after the market passes, the list resets.
4. As a vendor, the Dashboard shows packing completion status for my next market day.
5. As a vendor, I can optionally link a getting-started checklist item to a tracked compliance document.

**Schema (Mongo collections)**
- `checklists`
  - `id`, `vendor_id`, `market_id` (nullable), `type` in `('getting_started','packing')`, `name`, `created_at`
- `checklist_items`
  - `id`, `checklist_id`, `label`, `sort_order`, `checked` (template default), `compliance_item_id` (optional), `created_at`

**Seeding on signup**
- Create vendor-wide checklist (`type='getting_started'`) with generic items:
  - Vendor license
  - Liability insurance
  - Market application
  - Sales tax registration
  - Basic equipment
- Copy must be jurisdiction-neutral and explicitly framed as orientation guidance (not legal advice).

**Packing checklist behavior**
- One packing template per market (recommended default: create on first visit / first market add).
- Per-market-date checklist instance behavior:
  - Reset at **midnight the day after** `market_date`.
  - Implementation approach:
    - Store checks per `(checklist_id, market_date, item_id)` in a separate structure *or*
    - Derive “current” checked state for the active upcoming date and clear state when date is in the past.
  - (Exact data modeling to be finalized during implementation to guarantee reset correctness.)

**Dashboard integration**
- Surface packing checklist completion for next upcoming market day:
  - “Packing: 7/12 complete for Saturday – Shaker Square”
  - Link to open that market’s packing checklist for the date.

**Phase B test pass**
- Getting-started checklist auto-created on new signup.
- Packing checklist checks persist for a date, reset after date passes.
- Dashboard accurately reflects completion for next market day.

---

### Phase C — AI Refinements (Paid tier only) — COMPLETED
**Guiding constraints**
- AI outputs are advisory only; never auto-apply without user action.
- Core tracking features must work fully if Claude is unavailable (graceful degradation).

**3a. Restock suggestions**
- Add explicit `insufficient_history` state when allocation history rows < N (recommend N=3 market dates).
- Never guess when insufficient.

**3c. Projected revenue/profit per market day**
- Extend payload to include:
  - `unit_cost` per product
  - `booth_fee` (from market_days or market default)
- Return structured JSON including `projected_profit` in addition to `projected_revenue`.
- Cache results in `revenue_projections` (already exists) and avoid recompute on every page view.

**3d. Season rollup per market**
- Pure aggregation (no AI call):
  - Blend projections with actuals where available:
    - actual revenue = Σ(units_sold × unit_price)
  - Provide per-market trend vs prior weeks.

**Prompt caching recommendation**
- Default: **DB-level result caching** (always safe, already partially implemented).
- Additionally: attempt Anthropic prompt caching (`cache_control`) **if** `emergentintegrations` supports passing through caching directives.
  - If unsupported, do not block; ship DB caching only.

**Phase C test pass**
- ✅ Restock returns `insufficient_history: true` when distinct market_dates < 3 (verified with Beachwood: 0 dates → clear "not enough history" message, no AI call).
- ✅ Restock with sufficient history returns high-quality suggestions AND intelligently reasons about anomalous data (excluded 2026-07-23 outlier).
- ✅ Revenue endpoint returns `projected_revenue`, `projected_cogs`, `projected_booth_fee`, `projected_profit` (verified Shaker: rev $488.65 − cogs $91.35 − fee $45 = profit $352.20).
- ✅ Revenue with sparse history returns `insufficient_history: true` with null projections.
- ✅ DB-level result caching with fingerprint auto-invalidation: uncached ~19s, cached hits <0.4s. Fingerprint incorporates allocation count + market_day count + latest created_at, so any data change auto-invalidates.
- ✅ Rollup extended with `avg_profit_per_visit`, `total_profit`, and per-day `profit` in series.
- ✅ AI Insights page now shows a `Season Projected Profit` stat and per-market `Est. profit / visit` rows.
- ⚠️ Prompt caching via Anthropic `cache_control` NOT supported by current `emergentintegrations.LlmChat` wrapper (system_message is a plain string, no pass-through). Gracefully fell back to DB result caching only, as planned.
- ✅ AI downtime does not break any non-AI flows (P&L, checklists, CRUD all independent).

---

## 3) Next Actions
1. **Finish Phase A**:
   - Add `unit_cost` to product model/routes + UI
   - Add `default_booth_fee` to market model/routes + UI
   - Add `market_days` collection, routes, and indexes
   - Implement P&L compute endpoints and Allocate UI card
   - Add Markets “season snapshot” modal
2. Phase A validation pass (manual + basic tests).
3. Implement **Phase B** checklists (schema + seeding + UI + dashboard surfacing).
4. Implement **Phase C** AI refinements (history thresholds, profit projection, caching, rollups).

---

## 4) Success Criteria

### Onboarding
- ✅ No hard gating.
- ✅ Welcome modal once per session until dismissal.
- ✅ Checklist is persistent and dismissible.
- ✅ Wizard and tour are optional and replayable.
- ✅ Existing vendors are not nagged.

### Phase A — P&L (Free)
- Vendor can set market `default_booth_fee` and override per market day.
- Vendor can set product `unit_cost`.
- Allocate page shows estimated revenue/COGS/booth fee/net for a market date.
- Season view shows total net profit per market.
- All profitability copy is clearly labeled **Estimate** with no accounting/tax claims.

### Phase B — Checklists (Free)
- Getting-started checklist auto-seeded on signup with generic orientation items.
- Packing checklist template per market and per-date checkoff.
- Packing checklist resets at midnight the day after market date.
- Dashboard shows next market packing completion status.

### Phase C — AI (Paid)
- ✅ Restock and revenue never fabricate data when history is insufficient (`insufficient_history: true` short-circuit at N<3 distinct market dates).
- ✅ Revenue projections include `projected_profit` alongside revenue, using injected `unit_cost` and `booth_fee` from market_days/market defaults.
- ✅ AI responses are cached via fingerprint-based DB cache in `ai_cache` collection (auto-invalidates on data changes). Core app works fully without Claude.
- ⚠️ Anthropic prompt caching (`cache_control`) not exposed by `emergentintegrations`; DB result caching used as the graceful-fallback strategy per plan.
