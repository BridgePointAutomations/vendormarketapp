"""
Phase 1 POC — Claude AI Layer for MarketOps.
Validates the core differentiator (BRD §5.1-5.6) in isolation:
  1) Restock suggestions (FR-5.1)
  2) Market fit recommendations (FR-5.2)
  3) Revenue projection per market day (FR-5.5)
  4) Sparse-history graceful degradation (FR-5.5 low-confidence handling)

Success criterion: All 4 calls return valid, parseable JSON matching expected
schema. Exit code 0 only on full pass.
"""

import asyncio
import json
import sys
import traceback
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

from ai_client import ask_claude  # noqa: E402


async def _ask(session_id: str, user_prompt: str):
    return await ask_claude(user_prompt, session_hint=session_id)


# -------- Test 1: Restock suggestions (dense history) --------------------
async def test_restock_dense():
    print("\n[TEST 1] Restock suggestions with dense history")
    payload = {
        "vendor": {"business_name": "Cuyahoga Craft Bakery", "category": "food"},
        "market": {"name": "Shaker Square Farmers Market", "day": "Saturday"},
        "upcoming_market_date": str(date.today() + timedelta(days=5)),
        "products": [
            {"product_id": "p-sourdough", "name": "Sourdough loaf", "unit_price": 9.0},
            {"product_id": "p-focaccia", "name": "Focaccia", "unit_price": 7.0},
            {"product_id": "p-cookies", "name": "Cookie 6-pack", "unit_price": 12.0},
        ],
        "history": [
            {"date": "2025-09-06", "product_id": "p-sourdough", "allocated": 30, "remaining": 2},
            {"date": "2025-09-13", "product_id": "p-sourdough", "allocated": 32, "remaining": 4},
            {"date": "2025-09-20", "product_id": "p-sourdough", "allocated": 34, "remaining": 1},
            {"date": "2025-09-06", "product_id": "p-focaccia", "allocated": 20, "remaining": 8},
            {"date": "2025-09-13", "product_id": "p-focaccia", "allocated": 18, "remaining": 5},
            {"date": "2025-09-20", "product_id": "p-focaccia", "allocated": 16, "remaining": 2},
            {"date": "2025-09-06", "product_id": "p-cookies", "allocated": 25, "remaining": 0},
            {"date": "2025-09-13", "product_id": "p-cookies", "allocated": 28, "remaining": 3},
            {"date": "2025-09-20", "product_id": "p-cookies", "allocated": 30, "remaining": 4},
        ],
    }

    prompt = (
        "Suggest how many units of each product to allocate for the next market day.\n"
        "Return a JSON array (one object per product) with EXACT keys:\n"
        '[{"product_id": str, "suggested_qty": int, "rationale": str, "confidence": "low"|"medium"|"high"}]\n'
        f"CONTEXT:\n{json.dumps(payload)}"
    )
    parsed = await _ask("restock-dense", prompt)
    assert isinstance(parsed, list) and len(parsed) >= 1, "Expected non-empty JSON array"
    for row in parsed:
        assert set(["product_id", "suggested_qty", "rationale", "confidence"]).issubset(row.keys()), row
        assert isinstance(row["suggested_qty"], (int, float)) and row["suggested_qty"] >= 0
        assert row["confidence"] in {"low", "medium", "high"}
    print(f"  OK — {len(parsed)} suggestions returned")
    for r in parsed:
        print(f"    - {r['product_id']}: qty={r['suggested_qty']} conf={r['confidence']}")
    return True


# -------- Test 2: Market fit for a candidate market --------------------
async def test_market_fit():
    print("\n[TEST 2] Market fit evaluation for a candidate market")
    payload = {
        "vendor": {
            "business_name": "Lakewood Leather Goods",
            "category": "craft",
            "current_markets": [
                {"name": "Coit Road Farmers", "day": "Saturday"},
                {"name": "Cleveland Flea", "day": "Sunday"},
            ],
            "days_committed": ["Saturday", "Sunday"],
        },
        "candidate_market": {
            "market_id": "m-holiday-craft",
            "name": "Beachwood Holiday Craft Fair",
            "day_of_week": "Saturday",
            "season_start": "2025-11-29",
            "season_end": "2025-12-20",
            "category_focus": "craft",
            "address": "Beachwood Community Center, OH",
        },
    }
    prompt = (
        "Evaluate whether this candidate market is a good fit for the vendor.\n"
        "Return a JSON object with EXACT keys:\n"
        '{"market_id": str, "fit_assessment": "strong_fit"|"possible_fit"|"poor_fit", "reason": str, "confidence": "low"|"medium"|"high"}\n'
        f"CONTEXT:\n{json.dumps(payload)}"
    )
    parsed = await _ask("market-fit", prompt)
    assert isinstance(parsed, dict)
    assert set(["market_id", "fit_assessment", "reason", "confidence"]).issubset(parsed.keys()), parsed
    assert parsed["fit_assessment"] in {"strong_fit", "possible_fit", "poor_fit"}
    print(f"  OK — fit={parsed['fit_assessment']} conf={parsed['confidence']}")
    print(f"    reason: {parsed['reason'][:120]}...")
    return True


