# Google OAuth Setup Guide

This application uses **Google Identity Services** (OAuth 2.0) via `@react-oauth/google` - the modern, recommended approach for Google authentication.

## Setup Steps

### 1. Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. If prompted, configure the **OAuth consent screen**:
   - Choose **External** (unless you have a Google Workspace)
   - Fill in required fields:
     - App name: "Third Eye" (or your app name)
     - User support email: Your email
     - Developer contact: Your email
   - Add scopes (at minimum):
     - `openid`
     - `email`
     - `profile`
   - Add test users if your app is in testing mode

### 2. Configure OAuth Client

1. Application type: **Web application**
2. Name: "Third Eye Web Client" (or your choice)
3. **Authorized JavaScript origins**:
   - `http://localhost:5173` (Vite dev server)
   - `http://localhost:3000` (if using different port)
   - Your production domain (e.g., `https://yourdomain.com`)
4. **Authorized redirect URIs**:
   - `http://localhost:5173` (for local development)
   - Your production domain

### 3. Get Your Client ID

After creating the OAuth client, copy the **Client ID** (not the Client Secret - you don't need it for this implementation).

### 4. Configure Environment Variables

Create a `.env` file in the project root:

```env
VITE_API_URL=http://localhost:8000/api
VITE_GOOGLE_CLIENT_ID=your_client_id_here
```

Replace `your_client_id_here` with the Client ID from step 3.

### 5. Restart Development Server

After adding the environment variable, restart your Vite dev server:

```bash
npm run dev
```

## Important Notes

- **No API needs to be enabled** - Google Identity Services is built-in and doesn't require enabling any specific API
- The `@react-oauth/google` package uses the modern **Google Identity Services SDK**
- This implementation uses **OAuth 2.0** with JWT tokens (ID tokens)
- The Client Secret is **not needed** for client-side OAuth flows

## Troubleshooting

### "Error 400: redirect_uri_mismatch"
- Make sure your current URL (including port) is added to Authorized JavaScript origins
- Check that there are no trailing slashes in the origins list

### "Error 403: access_denied"
- Check your OAuth consent screen configuration
- Ensure test users are added if your app is in testing mode
- Verify scopes are properly configured

### Token not decoding properly
- Ensure the Client ID is correctly set in `.env`
- Check browser console for detailed error messages

## Security Notes

- Never commit your `.env` file with real credentials
- The Client ID is safe to expose in frontend code (it's public)
- For production, always verify tokens on your backend server
- Consider implementing token refresh for long-lived sessions
