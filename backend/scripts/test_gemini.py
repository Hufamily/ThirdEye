#!/usr/bin/env python3
"""
Test Gemini API Connection
"""

import sys
import asyncio
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from services.gemini_client import GeminiClient


async def test_gemini():
    """Test Gemini API connection"""
    print("=" * 70)
    print("Testing Gemini API Connection")
    print("=" * 70)
    
    try:
        client = GeminiClient()
        print(f"\n✅ Gemini client initialized")
        print(f"   Model: {client.model}")
        
        # Test connection
        print("\n🔍 Testing connection...")
        result = await client.chat(
            messages=[{"role": "user", "content": "Say hello in one word"}],
            max_tokens=10
        )
        
        text = client.extract_text_from_response(result)
        print(f"✅ Connection successful!")
        print(f"   Response: {text}")
        
        # Test JSON mode
        print("\n🔍 Testing JSON mode...")
        json_result = await client.analyze(
            prompt="Return a JSON object with keys 'name' and 'age'",
            system_instruction="You are a helpful assistant. Always return valid JSON.",
            json_mode=True
        )
        
        json_text = client.extract_text_from_response(json_result)
        print(f"✅ JSON mode works!")
        print(f"   Response: {json_text[:100]}...")
        
        return True
        
    except ValueError as e:
        print(f"\n❌ Configuration Error: {e}")
        print("\n💡 Add GEMINI_API_KEY to your .env file")
        print("   Get API key from: https://aistudio.google.com/app/apikey")
        return False
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(test_gemini())
    sys.exit(0 if success else 1)
