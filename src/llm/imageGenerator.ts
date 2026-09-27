import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { formatLlmError } from "./gemini.js";

/**
 * Generates visual artwork image URLs.
 * Attempts native Gemini image generation (gemini-3-pro-image-preview / Imagen 4) via @google/genai SDK,
 * with high-speed fallback to Pollinations.ai.
 */
export async function generateImageUrl(prompt: string): Promise<string> {
  const cleanPrompt = (prompt || "modern developer workspace code artwork 8k")
    .replace(/[^a-zA-Z0-9\s,._-]/g, "")
    .trim();

  // Try native Gemini image generation if API key is set
  if (config.gemini.apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
      const res: any = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: `Generate a high-res social media banner image for: ${cleanPrompt}`,
      });

      const imageBytes = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (imageBytes) {
        return `data:image/png;base64,${imageBytes}`;
      }
    } catch (err: any) {
      console.log(`[imageGenerator] Gemini native image preview note: ${formatLlmError(err)}. Using Pollinations artwork URL.`);
    }
  }

  const encoded = encodeURIComponent(cleanPrompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=1200&height=630&nologo=true`;
}
