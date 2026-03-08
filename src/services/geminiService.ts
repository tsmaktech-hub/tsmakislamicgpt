import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const generateIslamicResponse = async (prompt: string) => {
  const model = "gemini-3.1-pro-preview";
  
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
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to generate response from Islamic GPT.");
  }
};
