import express from "express";
import { createServer as createViteServer } from "vite";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import { OAuth2Client } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

let supabase: any;
try {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.error("Supabase environment variables are missing (SUPABASE_URL, SUPABASE_ANON_KEY)");
  }
} catch (e) {
  console.error("Failed to initialize Supabase client:", e);
}

const JWT_SECRET = process.env.JWT_SECRET || "tsmak-secret-key-123";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

async function createServer() {
  const app = express();
  app.use(express.json());

  // API routes go here
  app.get("/api/health", async (req, res) => {
    const status: any = {
      status: "ok",
      supabase: supabase ? "initialized" : "missing",
      env: process.env.NODE_ENV
    };
    
    if (supabase) {
      try {
        const { error } = await supabase.from("islamic_gpt_users").select("count", { count: 'exact', head: true });
        status.database = error ? `error: ${error.message}` : "connected";
      } catch (e: any) {
        status.database = `exception: ${e.message}`;
      }
    }
    
    res.json(status);
  });

  // Auth Routes
  app.get("/api/auth/google/url", (req, res) => {
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: "Google Client ID not configured" });
    }
    
    // Use the App URL provided in the runtime context or fallback to request origin
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
      redirect_uri: redirectUri
    });
    
    res.json({ url });
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      if (!supabase) {
        return res.status(500).send("Supabase is not configured. Please add SUPABASE_URL and SUPABASE_ANON_KEY to environment variables.");
      }
      const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
      const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
      
      const { tokens } = await client.getToken(code as string);
      client.setCredentials(tokens);

      const userInfoRes = await client.request({ url: 'https://www.googleapis.com/oauth2/v3/userinfo' });
      const userInfo = userInfoRes.data as any;

      // Find or create user
      const { data: user, error: findError } = await supabase
        .from("islamic_gpt_users")
        .select("*")
        .eq("email", userInfo.email)
        .single();
      
      let finalUser = user;

      if (!user) {
        const { data: newUser, error: insertError } = await supabase
          .from("islamic_gpt_users")
          .insert([{ email: userInfo.email, name: userInfo.name, password: 'google-oauth-user' }])
          .select()
          .single();
        
        if (insertError) throw insertError;
        finalUser = newUser;
      }

      if (!finalUser) {
        throw new Error("User creation failed during Google login.");
      }

      const token = jwt.sign({ userId: finalUser.id, email: finalUser.email, name: finalUser.name }, JWT_SECRET);

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  token: '${token}', 
                  user: ${JSON.stringify({ id: finalUser.id, email: finalUser.email, name: finalUser.name })} 
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Google OAuth Error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  app.post("/api/auth/signup", async (req, res) => {
    const { email, password, name } = req.body;
    try {
      if (!supabase) {
        return res.status(500).json({ error: "Supabase is not configured. Please add SUPABASE_URL and SUPABASE_ANON_KEY to environment variables." });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const { data: user, error } = await supabase
        .from("islamic_gpt_users")
        .insert([{ email, password: hashedPassword, name }])
        .select()
        .single();

      if (error) {
        if (error.code === "23505") { // UNIQUE constraint failed in Postgres
          return res.status(400).json({ error: "Email already exists" });
        }
        throw error;
      }

      if (!user) {
        throw new Error("User creation failed: No data returned from Supabase.");
      }

      const token = jwt.sign({ userId: user.id, email, name }, JWT_SECRET);
      res.json({ token, user: { id: user.id, email, name } });
    } catch (error: any) {
      console.error("Signup error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    try {
      if (!supabase) {
        return res.status(500).json({ error: "Supabase is not configured. Please add SUPABASE_URL and SUPABASE_ANON_KEY to environment variables." });
      }
      const { data: user, error } = await supabase
        .from("islamic_gpt_users")
        .select("*")
        .eq("email", email)
        .single();

      if (error || !user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign({ userId: user.id, email: user.email, name: user.name }, JWT_SECRET);
      res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Chat History
  app.get("/api/chats", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    
    try {
      if (!supabase) {
        return res.status(500).json({ error: "Supabase is not configured." });
      }
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const { data: chats, error } = await supabase
        .from("islamic_gpt_chats")
        .select("*")
        .eq("user_id", decoded.userId)
        .order("timestamp", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      res.json(chats);
    } catch (error) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  app.post("/api/chats", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    
    try {
      if (!supabase) {
        return res.status(500).json({ error: "Supabase is not configured." });
      }
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const { message, response } = req.body;
      const { error } = await supabase
        .from("islamic_gpt_chats")
        .insert([{ user_id: decoded.userId, message, response }]);
      
      if (error) throw error;
      res.json({ success: true });
    } catch (error) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  return app;
}

export const appPromise = createServer();

// For local development
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  appPromise.then(app => {
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
}

export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
