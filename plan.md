# Plan — Refined Onboarding (2-step Signup + Optional Welcome Modal + Optional Wizard + Optional Tour + Dashboard Checklist)

## 1) Objectives
- Collect richer vendor profile data via a lower-friction **2-step signup**.
- Replace hard onboarding gates with **optional, persistent nudges**:
  - A **Welcome modal** that appears once per session until dismissed.
  - A **Dashboard “Set up your stall” checklist** that stays visible until dismissed or completed.
  - An **optional setup wizard** (guided first market/product/compliance) accessible from the modal/checklist.
  - An **optional guided tour** (spotlight tooltips) user-initiated from the modal/checklist/Settings.
- Preserve backward compatibility: existing vendors should **not be nagged** by new onboarding UI.
- Maintain MarketOps stamp/paper aesthetic and avoid new UI libraries.

**Status / progress so far**
- ✅ Existing app has Signup/Login/Dashboard, CRUD for Markets/Products/Compliance/Allocations, AI integration, and Settings.
- ⏳ Onboarding refinement work (this plan) is pending implementation.

---

## 2) Implementation Steps

### Phase 1 — Data + API + 2-step Signup (No gates)
**User stories**
1. As a new vendor, I can sign up quickly (2 steps) while still providing key business context.
2. As an existing vendor, I am not interrupted by new onboarding prompts.
3. As the app, I can persist onboarding UI preferences per vendor.

**Backend (Phase 1)**
- Extend vendor schema (non-breaking):
  - Profile fields: `city`, `primary_market_type`, `expected_markets_count`
  - Onboarding UX flags: `welcome_dismissed`, `tour_completed`, `onboarding_completed`, `checklist_dismissed`
- Defaults / backfill behavior:
  - **Existing vendors** (missing fields):
    - `welcome_dismissed=true` (do not nag)
    - `tour_completed=true` (do not auto-tour; tour is optional anyway)
    - `onboarding_completed=true` (informational)
    - `checklist_dismissed=true` or `false`? (default **true** recommended to avoid new UI surprises; confirm during build)
  - **New signups**:
    - `welcome_dismissed=false`
    - `tour_completed=false`
    - `onboarding_completed=false`
    - `checklist_dismissed=false`
- Update models:
  - `SignupRequest` to accept new profile fields.
  - `VendorPublic` / `VendorUpdate` to return/patch these fields.
- Add endpoint:
  - `PATCH /auth/me/onboarding` to update any subset of:
    - `welcome_dismissed`, `tour_completed`, `onboarding_completed`, `checklist_dismissed`

**Frontend (Phase 1)**
- Update `Signup` to **2-step UI**:
  - Step 1: `email`, `password`
  - Step 2: `business_name`, `city`, `primary_market_type`, `expected_markets_count`, `owner_name`, `phone`, `category`
- Wire new fields end-to-end to `/auth/signup`.
- Validation:
  - `expected_markets_count` numeric and sane (min 0).

**Phase 1 test pass**
- New signup persists new fields and returns vendor public model with expected defaults.
- Existing vendor login is unaffected and not nagged.

---

### Phase 2 — Welcome Modal + Dashboard Checklist (Persistent nudges)
**User stories**
1. As a new vendor, after signup/login I see a clear next step without being blocked.
2. As a vendor, I can dismiss onboarding prompts permanently if I want.
3. As a vendor, I see a checklist that updates automatically as I complete setup tasks.

**Welcome modal (once per session)**
- Show rule:
  - Display if vendor `welcome_dismissed=false` **and** sessionStorage flag `welcome_seen_this_session` is not set.
  - On show, set `sessionStorage.welcome_seen_this_session=true`.
- Modal CTAs:
  - Primary: **Take the tour**
  - Secondary: **Set up my first market** (goes to optional wizard)
  - Close: **Maybe later** (closes; does **not** set `welcome_dismissed=true`; will show next session)
  - Checkbox: **Don’t show this again** (on close sets `welcome_dismissed=true`)
- Auto-dismiss logic (confirmed):
  - Clicking **Take the tour** OR **Set up my first market** auto-sets `welcome_dismissed=true` via `PATCH /auth/me/onboarding`.

**Dashboard checklist (whole-card dismiss only)**
- New component: “Set up your stall” card at top of Dashboard.
- Visible when:
  - `checklist_dismissed=false` AND (optionally) there are incomplete items.
