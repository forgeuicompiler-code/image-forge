import { GoogleGenAI, Type } from "@google/genai";
import firebaseConfig from "../../../../firebase-applet-config.json";

const apiKey = process.env.GEMINI_API_KEY || firebaseConfig.apiKey;
const ai = new GoogleGenAI({ apiKey });

if (!apiKey) {
  console.warn("WARNING: No API key found for Gemini.");
} else {
  console.log("Gemini API key source: " + (process.env.GEMINI_API_KEY ? "env" : "config"));
}

const DATASET_VERSION = "v1.2";

export interface AITags {
  subject: string[];
  brand: string | null;
  ui_role_fit: string[];
  composition: string[];
  confidence: number;
}

export async function tagCandidateServer(description: string): Promise<AITags> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this image description and extract structured semantic tags. 
    Be objective. If a brand is mentioned but not visible, set brand to null.
    
    Description: "${description}"`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Core objects in image" },
          brand: { type: Type.STRING, nullable: true, description: "Visible brand name or null" },
          ui_role_fit: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Best UI roles (hero, product, avatar)" },
          composition: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Visual traits (centered, wide, bokeh)" },
          confidence: { type: Type.NUMBER, description: "AI confidence score 0.0 to 1.0" }
        },
        required: ["subject", "brand", "ui_role_fit", "composition", "confidence"]
      }
    }
  });

  const tags = JSON.parse(response.text || "{}");
  if (!tags.subject || !Array.isArray(tags.subject)) throw new Error("Invalid AI output schema");
  return tags;
}

export async function expandSearchQuery(subject: string, brand: string | null): Promise<string[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Expand this image search subject into 3-4 highly relevant, diverse search queries for Unsplash.
    Subject: "${subject}"
    Brand: "${brand || 'None'}"
    
    Return a JSON array of strings.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    return [subject];
  }
}

