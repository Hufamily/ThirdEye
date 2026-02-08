#!/usr/bin/env python3
"""
Test Agent 0.0: Persona Architect
"""

import sys
import asyncio
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from agents.persona_architect import PersonaArchitect


async def test_persona_architect():
    """Test Persona Architect agent"""
    print("=" * 70)
    print("Testing Agent 0.0: Persona Architect")
    print("=" * 70)
    
    agent = PersonaArchitect()
    print(f"\n✅ Agent initialized: {agent}")
    
    # Test with a sample user_id (you'll need to replace with actual user_id)
    test_user_id = "test-user-123"  # Replace with real user_id from database
    
    print(f"\n🔍 Testing with user_id: {test_user_id}")
    print("   (Note: Will work better with real user data)")
    
    input_data = {
        "user_id": test_user_id,
        "include_docs": True,
        "include_sessions": True,
        "include_searches": True,
        "include_history": True,  # Include browser history
        # "google_access_token": "ya29.a0AfH6SMB..."  # Uncomment if you have Google token
    }
    
    try:
        result = await agent.process(input_data)
        
        if result.get("success"):
            print("\n✅ Persona analysis successful!")
            persona_card = result.get("data", {}).get("personaCard", {})
            
            print(f"\n📊 Persona Card:")
            print(f"   User ID: {persona_card.get('userId')}")
            print(f"   Learning Style: {persona_card.get('learningStyle')}")
            
            expertise = persona_card.get('expertiseLevels', {})
            print(f"   Expertise Levels: {len(expertise)} topics")
            if expertise:
                for topic, level in list(expertise.items())[:5]:
                    print(f"     • {topic}: {level}")
            
            print(f"   Active Projects: {len(persona_card.get('activeProjects', []))}")
            
            topics = persona_card.get('preferredTopics', [])
            print(f"   Preferred Topics: {len(topics)}")
            if topics:
                for topic in topics[:5]:
                    print(f"     • {topic}")
            
            print(f"   Known Gaps: {len(persona_card.get('knownGaps', []))}")
            print(f"   Learning Velocity: {persona_card.get('learningVelocity', 0)}")
            
            # Check browsing insights
            browsing = persona_card.get('browsingInsights')
            if browsing:
                print(f"\n🌐 Browsing Insights:")
                print(f"   Total Visits: {browsing.get('totalVisits', 0)}")
                print(f"   Learning Sites: {browsing.get('learningSitesCount', 0)}")
                top_domains = browsing.get('topDomains', [])
                if top_domains:
                    print(f"   Top Domains:")
                    for domain in top_domains[:5]:
                        print(f"     • {domain}")
            else:
                print("\n⚠️  No browsing insights (history may not be tracked)")
            
            return True
        else:
            print(f"\n❌ Persona analysis failed: {result.get('error')}")
            return False
            
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(test_persona_architect())
    sys.exit(0 if success else 1)
