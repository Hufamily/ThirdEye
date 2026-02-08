#!/usr/bin/env python3
"""
Test IFM K2-Think API endpoints
The IFM-* key format suggests this might be from IFM directly
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

# Possible IFM/K2-Think endpoints
ENDPOINTS = [
    "https://api.k2think.ai/v1/chat/completions",
    "https://k2think.ai/api/v1/chat/completions",
    "https://api.ifm.ai/v1/chat/completions",
    "https://api.mbzuai.ifm/v1/chat/completions",
]

MODELS = [
    "MBZUAI-IFM/K2-Think-v2",
    "MBZUAI-IFM/K2-Think",
    "kimi-k2-thinking",
    "k2think",
]

async def test_endpoint(endpoint: str, model: str):
    """Test a specific endpoint"""
    try:
        async with httpx.AsyncClient() as client:
            # Try both auth methods
            for auth_type, headers in [
                ("Bearer", {"Authorization": f"Bearer {API_KEY}"}),
                ("X-API-Key", {"X-API-Key": API_KEY}),
            ]:
                headers["Content-Type"] = "application/json"
                
                response = await client.post(
                    endpoint,
                    headers=headers,
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": "Hello"}],
                        "max_tokens": 10
                    },
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    print(f"   ✅ SUCCESS with {auth_type} auth!")
                    result = response.json()
                    if "choices" in result:
                        content = result["choices"][0]["message"]["content"]
                        print(f"   Response: {content[:50]}...")
                    return True, endpoint, model, auth_type
                elif response.status_code != 401:
                    print(f"   ⚠️  Status {response.status_code}: {response.text[:100]}")
    except Exception as e:
        pass  # Skip connection errors
    
    return False, None, None, None

async def main():
    """Test all possible endpoints"""
    print("=" * 70)
    print("Testing IFM K2-Think API Endpoints")
    print("=" * 70)
    print(f"\nAPI Key: {API_KEY[:10]}...{API_KEY[-4:] if len(API_KEY) > 14 else ''}")
    
    for endpoint in ENDPOINTS:
        print(f"\n🔍 Testing endpoint: {endpoint}")
        for model in MODELS:
            print(f"   Model: {model}")
            success, ep, mod, auth = await test_endpoint(endpoint, model)
            if success:
                print(f"\n🎉 FOUND WORKING CONFIGURATION!")
                print(f"   Endpoint: {ep}")
                print(f"   Model: {mod}")
                print(f"   Auth: {auth}")
                return 0
    
    print("\n❌ No working endpoint found")
    print("\nThe API key format 'IFM-*' suggests it might be:")
    print("1. From IFM (Institute of Foundation Models) - check k2think.ai")
    print("2. From Together AI - but needs different key format")
    print("3. From another provider")
    print("\nPlease check:")
    print("- Where you obtained this API key")
    print("- What service/provider it's for")
    print("- The correct endpoint URL for that provider")
    return 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
