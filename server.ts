import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

let supabase: any;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase client initialized successfully");
  } catch (e) {
    console.error("Supabase init error:", e);
  }
} else {
  console.warn("Supabase credentials missing in environment variables");
}

const JWT_SECRET = process.env.JWT_SECRET || "tsmak-secret-key-123";

const app = express();
app.use(express.json());

// API routes
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    supabase: supabase ? "initialized" : "missing",
    env: process.env.NODE_ENV,
    vercel: !!process.env.VERCEL,
    timestamp: new Date().toISOString()
  });
});

app.post("/api/auth/signup", async (req, res) => {
  const { email, password, name } = req.body;
  try {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const { data: user, error } = await supabase.from("islamic_gpt_users").insert([{ email, password: hashedPassword, name }]).select().single();
    if (error) {
      console.error("Signup DB Error:", error);
      return res.status(400).json({ error: error.code === "23505" ? "Email already exists" : error.message });
    }
    const token = jwt.sign({ userId: user.id, email, name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email, name } });
  } catch (error: any) {
    console.error("Signup internal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
    const { data: user, error } = await supabase.from("islamic_gpt_users").select("*").eq("email", email).single();
    
    if (error || !user) {
      console.warn("Login failed: User not found or DB error", error);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      console.warn("Login failed: Invalid password for", email);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    const token = jwt.sign({ userId: user.id, email: user.email, name: user.name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error: any) {
    console.error("Login internal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/chats", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  try {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { data: chats, error } = await supabase.from("islamic_gpt_chats").select("*").eq("user_id", decoded.userId).order("timestamp", { ascending: false }).limit(50);
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
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { message, response } = req.body;
    const { error } = await supabase.from("islamic_gpt_chats").insert([{ user_id: decoded.userId, message, response }]);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default app;
