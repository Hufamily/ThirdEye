#!/usr/bin/env python3
"""
Test Snowflake database connection
"""

import sys
import os
from pathlib import Path

# Get script directory and project root
script_dir = Path(__file__).parent.resolve()  # backend/scripts
backend_dir = script_dir.parent.resolve()      # backend
root_dir = backend_dir.parent.resolve()        # ThirdEye root

# Add backend directory to path for imports
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
from sqlalchemy import text

# Load environment variables from root directory
env_path = root_dir / ".env"
if env_path.exists():
    load_dotenv(env_path)
    print(f"✅ Loaded .env from: {env_path}")
else:
    print("⚠️  Warning: .env file not found at root directory.")
    print(f"   Expected location: {env_path}")
    print("   Make sure you've created it from .env.example at the project root")
    sys.exit(1)

try:
    from utils.database import engine
    
    print("=" * 60)
    print("Testing Snowflake Connection")
    print("=" * 60)
    print(f"\n📊 Configuration:")
    print(f"   Account: {os.getenv('SNOWFLAKE_ACCOUNT', 'NOT SET')}")
    print(f"   User: {os.getenv('SNOWFLAKE_USER', 'NOT SET')}")
    print(f"   Database: {os.getenv('SNOWFLAKE_DATABASE', 'NOT SET')}")
    print(f"   Warehouse: {os.getenv('SNOWFLAKE_WAREHOUSE', 'NOT SET')}")
    print(f"   Schema: {os.getenv('SNOWFLAKE_SCHEMA', 'NOT SET')}\n")
    
    with engine.connect() as conn:
        # Test basic query
        result = conn.execute(text('SELECT CURRENT_VERSION()'))
        version = result.fetchone()[0]
        print(f"✅ Snowflake connected successfully!")
        print(f"   Version: {version}\n")
        
        # Test database access
        result = conn.execute(text('SELECT CURRENT_DATABASE()'))
        database = result.fetchone()[0]
        print(f"✅ Database access OK")
        print(f"   Current database: {database}\n")
        
        # Test warehouse
        result = conn.execute(text('SELECT CURRENT_WAREHOUSE()'))
        warehouse = result.fetchone()[0]
        print(f"✅ Warehouse access OK")
        print(f"   Current warehouse: {warehouse}\n")
        
        # Test schema
        result = conn.execute(text('SELECT CURRENT_SCHEMA()'))
        schema = result.fetchone()[0]
        print(f"✅ Schema access OK")
        print(f"   Current schema: {schema}\n")
        
        print("🎉 All connection tests passed!")
        
except Exception as e:
    print(f"❌ Connection failed: {e}")
    import traceback
    print("\nFull traceback:")
    traceback.print_exc()
    print("\nTroubleshooting:")
    print("1. Check your .env file has correct Snowflake credentials")
    print("2. Verify your Snowflake account identifier includes region")
    print("3. Make sure warehouses and databases exist in Snowflake")
    print("4. Check your user has proper permissions")
    sys.exit(1)
