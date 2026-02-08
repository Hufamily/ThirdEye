#!/usr/bin/env python3
"""
K2-Think Authentication Debugging Script
Tests different authentication methods and endpoints
"""

import sys
import asyncio
import httpx
from pathlib import Path
from dotenv import load_dotenv
import os

# Load environment
backend_dir = Path(__file__).parent.parent
root_dir = backend_dir.parent
load_dotenv(root_dir / ".env")

API_KEY = os.getenv("K2_API_KEY")
BASE_URLS = [
    "https://kimi-k2.ai/api",
    "https://api.kimi-k2.ai",
    "https://kimi-k2.ai"
]

MODELS = [
    "kimi-k2-thinking",
    "kimi-k2-0905",
    "kimi-k2",
    "kimi/k2-think"
]

async def test_auth_method(url: str, model: str, auth_header: dict, method_name: str):
    """Test a specific authentication method"""
    print(f"\n🔍 Testing: {method_name}")
    print(f"   URL: {url}/v1/chat/completions")
    print(f"   Model: {model}")
    print(f"   Headers: {list(auth_header.keys())}")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{url}/v1/chat/completions",
                headers={
                    **auth_header,
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": "Say hello"}],
                    "max_tokens": 10
                },
                timeout=10.0
            )
            
            status = response.status_code
            if status == 200:
                print(f"   ✅ SUCCESS! Status: {status}")
                result = response.json()
                if "choices" in result:
                    content = result["choices"][0]["message"]["content"]
                    print(f"   Response: {content[:50]}...")
                return True
            elif status == 401:
                print(f"   ❌ FAILED: 401 Unauthorized")
                print(f"   Response: {response.text[:200]}")
                return False
            else:
                print(f"   ⚠️  Status: {status}")
                print(f"   Response: {response.text[:200]}")
                return False
                
    except httpx.ConnectError as e:
        print(f"   ❌ Connection Error: {e}")
        return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

async def main():
    """Run all authentication tests"""
    print("=" * 70)
    print("K2-Think Authentication Debugging")
    print("=" * 70)
    
    print(f"\n📋 API Key: {API_KEY[:10]}...{API_KEY[-4:] if len(API_KEY) > 14 else ''}")
    print(f"   Full Key: {API_KEY}")
    print(f"   Length: {len(API_KEY)} characters")
    
    if not API_KEY:
        print("\n❌ ERROR: K2_API_KEY not found in environment!")
        print("   Check your .env file")
        return 1
    
    # Test different authentication methods
    auth_methods = [
        ("Authorization: Bearer", {"Authorization": f"Bearer {API_KEY}"}),
        ("X-API-Key", {"X-API-Key": API_KEY}),
        ("Authorization: Bearer (no space)", {"Authorization": f"Bearer{API_KEY}"}),
    ]
    
    success_count = 0
    total_tests = 0
    
    # Test each combination
    for base_url in BASE_URLS:
        print(f"\n{'='*70}")
        print(f"Testing Base URL: {base_url}")
        print(f"{'='*70}")
        
        for model in MODELS:
            for method_name, auth_header in auth_methods:
                total_tests += 1
                success = await test_auth_method(base_url, model, auth_header, method_name)
                if success:
                    success_count += 1
                    print(f"\n🎉 FOUND WORKING CONFIGURATION!")
                    print(f"   Base URL: {base_url}")
                    print(f"   Model: {model}")
                    print(f"   Auth Method: {method_name}")
                    print(f"   Headers: {auth_header}")
                    print("\n✅ Use this configuration in k2think_client.py")
                    return 0
                
                # Small delay to avoid rate limiting
                await asyncio.sleep(0.5)
    
    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Total tests: {total_tests}")
    print(f"Successful: {success_count}")
    
    if success_count == 0:
        print("\n❌ No working configuration found")
        print("\nTroubleshooting steps:")
        print("1. Verify API key is correct at: https://kimi-k2.ai/dashboard")
        print("2. Check if API key is active and has credits")
        print("3. Verify API key format matches documentation")
        print("4. Check if your account has access to K2-Think API")
        print("5. Try generating a new API key")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
