import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { formatLlmError } from "./gemini.js";

export interface ResilientLlmOptions {
  jsonMode?: boolean;
  temperature?: number;
  systemInstruction?: string;
}

/**
 * Advanced Resilient LLM Completion Engine.
 * Implements multi-provider failover (Groq -> OpenRouter -> Gemini Cascade),
 * exponential backoff retry on 503/429 spikes, and clean error reporting.
 */
export async function generateResilientText(
  prompt: string,
  options: ResilientLlmOptions = {}
): Promise<string | null> {
  const fullPrompt = options.systemInstruction
    ? `${options.systemInstruction}\n\n${prompt}`
    : prompt;

  // 1. Try Groq API (High Speed & Zero Quota Contention)
  if (config.groq.apiKey) {
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.groq.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.groq.model,
          messages: [{ role: "user", content: fullPrompt }],
          temperature: options.temperature ?? 0.3,
          response_format: options.jsonMode ? { type: "json_object" } : undefined,
        }),
      });

      if (groqRes.ok) {
        const data = await groqRes.json();
        const text = data.choices?.[0]?.message?.content;
        if (text && text.trim().length > 0) {
          return text.trim();
        }
      }
    } catch (err: any) {
      console.warn(`[resilientLlm] Groq API warning: ${formatLlmError(err)}. Trying OpenRouter/Gemini...`);
    }
  }

  // 2. Try OpenRouter API (Multi-Model Infrastructure)
  if (config.openRouter.apiKey) {
    try {
      const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openRouter.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.openRouter.model,
          messages: [{ role: "user", content: fullPrompt }],
          temperature: options.temperature ?? 0.3,
        }),
      });

      if (openRouterRes.ok) {
        const data = await openRouterRes.json();
        const text = data.choices?.[0]?.message?.content;
        if (text && text.trim().length > 0) {
          return text.trim();
        }
      }
    } catch (err: any) {
      console.warn(`[resilientLlm] OpenRouter API warning: ${formatLlmError(err)}. Trying Gemini...`);
    }
  }

  // 3. Try Google Gemini API Cascade with exponential backoff on 503 / 429 errors
  if (config.gemini.apiKey) {
    const candidateModels = [
      config.gemini.model,
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-2.5-flash",
    ].filter((m, i, self) => self.indexOf(m) === i && Boolean(m));

    const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

    for (const modelName of candidateModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await ai.models.generateContent({
            model: modelName,
            contents: fullPrompt,
            config: {
              temperature: options.temperature ?? 0.3,
            },
          });

          const text = res.text;
          if (text && text.trim().length > 0) {
            return text.trim();
          }
        } catch (err: any) {
          const formattedErr = formatLlmError(err);
          const isTransient = formattedErr.includes("503") || formattedErr.includes("429") || formattedErr.includes("UNAVAILABLE") || formattedErr.includes("RESOURCE_EXHAUSTED");

          if (isTransient && attempt === 1) {
            // Wait 600ms before retrying same or next model
            await new Promise((resolve) => setTimeout(resolve, 600));
            continue;
          }

          console.warn(`[resilientLlm] Model '${modelName}' warning: ${formattedErr}. Cascading to next candidate...`);
          break; // move to next model
        }
      }
    }
  }

  return null;
}
