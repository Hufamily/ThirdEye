#!/usr/bin/env python3
"""
Quick API test script
Tests the API endpoints without requiring camera
"""

import requests
import time
import sys

API_URL = "http://localhost:5000"

def test_endpoint(endpoint, description):
    """Test an API endpoint"""
    print(f"\n🧪 Testing {description}...")
    try:
        url = f"{API_URL}{endpoint}"
        response = requests.get(url, timeout=5)
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}")
        return response.status_code == 200 or response.status_code == 204
    except requests.exceptions.ConnectionError:
        print(f"   ❌ Connection failed - Is the server running?")
        return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def main():
    print("=" * 50)
    print("Gaze Tracker API Test")
    print("=" * 50)
    print(f"\nTesting API at {API_URL}")
    print("Make sure the server is running: python3 main.py --mode api --skip-init")
    
    # Wait a moment for user to start server
    print("\n⏳ Waiting 2 seconds...")
    time.sleep(2)
    
    results = []
    
    # Test root endpoint
    results.append(("Root", test_endpoint("/", "API Information")))
    
    # Test health endpoint
    results.append(("Health", test_endpoint("/health", "Health Check")))
    
    # Test status endpoint
    results.append(("Status", test_endpoint("/status", "Status Information")))
    
    # Test gaze endpoint (may return 204 if no gaze data)
    results.append(("Gaze", test_endpoint("/gaze", "Gaze Coordinates")))
    
    # Summary
    print("\n" + "=" * 50)
    print("Test Summary")
    print("=" * 50)
    for name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{name}: {status}")
    
    all_passed = all(result[1] for result in results)
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
