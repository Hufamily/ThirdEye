#!/usr/bin/env python3
"""
End-to-End API Tests
Tests actual HTTP requests to FastAPI endpoints
"""

import sys
import asyncio
import httpx
from pathlib import Path
import json
from datetime import datetime

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Test configuration
BASE_URL = "http://localhost:8000"
API_BASE = f"{BASE_URL}/api"

# Test results
results = {
    "server": {},
    "auth": {},
    "agents": {},
    "enterprise": {},
    "overall": {"passed": 0, "failed": 0, "errors": []}
}


async def test_server_startup():
    """Test if server is running"""
    print("\n" + "="*70)
    print("TESTING SERVER STARTUP")
    print("="*70)
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Test root endpoint
            response = await client.get(f"{BASE_URL}/")
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Root endpoint: {data.get('status')}")
                results["server"]["root"] = True
            else:
                print(f"❌ Root endpoint: Status {response.status_code}")
                results["server"]["root"] = False
                return False
            
            # Test health endpoint
            response = await client.get(f"{BASE_URL}/health")
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Health endpoint: {data.get('status')}")
                results["server"]["health"] = True
            else:
                print(f"❌ Health endpoint: Status {response.status_code}")
                results["server"]["health"] = False
                return False
            
            # Test docs endpoint
            response = await client.get(f"{BASE_URL}/docs")
            if response.status_code == 200:
                print("✅ API docs accessible")
                results["server"]["docs"] = True
            else:
                print(f"⚠️  API docs: Status {response.status_code}")
                results["server"]["docs"] = False
            
            return True
            
    except httpx.ConnectError:
        print("❌ Cannot connect to server. Is it running?")
        print("   Start server with: cd backend && python3 -m uvicorn app.main:app --reload")
        results["server"]["connection"] = False
        return False
    except Exception as e:
        print(f"❌ Server test failed: {e}")
        results["server"]["error"] = str(e)
        return False


async def test_auth_endpoints():
    """Test authentication endpoints"""
    print("\n" + "="*70)
    print("TESTING AUTH ENDPOINTS")
    print("="*70)
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Test login endpoint exists (will fail without valid token, but should return 401/403 not 404)
            response = await client.get(f"{API_BASE}/auth/me")
            if response.status_code in [401, 403]:
                print("✅ /api/auth/me endpoint exists (requires auth)")
                results["auth"]["me_endpoint"] = True
            elif response.status_code == 404:
                print("❌ /api/auth/me endpoint not found")
                results["auth"]["me_endpoint"] = False
            else:
                print(f"✅ /api/auth/me endpoint exists (status {response.status_code})")
                results["auth"]["me_endpoint"] = True  # Endpoint exists
            
            # Test that endpoints require authentication
            response = await client.post(f"{API_BASE}/agents/persona-architect", json={})
            if response.status_code in [401, 403]:
                print("✅ Agent endpoints require authentication")
                results["auth"]["protected"] = True
            else:
                print(f"⚠️  Agent endpoint auth check: Status {response.status_code}")
                results["auth"]["protected"] = response.status_code in [401, 403]
            
            return True
            
    except Exception as e:
        print(f"❌ Auth test failed: {e}")
        results["auth"]["error"] = str(e)
        return False


async def test_agent_endpoints_structure():
    """Test agent endpoint structure (without auth)"""
    print("\n" + "="*70)
    print("TESTING AGENT ENDPOINTS STRUCTURE")
    print("="*70)
    
    endpoints_to_test = [
        ("/api/agents/persona-architect", "POST"),
        ("/api/agents/traffic-controller", "POST"),
        ("/api/agents/capture-scrape", "POST"),
        ("/api/agents/target-interpreter", "POST"),
        ("/api/agents/gap-hypothesis", "POST"),
        ("/api/agents/explanation-composer", "POST"),
        ("/api/agents/memory-vault", "POST"),
        ("/api/agents/document-surgeon", "POST"),
        ("/api/agents/orchestrate", "POST"),
    ]
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            for endpoint, method in endpoints_to_test:
                url = f"{BASE_URL}{endpoint}"
                
                if method == "POST":
                    response = await client.post(url, json={})
                else:
                    response = await client.get(url)
                
                # 401/403 = endpoint exists but needs auth (good)
                # 404 = endpoint doesn't exist (bad)
                # 422 = endpoint exists but validation failed (good)
                if response.status_code in [401, 403, 422]:
                    print(f"✅ {endpoint} exists (protected)")
                    results["agents"][endpoint] = True
                elif response.status_code == 404:
                    print(f"❌ {endpoint} NOT FOUND")
                    results["agents"][endpoint] = False
                else:
                    print(f"⚠️  {endpoint}: Status {response.status_code}")
                    results["agents"][endpoint] = response.status_code != 404
            
            return all(results["agents"].values())
            
    except Exception as e:
        print(f"❌ Agent endpoints test failed: {e}")
        results["agents"]["error"] = str(e)
        return False


