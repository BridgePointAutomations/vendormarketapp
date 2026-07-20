# plan.md — MarketOps (React + FastAPI + MongoDB)

## 1) Objectives
- Validate the **core differentiator**: Claude-powered AI outputs **valid, parseable JSON** for:
  - Restock suggestions
  - Market fit evaluation
  - Revenue projection (dense + sparse history)
- Deliver an MVP web app that covers required user stories:
  - Multi-market inventory allocation
  - Compliance tracking w/ expiring/expired statuses
  - In-app reminder logging (30/14/7 day intervals)
  - Paid-tier gating for AI tools (dev tier toggle)
- Implement the **design outline verbatim**:
  - **Light-only** UI
  - Specific palette
  - Fonts: **Oswald** (display), **Karla** (body), **Caveat** (**AI copy only** via `.ai-note`)
  - **Stamp badge constraints**: rotated stamp badges on Dashboard summaries only; plain pills for list density
- Ship a stable v1 with end-to-end validation and demo seeding.

**Current status:** MVP shipped.
- Phase 1 POC complete (all tests pass).
- Phase 2 full app build complete (backend + frontend).
- E2E testing complete (testing_agent_v3 overall 98.5% pass; no critical bugs).
- Demo credentials documented at `/app/memory/test_credentials.md`.

---

## 2) Implementation Steps

### Phase 1 — Core AI POC (Isolation; do not proceed until green)
**User stories**
1. As a developer, I can call Claude using `EMERGENT_LLM_KEY` and get deterministic **JSON-only** responses.
2. As a vendor, I can receive restock suggestions per product for a market day.
3. As a vendor, I can get a fit evaluation for a “considering” market.
4. As a vendor, I can get a projected revenue number with rationale and confidence.
5. As a vendor with sparse history, I see “not enough history” handled safely (no fake precision).

**Steps (completed)**
- Implemented `/app/backend/test_core.py` with:
  - `emergentintegrations` and Anthropic model (`claude-sonnet-4-6` in implementation).
  - Strict JSON extraction + `json.loads` parsing.
  - Minimal schema checks for:
    - Restock: `[{product_id, suggested_qty, rationale, confidence}]`
    - Market fit: `{market_id, fit_assessment, reason, confidence}`
    - Revenue: `{market_id, market_date, projected_revenue, rationale, confidence}`
  - Retry strategy on invalid JSON (max 2) and hard fail if still invalid.
  - Added explicit sparse-history test ensuring `confidence='low'`.

**Gate (met)**: Phase 1 passed locally end-to-end (all 4 tests PASS).

---

### Phase 2 — V1 App Development (MVP build around proven core)
**User stories**
1. As a vendor, I can sign up/login and see only my data.
2. As a vendor, I can manage products and immediately see low-stock signals.
3. As a vendor, I can add markets + set enrollment status (considering/applied/approved/active).
4. As a vendor, I can allocate inventory to a market date and update remaining during the day.
5. As a vendor, I can track compliance items (vendor-wide or per-market) and see expiring/expired states + in-app reminders.
6. As a free user, AI is locked; as a paid user (dev toggle), I can generate AI insights.

**Backend (FastAPI + Motor) — completed**
- Implemented backend structure:
  - `server.py` (FastAPI + CORS + startup index creation)
  - `auth.py` (bcrypt + JWT; paid-tier guard)
  - `models.py` (Pydantic request/response models)
  - `db.py` (Motor client + indexes)
  - `ai_client.py` (Claude wrapper with JSON-only enforcement)
- Implemented routes:
  - `routes/auth_routes.py`: signup/login/me + tier upgrade/downgrade
  - `routes/products_routes.py`: CRUD
  - `routes/markets_routes.py`: CRUD + candidate filtering
  - `routes/allocations_routes.py`: allocate per market/date + updates
  - `routes/compliance_routes.py`: CRUD + computed status + sweep
  - `routes/ai_routes.py`: restock, market-fit, revenue, revenue rollups (**paid-tier gated**)
  - `routes/dashboard_routes.py`: aggregated stats + market cards + action-needed + reminders
  - `routes/seed_routes.py`: idempotent demo seed
- Mongo collections (vendor-scoped):
  - `vendors, products, markets, allocations, compliance_items, reminders_log, revenue_projections`
