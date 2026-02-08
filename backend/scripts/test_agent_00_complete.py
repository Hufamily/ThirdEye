"""
Complete test script for Agent 0.0 (Persona Architect)
Tests with both Google Docs content and browser history
"""

import asyncio
import httpx
import json
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.auth import create_access_token
from models.user import User
from utils.database import get_db


async def test_agent_00_complete():
    """Test Agent 0.0 with all data sources"""
    
    base_url = os.getenv("API_BASE_URL", "http://localhost:8000")
    
    # Get JWT token (you'll need to set this)
    jwt_token = os.getenv("TEST_JWT_TOKEN")
    if not jwt_token:
        print("⚠️  TEST_JWT_TOKEN not set. Creating test token...")
        # Try to get user from database
        try:
            db = next(get_db())
            user = db.query(User).first()
            if user:
                token_data = {"sub": user.user_id, "email": user.email}
                jwt_token = create_access_token(token_data)
                print(f"✅ Created token for user: {user.email}")
            else:
                print("❌ No users found in database. Please create a user first.")
                return
        except Exception as e:
            print(f"❌ Error getting token: {e}")
            print("Please set TEST_JWT_TOKEN environment variable or ensure database has users")
            return
    
    # Optional: Google access token
    google_token = os.getenv("TEST_GOOGLE_TOKEN")
    
    print("🧪 Testing Agent 0.0 (Persona Architect)")
    print("=" * 60)
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Prepare request
        request_data = {
            "include_docs": True,
            "include_history": True,
            "include_sessions": True,
            "include_searches": True
        }
        
        if google_token:
            request_data["google_access_token"] = google_token
            print("✅ Using Google Docs content (access token provided)")
        else:
            print("⚠️  No Google token - using metadata only")
        
        print(f"\n📡 Calling: POST {base_url}/api/agents/persona-architect")
        print(f"Request: {json.dumps(request_data, indent=2)}")
        print("\n" + "-" * 60)
        
        try:
            response = await client.post(
                f"{base_url}/api/agents/persona-architect",
                headers={
                    "Authorization": f"Bearer {jwt_token}",
                    "Content-Type": "application/json"
                },
                json=request_data
            )
            
            print(f"Status Code: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                
                if result.get("success"):
                    print("✅ SUCCESS!")
                    print("\n" + "=" * 60)
                    
                    persona = result.get("data", {}).get("personaCard", {})
                    
                    # Display results
                    print("\n📊 PERSONA CARD SUMMARY:")
                    print("-" * 60)
                    
                    # Expertise Levels
                    expertise = persona.get("expertiseLevels", {})
                    if expertise:
                        print("\n🎯 Expertise Levels:")
                        for topic, level in expertise.items():
                            print(f"  • {topic}: {level}")
                    else:
                        print("\n⚠️  No expertise levels found")
                    
                    # Learning Style
                    learning_style = persona.get("learningStyle")
                    if learning_style:
                        print(f"\n📚 Learning Style: {learning_style}")
                    
                    # Preferred Topics
                    topics = persona.get("preferredTopics", [])
                    if topics:
                        print(f"\n⭐ Preferred Topics ({len(topics)}):")
                        for topic in topics[:10]:
                            print(f"  • {topic}")
                    else:
                        print("\n⚠️  No preferred topics found")
                    
                    # Active Projects
                    projects = persona.get("activeProjects", [])
                    if projects:
                        print(f"\n💼 Active Projects ({len(projects)}):")
                        for project in projects[:5]:
                            print(f"  • {project.get('name', 'Untitled')}")
                    
                    # Known Gaps
                    gaps = persona.get("knownGaps", [])
                    if gaps:
                        print(f"\n🔍 Known Knowledge Gaps ({len(gaps)}):")
                        for gap in gaps[:5]:
                            print(f"  • {gap}")
                    
                    # Learning Velocity
                    velocity = persona.get("learningVelocity")
                    if velocity is not None:
                        print(f"\n⚡ Learning Velocity: {velocity:.2f} (0.0-1.0)")
                    
                    # Browsing Insights
                    browsing = persona.get("browsingInsights")
                    if browsing:
                        print(f"\n🌐 Browsing Insights:")
                        print(f"  • Total Visits: {browsing.get('totalVisits', 0)}")
                        print(f"  • Learning Sites: {browsing.get('learningSitesCount', 0)}")
                        top_domains = browsing.get("topDomains", [])
                        if top_domains:
                            print(f"  • Top Domains:")
                            for domain in top_domains[:5]:
                                print(f"    - {domain}")
                    else:
                        print("\n⚠️  No browsing insights (history may not be tracked)")
                    
                    print("\n" + "=" * 60)
                    print("\n✅ Test completed successfully!")
                    print("\nFull response saved to: agent_00_test_result.json")
                    
                    # Save full response
                    with open("agent_00_test_result.json", "w") as f:
                        json.dump(result, f, indent=2)
                    
                else:
                    print("❌ Request succeeded but result.success = False")
                    print(f"Error: {result.get('error', 'Unknown error')}")
                    print(json.dumps(result, indent=2))
            else:
                print(f"❌ ERROR: {response.status_code}")
                print(response.text)
                
        except httpx.TimeoutException:
            print("❌ Request timed out (60s). Check if backend is running.")
        except httpx.ConnectError:
            print(f"❌ Could not connect to {base_url}")
            print("Make sure backend is running: python3 -m uvicorn app.main:app --reload")
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    print("Agent 0.0 Complete Test Script")
    print("=" * 60)
    print("\nPrerequisites:")
    print("  1. Backend running on http://localhost:8000")
    print("  2. Database connected and populated")
    print("  3. User exists in database")
    print("  4. (Optional) TEST_GOOGLE_TOKEN for Google Docs content")
    print("\n" + "=" * 60 + "\n")
    
    asyncio.run(test_agent_00_complete())
