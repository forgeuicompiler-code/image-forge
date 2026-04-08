import { GoogleGenAI, Type } from "@google/genai";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AITags {
  subject: string[];
  brand: string | null;
  ui_role_fit: string[];
  composition: string[];
  confidence: number;
}

export async function tagCandidate(description: string): Promise<AITags> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze this image description and extract structured semantic tags: "${description}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.ARRAY, items: { type: Type.STRING } },
            brand: { type: Type.STRING, nullable: true },
            ui_role_fit: { type: Type.ARRAY, items: { type: Type.STRING } },
            composition: { type: Type.ARRAY, items: { type: Type.STRING } },
            confidence: { type: Type.NUMBER }
          },
          required: ["subject", "brand", "ui_role_fit", "composition", "confidence"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Tagging failed:", error);
    return {
      subject: [],
      brand: null,
      ui_role_fit: [],
      composition: [],
      confidence: 0
    };
  }
}

export async function logTrace(traceData: any) {
  const path = "traces";
  try {
    const traceRef = doc(collection(db, path), traceData.id);
    await setDoc(traceRef, {
      ...traceData,
      timestamp: new Date().toISOString(),
      server_timestamp: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
