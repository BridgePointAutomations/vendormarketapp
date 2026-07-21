# Deploying to Vercel

This repo ships a single Vercel project that serves the React frontend as a
static build and the FastAPI backend as a Python serverless function.

## How it's wired

- `vercel.json` builds `frontend/` (`yarn build` → `frontend/build`) and
  rewrites every `/api/*` request to `api/index.py`.
- `api/index.py` imports the existing FastAPI app from `backend/server.py`
  and re-exports it as the ASGI app Vercel's Python runtime serves.
- `requirements.txt` (repo root) is what Vercel installs for `api/index.py`.
  It's a trimmed mirror of `backend/requirements.txt` — keep the two in sync
  if you add a backend dependency.
- AI Insights calls Claude directly via the `anthropic` SDK
  (`backend/ai_client.py`) — no external platform dependency.

## Required environment variables (set in the Vercel project settings)

| Variable | Required | Notes |
|---|---|---|
| `MONGO_URL` | yes | Connection string for a hosted MongoDB (e.g. an Atlas cluster). Vercel has no persistent local database. |
| `DB_NAME` | no | Defaults to `marketops`. |
| `JWT_SECRET` | yes | Strong random value — the server refuses to boot on a placeholder (`change-me`, `secret`, etc). Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. |
| `JWT_ALGORITHM` | no | Defaults to `HS256`. |
| `JWT_EXPIRE_HOURS` | no | Defaults to `168` (7 days). |
| `CORS_ORIGINS` | yes | Comma-separated allowed origins. With the same-origin setup below this is mostly a formality, but it's read at import time and must be non-empty. Set it to your Vercel deployment URL (e.g. `https://your-app.vercel.app`). |
| `ANTHROPIC_API_KEY` | yes, for AI Insights | An Anthropic API key. Without this, every route under `/api/ai/*` will fail; the rest of the app is unaffected. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-4-5-20250929`. |
| `REACT_APP_BACKEND_URL` | yes | Set to an **empty string** for this single-project setup, so the frontend calls same-origin `/api/*` (rewritten to the Python function). This is a build-time variable for CRA — changing it requires a redeploy. |

## Manual steps outside this repo

1. Provision a MongoDB database (Atlas free tier is fine for a prototype) and
   get its connection string for `MONGO_URL`.
2. Get an Anthropic API key for `ANTHROPIC_API_KEY` if you want AI Insights
   working.
3. Create the Vercel project pointing at this repo, set the environment
   variables above, and deploy.
4. Optionally hit `POST /api/seed/demo` once deployed to seed a demo vendor
   (see `README.md` for credentials).

## Local verification already done

- `yarn build` in `frontend/` succeeds against the trimmed `index.html` and
  `craco.config.js` (Emergent-specific script tags and the visual-edits
  devDependency were removed).
- `api/index.py` imports the FastAPI app cleanly against the trimmed root
  `requirements.txt` (verified in a clean virtualenv).
- `backend/ai_client.py` and `backend/test_core.py` import cleanly against
  the `anthropic` SDK.

None of this was deployed to a live Vercel project or connected to a real
Mongo/Anthropic account from this session — that's the next manual step.
