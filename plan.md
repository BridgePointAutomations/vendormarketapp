# Plan — Refined Onboarding (Signup + Required Wizard + Dashboard Tour/Checklist)

## 1) Objectives
- Collect richer vendor profile data via a lower-friction 2-step signup.
- Enforce a required first-time setup wizard that guides vendors to a usable “first market day” state.
- Keep post-onboarding momentum via a persistent Dashboard checklist and a one-time 4-stop guided tour.
- Preserve backward compatibility: existing vendors should not be blocked by new onboarding gates.
- Maintain MarketOps stamp/paper aesthetic and avoid new UI libraries.

---

## 2) Implementation Steps

### Phase 1 — Core Flow POC (Onboarding Gate + Flags + Minimal UI)
**User stories**
1. As a new vendor, I must complete onboarding before I can use the app.
2. As a returning vendor, I should not be forced back through onboarding after completing it.
3. As an existing vendor (pre-change), I should land normally without onboarding blockers.
4. As a new vendor, I want to land on the Dashboard and immediately see what to do next.
5. As a new vendor, I want my onboarding progress to persist across refreshes.

**Backend (POC)**
- Extend vendor schema (non-breaking): `city`, `primary_market_type`, `expected_markets_count`, `onboarding_completed`, `tour_completed`.
- Defaults / migration behavior:
  - When reading vendors missing flags: treat `onboarding_completed=true` and `tour_completed=true` (or set at login/me) to avoid blocking existing accounts.
  - For new signup: `onboarding_completed=false`, `tour_completed=false`.
- Update `SignupRequest`, `VendorPublic`, `VendorUpdate` models accordingly.
- Add endpoint: `PATCH /auth/me/onboarding` to update `{ onboarding_completed?, tour_completed? }`.

**Frontend (POC)**
- Add route guard (in app router or auth provider): if logged-in and `onboarding_completed=false`, redirect to `/?onboarding=1` or `/onboarding` (keep it simple) and block navigation elsewhere.
- Create barebones `OnboardingWizard` page with steps and “Continue” actions; for POC, stub create actions with existing Markets/Products/Compliance forms or minimal inline forms.
- Dashboard: add a simple checklist card (“Set up your stall”) driven by computed completion states (markets/products/compliance existence).

**POC test pass**
- New signup → forced wizard → finish → dashboard accessible.
- Refresh mid-wizard retains required gating.
- Existing vendor account not blocked.

---

### Phase 2 — V1 App Development (Full Signup + Wizard + Tour + Checklist)
**User stories**
1. As a new vendor, I can complete signup in 2 steps so it feels fast.
2. As a new vendor, I can add my first market and first product during onboarding.
3. As a new vendor, I can optionally add a compliance item without being blocked.
4. As a vendor, I see a persistent checklist on the Dashboard that auto-updates as I complete tasks.
5. As a first-time user, I get a one-time guided tour of key Dashboard actions.

**Signup improvements**
- Convert Signup to 2-step UI:
  - Step 1: email, password.
  - Step 2: business_name, city, primary_market_type, expected_markets_count, owner_name, phone, category.
- Backend: accept the new fields in `/auth/signup`; store them on vendor.
- Validation: ensure expected_markets_count is numeric and sane (min 0).

**Required setup wizard (non-skippable)**
- Steps (linear, required except compliance):
  1. Welcome (sets context, shows progress)
  2. Add first market (create via existing `/markets` POST)
  3. Add first product (create via existing `/products` POST)
  4. Add first compliance item (optional step: “Add now” or “Not now”)
  5. Done (calls `PATCH /auth/me/onboarding` → `onboarding_completed=true`; navigates to Dashboard)
- Persist progress:
  - Derive step completion from server truth (market/product exists) + local current step index.

**Dashboard checklist (persistent)**
- New component: “Set up your stall” card.
- Items (auto-checked):
  - Add a market (based on `/markets` count)
  - Add a product (based on `/products` count)
  - Add compliance (based on `/compliance` count) (optional/soft warning)
  - Create first allocation (based on `/allocations` for upcoming date)
- Each item links to the relevant page/action.

**Guided tour (no new libs)**
- Vanilla React overlay + spotlight rectangle.
- 4 stops (example targets):
  1. Markets section / “Manage”
  2. Products nav / add product entry point
  3. Compliance banner/section
  4. Allocate page entry point
- Only triggers when `tour_completed=false` AND `onboarding_completed=true`.
- On completion: `PATCH /auth/me/onboarding` with `tour_completed=true`.

**Wrap phase with E2E testing**
- Run existing tests + add coverage for:
  - Signup 2-step
  - Gate behavior
  - Wizard completion
  - Tour shows once

---

### Phase 3 — Hardening + UX Polish
**User stories**
1. As a vendor, I can’t get stuck in onboarding due to transient API failures.
2. As a vendor, I see clear error messages and can retry a failed wizard step.
3. As a vendor, checklist items feel consistent with the stamp/paper visual language.
4. As a vendor, I can revisit onboarding profile fields in Settings.
5. As a vendor, I can understand why an item is recommended (e.g., compliance is optional but important).

- Add robust loading/error states for each wizard step action.
- Add Settings fields for new vendor attributes (city, market type, expected markets) using `PATCH /auth/me`.
- Tighten backward compatibility: ensure `/auth/me` always returns flags and defaults.
- Add minimal analytics-style logging (server logs) for onboarding completion to help debug.
- Full regression test pass.

---

## 3) Next Actions
1. Implement backend model + `/auth/me/onboarding` endpoint + safe defaults for existing vendors.
2. Add frontend onboarding gate + new `OnboardingWizard` route.
3. Update Signup to 2-step and wire new fields end-to-end.
4. Implement Dashboard checklist card (dynamic completion + deep links).
5. Implement tour overlay and persistence via `tour_completed`.
6. Run end-to-end tests; fix until stable.

---

## 4) Success Criteria
- New vendor cannot access Markets/Products/Allocate/Compliance until onboarding is completed.
- Existing vendors are not interrupted (no forced onboarding).
- Signup saves: business_name, city, primary_market_type, expected_markets_count (plus existing fields).
- Wizard reliably creates first market + product; compliance step is optional but encouraged.
- Dashboard checklist reflects real completion state and updates without manual refresh.
- Guided tour runs once per vendor and never repeats after completion.
- All tests pass; no regressions in auth, CRUD, or dashboard loading.
