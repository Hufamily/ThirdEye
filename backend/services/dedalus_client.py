"""
Dedalus Labs API Client
Agent orchestration platform with MCP integration
"""

import httpx
from typing import Dict, Any, Optional, List
from app.config import settings
import json


class DedalusClient:
    """
    Client for Dedalus Labs API
    Handles agent orchestration and MCP server communication
    """
    
    def __init__(self):
        """Initialize Dedalus Labs client"""
        self.api_key = settings.dedalus_api_key
        self.api_url = settings.dedalus_api_url
        # Dedalus Labs uses OpenAI-compatible API
        self.base_url = f"{self.api_url}/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    async def create_agent(
        self,
        agent_name: str,
        agent_config: Dict[str, Any],
        mcp_servers: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Create a new agent in Dedalus Labs
        
        Args:
            agent_name: Name of the agent
            agent_config: Agent configuration
            mcp_servers: List of MCP server identifiers
            
        Returns:
            Agent creation response
        """
        async with httpx.AsyncClient() as client:
            payload = {
                "name": agent_name,
                "config": agent_config
            }
            
            if mcp_servers:
                payload["mcp_servers"] = mcp_servers
            
            response = await client.post(
                f"{self.base_url}/agents",
                headers=self.headers,
                json=payload,
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
    
    async def call_agent(
        self,
        agent_id: str,
        input_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Call an agent with input data
        
        Args:
            agent_id: Agent identifier
            input_data: Input data for the agent
            context: Optional context data
            
        Returns:
            Agent response
        """
        async with httpx.AsyncClient() as client:
            payload = {
                "input": input_data
            }
            
            if context:
                payload["context"] = context
            
            response = await client.post(
                f"{self.base_url}/agents/{agent_id}/call",
                headers=self.headers,
                json=payload,
                timeout=60.0
            )
            response.raise_for_status()
            return response.json()
    
    async def orchestrate_agents(
        self,
        agents: List[str],
        input_data: Dict[str, Any],
        routing_strategy: str = "sequential"
    ) -> Dict[str, Any]:
        """
        Orchestrate multiple agents
        
        Args:
            agents: List of agent IDs to orchestrate
            input_data: Input data
            routing_strategy: "sequential" or "parallel"
            
        Returns:
            Orchestration result
        """
        async with httpx.AsyncClient() as client:
            payload = {
                "agents": agents,
                "input": input_data,
                "strategy": routing_strategy
            }
            
            response = await client.post(
                f"{self.base_url}/orchestrate",
                headers=self.headers,
                json=payload,
                timeout=120.0
            )
            response.raise_for_status()
            return response.json()
    
    async def test_connection(self) -> bool:
        """
        Test connection to Dedalus Labs API
        
        Returns:
            True if connection successful
        """
        try:
            async with httpx.AsyncClient() as client:
                # Test with a simple chat completion (OpenAI-compatible endpoint)
                test_payload = {
                    "model": "gpt-4",  # Dedalus will route to appropriate model
                    "messages": [{"role": "user", "content": "Hello"}],
                    "max_tokens": 10
                }
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self.headers,
                    json=test_payload,
                    timeout=10.0
                )
                response.raise_for_status()
                return True
        except Exception as e:
            print(f"Dedalus Labs connection test failed: {e}")
            return False
