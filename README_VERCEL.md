# Deployment Instructions for Vercel

To fix the "white blank page" and ensure your full-stack app works on Vercel, please follow these steps:

## 1. Environment Variables
**CRITICAL**: You MUST add the following environment variables in your Vercel Dashboard for the app to work. Without these, the server will crash or return errors.

- `GEMINI_API_KEY`: Your Google Gemini API Key.
- `JWT_SECRET`: A random string for securing your tokens.
- `GOOGLE_CLIENT_ID`: Your Google OAuth Client ID.
- `GOOGLE_CLIENT_SECRET`: Your Google OAuth Client Secret.
- `SUPABASE_URL`: Your Supabase Project URL.
- `SUPABASE_ANON_KEY`: Your Supabase Anon Key.

**IMPORTANT**: After adding these variables, you **MUST** trigger a new deployment (Redeploy) for the changes to take effect in the browser code.

## 2. Google OAuth Setup
To enable "Continue with Google":
1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create a new "OAuth 2.0 Client ID" for a "Web application".
3. Add the following to **Authorized redirect URIs**:
   - `https://ais-pre-wtznyd3jspu772uths7pac-270958265231.europe-west2.run.app/api/auth/google/callback`
   - `https://ais-dev-wtznyd3jspu772uths7pac-270958265231.europe-west2.run.app/api/auth/google/callback`
4. Copy the Client ID and Client Secret to your Vercel environment variables.

## 3. Supabase Setup
Since SQLite does not persist on Vercel, this project now uses **Supabase** (PostgreSQL).
1. Create a project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** and run the following script to create the tables:
   ```sql
   CREATE TABLE islamic_gpt_users (
     id SERIAL PRIMARY KEY,
     email TEXT UNIQUE NOT NULL,
     password TEXT NOT NULL,
     name TEXT,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   );

   CREATE TABLE islamic_gpt_chats (
     id SERIAL PRIMARY KEY,
     user_id INTEGER REFERENCES islamic_gpt_users(id) ON DELETE CASCADE,
     message TEXT NOT NULL,
     response TEXT NOT NULL,
     timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   );
   ```
3. Go to **Project Settings** > **API** and copy the **Project URL** and **anon public** key.
4. Add them as `SUPABASE_URL` and `SUPABASE_ANON_KEY` in your Vercel Environment Variables.

## 2. Why the "API key must be set" error happened?
This error occurs because the Gemini API is being called from the frontend. In Vite, environment variables are injected at **build time**. 
If the `GEMINI_API_KEY` was not set in Vercel **before** you deployed, the build process injected an empty string, causing the crash.

## 4. Why the "Blank Page" happened?
The blank page was caused by two critical runtime errors:
- **`process is not defined`**: Vite doesn't define `process` in the browser. I added a polyfill in `index.html` and `vite.config.ts`.
- **`Cannot read properties of undefined (reading '0')`**: The app was trying to access the first letter of the user's name (`user?.name[0]`) before the user was logged in. I added a safety check for this.