- Key business logic shipped:
  - Compliance status: `expired` if past; `expiring` if within 30 days; else `active`.
  - Reminder sweep: creates `reminders_log` entries at 30/14/7 days, deduped.
  - Market-ready flag: based on vendor-wide + linked compliance items.
  - Low-stock warning: allocation below product threshold.
  - AI caching: revenue projections stored per (vendor, market, date); rollups are aggregation of cached values.

**Frontend (React) — completed**
- Implemented design system (from outline) in `src/index.css`:
  - Light-only enforced via `color-scheme: light only`.
  - Palette tokens: page/canvas/charcoal/stamp-red/crate-green/mustard/line.
  - Fonts loaded: Oswald/Karla/Caveat; `.ai-note` used for AI-generated copy only.
  - UI primitives: crate cards, produce tags, stamp badges, status pills, stat blocks, AI note block.
- Implemented auth + API client:
  - JWT stored in `localStorage`.
  - Axios interceptor applies token, redirects to `/login` on 401.
- Implemented routes/screens (8):
  - `/login` (includes **Try demo account** button → seeds + logs in)
  - `/signup`
  - `/` Dashboard: stat row, crate cards, stamp badges, compliance banner, one AI note slot (paid)
  - `/markets` My Markets: enrolled + candidate lists, CRUD modals, AI fit button (paid)
  - `/products`: CRUD modals; low-stock styling via produce tags
  - `/allocate`: market/date selector, bring/remaining edits, AI restock + apply-all, revenue projection callout (paid)
  - `/compliance`: grouped vendor-wide vs per-market; plain status pills; doc upload; reminders list
  - `/ai-insights`: paywall for free; paid view includes rollups + restock helper + candidate fit
  - `/settings`: profile editing + tier toggle (dev upgrade/downgrade)

**Conclude Phase 2 (completed)**
- Demo seed endpoint added: `POST /api/seed/demo`.
- Test credentials documented: `/app/memory/test_credentials.md`.
- E2E testing run via `testing_agent_v3`:
  - **Overall:** 98.5%
  - **Backend:** 97.8% (45/46)
  - **Frontend:** 100% (all pages functional)
  - No critical bugs; one low-priority note about `.test` email validation (expected behavior).

---

### Phase 3 — Hardening, UX Polish, and Coverage (next-phase / optional)
**User stories**
1. As a vendor, I can recover from invalid inputs with clear inline errors.
2. As a vendor, I can trust projections are cached and don’t spam AI endpoints.
3. As a vendor, I can manage larger datasets (more products/markets) without performance issues.
4. As a vendor, I can view/print/export compliance documents and records reliably.
5. As an admin (future), I can support billing + email reminders with minimal refactor.

**Steps (revised to reflect current status)**
- Prompt hardening:
  - Centralize/extend schema validation (optional JSON-schema level checks).
  - Improve caching rules for AI outputs (invalidate on relevant changes).
- Data model hardening:
  - Add `updated_at` across collections.
  - Add stricter ownership validations and unique constraints where appropriate (e.g., allocations per product+market+date).
- UX polish:
  - Inline form validation (avoid alert-based errors).
  - Better empty states for new vendors.
  - Add lightweight loading skeletons for AI calls.
- Operational upgrades (feature requests / later):
  - Real Stripe billing (replace tier toggle).
  - Real email provider for compliance reminders (Resend) + scheduled job.
  - File storage off Mongo (S3/Supabase Storage) if documents grow.

---

## 3) Next Actions
1. **Handoff-ready demo:** Use `/login` → **Try demo account** to explore the full app.
2. **Confirm feature roadmap:** choose which Phase-3 items matter most (billing, real email, exports, analytics, etc.).
3. If expanding, prioritize:
   - Billing + paid gating (Stripe)
   - Scheduled reminders (real email + cron)
   - Allocation/reporting enhancements (sales capture, profitability)

---

## 4) Success Criteria
- Phase 1: `test_core.py` passes consistently (valid JSON + sparse-history behavior).
- Phase 2: All listed user stories work end-to-end with vendor data isolation and paid-tier AI gating.
- Design: Light-only enforced; palette + typography rules adhered to; stamp badge only on Dashboard summaries; `.ai-note` only for AI text.
- Testing: E2E testing shows no critical bugs; demo seeding + credentials documented.

**Evidence (current build):**
- Phase 1: PASS
- Phase 2: COMPLETE
- E2E: 98.5% overall; no critical issues
- Demo creds: `/app/memory/test_credentials.md` (`demo@marketops.app` / `DemoVendor2025!`, paid tier)
