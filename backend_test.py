"""
MarketOps Backend API Test Suite
Tests all endpoints with vendor isolation, tier gating, and AI integration
"""
import requests
import sys
import json
from datetime import datetime, date, timedelta

class MarketOpsAPITester:
    def __init__(self, base_url="https://marketops-preview.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.vendor_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Store created IDs for cleanup and cross-reference tests
        self.product_ids = []
        self.market_ids = []
        self.allocation_ids = []
        self.compliance_ids = []

    def log_result(self, test_name, passed, details=""):
        """Log test result"""
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
            status = "✅ PASS"
        else:
            status = "❌ FAIL"
        
        result = {
            "test": test_name,
            "passed": passed,
            "details": details
        }
        self.test_results.append(result)
        print(f"{status} - {test_name}")
        if details and not passed:
            print(f"   Details: {details}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        req_headers = {'Content-Type': 'application/json'}
        if self.token:
            req_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            req_headers.update(headers)

        try:
            if method == 'GET':
                response = requests.get(url, headers=req_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=req_headers, timeout=30)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=req_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=req_headers, timeout=30)
            else:
                self.log_result(name, False, f"Unknown method: {method}")
                return False, {}

            success = response.status_code == expected_status
            response_data = {}
            try:
                response_data = response.json()
            except:
                pass

            if success:
                self.log_result(name, True, f"Status: {response.status_code}")
            else:
                self.log_result(name, False, 
                    f"Expected {expected_status}, got {response.status_code}. Response: {response.text[:200]}")

            return success, response_data

        except Exception as e:
            self.log_result(name, False, f"Error: {str(e)}")
            return False, {}

    # ========== AUTH TESTS ==========
    def test_seed_demo(self):
        """Test seed demo endpoint (idempotent)"""
        print("\n🔧 Testing Seed Demo...")
        success, response = self.run_test(
            "Seed Demo",
            "POST",
            "seed/demo",
            200
        )
        if success and 'token' in response:
            self.token = response['token']
            self.vendor_id = response.get('vendor_id')
            return True
        return False

    def test_signup(self):
        """Test signup with new vendor"""
        print("\n🔧 Testing Signup...")
        timestamp = datetime.now().strftime('%H%M%S%f')
        test_email = f"test_{timestamp}@marketops.test"
        
        success, response = self.run_test(
            "Signup - New Vendor",
            "POST",
            "auth/signup",
            200,
            data={
                "email": test_email,
                "password": "TestPass123!",
                "business_name": "Test Vendor",
                "category": "food"
            }
        )
        
        if success and 'token' in response:
            # Store for later tier gating tests
            self.free_tier_token = response['token']
            self.free_tier_vendor_id = response['vendor']['id']
            
            # Test duplicate signup
            self.run_test(
                "Signup - Duplicate Email (409)",
                "POST",
                "auth/signup",
                409,
                data={
                    "email": test_email,
                    "password": "TestPass123!",
                    "business_name": "Test Vendor 2",
                    "category": "food"
                }
            )
            return True
        return False

    def test_login(self):
        """Test login with demo credentials"""
        print("\n🔧 Testing Login...")
        success, response = self.run_test(
            "Login - Demo Credentials",
            "POST",
            "auth/login",
            200,
            data={
                "email": "demo@marketops.app",
                "password": "DemoVendor2025!"
            }
        )
        
        if success and 'token' in response:
            self.token = response['token']
            self.vendor_id = response['vendor']['id']
            
            # Test wrong password
            self.run_test(
                "Login - Wrong Password (401)",
                "POST",
                "auth/login",
                401,
                data={
                    "email": "demo@marketops.app",
                    "password": "WrongPassword"
                }
            )
            return True
        return False

    def test_auth_me(self):
        """Test /auth/me endpoint"""
        print("\n🔧 Testing Auth Me...")
        success, response = self.run_test(
            "Auth Me - With Token",
            "GET",
            "auth/me",
            200
        )
        
        if success:
            # Test without token
            old_token = self.token
            self.token = None
            self.run_test(
                "Auth Me - Without Token (401)",
                "GET",
                "auth/me",
                401
            )
            self.token = old_token
            return True
        return False

    def test_tier_upgrade_downgrade(self):
        """Test tier upgrade/downgrade"""
        print("\n🔧 Testing Tier Management...")
        
        # Upgrade
        success, response = self.run_test(
            "Upgrade to Paid",
            "POST",
            "auth/me/upgrade",
            200
        )
        
        if success and response.get('tier') == 'paid':
            # Downgrade
            success2, response2 = self.run_test(
                "Downgrade to Free",
                "POST",
                "auth/me/downgrade",
                200
            )
            
            if success2 and response2.get('tier') == 'free':
                # Upgrade back for AI tests
                self.run_test(
                    "Upgrade to Paid Again",
                    "POST",
                    "auth/me/upgrade",
                    200
                )
                return True
        return False

    # ========== PRODUCTS TESTS ==========
    def test_products_crud(self):
        """Test products CRUD operations"""
        print("\n🔧 Testing Products CRUD...")
        
        # List products (should have seeded data)
        success, response = self.run_test(
            "List Products",
            "GET",
            "products",
            200
        )
        
        if not success:
            return False
        
        initial_count = len(response)
        print(f"   Found {initial_count} seeded products")
        
        # Create product
        success, response = self.run_test(
            "Create Product",
            "POST",
            "products",
            200,
            data={
                "name": "Test Product",
                "sku": "TEST-01",
                "unit": "piece",
                "unit_price": 10.0,
                "current_stock": 50,
                "low_stock_threshold": 10
            }
        )
        
        if success and 'id' in response:
            product_id = response['id']
            self.product_ids.append(product_id)
            
            # Update product
            success2, response2 = self.run_test(
                "Update Product",
                "PATCH",
                f"products/{product_id}",
                200,
                data={
                    "unit_price": 12.0,
                    "current_stock": 60
                }
            )
            
            if success2 and response2.get('unit_price') == 12.0:
                # Delete product
                success3, _ = self.run_test(
                    "Delete Product",
                    "DELETE",
                    f"products/{product_id}",
                    200
                )
                return success3
        
        return False

    # ========== MARKETS TESTS ==========
    def test_markets_crud(self):
        """Test markets CRUD operations"""
        print("\n🔧 Testing Markets CRUD...")
        
        # List markets
        success, response = self.run_test(
            "List Markets",
            "GET",
            "markets",
            200
        )
        
        if not success:
            return False
        
        print(f"   Found {len(response)} seeded markets")
        
        # List candidate markets
        success, response = self.run_test(
            "List Candidate Markets",
            "GET",
            "markets?is_candidate=true",
            200
        )
        
        if success:
            print(f"   Found {len(response)} candidate markets")
        
        # Create market
        success, response = self.run_test(
            "Create Market",
            "POST",
            "markets",
            200,
            data={
                "name": "Test Market",
                "address": "123 Test St",
                "day_of_week": "Sunday",
                "recurrence_pattern": "weekly",
                "category_focus": "food",
                "is_candidate": True,
                "status": "considering"
            }
        )
        
        if success and 'id' in response:
            market_id = response['id']
            self.market_ids.append(market_id)
            
            # Update market
            success2, response2 = self.run_test(
                "Update Market Status",
                "PATCH",
                f"markets/{market_id}",
                200,
                data={
                    "status": "applied",
                    "is_candidate": False
                }
            )
            
            if success2 and response2.get('status') == 'applied':
                # Delete market
                success3, _ = self.run_test(
                    "Delete Market",
                    "DELETE",
                    f"markets/{market_id}",
                    200
                )
                return success3
        
        return False

    # ========== ALLOCATIONS TESTS ==========
    def test_allocations_crud(self):
        """Test allocations CRUD with ownership validation"""
        print("\n🔧 Testing Allocations CRUD...")
        
        # Get a product and market first
        _, products = self.run_test("Get Products for Allocation", "GET", "products", 200)
        _, markets = self.run_test("Get Markets for Allocation", "GET", "markets", 200)
        
        if not products or not markets:
            self.log_result("Allocations CRUD", False, "No products or markets available")
            return False
        
        product_id = products[0]['id']
        market_id = markets[0]['id']
        test_date = str(date.today() + timedelta(days=10))
        
        # Create allocation
        success, response = self.run_test(
            "Create Allocation",
            "POST",
            "allocations",
            200,
            data={
                "market_id": market_id,
                "product_id": product_id,
                "allocated_qty": 30,
                "market_date": test_date
            }
        )
        
        if success and 'id' in response:
            allocation_id = response['id']
            self.allocation_ids.append(allocation_id)
            
            # List allocations with filters
            self.run_test(
                "List Allocations by Market",
                "GET",
                f"allocations?market_id={market_id}",
                200
            )
            
            self.run_test(
                "List Allocations by Date",
                "GET",
                f"allocations?market_date={test_date}",
                200
            )
            
            # Update allocation
            success2, response2 = self.run_test(
                "Update Allocation",
                "PATCH",
                f"allocations/{allocation_id}",
                200,
                data={
                    "remaining_qty": 25,
                    "actual_units_sold": 5
                }
            )
            
            if success2 and response2.get('remaining_qty') == 25:
                # Delete allocation
                success3, _ = self.run_test(
                    "Delete Allocation",
                    "DELETE",
                    f"allocations/{allocation_id}",
                    200
                )
                return success3
        
        return False

    # ========== COMPLIANCE TESTS ==========
    def test_compliance_crud(self):
        """Test compliance CRUD with status computation"""
        print("\n🔧 Testing Compliance CRUD...")
        
        # List compliance items
        success, response = self.run_test(
            "List Compliance Items",
            "GET",
            "compliance",
            200
        )
        
        if not success:
            return False
        
        print(f"   Found {len(response)} compliance items")
        
        # Check status computation
        for item in response:
            status = item.get('status')
            exp_date = item.get('expiration_date')
            print(f"   Item: {item.get('name')} - Status: {status} - Expires: {exp_date}")
        
        # Create compliance item (expiring in 20 days)
        exp_date = str(date.today() + timedelta(days=20))
        success, response = self.run_test(
            "Create Compliance Item (Expiring)",
            "POST",
            "compliance",
            200,
            data={
                "type": "permit",
                "name": "Test Permit",
                "expiration_date": exp_date,
                "notes": "Test compliance item"
            }
        )
        
        if success and 'id' in response:
            compliance_id = response['id']
            self.compliance_ids.append(compliance_id)
            
            # Verify status is 'expiring' (within 30 days)
            if response.get('status') != 'expiring':
                self.log_result("Compliance Status Computation", False, 
                    f"Expected 'expiring', got '{response.get('status')}'")
            else:
                self.log_result("Compliance Status Computation", True, "Status correctly computed as 'expiring'")
            
            # Update compliance item
            new_exp_date = str(date.today() + timedelta(days=60))
            success2, response2 = self.run_test(
                "Update Compliance Item",
                "PATCH",
                f"compliance/{compliance_id}",
                200,
                data={
                    "expiration_date": new_exp_date,
                    "notes": "Updated test item"
                }
            )
            
            if success2 and response2.get('status') == 'active':
                # Delete compliance item
                success3, _ = self.run_test(
                    "Delete Compliance Item",
                    "DELETE",
                    f"compliance/{compliance_id}",
                    200
                )
                return success3
        
        return False

    def test_compliance_sweep(self):
        """Test compliance sweep for reminders"""
        print("\n🔧 Testing Compliance Sweep...")
        
        success, response = self.run_test(
            "Compliance Sweep",
            "POST",
            "compliance/sweep",
            200
        )
        
        if success:
            new_reminders = response.get('new', 0)
            total_log = len(response.get('log', []))
            print(f"   New reminders: {new_reminders}, Total log entries: {total_log}")
            return True
        
        return False

    # ========== AI TESTS ==========
    def test_ai_tier_gating(self):
        """Test AI endpoints are gated for free tier"""
        print("\n🔧 Testing AI Tier Gating (Free Tier)...")
        
        if not hasattr(self, 'free_tier_token'):
            print("   Skipping: No free tier token available")
            return True
        
        # Save current token
        old_token = self.token
        self.token = self.free_tier_token
        
        # Get a market for testing
        _, markets = self.run_test("Get Markets for AI Test", "GET", "markets", 200)
        if not markets:
            self.token = old_token
            return False
        
        market_id = markets[0]['id']
        test_date = str(date.today() + timedelta(days=5))
        
        # Test restock (should return 402)
        self.run_test(
            "AI Restock - Free Tier (402)",
            "POST",
            "ai/restock",
            402,
            data={
                "market_id": market_id,
                "market_date": test_date
            }
        )
        
        # Test market-fit (should return 402)
        self.run_test(
            "AI Market Fit - Free Tier (402)",
            "POST",
            "ai/market-fit",
            402,
            data={
                "market_id": market_id
            }
        )
        
        # Test revenue (should return 402)
        self.run_test(
            "AI Revenue - Free Tier (402)",
            "POST",
            "ai/revenue",
            402,
            data={
                "market_id": market_id,
                "market_date": test_date
            }
        )
        
        # Restore token
        self.token = old_token
        return True

    def test_ai_restock(self):
        """Test AI restock endpoint (paid tier)"""
        print("\n🔧 Testing AI Restock (Paid Tier)...")
        
        # Get markets
        _, markets = self.run_test("Get Markets for Restock", "GET", "markets", 200)
        if not markets:
            return False
        
        # Use first active market
        market_id = markets[0]['id']
        test_date = str(date.today() + timedelta(days=5))
        
        print(f"   Testing with market: {markets[0]['name']}")
        print(f"   This will make a real Claude API call (may take 3-8 seconds)...")
        
        success, response = self.run_test(
            "AI Restock",
            "POST",
            "ai/restock",
            200,
            data={
                "market_id": market_id,
                "market_date": test_date
            }
        )
        
        if success:
            suggestions = response.get('suggestions', [])
            print(f"   Received {len(suggestions)} suggestions")
            if suggestions:
                # Validate structure
                first = suggestions[0]
                required_keys = ['product_id', 'suggested_qty', 'rationale', 'confidence']
                has_all_keys = all(k in first for k in required_keys)
                if has_all_keys:
                    self.log_result("AI Restock JSON Structure", True, "All required keys present")
                    print(f"   Sample: {first['rationale'][:100]}...")
                else:
                    self.log_result("AI Restock JSON Structure", False, f"Missing keys. Got: {list(first.keys())}")
            return True
        
        return False

    def test_ai_market_fit(self):
        """Test AI market fit endpoint (paid tier)"""
        print("\n🔧 Testing AI Market Fit (Paid Tier)...")
        
        # Get candidate markets
        _, markets = self.run_test("Get Candidate Markets", "GET", "markets?is_candidate=true", 200)
        if not markets:
            print("   No candidate markets available, skipping")
            return True
        
        market_id = markets[0]['id']
        print(f"   Testing with candidate market: {markets[0]['name']}")
        print(f"   This will make a real Claude API call (may take 3-8 seconds)...")
        
        success, response = self.run_test(
            "AI Market Fit",
            "POST",
            "ai/market-fit",
            200,
            data={
                "market_id": market_id
            }
        )
        
        if success:
            # Validate structure
            required_keys = ['market_id', 'fit_assessment', 'reason', 'confidence']
            has_all_keys = all(k in response for k in required_keys)
            if has_all_keys:
                self.log_result("AI Market Fit JSON Structure", True, "All required keys present")
                print(f"   Assessment: {response.get('fit_assessment')}")
                print(f"   Reason: {response.get('reason')[:100]}...")
            else:
                self.log_result("AI Market Fit JSON Structure", False, f"Missing keys. Got: {list(response.keys())}")
            return True
        
        return False

    def test_ai_revenue(self):
        """Test AI revenue projection endpoint (paid tier)"""
        print("\n🔧 Testing AI Revenue Projection (Paid Tier)...")
        
        # Get markets
        _, markets = self.run_test("Get Markets for Revenue", "GET", "markets", 200)
        if not markets:
            return False
        
        market_id = markets[0]['id']
        test_date = str(date.today() + timedelta(days=5))
        
        print(f"   Testing with market: {markets[0]['name']}")
        print(f"   This will make a real Claude API call (may take 3-8 seconds)...")
        
        success, response = self.run_test(
            "AI Revenue Projection",
            "POST",
            "ai/revenue",
            200,
            data={
                "market_id": market_id,
                "market_date": test_date
            }
        )
        
        if success:
            # Validate structure
            required_keys = ['market_id', 'market_date', 'projected_revenue', 'rationale', 'confidence']
            has_all_keys = all(k in response for k in required_keys)
            if has_all_keys:
                self.log_result("AI Revenue JSON Structure", True, "All required keys present")
                print(f"   Projected Revenue: ${response.get('projected_revenue')}")
                print(f"   Rationale: {response.get('rationale')[:100]}...")
            else:
                self.log_result("AI Revenue JSON Structure", False, f"Missing keys. Got: {list(response.keys())}")
            return True
        
        return False

    def test_ai_revenue_rollup(self):
        """Test AI revenue rollup endpoint"""
        print("\n🔧 Testing AI Revenue Rollup...")
        
        # Get markets
        _, markets = self.run_test("Get Markets for Rollup", "GET", "markets", 200)
        if not markets:
            return False
        
        market_id = markets[0]['id']
        
        success, response = self.run_test(
            "AI Revenue Rollup",
            "GET",
            f"ai/revenue/rollup/{market_id}",
            200
        )
        
        if success:
            # Validate structure
            required_keys = ['market_id', 'avg_per_visit', 'total', 'visits', 'trend', 'series']
            has_all_keys = all(k in response for k in required_keys)
            if has_all_keys:
                self.log_result("AI Revenue Rollup Structure", True, "All required keys present")
                print(f"   Visits: {response.get('visits')}, Avg: ${response.get('avg_per_visit')}, Trend: {response.get('trend')}")
            else:
                self.log_result("AI Revenue Rollup Structure", False, f"Missing keys. Got: {list(response.keys())}")
            return True
        
        return False

    # ========== DASHBOARD TESTS ==========
    def test_dashboard(self):
        """Test dashboard aggregation"""
        print("\n🔧 Testing Dashboard...")
        
        success, response = self.run_test(
            "Dashboard",
            "GET",
            "dashboard",
            200
        )
        
        if success:
            stats = response.get('stats', {})
            market_cards = response.get('market_cards', [])
            action_needed = response.get('action_needed', [])
            reminders = response.get('reminders', [])
            
            print(f"   Stats: {stats}")
            print(f"   Market Cards: {len(market_cards)}")
            print(f"   Action Needed: {len(action_needed)}")
            print(f"   Reminders: {len(reminders)}")
            
            # Validate structure
            required_stats = ['markets_this_week', 'action_needed_count', 'projected_week_revenue', 'total_markets']
            has_all_stats = all(k in stats for k in required_stats)
            if has_all_stats:
                self.log_result("Dashboard Stats Structure", True, "All required stats present")
            else:
                self.log_result("Dashboard Stats Structure", False, f"Missing stats. Got: {list(stats.keys())}")
            
            # Check market cards structure
            if market_cards:
                card = market_cards[0]
                required_card_keys = ['id', 'name', 'ready', 'warnings', 'compliance_issues']
                has_all_card_keys = all(k in card for k in required_card_keys)
                if has_all_card_keys:
                    self.log_result("Dashboard Market Card Structure", True, "All required keys present")
                else:
                    self.log_result("Dashboard Market Card Structure", False, f"Missing keys. Got: {list(card.keys())}")
            
            return True
        
        return False

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("📊 TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        print("="*60)
        
        # Print failed tests
        failed_tests = [r for r in self.test_results if not r['passed']]
        if failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in failed_tests:
                print(f"  - {test['test']}")
                if test['details']:
                    print(f"    {test['details']}")
        
        return self.tests_passed == self.tests_run

def main():
    print("="*60)
    print("🚀 MarketOps Backend API Test Suite")
    print("="*60)
    
    tester = MarketOpsAPITester()
    
    # Run tests in order
    try:
        # 1. Seed demo data
        if not tester.test_seed_demo():
            print("\n❌ Seed demo failed, stopping tests")
            return 1
        
        # 2. Auth tests
        tester.test_signup()
        tester.test_login()
        tester.test_auth_me()
        tester.test_tier_upgrade_downgrade()
        
        # 3. CRUD tests
        tester.test_products_crud()
        tester.test_markets_crud()
        tester.test_allocations_crud()
        tester.test_compliance_crud()
        tester.test_compliance_sweep()
        
        # 4. Dashboard
        tester.test_dashboard()
        
        # 5. AI tests (tier gating + paid features)
        tester.test_ai_tier_gating()
        tester.test_ai_restock()
        tester.test_ai_market_fit()
        tester.test_ai_revenue()
        tester.test_ai_revenue_rollup()
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1
    
    # Print summary
    all_passed = tester.print_summary()
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
