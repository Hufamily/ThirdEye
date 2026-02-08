"""
Test script for frontend-backend integration routes
Tests all newly created endpoints
"""

import requests
import json
import sys
from typing import Optional

# Configuration
BASE_URL = "http://localhost:8000/api"
TEST_EMAIL = "test@example.com"

# Test token (will be set after login)
auth_token: Optional[str] = None


def print_test(name: str):
    """Print test header"""
    print(f"\n{'='*60}")
    print(f"Testing: {name}")
    print(f"{'='*60}")


def make_request(method: str, endpoint: str, data: Optional[dict] = None, params: Optional[dict] = None) -> dict:
    """Make authenticated API request"""
    url = f"{BASE_URL}{endpoint}"
    headers = {
        "Content-Type": "application/json"
    }
    
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    
    try:
        if method == "GET":
            response = requests.get(url, headers=headers, params=params)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=data)
        elif method == "PUT":
            response = requests.put(url, headers=headers, json=data)
        elif method == "PATCH":
            response = requests.patch(url, headers=headers, json=data)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        response.raise_for_status()
        return response.json() if response.content else {}
    except requests.exceptions.RequestException as e:
        print(f"❌ Error: {e}")
        if hasattr(e.response, 'text'):
            print(f"Response: {e.response.text}")
        return None


def test_auth():
    """Test authentication endpoints"""
    global auth_token
    
    print_test("Authentication")
    
    # Note: Google login requires actual Google OAuth token
    # For testing, we'll skip this and assume token is set manually
    print("⚠️  Skipping Google login (requires OAuth token)")
    print("   To test: Set auth_token manually or use a real Google token")
    
    # Test /me endpoint (will fail without token, but shows structure)
    print("\nTesting GET /auth/me...")
    result = make_request("GET", "/auth/me")
    if result:
        print("✅ GET /auth/me works")
        print(f"   User: {result.get('user', {}).get('email', 'N/A')}")
    else:
        print("❌ GET /auth/me failed (expected without token)")


def test_personal_routes():
    """Test personal dashboard routes"""
    print_test("Personal Dashboard Routes")
    
    # Test profile
    print("\nTesting GET /personal/profile...")
    result = make_request("GET", "/personal/profile")
    if result:
        print("✅ GET /personal/profile works")
        print(f"   Name: {result.get('name', 'N/A')}")
        print(f"   Email: {result.get('email', 'N/A')}")
    else:
        print("❌ GET /personal/profile failed")
    
    # Test sessions
    print("\nTesting GET /personal/sessions...")
    result = make_request("GET", "/personal/sessions", params={"limit": 10})
    if result:
        print(f"✅ GET /personal/sessions works")
        print(f"   Found {len(result)} sessions")
    else:
        print("❌ GET /personal/sessions failed")
    
    # Test notebook entries
    print("\nTesting GET /personal/notebook-entries...")
    result = make_request("GET", "/personal/notebook-entries", params={"limit": 10})
    if result:
        print(f"✅ GET /personal/notebook-entries works")
        print(f"   Found {len(result)} entries")
    else:
        print("❌ GET /personal/notebook-entries failed")
    
    # Test persona settings
    print("\nTesting GET /personal/persona...")
    result = make_request("GET", "/personal/persona")
    if result:
        print("✅ GET /personal/persona works")
        print(f"   Experience: {result.get('experience', 'N/A')}")
    else:
        print("❌ GET /personal/persona failed")
    
    # Test privacy settings
    print("\nTesting GET /personal/privacy-settings...")
    result = make_request("GET", "/personal/privacy-settings")
    if result:
        print("✅ GET /personal/privacy-settings works")
        print(f"   Data Sharing: {result.get('dataSharing', 'N/A')}")
    else:
        print("❌ GET /personal/privacy-settings failed")


