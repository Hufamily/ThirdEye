#!/usr/bin/env python3
"""
Update Snowflake schema with missing tables
Run this script to add TRACKED_ASSETS and ORG_MEMBERSHIPS tables
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from utils.database import get_db, ensure_warehouse_resumed

def update_schema():
    """Add missing tables to Snowflake schema"""
    
    print("="*60)
    print("Snowflake Schema Update")
    print("="*60)
    print()
    
    db = next(get_db())
    
    try:
        ensure_warehouse_resumed()
        print("✓ Warehouse resumed")
        
        # Read update script
        update_script_path = Path(__file__).parent.parent / "migrations" / "update_schema.sql"
        
        if not update_script_path.exists():
            print(f"✗ Error: {update_script_path} not found")
            return False
        
        with open(update_script_path, 'r') as f:
            script_content = f.read()
        
        # Split script into individual statements (simple approach)
        # Remove comments and empty lines
        statements = []
        current_statement = []
        
        for line in script_content.split('\n'):
            line = line.strip()
            # Skip comments and empty lines
            if line.startswith('--') or not line:
                continue
            # Skip verification query at the end
            if line.startswith('SELECT') and 'TABLE_NAME' in line:
                continue
            
            current_statement.append(line)
            
            # If line ends with semicolon, it's the end of a statement
            if line.endswith(';'):
                statement = ' '.join(current_statement)
                if statement.strip():
                    statements.append(statement)
                current_statement = []
        
        # Execute each statement
        print(f"\nExecuting {len(statements)} SQL statements...\n")
        
        for i, statement in enumerate(statements, 1):
            try:
                print(f"[{i}/{len(statements)}] Executing: {statement[:80]}...")
                db.execute(text(statement))
                db.commit()
                print(f"  ✓ Success")
            except Exception as e:
                # Check if it's a "table already exists" error (which is OK)
                error_msg = str(e).lower()
                if 'already exists' in error_msg or 'object already exists' in error_msg:
                    print(f"  ⚠ Table already exists (skipping)")
                else:
                    print(f"  ✗ Error: {e}")
                    raise
        
        # Verify tables were created
        print("\n" + "="*60)
        print("Verifying tables...")
        print("="*60)
        
        result = db.execute(text("""
            SELECT TABLE_NAME 
            FROM THIRDEYE_DEV.INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = 'PUBLIC'
              AND TABLE_NAME IN ('TRACKED_ASSETS', 'ORG_MEMBERSHIPS')
            ORDER BY TABLE_NAME
        """))
        
        tables = [row[0] for row in result.fetchall()]
        
        required_tables = ['TRACKED_ASSETS', 'ORG_MEMBERSHIPS']
        
        print("\nRequired tables:")
        all_exist = True
        for table in required_tables:
            if table in tables:
                print(f"  ✓ {table} exists")
            else:
                print(f"  ✗ {table} MISSING")
                all_exist = False
        
        if all_exist:
            print("\n" + "="*60)
            print("✓ Schema update completed successfully!")
            print("="*60)
            return True
        else:
            print("\n" + "="*60)
            print("✗ Some tables are missing. Please check errors above.")
            print("="*60)
            return False
            
    except Exception as e:
        print(f"\n✗ Error updating schema: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


if __name__ == "__main__":
    success = update_schema()
    sys.exit(0 if success else 1)
