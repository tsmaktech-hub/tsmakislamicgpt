import { GoogleGenAI } from "@google/genai";

export const generateIslamicResponse = async (prompt: string) => {
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to generate response from backend.");
    }

    return data.text;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
