import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Initialize Supabase lazily to avoid crashing on startup if env vars are missing
const getSupabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error("Missing Supabase environment variables (SUPABASE_URL, SUPABASE_ANON_KEY)");
  }
  
  return createClient(url, key);
};

const JWT_SECRET = process.env.JWT_SECRET || "tsmak-secret-key-123";

const app = express();
app.use(express.json());

// Health check
app.get("/api/health", async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("islamic_gpt_users").select("count", { count: 'exact', head: true });
    
    res.json({
      status: "ok",
      database: error ? `error: ${error.message}` : "connected",
      vercel: !!process.env.VERCEL,
      env: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      message: error.message,
      vercel: !!process.env.VERCEL,
      hint: "Check your Vercel Environment Variables"
    });
  }
});

// Simple test route
app.get("/api/test", (req, res) => {
  res.send("API is reachable");
});

app.post("/api/auth/signup", async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const supabase = getSupabase();
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const { data: user, error } = await supabase
      .from("islamic_gpt_users")
      .insert([{ email, password: hashedPassword, name }])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ 
        error: error.code === "23505" ? "Email already exists" : error.message 
      });
    }

    const token = jwt.sign({ userId: user.id, email, name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email, name } });
  } catch (error: any) {
    console.error("Signup error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const supabase = getSupabase();
    const { data: user, error } = await supabase
      .from("islamic_gpt_users")
      .select("*")
      .eq("email", email)
      .single();
    
    if (error || !user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    const token = jwt.sign({ userId: user.id, email: user.email, name: user.name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

app.get("/api/chats", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  
  try {
    const supabase = getSupabase();
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
  } catch (error: any) {
    res.status(401).json({ error: error.message || "Invalid token" });
  }
});

app.post("/api/chats", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  
  try {
    const supabase = getSupabase();
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { message, response } = req.body;
    
    const { error } = await supabase
      .from("islamic_gpt_chats")
      .insert([{ user_id: decoded.userId, message, response }]);
      
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(401).json({ error: error.message || "Invalid token" });
  }
});

export default app;
