#!/usr/bin/env python3
"""
Quick endpoint testing script
Tests if API is running and endpoints respond correctly
"""

import sys
import requests
from pathlib import Path

def test_endpoint(method, url, headers=None, json_data=None, expected_status=None):
    """Test a single endpoint"""
    try:
        if method == "GET":
            response = requests.get(url, headers=headers, timeout=5)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=json_data, timeout=5)
        else:
            return False, f"Unsupported method: {method}"
        
        status_ok = expected_status is None or response.status_code == expected_status
        return status_ok, f"{method} {url} -> {response.status_code}"
    except requests.exceptions.ConnectionError:
        return False, f"{method} {url} -> Connection refused (API not running?)"
    except Exception as e:
        return False, f"{method} {url} -> Error: {str(e)}"

def main():
    base_url = "http://localhost:8000"
    
    print("="*60)
    print("ThirdEye Backend Endpoint Tests")
    print("="*60)
    print()
    
    # Test 1: Health check
    print("1. Testing API Health...")
    ok, msg = test_endpoint("GET", f"{base_url}/health", expected_status=200)
    print(f"   {'✓' if ok else '✗'} {msg}")
    if not ok:
        print("\n   ⚠️  API is not running. Start it with:")
        print("      cd backend && uvicorn app.main:app --reload")
        return
    
    # Test 2: Root endpoint
    print("\n2. Testing Root Endpoint...")
    ok, msg = test_endpoint("GET", f"{base_url}/", expected_status=200)
    print(f"   {'✓' if ok else '✗'} {msg}")
    
    # Test 3: OpenAPI docs
    print("\n3. Testing OpenAPI Docs...")
    ok, msg = test_endpoint("GET", f"{base_url}/docs", expected_status=200)
    print(f"   {'✓' if ok else '✗'} {msg}")
    
    # Test 4: Auth endpoints (should return 401/422 without auth)
    print("\n4. Testing Auth Endpoints...")
    ok, msg = test_endpoint("GET", f"{base_url}/api/auth/me", expected_status=[401, 403])
    print(f"   {'✓' if ok else '✗'} {msg} (expected 401/403)")
    
    ok, msg = test_endpoint("POST", f"{base_url}/api/auth/google-login", 
                           json_data={"credential": "test", "accountType": "personal"},
                           expected_status=[400, 401, 422])
    print(f"   {'✓' if ok else '✗'} {msg} (expected 400/401/422)")
    
    # Test 5: Personal endpoints (should return 401 without auth)
    print("\n5. Testing Personal Endpoints...")
    endpoints = [
        ("GET", "/api/personal/profile"),
        ("GET", "/api/personal/sessions"),
        ("GET", "/api/personal/notebook-entries"),
    ]
    for method, path in endpoints:
        ok, msg = test_endpoint(method, f"{base_url}{path}", expected_status=[401, 403])
        print(f"   {'✓' if ok else '✗'} {msg} (expected 401/403)")
    
    # Test 6: Enterprise endpoints (should return 401 without auth)
    print("\n6. Testing Enterprise Endpoints...")
    endpoints = [
        ("GET", "/api/enterprise/documents"),
        ("GET", "/api/enterprise/suggestions"),
        ("GET", "/api/enterprise/kpis"),
        ("GET", "/api/enterprise/organization"),
    ]
    for method, path in endpoints:
        ok, msg = test_endpoint(method, f"{base_url}{path}", expected_status=[401, 403])
        print(f"   {'✓' if ok else '✗'} {msg} (expected 401/403)")
    
    # Test 7: Extension endpoints (should return 401 without auth)
    print("\n7. Testing Extension Endpoints...")
    endpoints = [
        ("GET", "/api/extension/status"),
        ("POST", "/api/extension/session/start"),
    ]
    for method, path in endpoints:
        ok, msg = test_endpoint(method, f"{base_url}{path}", 
                               json_data={"url": "test", "documentTitle": "test", "documentType": "other"} if method == "POST" else None,
                               expected_status=[401, 403, 422])
        print(f"   {'✓' if ok else '✗'} {msg} (expected 401/403/422)")
    
    print("\n" + "="*60)
    print("✓ Basic endpoint tests completed!")
    print("="*60)
    print("\nNote: 401/403 responses are expected for protected endpoints")
    print("      without authentication tokens.")

if __name__ == "__main__":
    main()
