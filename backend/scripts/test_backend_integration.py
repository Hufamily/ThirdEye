#!/usr/bin/env python3
"""
Comprehensive Backend Integration Test
Tests all backend components, database connections, and integrations
"""

import sys
import asyncio
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from utils.database import engine, ensure_warehouse_resumed
from sqlalchemy import text
from services.whitelist_service import WhitelistService
from services.agent_orchestrator import AgentOrchestrator
from services.dedalus_client import DedalusClient
from services.gemini_client import GeminiClient
from services.k2think_client import K2ThinkClient
from services.vision_client import VisionClient
from services.google_drive_client import GoogleDriveClient
from agents.persona_architect import PersonaArchitect
from agents.traffic_controller import TrafficController
from agents.capture_scrape import CaptureScrape
from agents.target_interpreter import TargetInterpreter
from agents.gap_hypothesis import GapHypothesis
from agents.explanation_composer import ExplanationComposer
from agents.memory_vault import MemoryVault
from agents.document_surgeon import DocumentSurgeon
import json
from datetime import datetime


class BackendIntegrationTest:
    """Comprehensive backend integration test suite"""
    
    def __init__(self):
        self.results = {
            "database": {},
            "services": {},
            "agents": {},
            "routes": {},
            "overall": {"passed": 0, "failed": 0, "errors": []}
        }
    
    async def test_database_connection(self):
        """Test database connection and basic queries"""
        print("\n" + "="*70)
        print("TESTING DATABASE CONNECTION")
        print("="*70)
        
        try:
            await ensure_warehouse_resumed()
            
            # Test basic connection
            with engine.connect() as conn:
                result = conn.execute(text("SELECT CURRENT_DATABASE(), CURRENT_SCHEMA()"))
                row = result.fetchone()
                print(f"✅ Database: {row[0]}, Schema: {row[1]}")
                self.results["database"]["connection"] = True
                
                # Test table existence
                tables_to_check = [
                    "USERS", "SESSIONS", "DOCUMENTS", "INTERACTIONS",
                    "TRACKED_ASSETS", "ORG_MEMBERSHIPS", "ORGANIZATIONS",
                    "WHITELISTED_FOLDERS", "PERSONA_CARDS", "GAP_HYPOTHESES",
                    "EXPLANATIONS", "DOCUMENT_SUGGESTIONS", "AGENT_EXECUTIONS"
                ]
                
                existing_tables = []
                missing_tables = []
                
                for table in tables_to_check:
                    try:
                        check_query = text(f"""
                            SELECT COUNT(*) 
                            FROM INFORMATION_SCHEMA.TABLES 
                            WHERE TABLE_SCHEMA = 'PUBLIC' 
                            AND TABLE_NAME = '{table}'
                        """)
                        result = conn.execute(check_query)
                        count = result.fetchone()[0]
                        if count > 0:
                            existing_tables.append(table)
                            print(f"  ✅ Table exists: {table}")
                        else:
                            missing_tables.append(table)
                            print(f"  ⚠️  Table missing: {table}")
                    except Exception as e:
                        missing_tables.append(table)
                        print(f"  ❌ Error checking {table}: {e}")
                
                self.results["database"]["tables"] = {
                    "existing": existing_tables,
                    "missing": missing_tables
                }
                
                if missing_tables:
                    print(f"\n⚠️  Missing tables: {', '.join(missing_tables)}")
                    print("   Run migrations to create missing tables")
                else:
                    print("\n✅ All required tables exist")
                
        except Exception as e:
            print(f"❌ Database connection failed: {e}")
            self.results["database"]["connection"] = False
            self.results["overall"]["errors"].append(f"Database: {str(e)}")
            return False
        
        return True
    
    async def test_services(self):
        """Test all service initializations"""
        print("\n" + "="*70)
        print("TESTING SERVICES")
        print("="*70)
        
        services = {
            "WhitelistService": WhitelistService,
            "AgentOrchestrator": AgentOrchestrator,
            "DedalusClient": DedalusClient,
            "GeminiClient": GeminiClient,
            "K2ThinkClient": K2ThinkClient,
            "VisionClient": VisionClient,
        }
        
        for name, service_class in services.items():
            try:
                instance = service_class()
                print(f"✅ {name}: Initialized successfully")
                self.results["services"][name] = True
                
                # Test connection for clients that have it
                if hasattr(instance, 'test_connection'):
                    try:
                        is_connected = await instance.test_connection()
                        if is_connected:
                            print(f"  ✅ {name}: Connection test passed")
                        else:
                            print(f"  ⚠️  {name}: Connection test failed (may be expected)")
                    except Exception as e:
                        print(f"  ⚠️  {name}: Connection test error: {e}")
                
            except Exception as e:
                print(f"❌ {name}: Initialization failed: {e}")
                self.results["services"][name] = False
                self.results["overall"]["errors"].append(f"{name}: {str(e)}")
        
        return all(self.results["services"].values())
    
    async def test_agents(self):
        """Test all agent initializations"""
        print("\n" + "="*70)
        print("TESTING AGENTS")
        print("="*70)
        
        agents = {
            "PersonaArchitect": PersonaArchitect,
            "TrafficController": TrafficController,
            "CaptureScrape": CaptureScrape,
            "TargetInterpreter": TargetInterpreter,
            "GapHypothesis": GapHypothesis,
            "ExplanationComposer": ExplanationComposer,
            "MemoryVault": MemoryVault,
            "DocumentSurgeon": DocumentSurgeon,
        }
        
        for name, agent_class in agents.items():
            try:
                instance = agent_class()
                print(f"✅ {name}: Initialized successfully")
                print(f"   ID: {instance.agent_id}, Name: {instance.agent_name}")
                self.results["agents"][name] = True
            except Exception as e:
                print(f"❌ {name}: Initialization failed: {e}")
                self.results["agents"][name] = False
                self.results["overall"]["errors"].append(f"{name}: {str(e)}")
        
        return all(self.results["agents"].values())
    
    async def test_whitelist_service(self):
        """Test WhitelistService functionality"""
        print("\n" + "="*70)
        print("TESTING WHITELIST SERVICE")
        print("="*70)
        
        try:
            service = WhitelistService()
            
            # Test getting folders (should work even if empty)
            test_org_id = "test-org-123"
            folders = await service.get_whitelisted_folders(test_org_id)
            print(f"✅ get_whitelisted_folders: {len(folders)} folders")
            
            # Test document whitelist check (should return False for non-existent doc)
            is_whitelisted = await service.is_document_whitelisted(
                doc_id="test-doc-123",
                org_id=test_org_id
            )
            print(f"✅ is_document_whitelisted: {is_whitelisted} (expected: False)")
            
            self.results["services"]["WhitelistService_functionality"] = True
            return True
            
        except Exception as e:
            print(f"❌ WhitelistService test failed: {e}")
            self.results["services"]["WhitelistService_functionality"] = False
            self.results["overall"]["errors"].append(f"WhitelistService: {str(e)}")
            return False
    
    async def test_agent_orchestrator(self):
        """Test AgentOrchestrator initialization"""
        print("\n" + "="*70)
        print("TESTING AGENT ORCHESTRATOR")
        print("="*70)
        
        try:
            orchestrator = AgentOrchestrator()
            print("✅ AgentOrchestrator initialized")
            
            # Check if Dedalus client is available
            if orchestrator.dedalus:
                print("  ✅ Dedalus client available")
            else:
                print("  ⚠️  Dedalus client not available (will use direct calls)")
            
            self.results["services"]["AgentOrchestrator_functionality"] = True
            return True
            
        except Exception as e:
            print(f"❌ AgentOrchestrator test failed: {e}")
            self.results["services"]["AgentOrchestrator_functionality"] = False
            self.results["overall"]["errors"].append(f"AgentOrchestrator: {str(e)}")
            return False
    
    async def test_agent_storage(self):
        """Test agent storage methods"""
        print("\n" + "="*70)
        print("TESTING AGENT STORAGE METHODS")
        print("="*70)
        
        # Test that agents have storage methods
        agents_with_storage = {
            "PersonaArchitect": ("_save_persona_card", PersonaArchitect),
            "CaptureScrape": ("_store_capture_result", CaptureScrape),
            "GapHypothesis": ("_store_hypotheses", GapHypothesis),
            "ExplanationComposer": ("_store_explanation", ExplanationComposer),
            "DocumentSurgeon": ("_store_suggestions", DocumentSurgeon),
        }
        
        all_have_storage = True
        for agent_name, (method_name, agent_class) in agents_with_storage.items():
            try:
                instance = agent_class()
                if hasattr(instance, method_name):
                    print(f"✅ {agent_name}: Has {method_name}")
                else:
                    print(f"❌ {agent_name}: Missing {method_name}")
                    all_have_storage = False
            except Exception as e:
                print(f"❌ {agent_name}: Error checking storage method: {e}")
                all_have_storage = False
        
        self.results["agents"]["storage_methods"] = all_have_storage
        return all_have_storage
    
    async def test_imports(self):
        """Test that all imports work correctly"""
        print("\n" + "="*70)
        print("TESTING IMPORTS")
        print("="*70)
        
        imports_to_test = [
            ("routes.agents", "router"),
            ("routes.enterprise", "router"),
            ("routes.auth", "router"),
            ("services.whitelist_service", "WhitelistService"),
            ("services.agent_orchestrator", "AgentOrchestrator"),
        ]
        
        all_imports_ok = True
        for module_path, attr_name in imports_to_test:
            try:
                module = __import__(module_path, fromlist=[attr_name])
                attr = getattr(module, attr_name)
                print(f"✅ {module_path}.{attr_name}")
            except Exception as e:
                print(f"❌ {module_path}.{attr_name}: {e}")
                all_imports_ok = False
                self.results["overall"]["errors"].append(f"Import {module_path}.{attr_name}: {str(e)}")
        
        return all_imports_ok
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*70)
        print("TEST SUMMARY")
        print("="*70)
        
        total_tests = 0
        passed_tests = 0
        
        # Count database tests
        if self.results["database"].get("connection"):
            passed_tests += 1
        total_tests += 1
        
        # Count service tests
        for service, result in self.results["services"].items():
            total_tests += 1
            if result:
                passed_tests += 1
        
        # Count agent tests
        for agent, result in self.results["agents"].items():
            total_tests += 1
            if result:
                passed_tests += 1
        
        print(f"\nTotal Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {total_tests - passed_tests}")
        
        if self.results["overall"]["errors"]:
            print(f"\nErrors Found: {len(self.results['overall']['errors'])}")
            for error in self.results["overall"]["errors"][:10]:  # Show first 10
                print(f"  • {error}")
        
        # Save results
        results_file = backend_dir / "scripts" / "integration_test_results.json"
        with open(results_file, "w") as f:
            json.dump(self.results, f, indent=2, default=str)
        
        print(f"\n📄 Detailed results saved to: {results_file}")
        
        return passed_tests == total_tests


async def main():
    """Run all integration tests"""
    print("="*70)
    print("BACKEND INTEGRATION TEST SUITE")
    print("="*70)
    print(f"Started at: {datetime.now().isoformat()}")
    
    tester = BackendIntegrationTest()
    
    # Run tests
    await tester.test_imports()
    await tester.test_database_connection()
    await tester.test_services()
    await tester.test_agents()
    await tester.test_whitelist_service()
    await tester.test_agent_orchestrator()
    await tester.test_agent_storage()
    
    # Print summary
    all_passed = tester.print_summary()
    
    print("\n" + "="*70)
    if all_passed:
        print("✅ ALL TESTS PASSED")
    else:
        print("⚠️  SOME TESTS FAILED - Review errors above")
    print("="*70)
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
