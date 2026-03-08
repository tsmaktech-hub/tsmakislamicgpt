import { GoogleGenAI } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

const getAI = () => {
  if (!aiInstance) {
    // Try to get the key from process.env (injected by Vite define) 
    // or import.meta.env (standard Vite way)
    const apiKey = process.env.GEMINI_API_KEY || ((import.meta as any).env && (import.meta as any).env.VITE_GEMINI_API_KEY);
    
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing. Please ensure you have set GEMINI_API_KEY in your Vercel Environment Variables and redeployed.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

export const generateIslamicResponse = async (prompt: string) => {
  const model = "gemini-3.1-pro-preview";
  
  const systemInstruction = `You are "Tsmmak Islamic GPT", a highly knowledgeable and respectful Islamic AI assistant. 
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
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    return response.text;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    if (error.message?.includes("API key")) {
      throw new Error("Islamic GPT Error: API Key is missing or invalid. Please check your Vercel environment variables.");
    }
    throw new Error("Failed to generate response from Islamic GPT.");
  }
};
