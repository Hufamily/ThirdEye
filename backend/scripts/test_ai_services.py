#!/usr/bin/env python3
"""
Test AI Services Connection
Tests Dedalus Labs and K2-Think API connections
"""

import sys
import asyncio
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from services.dedalus_client import DedalusClient
from services.k2think_client import K2ThinkClient


async def test_dedalus():
    """Test Dedalus Labs connection"""
    print("\n" + "=" * 60)
    print("Testing Dedalus Labs Connection")
    print("=" * 60)
    
    client = DedalusClient()
    
    try:
        print("\n🔍 Testing connection...")
        connected = await client.test_connection()
        
        if connected:
            print("✅ Dedalus Labs connection successful!")
            return True
        else:
            print("❌ Dedalus Labs connection failed")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_k2think():
    """Test K2-Think connection"""
    print("\n" + "=" * 60)
    print("Testing K2-Think Connection")
    print("=" * 60)
    
    client = K2ThinkClient()
    
    try:
        print("\n🔍 Testing connection with simple query...")
        result = await client.test_connection()
        
        if result:
            print("✅ K2-Think connection successful!")
            
            # Test a simple reasoning query
            print("\n🔍 Testing reasoning capability...")
            try:
                reasoning_result = await client.reason(
                    "Explain what machine learning is in one sentence.",
                    max_steps=3
                )
                
                print("✅ Reasoning test successful!")
                print(f"   Response keys: {list(reasoning_result.keys())}")
            except Exception as e:
                print(f"⚠️  Reasoning test failed (but connection works): {e}")
            
            return True
        else:
            print("❌ K2-Think connection failed")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run all tests"""
    print("=" * 60)
    print("AI Services Connection Test")
    print("=" * 60)
    
    results = []
    
    # Test Dedalus Labs
    dedalus_ok = await test_dedalus()
    results.append(("Dedalus Labs", dedalus_ok))
    
    # Test K2-Think
    k2think_ok = await test_k2think()
    results.append(("K2-Think", k2think_ok))
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print("=" * 60)
    
    if all(result for _, result in results):
        print("\n🎉 All AI services connected successfully!")
        print("✅ Ready to implement agents")
        return 0
    else:
        print("\n⚠️  Some services failed to connect")
        print("Check your API credentials in .env file")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
