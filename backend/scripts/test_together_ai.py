#!/usr/bin/env python3
"""
Test Together AI K2-Think API
The key format IFM-* suggests this might be a Together AI key
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

async def test_together_ai():
    """Test Together AI endpoint for K2-Think"""
    print("=" * 70)
    print("Testing Together AI K2-Think API")
    print("=" * 70)
    print(f"\nAPI Key: {API_KEY[:10]}...{API_KEY[-4:] if len(API_KEY) > 14 else ''}")
    
    # Together AI uses different endpoint
    base_url = "https://api.together.xyz/v1"
    
    models = [
        "MBZUAI-IFM/K2-Think-v2",
        "MBZUAI-IFM/K2-Think",
        "togethercomputer/K2-Think",
    ]
    
    for model in models:
        print(f"\n🔍 Testing model: {model}")
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {API_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": "Say hello"}],
                        "max_tokens": 10
                    },
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    print(f"   ✅ SUCCESS! Model {model} works!")
                    result = response.json()
                    if "choices" in result:
                        content = result["choices"][0]["message"]["content"]
                        print(f"   Response: {content}")
                    return True, model, base_url
                else:
                    print(f"   ❌ Status: {response.status_code}")
                    print(f"   Response: {response.text[:200]}")
        except Exception as e:
            print(f"   ❌ Error: {e}")
    
    return False, None, None

if __name__ == "__main__":
    success, model, base_url = asyncio.run(test_together_ai())
    if success:
        print(f"\n🎉 Found working configuration!")
        print(f"   Base URL: {base_url}")
        print(f"   Model: {model}")
        print(f"   Update k2think_client.py with these settings")
        sys.exit(0)
    else:
        print("\n❌ Together AI test failed")
        sys.exit(1)
