#!/usr/bin/env python3
"""
Run all database migrations
Executes SQL migration files in order
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from utils.database import engine, ensure_warehouse_resumed
from sqlalchemy import text
import asyncio

migrations_dir = backend_dir / "migrations"

# Migration files in order
migration_files = [
    "add_whitelisted_folders_table.sql",
    "add_agent_storage_tables.sql"
]


async def run_migration_file(file_path: Path):
    """Run a single migration file"""
    print(f"\n{'='*70}")
    print(f"Running migration: {file_path.name}")
    print('='*70)
    
    try:
        with open(file_path, 'r') as f:
            sql_content = f.read()
        
        # Split by semicolons and execute each statement
        statements = [s.strip() for s in sql_content.split(';') if s.strip() and not s.strip().startswith('--')]
        
        await ensure_warehouse_resumed()
        
        with engine.connect() as conn:
            for i, statement in enumerate(statements, 1):
                if statement:
                    try:
                        print(f"  Executing statement {i}/{len(statements)}...")
                        conn.execute(text(statement))
                        conn.commit()
                        print(f"  ✅ Statement {i} executed successfully")
                    except Exception as e:
                        # Check if it's a "already exists" error (which is OK)
                        error_str = str(e).lower()
                        if "already exists" in error_str or "duplicate" in error_str:
                            print(f"  ⚠️  Statement {i}: Already exists (skipping)")
                        else:
                            print(f"  ❌ Statement {i} failed: {e}")
                            raise
        
        print(f"\n✅ Migration {file_path.name} completed successfully")
        return True
        
    except Exception as e:
        print(f"\n❌ Migration {file_path.name} failed: {e}")
        return False


async def main():
    """Run all migrations"""
    print("="*70)
    print("DATABASE MIGRATION RUNNER")
    print("="*70)
    
    success_count = 0
    total_count = len(migration_files)
    
    for migration_file in migration_files:
        file_path = migrations_dir / migration_file
        
        if not file_path.exists():
            print(f"\n⚠️  Migration file not found: {file_path}")
            continue
        
        success = await run_migration_file(file_path)
        if success:
            success_count += 1
    
    print("\n" + "="*70)
    print("MIGRATION SUMMARY")
    print("="*70)
    print(f"Total migrations: {total_count}")
    print(f"Successful: {success_count}")
    print(f"Failed: {total_count - success_count}")
    
    if success_count == total_count:
        print("\n✅ All migrations completed successfully!")
        return 0
    else:
        print("\n⚠️  Some migrations failed - review errors above")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
