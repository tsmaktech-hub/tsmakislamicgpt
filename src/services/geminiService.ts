import { GoogleGenAI } from "@google/genai";

export const generateIslamicResponse = async (prompt: string) => {
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    let data;
    const contentType = res.headers.get("content-type");
    const isJson = contentType && contentType.indexOf("application/json") !== -1;

    if (isJson) {
      try {
        data = await res.json();
      } catch (e: any) {
        const text = await res.text().catch(() => "Could not read response body");
        throw new Error(`Invalid JSON response from server (${res.status}): ${text.substring(0, 100)}`);
      }
    } else {
      const text = await res.text().catch(() => "Could not read response body");
      throw new Error(`Server Error (${res.status}): ${text.substring(0, 100)}`);
    }

    if (!res.ok) {
      throw new Error(data.error || "Failed to generate response from backend.");
    }

    return data.text;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
