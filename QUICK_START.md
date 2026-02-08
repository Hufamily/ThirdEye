# ThirdEye Quick Start Guide

## Unified Environment Setup ✅

ThirdEye uses a **single `.env` file at the project root** shared by both frontend and backend.

## Setup Steps

### 1. Create `.env` File

```bash
# From project root
cp .env.example .env
```

### 2. Fill in Credentials

Edit `.env` and provide:

- **Snowflake credentials** (after creating account - see `backend/SETUP.md`)
- **Google Client Secret** (from Google Cloud Console)
- **JWT Secret Key** (generate with: `cd backend && python scripts/generate_jwt_secret.py`)

### 3. Run Setup Script (Optional)

```bash
cd backend
python scripts/setup_credentials.py
```

This interactive script will help you fill in all values.

## Start Development

### Backend
```bash
cd backend
pip install -r requirements.txt
python -m app.main
```

Backend runs on: http://localhost:8000  
API docs: http://localhost:8000/docs

### Frontend
```bash
cd Devfest
npm install
npm run dev
```

Frontend runs on: http://localhost:5173

## Verify Setup

### Test Snowflake Connection
```bash
cd backend
python scripts/test_snowflake_connection.py
```

### Test Backend API
Visit http://localhost:8000/docs and try the `/health` endpoint.

## File Structure

```
ThirdEye/
├── .env                    # ← Your credentials (create from .env.example)
├── .env.example            # ← Template (already created)
├── Devfest/                # Frontend (reads VITE_* vars automatically)
└── backend/                # Backend (reads all vars automatically)
```

## Important Notes

- ✅ `.env` is already in `.gitignore` - never commit it!
- ✅ Frontend only sees `VITE_*` variables (others are server-side)
- ✅ Both projects automatically use the root `.env` file
- ✅ Shared values (like Google Client ID) are defined once

## Next Steps

1. Set up Snowflake account (see `backend/SETUP.md`)
2. Get Google Client Secret from Google Cloud Console
3. Fill in `.env` file
4. Test connections
5. Start coding! 🚀

## Need Help?

- **Snowflake Setup**: See `backend/SETUP.md`
- **Environment Variables**: See `UNIFIED_ENV_SETUP.md`
- **Backend API**: See `BACKEND_INTEGRATION_GUIDE.md`
