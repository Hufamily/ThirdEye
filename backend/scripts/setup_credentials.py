#!/usr/bin/env python3
"""
Interactive script to set up backend credentials
"""

import os
import secrets
from pathlib import Path

def generate_jwt_secret():
    """Generate a secure JWT secret key"""
    return secrets.token_urlsafe(32)

def create_env_file():
    """Create .env file from root .env.example with interactive prompts"""
    root_dir = Path(__file__).parent.parent.parent
    env_example = root_dir / ".env.example"
    env_file = root_dir / ".env"
    
    if env_file.exists():
        response = input(f"\n⚠️  .env file already exists at root. Overwrite? (y/N): ")
        if response.lower() != 'y':
            print("Cancelled. Existing .env file preserved.")
            return
        print("Backing up existing .env to .env.backup...")
        os.rename(env_file, root_dir / ".env.backup")
    
    # Read template
    with open(env_example, 'r') as f:
        content = f.read()
    
    print("\n" + "="*60)
    print("ThirdEye Backend Credentials Setup")
    print("="*60)
    print("\nPlease provide the following information:\n")
    
    # Snowflake
    print("📊 SNOWFLAKE CONFIGURATION")
    print("-" * 60)
    snowflake_account = input("Snowflake Account Identifier (e.g., xy12345.us-east-1): ").strip()
    snowflake_user = input("Snowflake Username: ").strip()
    snowflake_password = input("Snowflake Password: ").strip()
    print("✅ Using default warehouse: COMPUTE_WH")
    print("✅ Using default database: THIRDEYE_DEV")
    print("✅ Using default schema: PUBLIC\n")
    
    # JWT
    print("🔐 JWT AUTHENTICATION")
    print("-" * 60)
    generate_jwt = input("Generate new JWT secret key? (Y/n): ").strip().lower()
    if generate_jwt != 'n':
        jwt_secret = generate_jwt_secret()
        print(f"✅ Generated JWT secret: {jwt_secret[:20]}...")
    else:
        jwt_secret = input("Enter JWT secret key (min 32 chars): ").strip()
    print()
    
    # Google OAuth
    print("🔑 GOOGLE OAUTH")
    print("-" * 60)
    print(f"✅ Client ID already configured: 331266334090-nahb5m02sqd86tlh3fq1jjjur9msdk83.apps.googleusercontent.com")
    google_client_secret = input("Google Client Secret: ").strip()
    print()
    
    # Dedalus Labs
    print("🤖 DEDALUS LABS")
    print("-" * 60)
    print("✅ Dedalus API key already configured!")
    print()
    
    # K2-Think
    print("🧠 K2-THINK (Kimi K2)")
    print("-" * 60)
    print("✅ K2 API key already configured!")
    print()
    
    # Replace placeholders
    content = content.replace("SNOWFLAKE_ACCOUNT=your_account_identifier.us-east-1", f"SNOWFLAKE_ACCOUNT={snowflake_account}")
    content = content.replace("SNOWFLAKE_USER=your_username", f"SNOWFLAKE_USER={snowflake_user}")
    content = content.replace("SNOWFLAKE_PASSWORD=your_password", f"SNOWFLAKE_PASSWORD={snowflake_password}")
    content = content.replace("JWT_SECRET_KEY=your-secret-key-change-in-production-min-32-chars", f"JWT_SECRET_KEY={jwt_secret}")
    content = content.replace("GOOGLE_CLIENT_SECRET=your_google_client_secret", f"GOOGLE_CLIENT_SECRET={google_client_secret}")
    content = content.replace("DEDALUS_API_KEY=dsk-live-26efce6175d9-551d8047c7b33ce00f9b82035b23b658", "DEDALUS_API_KEY=dsk-live-26efce6175d9-551d8047c7b33ce00f9b82035b23b658")
    
    # Write .env file
    with open(env_file, 'w') as f:
        f.write(content)
    
    print("\n" + "="*60)
    print("✅ .env file created successfully at project root!")
    print("="*60)
    print(f"\nLocation: {env_file}")
    print("\nNext steps:")
    print("1. Review the .env file to ensure all values are correct")
    print("2. Run: cd backend && python scripts/test_snowflake_connection.py")
    print("3. Start the backend: cd backend && python -m app.main")
    print("4. Start the frontend: cd Devfest && npm run dev")
    print("\n⚠️  Remember: Never commit .env to git!")
    print("   This unified .env file is used by both frontend and backend.")

if __name__ == "__main__":
    try:
        create_env_file()
    except KeyboardInterrupt:
        print("\n\nSetup cancelled.")
    except Exception as e:
        print(f"\n❌ Error: {e}")
