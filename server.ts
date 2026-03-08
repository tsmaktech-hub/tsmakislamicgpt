import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

let supabase: any;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.error("Supabase init error:", e);
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "tsmak-secret-key-123";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

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

app.get("/api/auth/google/url", (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(500).json({ error: "Google Client ID not configured" });
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
    if (!supabase) return res.status(500).send("Supabase not configured");
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
    const { tokens } = await client.getToken(code as string);
    client.setCredentials(tokens);
    const userInfoRes = await client.request({ url: 'https://www.googleapis.com/oauth2/v3/userinfo' });
    const userInfo = userInfoRes.data as any;

    const { data: user } = await supabase.from("islamic_gpt_users").select("*").eq("email", userInfo.email).single();
    let finalUser = user;
    if (!user) {
      const { data: newUser, error: insertError } = await supabase
        .from("islamic_gpt_users")
        .insert([{ email: userInfo.email, name: userInfo.name, password: 'google-oauth-user' }])
        .select().single();
      if (insertError) throw insertError;
      finalUser = newUser;
    }
    const token = jwt.sign({ userId: finalUser.id, email: finalUser.email, name: finalUser.name }, JWT_SECRET);
    res.send(`<html><body><script>if(window.opener){window.opener.postMessage({type:'OAUTH_AUTH_SUCCESS',token:'${token}',user:${JSON.stringify({id:finalUser.id,email:finalUser.email,name:finalUser.name})}},'*');window.close();}else{window.location.href='/';}</script></body></html>`);
  } catch (error) {
    res.status(500).send("Authentication failed");
  }
});

app.post("/api/auth/signup", async (req, res) => {
  const { email, password, name } = req.body;
  try {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const { data: user, error } = await supabase.from("islamic_gpt_users").insert([{ email, password: hashedPassword, name }]).select().single();
    if (error) return res.status(400).json({ error: error.code === "23505" ? "Email already exists" : error.message });
    const token = jwt.sign({ userId: user.id, email, name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email, name } });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
    const { data: user, error } = await supabase.from("islamic_gpt_users").select("*").eq("email", email).single();
    if (error || !user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ userId: user.id, email: user.email, name: user.name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
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
