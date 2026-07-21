# MarketOps

**Stall to spreadsheet.** MarketOps is a multi-market operations tool for local
market vendors: track inventory across markets, watch compliance expirations,
plan packing lists, project revenue and profit, and get AI-assisted restock
suggestions and market-fit reviews.

- Frontend: React 19 + Craco + Shadcn UI + Tailwind
- Backend: FastAPI + Motor (async MongoDB)
- AI: Claude Sonnet via the official `anthropic` SDK
- Local dev: served behind Kubernetes ingress (`/api/*` → backend `:8001`, all
  other paths → frontend `:3000`)
- Deployment: see [`DEPLOY.md`](./DEPLOY.md) for the Vercel setup (single
  project — static frontend + FastAPI as a Python serverless function)

---

## Repo layout

```
/app
├── backend/               FastAPI service (routes/, ai_client.py, auth, models, utils)
│   └── requirements.txt
├── frontend/              CRA + Craco React app
│   ├── src/
│   │   ├── pages/         Dashboard, Markets, Products, Allocate, Compliance,
│   │   │                  Checklists, AIInsights, Settings, Login, Signup, Onboarding
│   │   ├── components/    Layout, ui-market, Modals, PnlCompareCard, PackingNextCard, ...
│   │   ├── lib/           api client, auth context, format helpers, download helper
│   │   └── context/       OnboardingContext
│   └── package.json
├── memory/                agent notes & credentials
├── plan.md                current implementation plan (kept up-to-date)
└── README.md              you are here
```

---

## Environment variables

### `/app/backend/.env`

| Variable          | Required | Notes                                                                         |
|-------------------|----------|-------------------------------------------------------------------------------|
| `MONGO_URL`       | yes      | e.g. `mongodb://localhost:27017` (preconfigured in the container)             |
| `DB_NAME`         | yes      | Database name, e.g. `marketops`                                               |
| `JWT_SECRET`      | yes      | **Must be a strong random value.** The server refuses to start on `change-me` |
| `JWT_ALGORITHM`   | no       | Defaults to `HS256`                                                           |
| `JWT_EXPIRE_HOURS`| no       | Defaults to `168` (7 days)                                                    |
| `ANTHROPIC_API_KEY`| yes     | Powers Claude via the `anthropic` SDK (AI Insights routes only)              |
| `ANTHROPIC_MODEL` | no       | Defaults to `claude-sonnet-4-5-20250929`                                      |
| `CORS_ORIGINS`    | yes      | Comma-separated allowed origins (e.g. `https://your-app.vercel.app`). `*` still works in dev but disables credential passing |

Generate a JWT secret with:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### `/app/frontend/.env`

| Variable                | Required | Notes                                                            |
|-------------------------|----------|------------------------------------------------------------------|
| `REACT_APP_BACKEND_URL` | yes      | Full backend URL. The frontend appends `/api` at request time.   |

> Do **not** hardcode URLs anywhere; always read from these env vars.

---

## Running the app

The container ships with `supervisor` managing both processes.

```bash
supervisorctl status                # see current state
supervisorctl restart backend       # after backend .env or requirements.txt changes
supervisorctl restart frontend      # after adding a new yarn dep
```

Hot reloading is enabled for both, so day-to-day code edits do not need a
restart.

Logs live in `/var/log/supervisor/`:

```bash
tail -n 100 /var/log/supervisor/backend.err.log
tail -n 100 /var/log/supervisor/frontend.err.log
```

If you're running locally instead of the container:

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend (use yarn, never npm)
cd frontend
yarn install
yarn start        # http://localhost:3000
```

---

## Seed demo data

There is an endpoint that seeds a demo vendor with products, markets,
allocations, and compliance items. Handy for exploring the paid-tier AI
features:

```bash
curl -X POST "$REACT_APP_BACKEND_URL/api/seed/demo"
```

That returns credentials (or you can use the ones already stored in
`memory/test_credentials.md`):

```
email:    demo@marketops.app
password: DemoVendor2025!
```

Log in at `/login` in the running frontend to see the seeded state, including
several logged market days for Shaker Square and Coit Road so the AI features
have enough history.

---

## Key features

- **Multi-market inventory & allocations** — enroll markets, add products,
  allocate per market date, and log remaining or actual units sold.
- **Compliance tracking** — permits, licenses, insurance, tax. Status
  auto-derived from expiration date; 30/14/7-day reminder cadence
  (in-app; email delivery not yet wired).
- **Per-market-day P&L** — set `unit_cost` on products, `default_booth_fee` on
  markets, override booth fee per date via `market_days`, and get an estimated
  Revenue / COGS / Booth / Net Profit breakdown per market day and per season.
- **Season P&L export** — download a CSV per market for taxes/records
  (`GET /api/pnl/season/{market_id}/export`).
- **Market comparison widget** — Dashboard ranks your enrolled markets by
  estimated net profit per market day.
- **Copy-last-season markets** — one click clones your active markets into
  "considering" entries for the new season.
- **Checklists** — seeded getting-started list, plus reusable per-market
  packing checklists with a printable CSV export and midnight auto-reset
  after market day.
- **AI Insights (paid tier)**:
  - Restock suggestions grounded in real allocation history (returns an
    explicit `insufficient_history` state when there are fewer than 3
    logged market dates instead of guessing).
  - Revenue & profit projections that include `unit_cost` and `booth_fee`.
  - Market-fit evaluations for candidate markets.
  - Fingerprint-based DB result caching so repeat calls return instantly and
    auto-invalidate when your data changes.

Tier gating: the AI endpoints check `vendor.tier == 'paid'`. Flip a vendor to
paid by editing the `vendors` document directly or via the Settings toggle if
present.

---

## Development conventions

- Use **UUIDs**, not `ObjectId`.
- All datetimes are stored as ISO strings in **UTC**.
- **All API routes** are mounted under `/api`. Do not bypass this prefix — it
  is required by the ingress.
- Cross-router imports on the backend are avoided; shared helpers live in
  `backend/utils.py`.
- Frontend never imports `swr` (removed); async data is fetched via `axios`
  directly through `lib/api.js`.
- The design system lives in `frontend/src/App.css` (fonts, palette, stamp
  badges, produce tags). Do not introduce a new UI library.

---

## Testing quickstart

Manual endpoint smoke test with curl:

```bash
export BASE="$REACT_APP_BACKEND_URL/api"
TOKEN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@marketops.app","password":"DemoVendor2025!"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['token'])")

curl -s "$BASE/dashboard" -H "Authorization: Bearer $TOKEN" | python -m json.tool
curl -s "$BASE/pnl/compare" -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

Backend has a small AI POC script at `backend/test_core.py` you can also run
directly.

---

## Roadmap / not yet wired

- Resend (or SendGrid) transactional email delivery for the existing
  compliance reminder cadence and a weekly low-stock digest. Sweep logic
  and per-item channel state already exist in the DB.
- Stripe billing to replace the manual `tier` toggle.
- Sales/profitability reporting dashboards.
- Document export beyond CSV (PDF invoicing, per-vendor account statements).
