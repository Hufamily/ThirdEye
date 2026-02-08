#!/usr/bin/env python3
"""
Register all agents in Dedalus Labs
Run this script to register agents on startup or manually
"""

import sys
import asyncio
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from services.dedalus_client import DedalusClient


async def register_all_agents():
    """Register all agents in Dedalus Labs"""
    
    print("=" * 70)
    print("Registering Agents in Dedalus Labs")
    print("=" * 70)
    
    try:
        dedalus_client = DedalusClient()
        
        # Test connection first
        print("\n1. Testing Dedalus connection...")
        connection_ok = await dedalus_client.test_connection()
        
        if not connection_ok:
            print("❌ Dedalus connection failed. Check API key and URL.")
            return False
        
        print("✅ Dedalus connection successful!")
        
        # Agent configurations
        agents = [
            {
                "name": "persona_architect",
                "model": "gemini-2.0-flash",
                "description": "Agent 0.0: Builds user knowledge profile"
            },
            {
                "name": "traffic_controller",
                "model": "gpt-4-turbo",
                "description": "Agent 0.5: Routes requests and detects mode"
            },
            {
                "name": "capture_scrape",
                "model": "gpt-4-turbo",
                "description": "Agent 1.0: Extracts content from pages"
            },
            {
                "name": "target_interpreter",
                "model": "gemini-2.0-flash",
                "description": "Agent 2.0: Classifies content and assesses complexity"
            },
            {
                "name": "gap_hypothesis",
                "model": "k2-think",
                "description": "Agent 3.0: Hypothesizes knowledge gaps using K2-Think"
            },
            {
                "name": "explanation_composer",
                "model": "k2-think",
                "description": "Agent 4.0: Composes personalized explanations using K2-Think"
            },
            {
                "name": "memory_vault",
                "model": "gpt-4-turbo",
                "description": "Agent 5.0: Tracks learning interactions"
            },
            {
                "name": "document_surgeon",
                "model": "k2-think",
                "description": "Agent 6.0: Aggregates friction and suggests improvements"
            }
        ]
        
        print(f"\n2. Registering {len(agents)} agents...")
        
        registered = []
        failed = []
        
        for agent_config in agents:
            agent_name = agent_config["name"]
            print(f"\n   Registering: {agent_name} ({agent_config['description']})")
            
            try:
                result = await dedalus_client.create_agent(
                    agent_name=agent_name,
                    agent_config={
                        "model": agent_config["model"],
                        "description": agent_config["description"]
                    }
                )
                
                agent_id = result.get("id") or result.get("agent_id")
                if agent_id:
                    print(f"   ✅ Registered: {agent_name} (ID: {agent_id})")
                    registered.append({
                        "name": agent_name,
                        "id": agent_id,
                        "model": agent_config["model"]
                    })
                else:
                    print(f"   ⚠️  Registered but no ID returned: {agent_name}")
                    registered.append({
                        "name": agent_name,
                        "id": None,
                        "model": agent_config["model"]
                    })
                    
            except Exception as e:
                print(f"   ❌ Failed: {agent_name} - {e}")
                failed.append({
                    "name": agent_name,
                    "error": str(e)
                })
        
        # Summary
        print("\n" + "=" * 70)
        print("Registration Summary")
        print("=" * 70)
        print(f"✅ Successfully registered: {len(registered)}/{len(agents)}")
        print(f"❌ Failed: {len(failed)}/{len(agents)}")
        
        if registered:
            print("\nRegistered Agents:")
            for agent in registered:
                print(f"  • {agent['name']} ({agent['model']})")
                if agent['id']:
                    print(f"    ID: {agent['id']}")
        
        if failed:
            print("\nFailed Agents:")
            for agent in failed:
                print(f"  • {agent['name']}: {agent['error']}")
        
        # Save agent IDs to file for reference
        if registered:
            import json
            agents_file = backend_dir / "config" / "dedalus_agents.json"
            agents_file.parent.mkdir(exist_ok=True)
            
            with open(agents_file, "w") as f:
                json.dump({
                    "registered_at": str(asyncio.get_event_loop().time()),
                    "agents": registered
                }, f, indent=2)
            
            print(f"\n📄 Agent IDs saved to: {agents_file}")
        
        return len(failed) == 0
        
    except Exception as e:
        print(f"\n❌ Registration failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(register_all_agents())
    sys.exit(0 if success else 1)
