import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

/**
 * Generates multimodal vector embeddings using gemini-embedding-2 SDK.
 * Maps text, code, and project context into a shared vector space.
 */
export async function generateMultimodalEmbedding(content: string): Promise<number[]> {
  if (!config.gemini.apiKey || !content) {
    return createDummyVector(content);
  }

  try {
    const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    // Use gemini-embedding-2 model for multimodal vector embeddings
    const response = await ai.models.embedContent({
      model: "gemini-embedding-2",
      contents: content.slice(0, 2000),
    });

    const vector = (response as any).embeddings?.[0]?.values || (response as any).embedding?.values;
    if (vector && vector.length > 0) {
      return vector;
    }
    return createDummyVector(content);
  } catch (err: any) {
    console.warn("[embedding] gemini-embedding-2 fallback warning:", err.message);
    return createDummyVector(content);
  }
}

function createDummyVector(text: string): number[] {
  const hash = Array.from(text).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const dummy: number[] = [];
  for (let i = 0; i < 64; i++) {
    dummy.push(Math.sin(hash + i));
  }
  return dummy;
}
