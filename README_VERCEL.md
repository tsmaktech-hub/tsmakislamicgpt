# Deployment Instructions for Vercel

To fix the "white blank page" and ensure your full-stack app works on Vercel, please follow these steps:

## 1. Environment Variables
Ensure you have added the following environment variables in your Vercel Dashboard:
- `GEMINI_API_KEY`: Your Google Gemini API Key.
- `JWT_SECRET`: A random string for securing your tokens.

**IMPORTANT**: After adding these variables, you **MUST** trigger a new deployment (Redeploy) for the changes to take effect in the browser code.

## 2. Why the "API key must be set" error happened?
This error occurs because the Gemini API is being called from the frontend. In Vite, environment variables are injected at **build time**. 
If the `GEMINI_API_KEY` was not set in Vercel **before** you deployed, the build process injected an empty string, causing the crash.

## 3. Database Warning
This project uses **SQLite** (`better-sqlite3`), which is a file-based database. 
**Vercel is serverless and stateless**, meaning:
- The database file will be reset every time the server restarts (cold start).
- Data will not persist across different users or sessions reliably.
- **Recommendation**: For production, please switch to a hosted database like **Supabase (PostgreSQL)**, **MongoDB Atlas**, or **Neon**.

## 4. Why the "Blank Page" happened?
The blank page was caused by two critical runtime errors:
- **`process is not defined`**: Vite doesn't define `process` in the browser. I added a polyfill in `index.html` and `vite.config.ts`.
- **`Cannot read properties of undefined (reading '0')`**: The app was trying to access the first letter of the user's name (`user?.name[0]`) before the user was logged in. I added a safety check for this.
