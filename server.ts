import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// On Vercel, the filesystem is read-only except for /tmp
// Note: Data in /tmp is ephemeral and will be lost between requests/restarts
const dbPath = process.env.VERCEL === "1" 
  ? path.join("/tmp", "islamic_gpt.db") 
  : path.join(process.cwd(), "islamic_gpt.db");

const db = new Database(dbPath);
const JWT_SECRET = process.env.JWT_SECRET || "tsmak-secret-key-123";

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT
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

const app = express();
app.use(express.json());

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

app.post("/api/chats/clear", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Password is required" });

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(decoded.userId) as any;
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid password" });
    }

    db.prepare("DELETE FROM chats WHERE user_id = ?").run(decoded.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(401).json({ error: "Invalid token or verification failed" });
  }
});

app.post("/api/chats/clear", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Password is required" });

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(decoded.userId) as any;
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid password" });
    }

    db.prepare("DELETE FROM chats WHERE user_id = ?").run(decoded.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(401).json({ error: "Invalid token or verification failed" });
  }
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else if (process.env.VERCEL !== "1") {
  // Only serve static files if NOT on Vercel (Vercel handles this automatically)
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

const PORT = 3000;
if (process.env.NODE_ENV !== "production" || process.env.VERCEL !== "1") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
