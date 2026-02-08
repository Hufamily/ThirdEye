#!/usr/bin/env python3
"""
Generate a secure JWT secret key for the backend
"""

import secrets

if __name__ == "__main__":
    secret = secrets.token_urlsafe(32)
    print(f"\nGenerated JWT Secret Key:")
    print(f"{secret}\n")
    print("Add this to your .env file as JWT_SECRET_KEY")
