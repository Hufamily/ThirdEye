#!/usr/bin/env python3
"""
Phase 0: Infrastructure Verification Script
Verifies all prerequisites before starting development
"""

import sys
import os
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from utils.database import engine, ensure_warehouse_resumed
from sqlalchemy import text
from dotenv import load_dotenv

# Load environment variables
root_dir = backend_dir.parent
env_path = root_dir / ".env"
load_dotenv(env_path)

def check_database_tables():
    """Verify all required tables exist in Snowflake"""
    print("\n🔍 Checking Database Tables...")
    
    required_tables = [
        'USERS', 'SESSIONS', 'NOTEBOOK_ENTRIES', 'DOCUMENTS', 
        'SUGGESTIONS', 'ORGANIZATIONS', 'INTERACTIONS', 
        'TRACKED_ASSETS', 'ORG_MEMBERSHIPS'
    ]
    
    try:
        ensure_warehouse_resumed()
        
        with engine.connect() as conn:
            # Check each table exists
            result = conn.execute(text("""
                SELECT TABLE_NAME 
                FROM THIRDEYE_DEV.INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = 'PUBLIC'
                ORDER BY TABLE_NAME
            """))
            
            existing_tables = [row[0] for row in result.fetchall()]
            missing_tables = [t for t in required_tables if t not in existing_tables]
            
            print(f"✅ Found {len(existing_tables)} tables in database")
            
            if missing_tables:
                print(f"❌ Missing tables: {', '.join(missing_tables)}")
                print("\n⚠️  ACTION REQUIRED: Run migration script:")
                print("   backend/migrations/add_missing_tables.sql")
                return False
            else:
                print("✅ All required tables exist!")
                for table in required_tables:
                    print(f"   ✓ {table}")
                return True
            
    except Exception as e:
        print(f"❌ Error checking tables: {e}")
        import traceback
        traceback.print_exc()
        return False

def check_backend_api():
    """Check if backend API can start"""
    print("\n🔍 Checking Backend API...")
    
    try:
        import uvicorn
        from app.main import app
        
        # Check if app loads without errors
        print("✅ Backend app imports successfully")
        print("✅ FastAPI app initialized")
        print("\n💡 To start backend: cd backend && python -m app.main")
        print("💡 API docs will be at: http://localhost:8000/docs")
        return True
    except Exception as e:
        print(f"❌ Error loading backend: {e}")
        return False

def check_snowflake_connection():
    """Test Snowflake connection"""
    print("\n🔍 Testing Snowflake Connection...")
    
    try:
        ensure_warehouse_resumed()
        
        with engine.connect() as conn:
            result = conn.execute(text("SELECT CURRENT_DATABASE(), CURRENT_SCHEMA(), CURRENT_WAREHOUSE()"))
            row = result.fetchone()
            
            print(f"✅ Connected to Snowflake")
            print(f"   Database: {row[0]}")
            print(f"   Schema: {row[1]}")
            print(f"   Warehouse: {row[2]}")
            
            return True
    except Exception as e:
        print(f"❌ Snowflake connection failed: {e}")
        print("\n⚠️  Check your .env file for SNOWFLAKE_* variables")
        import traceback
        traceback.print_exc()
        return False

def check_environment_variables():
    """Check required environment variables"""
    print("\n🔍 Checking Environment Variables...")
    
    required_vars = {
        'SNOWFLAKE_ACCOUNT': 'Snowflake account',
        'SNOWFLAKE_USER': 'Snowflake user',
        'SNOWFLAKE_PASSWORD': 'Snowflake password',
        'SNOWFLAKE_WAREHOUSE': 'Snowflake warehouse',
        'SNOWFLAKE_DATABASE': 'Snowflake database',
        'SNOWFLAKE_SCHEMA': 'Snowflake schema',
        'GOOGLE_CLIENT_SECRET': 'Google OAuth secret',
        'JWT_SECRET_KEY': 'JWT secret key',
    }
    
    missing = []
    for var, desc in required_vars.items():
        value = os.getenv(var)
        if not value:
            missing.append(f"  ❌ {var} ({desc})")
        else:
            # Mask sensitive values
            masked = value[:4] + "..." if len(value) > 4 else "***"
            print(f"  ✅ {var}: {masked}")
    
    if missing:
        print("\n⚠️  Missing environment variables:")
        for item in missing:
            print(item)
        print("\n💡 Check your .env file at project root")
        return False
    
    print("✅ All required environment variables set")
    return True

def check_frontend_build():
    """Check if frontend can build"""
    print("\n🔍 Checking Frontend...")
    
    frontend_dir = backend_dir.parent / "Devfest"
    
    if not frontend_dir.exists():
        print(f"❌ Frontend directory not found: {frontend_dir}")
        return False
    
    package_json = frontend_dir / "package.json"
    if not package_json.exists():
        print(f"❌ package.json not found in {frontend_dir}")
        return False
    
    print(f"✅ Frontend directory found: {frontend_dir}")
    print("💡 To build frontend: cd Devfest && npm install && npm run build")
    print("💡 To run dev server: cd Devfest && npm run dev")
    
    return True

def main():
    """Run all verification checks"""
    print("=" * 60)
    print("Phase 0: Infrastructure Verification")
    print("=" * 60)
    
    checks = [
        ("Environment Variables", check_environment_variables),
        ("Snowflake Connection", check_snowflake_connection),
        ("Database Tables", check_database_tables),
        ("Backend API", check_backend_api),
        ("Frontend", check_frontend_build),
    ]
    
    results = []
    for name, check_func in checks:
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n❌ Error in {name}: {e}")
            results.append((name, False))
    
    # Summary
    print("\n" + "=" * 60)
    print("VERIFICATION SUMMARY")
    print("=" * 60)
    
    all_passed = True
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
        if not result:
            all_passed = False
    
    print("=" * 60)
    
    if all_passed:
        print("\n🎉 ALL CHECKS PASSED!")
        print("✅ Ready to proceed to Phase 3: AI/ML Integration")
        return 0
    else:
        print("\n⚠️  SOME CHECKS FAILED")
        print("Please fix the issues above before proceeding")
        return 1

if __name__ == "__main__":
    sys.exit(main())
