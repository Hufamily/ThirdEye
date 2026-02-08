#!/usr/bin/env python3
"""
Manual database operations test
Test inserting, querying, and deleting data from Snowflake
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from sqlalchemy import text

# Load environment variables from root directory
root_dir = Path(__file__).parent.parent.parent
env_path = root_dir / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    print("⚠️  Warning: .env file not found at root directory.")
    sys.exit(1)

from utils.database import engine, get_db
import uuid

def test_insert_user():
    """Test inserting a user"""
    print("\n" + "="*60)
    print("Test 1: Insert User")
    print("="*60)
    
    test_user_id = str(uuid.uuid4())
    test_data = {
        'user_id': test_user_id,
        'google_sub': f'test-sub-{test_user_id[:8]}',
        'email': 'test@example.com',
        'name': 'Test User',
        'account_type': 'personal'
    }
    
    try:
        with engine.connect() as conn:
            # Insert test user
            conn.execute(text("""
                INSERT INTO THIRDEYE_DEV.PUBLIC.USERS 
                (USER_ID, GOOGLE_SUB, EMAIL, NAME, ACCOUNT_TYPE) 
                VALUES (:user_id, :google_sub, :email, :name, :account_type)
            """), test_data)
            conn.commit()
            print(f"✅ Inserted user: {test_user_id}")
            return test_user_id
    except Exception as e:
        print(f"❌ Insert failed: {e}")
        return None

def test_query_user(user_id):
    """Test querying a user"""
    print("\n" + "="*60)
    print("Test 2: Query User")
    print("="*60)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT USER_ID, EMAIL, NAME, ACCOUNT_TYPE 
                FROM THIRDEYE_DEV.PUBLIC.USERS 
                WHERE USER_ID = :user_id
            """), {'user_id': user_id})
            row = result.fetchone()
            if row:
                print(f"✅ Found user:")
                print(f"   ID: {row[0]}")
                print(f"   Email: {row[1]}")
                print(f"   Name: {row[2]}")
                print(f"   Account Type: {row[3]}")
                return True
            else:
                print("❌ User not found")
                return False
    except Exception as e:
        print(f"❌ Query failed: {e}")
        return False

def test_list_all_users():
    """Test listing all users"""
    print("\n" + "="*60)
    print("Test 3: List All Users")
    print("="*60)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT USER_ID, EMAIL, NAME, ACCOUNT_TYPE 
                FROM THIRDEYE_DEV.PUBLIC.USERS 
                ORDER BY CREATED_AT DESC 
                LIMIT 10
            """))
            rows = result.fetchall()
            print(f"✅ Found {len(rows)} users:")
            for row in rows:
                print(f"   - {row[1]} ({row[0][:8]}...)")
            return True
    except Exception as e:
        print(f"❌ List failed: {e}")
        return False

def test_delete_user(user_id):
    """Test deleting a user"""
    print("\n" + "="*60)
    print("Test 4: Delete User")
    print("="*60)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                DELETE FROM THIRDEYE_DEV.PUBLIC.USERS 
                WHERE USER_ID = :user_id
            """), {'user_id': user_id})
            conn.commit()
            print(f"✅ Deleted user: {user_id}")
            return True
    except Exception as e:
        print(f"❌ Delete failed: {e}")
        return False

def test_table_counts():
    """Test counting records in all tables"""
    print("\n" + "="*60)
    print("Test 5: Table Record Counts")
    print("="*60)
    
    tables = ['USERS', 'ORGANIZATIONS', 'TRACKED_ASSETS', 'INTERACTION_LOGS', 
              'DOCUMENT_REVISIONS', 'SESSIONS', 'NOTEBOOK_ENTRIES', 'SUGGESTIONS']
    
    try:
        with engine.connect() as conn:
            for table in tables:
                result = conn.execute(text(f"""
                    SELECT COUNT(*) 
                    FROM THIRDEYE_DEV.PUBLIC.{table}
                """))
                count = result.fetchone()[0]
                print(f"   {table}: {count} records")
            return True
    except Exception as e:
        print(f"❌ Count failed: {e}")
        return False

if __name__ == "__main__":
    print("="*60)
    print("ThirdEye Database Operations Test")
    print("="*60)
    
    # Test 1: Insert
    user_id = test_insert_user()
    
    if user_id:
        # Test 2: Query
        test_query_user(user_id)
        
        # Test 3: List all
        test_list_all_users()
        
        # Test 4: Delete
        test_delete_user(user_id)
    
    # Test 5: Counts
    test_table_counts()
    
    print("\n" + "="*60)
    print("✅ All database operation tests completed!")
    print("="*60 + "\n")
