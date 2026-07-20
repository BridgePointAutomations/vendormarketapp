# plan.md — MarketOps (React + FastAPI + MongoDB)

## 1) Objectives
- Prove the **core differentiator** works: Claude-powered AI outputs **valid, parseable JSON** for restock, market fit, and revenue projection.
- Build an MVP web app that covers all required user stories: inventory across markets, compliance tracking w/ reminders, and paid-tier AI tools.
- Implement the **design outline verbatim** (light-only, palette, Oswald/Karla/Caveat usage, stamp badge constraints).
- Ship a stable v1 via incremental testing (core POC → v1 app → full E2E).

---

## 2) Implementation Steps

### Phase 1 — Core AI POC (Isolation; do not proceed until green)
**User stories**
1. As a developer, I can call Claude using `EMERGENT_LLM_KEY` and get deterministic **JSON-only** responses.
2. As a vendor, I can receive restock suggestions per product for a market day.
3. As a vendor, I can get a fit evaluation for a “considering” market.
4. As a vendor, I can get a projected revenue number with rationale and confidence.
5. As a vendor with sparse history, I see “not enough history” handled safely (no fake precision).

**Steps**
- Websearch best practices for: Anthropic JSON-mode / tool-use style prompting, schema validation, and guardrails for “JSON only”.
- Implement `/app/backend/test_core.py`:
  - Uses `emergentintegrations` + model `claude-sonnet-4-5-20250929`.
  - Sends 3 prompts with realistic payloads (dense history + sparse history).
  - Validates with `json.loads` + minimal schema checks:
    - Restock: `[{product_id, suggested_qty, rationale, confidence}]`
    - Market rec: `{market_id, fit_assessment, reason, confidence}`
    - Revenue: `{market_id, market_date, projected_revenue, rationale, confidence}`
  - Enforces retry strategy on invalid JSON (max 2) + hard fail if still invalid.
- Output: console summary + exit code 0 only when all validations pass.

**Gate**: Phase 1 must pass end-to-end locally before any app build.

---

### Phase 2 — V1 App Development (MVP build around proven core)
**User stories**
1. As a vendor, I can sign up/login and see only my data.
2. As a vendor, I can manage products and immediately see low-stock signals.
3. As a vendor, I can add markets + set enrollment status (considering/applied/approved/active).
4. As a vendor, I can allocate inventory to a market date and update remaining during the day.
5. As a vendor, I can track compliance items (vendor-wide or per-market) and see expiring/expired states + in-app reminders.
6. As a free user, AI is locked; as a paid user (dev toggle), I can generate AI insights.

**Backend (FastAPI + Motor)**
- Create minimal but complete backend structure:
  - `server.py` (CORS, app init), `auth.py` (bcrypt + JWT), `models.py` (Pydantic), `db.py` (Motor client), `deps.py` (auth dependency).
  - Routes: `vendors, products, markets, allocations, compliance, ai, dashboard`.
- Mongo collections (vendor-scoped): `vendors, products, markets, allocations, compliance_items, reminders_log, revenue_projections`.
- Implement key business logic:
  - Compliance status: `expired` if < today; `expiring` if within 30 days; else `active`.
  - Reminder sweep (on dashboard load): write `reminders_log` entries at 30/14/7 days if not already sent.
  - Market-ready vs action-needed: market is “ready” if all linked compliance items are `active` (and vendor-wide required items are active).
  - Low-stock warnings: upcoming allocation below product threshold.
- AI routes (paid-tier gated via `vendor.tier`):
  - `POST /ai/restock`, `POST /ai/market-fit`, `POST /ai/revenue` using the Phase-1 proven prompt+schema.
  - Cache strategy MVP: store last AI output per (vendor, market, date) in Mongo; reuse unless inputs changed.

**Frontend (React + Tailwind + shadcn/ui)**
- Global design system:
  - Force light-only: `color-scheme: light` + white page background.
  - Tokens: page/canvas/charcoal/stamp-red/crate-green/mustard/line.
  - Fonts: Oswald (display), Karla (body), Caveat (AI only) + `.ai-note` class.
  - Components: `CrateCard`, `ProduceTag`, `StampBadge` (Dashboard only), `StatusPill` (Compliance), `StatRow`, `AINote`.
- Routes:
  - `/login`, `/signup`
  - `/` Dashboard: stat row + crate cards + stamp badge verdict; show compliance banner; show 1 AI note slot.
  - `/markets` My Markets: list + create/edit + enrollment status + “considering” flag.
  - `/products` Products CRUD + low-stock list.
  - `/allocate` Allocate: pick market + date; produce-tag grid; update remaining; revenue projection callout.
  - `/compliance` Compliance: grouped vendor-wide vs per-market; plain pills; document base64 upload.
  - `/ai-insights` AI Insights: stat row rollups + restock notes + market fit evals; upgrade CTA when free.
  - `/settings` profile + tier toggle (“Upgrade” flips tier).
- API client: JWT storage, auth headers, error states (401 redirect to login), loading/empty/sparse-data states.

**Conclude Phase 2**
- Seed demo data endpoint or script (1 vendor, 2 markets, 6 products, 6 compliance items, 4 allocations).
- Run testing agent for 1 full E2E pass; fix critical UX/data bugs.

---

### Phase 3 — Hardening, UX Polish, and Coverage
**User stories**
1. As a vendor, I can recover from invalid inputs with clear inline errors.
2. As a vendor, I can see consistent statuses (ready/action-needed, expiring/expired) across all pages.
3. As a vendor, AI outputs are clearly labeled and visually distinct (Caveat only for AI).
4. As a vendor, I can trust projections are cached and don’t spam the AI endpoint.
5. As a tester, I can log in with seeded credentials and explore a complete demo path.

**Steps**
- Refactor prompts + response validation into `utils/ai_client.py` with strict JSON parsing and schema enforcement.
- Improve caching invalidation rules (inputs change → regenerate).
- Add pagination/sorting where needed (products, compliance) without breaking design density.
- Add basic audit fields (`created_at`, `updated_at`) and tighten vendor scoping checks.
- Run testing agent again; fix regressions; finalize `test_credentials.md`.

---

## 3) Next Actions
1. Implement and run **Phase 1**: `/app/backend/test_core.py` until all 3 AI calls pass with strict JSON.
2. Scaffold backend + frontend in one cohesive pass (Phase 2), starting with dashboard → products → markets → allocate → compliance → AI insights.
3. Seed demo data + run E2E tests; patch issues before expanding.

---

## 4) Success Criteria
- Phase 1: `test_core.py` passes (valid JSON + sparse-history behavior) consistently.
- Phase 2: All listed user stories work end-to-end with vendor data isolation and paid-tier AI gating.
- Design: Light-only enforced; palette + typography rules adhered to; stamp badge only on Dashboard summaries; `.ai-note` only for AI text.
- Phase 3: Testing agent reports clean E2E flow with no critical issues; seeded demo + credentials documented.
