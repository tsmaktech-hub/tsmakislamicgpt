import express from "express";
import cors from "cors";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

// Process-level error handling for better diagnostics in Vercel logs
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Gemini lazily
let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing in Vercel environment variables.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

// Initialize Supabase lazily
const getSupabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error("Supabase configuration missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel.");
  }
  
  return createClient(url, key);
};

const JWT_SECRET = process.env.JWT_SECRET || "tsmak-secret-key-123";

// Basic ping
app.get("/api/ping", (req, res) => {
  res.json({ status: "ok", message: "Pong" });
});

// Health check
app.get("/api/health", async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("islamic_gpt_users").select("count", { count: 'exact', head: true });
    
    if (error) {
      return res.status(200).json({
        status: "warning",
        database: "connected but table check failed",
        error: error.message,
        hint: "Ensure 'islamic_gpt_users' table exists in your Supabase database."
      });
    }

    res.json({
      status: "ok",
      database: "connected",
      vercel: !!process.env.VERCEL,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      message: error.message,
      hint: "Check your Vercel Environment Variables."
    });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const supabase = getSupabase();
    console.log(`[AUTH] Attempting signup for: ${email}`);
    
    // Use a safer way to access bcrypt methods in ESM
    const bcryptHash = (bcrypt as any).hash || (bcrypt as any).default?.hash;
    if (!bcryptHash) throw new Error("Bcrypt hash function not found");
    
    const hashedPassword = await bcryptHash(password, 10);
    
    const { data: user, error } = await supabase
      .from("islamic_gpt_users")
      .insert([{ email, password: hashedPassword, name }])
      .select()
      .single();

    if (error) {
      console.error("Supabase Signup Error:", error);
      return res.status(400).json({ 
        error: error.code === "23505" ? "Email already exists" : error.message 
      });
    }

    const token = jwt.sign({ userId: user.id, email, name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email, name } });
  } catch (error: any) {
    console.error("Signup internal error:", error);
    res.status(500).json({ error: error.message || "Internal server error during signup" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const supabase = getSupabase();
    console.log(`[AUTH] Attempting login for: ${email}`);
    
    const { data: user, error } = await supabase
      .from("islamic_gpt_users")
      .select("*")
      .eq("email", email)
      .single();
    
    if (error || !user) {
      console.warn(`[AUTH] Login failed: User not found for ${email}`, error);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    // Use a safer way to access bcrypt methods in ESM
    const bcryptCompare = (bcrypt as any).compare || (bcrypt as any).default?.compare;
    if (!bcryptCompare) throw new Error("Bcrypt compare function not found");
    
    const isValid = await bcryptCompare(password, user.password);
    if (!isValid) {
      console.warn(`[AUTH] Login failed: Password mismatch for ${email}`);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    const jwtSign = (jwt as any).sign || (jwt as any).default?.sign;
    if (!jwtSign) throw new Error("JWT sign function not found");
    
    const token = jwtSign({ userId: user.id, email: user.email, name: user.name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error: any) {
    console.error("Login internal error:", error);
    res.status(500).json({ error: error.message || "Internal server error during login" });
  }
});

app.get("/api/chats", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  
  try {
    const supabase = getSupabase();
    const token = authHeader.split(" ")[1];
    
    const jwtVerify = (jwt as any).verify || (jwt as any).default?.verify;
    if (!jwtVerify) throw new Error("JWT verify function not found");
    
    const decoded = jwtVerify(token, JWT_SECRET) as any;
    
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
    
    const jwtVerify = (jwt as any).verify || (jwt as any).default?.verify;
    if (!jwtVerify) throw new Error("JWT verify function not found");
    
    const decoded = jwtVerify(token, JWT_SECRET) as any;
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

app.post("/api/chats/clear", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Password is required" });

  try {
    const supabase = getSupabase();
    const token = authHeader.split(" ")[1];
    
    const jwtVerify = (jwt as any).verify || (jwt as any).default?.verify;
    if (!jwtVerify) throw new Error("JWT verify function not found");
    
    const decoded = jwtVerify(token, JWT_SECRET) as any;
    
    // Verify password
    const { data: user, error: userError } = await supabase
      .from("islamic_gpt_users")
      .select("*")
      .eq("id", decoded.userId)
      .single();
      
    if (userError || !user) {
      return res.status(401).json({ error: "User not found" });
    }

    const bcryptCompare = (bcrypt as any).compare || (bcrypt as any).default?.compare;
    if (!bcryptCompare) throw new Error("Bcrypt compare function not found");
    
    const isValid = await bcryptCompare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Delete chats
    const { error: deleteError } = await supabase
      .from("islamic_gpt_chats")
      .delete()
      .eq("user_id", decoded.userId);
      
    if (deleteError) throw deleteError;
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("Clear history error:", error);
    res.status(500).json({ error: error.message || "Failed to clear history" });
  }
});

app.post("/api/generate", async (req, res) => {
  const { prompt } = req.body;
  console.log(`[API] Received generation request for prompt: ${prompt?.substring(0, 50)}...`);
  
  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  const systemInstruction = `You are "Tsmak Islamic GPT", a highly knowledgeable and respectful Islamic AI assistant. 
Your goal is to provide accurate answers to Islamic questions based strictly on the Quran and authentic Hadith (Sahih Bukhari, Sahih Muslim, etc.).

For every answer:
1. Provide a clear explanation in English.
2. Include relevant Quranic verses as evidence.
3. Include relevant Hadiths as evidence.
4. For every piece of evidence (Quran or Hadith), you MUST provide:
   - The original Arabic text.
   - The English translation.
   - The specific reference (e.g., Surah Al-Baqarah 2:255 or Sahih Bukhari 1).
5. Maintain a scholarly, humble, and objective tone.
6. If a matter has different scholarly opinions, briefly mention them with respect.
7. Use Markdown for formatting. Use blockquotes for Arabic texts.

Structure your response clearly with headings.`;

  try {
    const ai = getAI();
    let response;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });
        break; // Success
      } catch (err: any) {
        attempts++;
        const isTransient = err.message?.includes("503") || err.message?.includes("high demand") || err.message?.includes("overloaded");
        if (isTransient && attempts < maxAttempts) {
          console.log(`[API] Gemini busy, retrying attempt ${attempts}...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * attempts)); // Exponential backoff
          continue;
        }
        throw err; // Rethrow if not transient or max attempts reached
      }
    }

    if (!response) throw new Error("Failed to get response from Gemini after retries");

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini Error:", error);
    // Extract a cleaner message if it's a quota or demand error
    let errorMessage = error.message || "Failed to generate response from Gemini";
    if (errorMessage.includes("quota") || errorMessage.includes("429")) {
      errorMessage = "The AI is currently busy (Quota Exceeded). Please wait a minute and try again.";
    } else if (errorMessage.includes("503") || errorMessage.includes("high demand")) {
      errorMessage = "The AI is currently experiencing very high demand. Please try again in a few moments.";
    }
    res.status(500).json({ error: errorMessage });
  }
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({ 
    error: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

export default app;