def test_enterprise_routes():
    """Test enterprise routes"""
    print_test("Enterprise Routes")
    
    # Test documents
    print("\nTesting GET /enterprise/documents...")
    result = make_request("GET", "/enterprise/documents", params={"limit": 10})
    if result:
        print("✅ GET /enterprise/documents works")
        print(f"   Found {result.get('total', 0)} documents")
    else:
        print("❌ GET /enterprise/documents failed")
    
    # Test suggestions
    print("\nTesting GET /enterprise/suggestions...")
    result = make_request("GET", "/enterprise/suggestions", params={"limit": 10})
    if result:
        print("✅ GET /enterprise/suggestions works")
        print(f"   Found {result.get('total', 0)} suggestions")
    else:
        print("❌ GET /enterprise/suggestions failed")
    
    # Test KPIs
    print("\nTesting GET /enterprise/kpis...")
    result = make_request("GET", "/enterprise/kpis")
    if result:
        print("✅ GET /enterprise/kpis works")
        print(f"   Time Reclaimed: {result.get('timeReclaimed', 0)} hours")
    else:
        print("❌ GET /enterprise/kpis failed")
    
    # Test organization
    print("\nTesting GET /enterprise/organization...")
    result = make_request("GET", "/enterprise/organization")
    if result:
        print("✅ GET /enterprise/organization works")
        print(f"   Org Name: {result.get('orgName', 'N/A')}")
    else:
        print("❌ GET /enterprise/organization failed")
    
    # Test Google Drive sources
    print("\nTesting GET /enterprise/google-drive/sources...")
    result = make_request("GET", "/enterprise/google-drive/sources")
    if result:
        print("✅ GET /enterprise/google-drive/sources works")
        print(f"   Found {len(result.get('sources', []))} sources")
    else:
        print("❌ GET /enterprise/google-drive/sources failed")
    
    # Test members
    print("\nTesting GET /enterprise/members...")
    result = make_request("GET", "/enterprise/members")
    if result:
        print("✅ GET /enterprise/members works")
        print(f"   Found {len(result.get('members', []))} members")
    else:
        print("❌ GET /enterprise/members failed")
    
    # Test settings
    print("\nTesting GET /enterprise/settings...")
    result = make_request("GET", "/enterprise/settings")
    if result:
        print("✅ GET /enterprise/settings works")
        print(f"   Classification Rules: {len(result.get('classificationRules', []))}")
    else:
        print("❌ GET /enterprise/settings failed")


def test_google_docs_routes():
    """Test Google Docs routes"""
    print_test("Google Docs Routes")
    
    # Test documents
    print("\nTesting GET /google-docs/documents...")
    result = make_request("GET", "/google-docs/documents")
    if result:
        print("✅ GET /google-docs/documents works")
        print(f"   Found {result.get('total', 0)} documents")
    else:
        print("❌ GET /google-docs/documents failed")
    
    # Test suggestions (requires documentId)
    print("\nTesting GET /google-docs/suggestions...")
    print("   (Skipping - requires documentId parameter)")


def test_extension_routes():
    """Test extension routes"""
    print_test("Extension Routes")
    
    # Test status
    print("\nTesting GET /extension/status...")
    result = make_request("GET", "/extension/status")
    if result:
        print("✅ GET /extension/status works")
        print(f"   Is Active: {result.get('isActive', False)}")
    else:
        print("❌ GET /extension/status failed")


def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("Frontend-Backend Integration Route Tests")
    print("="*60)
    print(f"\nBase URL: {BASE_URL}")
    print(f"Note: Most tests require authentication token")
    print(f"Set auth_token in script or provide via environment")
    
    # Check if server is running
    try:
        response = requests.get(f"{BASE_URL.replace('/api', '')}/health", timeout=2)
        if response.status_code == 200:
            print("\n✅ Backend server is running")
        else:
            print("\n⚠️  Backend server responded with non-200 status")
    except requests.exceptions.RequestException:
        print("\n❌ Backend server is not running!")
        print("   Please start the backend server first:")
        print("   cd backend && python -m uvicorn app.main:app --reload")
        sys.exit(1)
    
    # Run tests
    test_auth()
    test_personal_routes()
    test_enterprise_routes()
    test_google_docs_routes()
    test_extension_routes()
    
    print("\n" + "="*60)
    print("Testing Complete")
    print("="*60)
    print("\nNote: Some tests may fail without proper authentication.")
    print("To test with authentication:")
    print("1. Login via frontend to get a token")
    print("2. Set auth_token variable in this script")
    print("3. Run tests again")


if __name__ == "__main__":
    main()