- Dismiss behavior:
  - Header “×” hides entire card forever: sets `checklist_dismissed=true`.
- Items (auto-checked by real data):
  - Add a market (based on `/markets` count)
  - Add a product (based on `/products` count)
  - Add compliance (based on `/compliance` count) — recommended
  - Create first allocation (based on `/allocations` for upcoming date)
  - Take the tour (based on `tour_completed` flag)
- Each item deep-links to the relevant page or triggers the tour.

---

### Phase 3 — Optional Setup Wizard Route + Optional Guided Tour + Settings replay
**User stories**
1. As a vendor, I can choose a guided setup wizard when I want structured onboarding.
2. As a vendor, I can take (or replay) a guided tour at any time.

**Optional setup wizard**
- Route: `/onboarding` (not gated; accessible any time).
- Entry points:
  - Welcome modal: “Set up my first market”
  - Dashboard checklist: “Add your first market / product / compliance” can link to wizard or respective pages (decide per UX)
  - Settings: “Run setup wizard”
- Steps (linear; **optional overall**, but within wizard steps enforce required fields):
  1. Welcome
  2. Add first market (**required fields**: `name`, `day_of_week`, `address`)
  3. Add first product (**required fields**: `name`, `unit`, `unit_price`, `current_stock`)
  4. Add first compliance item (optional step; but if user chooses to add, apply standard validations)
  5. Done → set `onboarding_completed=true`

**Optional guided tour (no new libs)**
- User-initiated only (no automatic trigger):
  - Welcome modal “Take the tour”
  - Checklist item “Take the tour”
  - Settings “Replay tour”
- 4-stop spotlight tour (targets may adjust to final UI):
  1. Markets section / “Manage”
  2. Products entry point
  3. Compliance banner/section
  4. Allocate entry point
- Completion:
  - On finish or skip: set `tour_completed=true`.

**Settings additions**
- Add controls:
  - “Replay tour” (sets `tour_completed=false` then starts tour, or directly starts tour without changing flag)
  - “Run setup wizard”
  - Optional: “Show welcome modal again” (sets `welcome_dismissed=false`) (nice-to-have)

---

### Phase 4 — E2E testing + polish
**User stories**
1. As a vendor, onboarding UI never blocks me from using the app.
2. As a vendor, prompts are helpful but not annoying.
3. As the app, I handle API failures gracefully.

**Testing**
- Add/extend tests for:
  - Signup 2-step and new fields persistence
  - Welcome modal session behavior (once per session)
  - Welcome modal dismissal logic and vendor flag persistence
  - Checklist display, deep links, and whole-card dismiss
  - Wizard required fields and completion flag
  - Tour completion flag + replay from Settings

**Polish**
- Clear error banners + retry on wizard step submissions.
- Keep all UI consistent with the stamp/paper design system.
- Ensure `/auth/me` always returns all onboarding flags with sane defaults.

---

## 3) Next Actions
1. Implement backend vendor schema extensions + `PATCH /auth/me/onboarding` + safe defaults/backfill behavior.
2. Update Signup to 2-step and wire new profile fields end-to-end.
3. Implement Welcome modal (once per session) + persistence rules.
4. Implement Dashboard checklist card (dynamic completion + whole-card dismiss).
5. Implement optional `/onboarding` wizard route (required fields inside wizard) + set `onboarding_completed=true`.
6. Implement optional guided tour overlay + Settings replay controls.
7. Run E2E/regression tests; fix until stable.

---

## 4) Success Criteria
- ✅ No hard gating: vendors can always access the app immediately after signup/login.
- ✅ Signup saves: `business_name`, `city`, `primary_market_type`, `expected_markets_count` (plus existing fields).
- ✅ Welcome modal:
  - Shows **once per session** until `welcome_dismissed=true`.
  - Clicking **Take the tour** or **Set up my first market** sets `welcome_dismissed=true`.
- ✅ Dashboard checklist:
  - Persists until dismissed via header “×” (whole-card dismiss) or completion.
  - Reflects real completion state without manual refresh.
- ✅ Setup wizard is optional, but enforces required fields for market/product inside the wizard.
- ✅ Tour is optional, user-initiated, and completion sets `tour_completed=true`.
- ✅ Existing vendors are not nagged by new onboarding UI (welcome defaults to dismissed).
- ✅ All tests pass; no regressions in auth, CRUD, or dashboard loading.