async def test_enterprise_endpoints_structure():
    """Test enterprise endpoint structure"""
    print("\n" + "="*70)
    print("TESTING ENTERPRISE ENDPOINTS STRUCTURE")
    print("="*70)
    
    endpoints_to_test = [
        ("/api/enterprise/whitelisted-folders", "GET"),
        ("/api/enterprise/whitelisted-folders", "POST"),
        ("/api/enterprise/documents", "GET"),
        ("/api/enterprise/suggestions", "GET"),
    ]
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            for endpoint, method in endpoints_to_test:
                url = f"{BASE_URL}{endpoint}"
                
                if method == "POST":
                    response = await client.post(url, json={})
                else:
                    response = await client.get(url)
                
                if response.status_code in [401, 403, 422]:
                    print(f"✅ {endpoint} ({method}) exists")
                    results["enterprise"][f"{endpoint}_{method}"] = True
                elif response.status_code == 404:
                    print(f"❌ {endpoint} ({method}) NOT FOUND")
                    results["enterprise"][f"{endpoint}_{method}"] = False
                else:
                    print(f"⚠️  {endpoint} ({method}): Status {response.status_code}")
                    results["enterprise"][f"{endpoint}_{method}"] = response.status_code != 404
            
            return all(results["enterprise"].values())
            
    except Exception as e:
        print(f"❌ Enterprise endpoints test failed: {e}")
        results["enterprise"]["error"] = str(e)
        return False


async def test_orchestration_endpoint():
    """Test orchestration endpoint specifically"""
    print("\n" + "="*70)
    print("TESTING ORCHESTRATION ENDPOINT")
    print("="*70)
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Test with invalid payload (should return 401 or 422)
            response = await client.post(
                f"{API_BASE}/agents/orchestrate",
                json={"capture_result": {"test": "data"}}
            )
            
            if response.status_code in [401, 403]:
                print("✅ Orchestration endpoint exists and requires auth")
                results["agents"]["orchestrate_auth"] = True
            elif response.status_code == 422:
                print("✅ Orchestration endpoint exists (validation error)")
                results["agents"]["orchestrate_auth"] = True
            elif response.status_code == 404:
                print("❌ Orchestration endpoint NOT FOUND")
                results["agents"]["orchestrate_auth"] = False
            else:
                print(f"✅ Orchestration endpoint exists (status {response.status_code})")
                results["agents"]["orchestrate_auth"] = response.status_code != 404
            
            return results["agents"].get("orchestrate_auth", False)
            
    except Exception as e:
        print(f"❌ Orchestration test failed: {e}")
        results["agents"]["orchestrate_error"] = str(e)
        return False


async def test_error_handling():
    """Test error handling"""
    print("\n" + "="*70)
    print("TESTING ERROR HANDLING")
    print("="*70)
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Test 404 for non-existent endpoint
            response = await client.get(f"{BASE_URL}/api/nonexistent")
            if response.status_code == 404:
                print("✅ 404 handling works")
                results["server"]["404_handling"] = True
            else:
                print(f"⚠️  404 handling: Status {response.status_code}")
                results["server"]["404_handling"] = False
            
            # Test invalid JSON
            response = await client.post(
                f"{API_BASE}/agents/orchestrate",
                content="invalid json",
                headers={"Content-Type": "application/json"}
            )
            if response.status_code in [400, 422]:
                print("✅ Invalid JSON handling works")
                results["server"]["json_error_handling"] = True
            else:
                print(f"⚠️  JSON error handling: Status {response.status_code}")
                results["server"]["json_error_handling"] = False
            
            return True
            
    except Exception as e:
        print(f"❌ Error handling test failed: {e}")
        results["server"]["error_handling_error"] = str(e)
        return False


def print_summary():
    """Print test summary"""
    print("\n" + "="*70)
    print("E2E TEST SUMMARY")
    print("="*70)
    
    total = 0
    passed = 0
    
    # Count server tests
    for key, value in results["server"].items():
        if isinstance(value, bool):
            total += 1
            if value:
                passed += 1
    
    # Count auth tests
    for key, value in results["auth"].items():
        if isinstance(value, bool):
            total += 1
            if value:
                passed += 1
    
    # Count agent tests
    for key, value in results["agents"].items():
        if isinstance(value, bool):
            total += 1
            if value:
                passed += 1
    
    # Count enterprise tests
    for key, value in results["enterprise"].items():
        if isinstance(value, bool):
            total += 1
            if value:
                passed += 1
    
    print(f"\nTotal Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    
    if results["overall"]["errors"]:
        print(f"\nErrors: {len(results['overall']['errors'])}")
        for error in results["overall"]["errors"][:5]:
            print(f"  • {error}")
    
    # Save results
    results_file = backend_dir / "scripts" / "e2e_test_results.json"
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2, default=str)
    
    print(f"\n📄 Detailed results saved to: {results_file}")
    
    return passed == total


async def main():
    """Run all E2E tests"""
    print("="*70)
    print("END-TO-END API TEST SUITE")
    print("="*70)
    print(f"Testing server at: {BASE_URL}")
    print(f"Started at: {datetime.now().isoformat()}")
    
    # Run tests
    server_ok = await test_server_startup()
    
    if not server_ok:
        print("\n❌ Server is not running. Cannot continue tests.")
        print("   Start server with: cd backend && python3 -m uvicorn app.main:app --reload")
        return 1
    
    await test_auth_endpoints()
    await test_agent_endpoints_structure()
    await test_enterprise_endpoints_structure()
    await test_orchestration_endpoint()
    await test_error_handling()
    
    # Print summary
    all_passed = print_summary()
    
    print("\n" + "="*70)
    if all_passed:
        print("✅ ALL E2E TESTS PASSED")
    else:
        print("⚠️  SOME E2E TESTS FAILED")
    print("="*70)
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
