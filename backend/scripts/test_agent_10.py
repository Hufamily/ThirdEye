#!/usr/bin/env python3
"""
Test Agent 1.0: Capture & Scrape
"""

import sys
import asyncio
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from agents.capture_scrape import CaptureScrape


async def test_capture_scrape():
    """Test Capture & Scrape agent"""
    print("=" * 70)
    print("Testing Agent 1.0: Capture & Scrape")
    print("=" * 70)
    
    agent = CaptureScrape()
    print(f"\n✅ Agent initialized: {agent}")
    
    # Test 1: Web page extraction
    print("\n" + "-" * 70)
    print("Test 1: Web Page Extraction")
    print("-" * 70)
    
    input_data_web = {
        "url": "https://example.com/article",
        "cursor_position": {"x": 400, "y": 300},
        "dwell_time_ms": 2000,
        "context_lines": 10,
        "page_content": {
            "text": "\n".join([
                f"Line {i}: This is line number {i} of the article content."
                for i in range(50)
            ])
        }
    }
    
    try:
        result = await agent.process(input_data_web)
        
        if result.get("success"):
            data = result.get("data", {})
            print("✅ Web page extraction successful!")
            print(f"\n📄 Extracted Text:")
            print(f"   {data.get('extracted_text', '')[:100]}...")
            print(f"\n📊 Context:")
            print(f"   Before: {len(data.get('context_before', ''))} chars")
            print(f"   After: {len(data.get('context_after', ''))} chars")
            print(f"   Source Type: {data.get('source_type')}")
        else:
            print(f"❌ Failed: {result.get('error')}")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    # Test 2: Google Docs extraction (without token)
    print("\n" + "-" * 70)
    print("Test 2: Google Docs Extraction (No Token)")
    print("-" * 70)
    
    input_data_docs = {
        "url": "https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit",
        "cursor_position": {"x": 400, "y": 300},
        "dwell_time_ms": 2000,
        "context_lines": 10
    }
    
    try:
        result = await agent.process(input_data_docs)
        
        if result.get("success"):
            data = result.get("data", {})
            print("✅ Google Docs detection successful!")
            print(f"   Source Type: {data.get('source_type')}")
            metadata = data.get("metadata", {})
            if "error" in metadata:
                print(f"   ⚠️  Expected: {metadata['error']}")
        else:
            print(f"❌ Failed: {result.get('error')}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    # Test 3: PDF detection
    print("\n" + "-" * 70)
    print("Test 3: PDF Detection")
    print("-" * 70)
    
    input_data_pdf = {
        "url": "https://example.com/document.pdf",
        "cursor_position": {"x": 400, "y": 300},
        "dwell_time_ms": 2000,
        "context_lines": 10
    }
    
    try:
        result = await agent.process(input_data_pdf)
        
        if result.get("success"):
            data = result.get("data", {})
            print("✅ PDF detection successful!")
            print(f"   Source Type: {data.get('source_type')}")
            metadata = data.get("metadata", {})
            if "error" in metadata:
                print(f"   ⚠️  Note: {metadata.get('note', '')}")
        else:
            print(f"❌ Failed: {result.get('error')}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    print("\n" + "=" * 70)
    print("✅ All tests completed!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(test_capture_scrape())
