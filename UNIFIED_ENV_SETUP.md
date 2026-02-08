# Unified Environment Variables Setup

ThirdEye now uses a **single `.env` file at the project root** that is shared by both the frontend (Devfest) and backend.

## Quick Start

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

2. **Fill in your credentials** in the root `.env` file:
   - Snowflake credentials (after creating account)
   - Google Client Secret
   - JWT Secret Key (or generate one)

3. **That's it!** Both frontend and backend will automatically use this file.

## File Structure

```
ThirdEye/
├── .env                    # ← Unified env file (create this)
├── .env.example            # ← Template (already created)
├── Devfest/                # Frontend reads VITE_* vars automatically
└── backend/                # Backend reads all vars automatically
```

## How It Works

### Frontend (Vite)
- **Automatically** reads `VITE_*` prefixed variables from root `.env`
- No configuration needed - Vite handles this automatically
- Variables prefixed with `VITE_` are exposed to the browser

### Backend (FastAPI)
- **Configured** to read from root `.env` file
- All environment variables are available server-side
- Updated files:
  - `backend/app/main.py` - loads root `.env`
  - `backend/app/config.py` - points to root `.env`
  - `backend/utils/database.py` - loads root `.env`

## Environment Variables

### Shared Variables (Must Match)
- `VITE_API_URL` / `API_BASE_URL` - API endpoint URL
- `VITE_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_ID` - Google OAuth Client ID

### Backend Only
- `SNOWFLAKE_*` - Database credentials
- `JWT_SECRET_KEY` - Authentication secret
- `DEDALUS_API_KEY` - AI orchestration
- `K2_*` - Reasoning model config

### Frontend Only
- `VITE_*` prefixed variables are exposed to browser
- `DEFAULT_K2_*` - Frontend K2 config (if needed)

## Setup Scripts

### Interactive Setup
```bash
cd backend
python scripts/setup_credentials.py
```
This will create the root `.env` file interactively.

### Generate JWT Secret
```bash
cd backend
python scripts/generate_jwt_secret.py
```

### Test Snowflake Connection
```bash
cd backend
python scripts/test_snowflake_connection.py
```

## Migration from Separate Files

If you had separate `.env` files before:

1. **Backup old files** (optional):
   ```bash
   mv Devfest/.env Devfest/.env.backup
   mv backend/.env backend/.env.backup
   ```

2. **Create unified `.env`** at root:
   ```bash
   cp .env.example .env
   ```

3. **Copy values** from old files to root `.env`

4. **Delete old files** (they're no longer needed)

## Benefits

✅ **Single source of truth** - All credentials in one place  
✅ **Easier management** - Update once, both projects use it  
✅ **No duplication** - Shared values (like Google Client ID) defined once  
✅ **Simpler setup** - One file to configure  

## Security Notes

- ✅ Root `.env` is already in `.gitignore`
- ✅ Never commit `.env` to git
- ✅ Use different credentials for production
- ✅ Frontend only sees `VITE_*` variables (others are server-side only)
