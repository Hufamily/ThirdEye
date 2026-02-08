"""
Agent Orchestrator Service
Wraps Dedalus Labs to orchestrate agent flow
"""

from typing import Dict, Any, Optional, List
from services.dedalus_client import DedalusClient
from agents.persona_architect import PersonaArchitect
from agents.capture_scrape import CaptureScrape
from agents.target_interpreter import TargetInterpreter
from agents.gap_hypothesis import GapHypothesis
from agents.explanation_composer import ExplanationComposer
from agents.memory_vault import MemoryVault
import asyncio


class AgentOrchestrator:
    """
    Orchestrates agent pipeline using Dedalus Labs
    Manages sequential agent execution and result passing
    """
    
    def __init__(self):
        """Initialize orchestrator with Dedalus client"""
        try:
            self.dedalus = DedalusClient()
        except Exception as e:
            print(f"Warning: Dedalus client initialization failed: {e}")
            self.dedalus = None
    
    async def process_user_interaction(
        self,
        user_id: str,
        capture_result: Dict[str, Any],
        persona_card: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Orchestrate full agent pipeline for user interaction
        
        Flow:
        1. Agent 2.0: Classify content
        2. Agent 3.0: Hypothesize gaps
        3. Agent 4.0: Compose explanation
        4. Agent 5.0: Log interaction
        
        Args:
            user_id: User ID
            capture_result: Result from Agent 1.0 (Capture & Scrape)
            persona_card: Optional persona card (will fetch if not provided)
            session_id: Optional session ID
            
        Returns:
            Orchestration result with all agent outputs
        """
        try:
            # Step 1: Get persona card if not provided
            if not persona_card:
                persona_architect = PersonaArchitect()
                persona_result = await persona_architect.process({
                    "user_id": user_id,
                    "include_docs": True,
                    "include_sessions": True,
                    "include_searches": True,
                    "include_history": True
                })
                
                if persona_result.get("success"):
                    persona_card = persona_result.get("data", {}).get("personaCard", {})
                else:
                    # Fallback empty persona card
                    persona_card = {
                        "expertiseLevels": {},
                        "learningStyle": "reading",
                        "knownGaps": [],
                        "activeProjects": []
                    }
            
            # Step 2: Use Dedalus to orchestrate agents if available
            if self.dedalus:
                try:
                    # Prepare input for Dedalus orchestration
                    orchestration_input = {
                        "user_id": user_id,
                        "capture_result": capture_result,
                        "persona_card": persona_card,
                        "session_id": session_id
                    }
                    
                    # Orchestrate agents 2.0, 3.0, 4.0 sequentially
                    agents = ["target_interpreter", "gap_hypothesis", "explanation_composer"]
                    
                    result = await self.dedalus.orchestrate_agents(
                        agents=agents,
                        input_data=orchestration_input,
                        routing_strategy="sequential"
                    )
                    
                    # Extract results from Dedalus response
                    if result.get("success"):
                        return await self._process_dedalus_result(
                            result, user_id, capture_result, persona_card, session_id
                        )
                    else:
                        # Fallback to direct agent calls
                        return await self._process_direct_agents(
                            user_id, capture_result, persona_card, session_id
                        )
                        
                except Exception as e:
                    print(f"Dedalus orchestration failed: {e}, using direct calls")
                    return await self._process_direct_agents(
                        user_id, capture_result, persona_card, session_id
                    )
            else:
                # No Dedalus, use direct agent calls
                return await self._process_direct_agents(
                    user_id, capture_result, persona_card, session_id
                )
                
        except Exception as e:
            return {
                "success": False,
                "error": f"Orchestration failed: {str(e)}"
            }
    
    async def _process_direct_agents(
        self,
        user_id: str,
        capture_result: Dict[str, Any],
        persona_card: Dict[str, Any],
        session_id: Optional[str]
    ) -> Dict[str, Any]:
        """Process agents directly without Dedalus (fallback)"""
        
        print(f"[AgentOrchestrator] Starting direct agent processing")
        print(f"[AgentOrchestrator] Capture result keys: {list(capture_result.keys()) if capture_result else 'None'}")
        print(f"[AgentOrchestrator] Persona card keys: {list(persona_card.keys()) if persona_card else 'None'}")
        print(f"[AgentOrchestrator] User ID: {user_id}")
        
        results = {
            "user_id": user_id,
            "session_id": session_id,
            "agents": {}
        }
        
        # Agent 2.0: Target Interpreter
        try:
            target_interpreter = TargetInterpreter()
            classification_result = await target_interpreter.process({
                "capture_result": capture_result,
                "persona_card": persona_card
            })
            print(f"[AgentOrchestrator] Agent 2.0 result: success={classification_result.get('success')}, has_data={bool(classification_result.get('data'))}")
            if not classification_result.get("success"):
                print(f"[AgentOrchestrator] Agent 2.0 returned success=False: {classification_result.get('error', 'Unknown error')}")
            results["agents"]["2.0"] = classification_result.get("data", {})
        except Exception as e:
            print(f"[AgentOrchestrator] Agent 2.0 failed with exception: {e}")
            import traceback
            traceback.print_exc()
            results["agents"]["2.0"] = {"error": str(e)}
        
        # Agent 3.0: Gap Hypothesis
        try:
            classification_data = results["agents"].get("2.0", {})
            print(f"[AgentOrchestrator] Agent 3.0 input - classification_data keys: {list(classification_data.keys())}")
            gap_hypothesis = GapHypothesis()
            hypothesis_result = await gap_hypothesis.process({
                "classification_result": classification_data,
                "persona_card": persona_card
            })
            print(f"[AgentOrchestrator] Agent 3.0 result: success={hypothesis_result.get('success')}, has_data={bool(hypothesis_result.get('data'))}")
            if not hypothesis_result.get("success"):
                print(f"[AgentOrchestrator] Agent 3.0 returned success=False: {hypothesis_result.get('error', 'Unknown error')}")
            results["agents"]["3.0"] = hypothesis_result.get("data", {})
        except Exception as e:
            print(f"[AgentOrchestrator] Agent 3.0 failed with exception: {e}")
            import traceback
            traceback.print_exc()
            results["agents"]["3.0"] = {"error": str(e)}
        
        # Agent 4.0: Explanation Composer
        try:
            hypothesis_data = results["agents"].get("3.0", {})
            winning_hypothesis = None
            
            # Get winning hypothesis
            if hypothesis_data.get("candidates"):
                winning_id = hypothesis_data.get("winning_hypothesis")
                if winning_id:
                    for candidate in hypothesis_data["candidates"]:
                        if candidate.get("id") == winning_id:
                            winning_hypothesis = candidate
                            break
            
            if not winning_hypothesis and hypothesis_data.get("candidates"):
                winning_hypothesis = hypothesis_data["candidates"][0]
            
            if winning_hypothesis:
                explanation_composer = ExplanationComposer()
                explanation_result = await explanation_composer.process({
                    "winning_hypothesis": winning_hypothesis,
                    "original_content": capture_result,
                    "persona_card": persona_card,
                    "reading_state": "confused"
                })
                results["agents"]["4.0"] = explanation_result.get("data", {})
            else:
                results["agents"]["4.0"] = {"error": "No hypothesis available"}
        except Exception as e:
            print(f"Agent 4.0 failed: {e}")
            results["agents"]["4.0"] = {"error": str(e)}
        
        # Agent 5.0: Memory Vault (log interaction)
        try:
            memory_vault = MemoryVault()
            interaction_data = {
                "doc_id": capture_result.get("metadata", {}).get("doc_id"),
                "anchor_id": capture_result.get("metadata", {}).get("anchor_id"),
                "content": capture_result.get("extracted_text", ""),
                "gap_hypothesis": results["agents"].get("3.0", {}),
                "explanation_given": results["agents"].get("4.0", {}),
                "concepts": results["agents"].get("2.0", {}).get("concepts", [])
            }
            
            log_result = await memory_vault.process({
                "user_id": user_id,
                "session_id": session_id,
                "interaction": interaction_data,
                "action": "log"
            })
            results["agents"]["5.0"] = log_result.get("data", {})
        except Exception as e:
            print(f"Agent 5.0 failed: {e}")
            results["agents"]["5.0"] = {"error": str(e)}
        
        return {
            "success": True,
            "data": results
        }
    
    async def _process_dedalus_result(
        self,
        dedalus_result: Dict[str, Any],
        user_id: str,
        capture_result: Dict[str, Any],
        persona_card: Dict[str, Any],
        session_id: Optional[str]
    ) -> Dict[str, Any]:
        """Process Dedalus orchestration result"""
        
        # Dedalus returns orchestrated results
        # Extract agent outputs from Dedalus response format
        results = {
            "user_id": user_id,
            "session_id": session_id,
            "agents": {},
            "orchestrated_by": "dedalus"
        }
        
        # Parse Dedalus response (format may vary)
        if "results" in dedalus_result:
            for agent_name, agent_result in dedalus_result["results"].items():
                results["agents"][agent_name] = agent_result
        
        # Always log interaction via Agent 5.0
        try:
            memory_vault = MemoryVault()
            interaction_data = {
                "doc_id": capture_result.get("metadata", {}).get("doc_id"),
                "anchor_id": capture_result.get("metadata", {}).get("anchor_id"),
                "content": capture_result.get("extracted_text", ""),
                "gap_hypothesis": results["agents"].get("gap_hypothesis", {}),
                "explanation_given": results["agents"].get("explanation_composer", {}),
                "concepts": results["agents"].get("target_interpreter", {}).get("concepts", [])
            }
            
            log_result = await memory_vault.process({
                "user_id": user_id,
                "session_id": session_id,
                "interaction": interaction_data,
                "action": "log"
            })
            results["agents"]["5.0"] = log_result.get("data", {})
        except Exception as e:
            print(f"Agent 5.0 logging failed: {e}")
        
        return {
            "success": True,
            "data": results
        }
    
    async def orchestrate_single_agent(
        self,
        agent_id: str,
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Orchestrate a single agent through Dedalus
        
        Args:
            agent_id: Agent ID (e.g., "2.0", "3.0")
            input_data: Input data for the agent
            
        Returns:
            Agent result
        """
        if not self.dedalus:
            return {
                "success": False,
                "error": "Dedalus client not available"
            }
        
        try:
            agent_name_map = {
                "0.0": "persona_architect",
                "1.0": "capture_scrape",
                "2.0": "target_interpreter",
                "3.0": "gap_hypothesis",
                "4.0": "explanation_composer",
                "5.0": "memory_vault",
                "6.0": "document_surgeon"
            }
            
            agent_name = agent_name_map.get(agent_id)
            if not agent_name:
                return {
                    "success": False,
                    "error": f"Unknown agent ID: {agent_id}"
                }
            
            result = await self.dedalus.call_agent(
                agent_id=agent_name,
                input_data=input_data
            )
            
            return {
                "success": True,
                "data": result
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
