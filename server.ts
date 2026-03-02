import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use /tmp for SQLite on Vercel as it's the only writable directory
const dbPath = process.env.VERCEL ? path.join("/tmp", "islamic_gpt.db") : "islamic_gpt.db";
let db: any;

try {
  db = new Database(dbPath);
} catch (err) {
  console.error("Database initialization failed. Using mock database for Vercel demo.", err);
  // Mock database for Vercel demo if native better-sqlite3 fails
  db = {
    exec: () => {},
    prepare: () => ({
      get: () => null,
      all: () => [],
      run: () => ({ lastInsertRowid: 1 })
    })
  };
}
const JWT_SECRET = process.env.JWT_SECRET || "tsmak-secret-key-123";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    google_id TEXT UNIQUE
  );
  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    message TEXT,
    response TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

async function createServer() {
  const app = express();
  app.use(express.json());

  // Google OAuth Routes
  app.get("/api/auth/google/url", (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ 
        error: "Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the Secrets panel." 
      });
    }
    const redirectUri = `${process.env.APP_URL}/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
    });
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.json({ url });
  });

  app.get("/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      const redirectUri = `${process.env.APP_URL}/auth/google/callback`;
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code as string,
          client_id: GOOGLE_CLIENT_ID!,
          client_secret: GOOGLE_CLIENT_SECRET!,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokens = await tokenRes.json();
      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const googleUser = await userRes.json();

      // Find or create user
      let user = db.prepare("SELECT * FROM users WHERE google_id = ? OR email = ?").get(googleUser.sub, googleUser.email) as any;

      if (!user) {
        const stmt = db.prepare("INSERT INTO users (email, name, google_id) VALUES (?, ?, ?)");
        const result = stmt.run(googleUser.email, googleUser.name, googleUser.sub);
        user = { id: result.lastInsertRowid, email: googleUser.email, name: googleUser.name };
      } else if (!user.google_id) {
        db.prepare("UPDATE users SET google_id = ? WHERE id = ?").run(googleUser.sub, user.id);
      }

      const token = jwt.sign({ userId: user.id, email: user.email, name: user.name }, JWT_SECRET);

      res.send(`
        <html>
          <body>
            <script>
              window.opener.postMessage({ 
                type: 'OAUTH_AUTH_SUCCESS', 
                token: '${token}',
                user: ${JSON.stringify({ id: user.id, email: user.email, name: user.name })}
              }, '*');
              window.close();
            </script>
            <p>Authentication successful. Closing window...</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Google OAuth error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  // Auth Routes
  app.post("/api/auth/signup", async (req, res) => {
    const { email, password, name } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const stmt = db.prepare("INSERT INTO users (email, password, name) VALUES (?, ?, ?)");
      const result = stmt.run(email, hashedPassword, name);
      const token = jwt.sign({ userId: result.lastInsertRowid, email, name }, JWT_SECRET);
      res.json({ token, user: { id: result.lastInsertRowid, email, name } });
    } catch (error: any) {
      if (error.message.includes("UNIQUE constraint failed")) {
        res.status(400).json({ error: "Email already exists" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const token = jwt.sign({ userId: user.id, email: user.email, name: user.name }, JWT_SECRET);
      res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Chat History
  app.get("/api/chats", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    
    try {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const chats = db.prepare("SELECT * FROM chats WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50").all(decoded.userId);
      res.json(chats);
    } catch (error) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  app.post("/api/chats", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    
    try {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const { message, response } = req.body;
      const stmt = db.prepare("INSERT INTO chats (user_id, message, response) VALUES (?, ?, ?)");
      stmt.run(decoded.userId, message, response);
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
  } else if (!process.env.VERCEL) {
    // Serve static files in production ONLY if not on Vercel
    // Vercel handles static serving via vercel.json rewrites
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) return res.status(404).end();
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  return app;
}

const appPromise = createServer();

// For local development
if (process.env.NODE_ENV !== "production") {
  appPromise.then(app => {
    app.listen(3000, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:3000`);
    });
  });
}

// Export for Vercel
export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