# -------- Test 3: Revenue projection (dense history) --------------------
async def test_revenue_dense():
    print("\n[TEST 3] Revenue projection for upcoming market day (dense)")
    payload = {
        "market": {"market_id": "m-shaker-sq", "name": "Shaker Square Farmers"},
        "market_date": str(date.today() + timedelta(days=5)),
        "products": [
            {"product_id": "p-sourdough", "unit_price": 9.0, "suggested_qty": 34},
            {"product_id": "p-focaccia", "unit_price": 7.0, "suggested_qty": 18},
            {"product_id": "p-cookies", "unit_price": 12.0, "suggested_qty": 30},
        ],
        "history_sell_through": {
            "p-sourdough": [0.93, 0.87, 0.97],
            "p-focaccia": [0.60, 0.72, 0.87],
            "p-cookies": [1.0, 0.89, 0.87],
        },
    }
    prompt = (
        "Project total revenue for this market day using the suggested quantities, "
        "unit prices, and historical sell-through rates.\n"
        "Return a JSON object with EXACT keys:\n"
        '{"market_id": str, "market_date": str (YYYY-MM-DD), '
        '"projected_revenue": number, "rationale": str, '
        '"confidence": "low"|"medium"|"high"}\n'
        f"CONTEXT:\n{json.dumps(payload)}"
    )
    parsed = await _ask("revenue-dense", prompt)
    assert isinstance(parsed, dict)
    assert set(["market_id", "market_date", "projected_revenue", "rationale", "confidence"]).issubset(parsed.keys())
    assert isinstance(parsed["projected_revenue"], (int, float)) and parsed["projected_revenue"] > 0
    print(f"  OK — projected=${parsed['projected_revenue']:.2f} conf={parsed['confidence']}")
    return True


# -------- Test 4: Sparse history — graceful low-confidence --------------------
async def test_revenue_sparse():
    print("\n[TEST 4] Revenue projection with sparse/no history (should degrade)")
    payload = {
        "market": {"market_id": "m-new", "name": "Ohio City Winter Market (new for vendor)"},
        "market_date": str(date.today() + timedelta(days=10)),
        "products": [
            {"product_id": "p-candles", "unit_price": 18.0, "suggested_qty": 15},
        ],
        "history_sell_through": {},  # explicitly empty
    }
    prompt = (
        "Project total revenue for this market day using the given data. There is "
        "no historical sell-through — reflect that in the rationale and confidence.\n"
        "Return a JSON object with EXACT keys:\n"
        '{"market_id": str, "market_date": str, '
        '"projected_revenue": number, "rationale": str, '
        '"confidence": "low"|"medium"|"high"}\n'
        f"CONTEXT:\n{json.dumps(payload)}"
    )
    parsed = await _ask("revenue-sparse", prompt)
    assert isinstance(parsed, dict)
    assert parsed["confidence"] == "low", f"Expected low confidence on sparse data, got {parsed['confidence']}"
    assert isinstance(parsed["projected_revenue"], (int, float))
    print(f"  OK — projected=${parsed['projected_revenue']:.2f} conf={parsed['confidence']} (low required)")
    return True


async def main():
    results = {}
    tests = [
        ("restock_dense", test_restock_dense),
        ("market_fit", test_market_fit),
        ("revenue_dense", test_revenue_dense),
        ("revenue_sparse", test_revenue_sparse),
    ]
    for name, fn in tests:
        try:
            results[name] = await fn()
        except Exception:
            results[name] = False
            print(f"  FAIL — {name}")
            traceback.print_exc()

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for k, v in results.items():
        print(f"  {k}: {'PASS' if v else 'FAIL'}")
    all_pass = all(results.values())
    print(f"\nOVERALL: {'ALL PASS ✓' if all_pass else 'FAIL ✗'}")
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    asyncio.run(main())
