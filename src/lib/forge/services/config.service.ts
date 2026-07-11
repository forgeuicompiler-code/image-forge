import firebaseConfig from "../../../../firebase-applet-config.json";

export interface RankingWeights {
  semantic: number;
  visual: number;
  quality: number;
  version: string;
}

const DEFAULT_WEIGHTS: RankingWeights = {
  semantic: 0.6,
  visual: 0.3,
  quality: 0.1,
  version: "default-v1"
};

export async function getRankingWeights(): Promise<RankingWeights> {
  try {
    console.log("[Config] Fetching ranking weights (REST API)...");
    const projectId = firebaseConfig.projectId;
    const databaseId = firebaseConfig.firestoreDatabaseId || "(default)";
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/config/ranking`;
    
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status !== 404) {
        console.warn(`[Config] Failed to fetch config (Status: ${response.status}). Using defaults.`);
      }
      return DEFAULT_WEIGHTS;
    }
    
    const json = await response.json();
    const fields = json.fields;
    
    if (!fields) {
      return DEFAULT_WEIGHTS;
    }
    
    const parseNumber = (field: any, defaultVal: number) => {
      if (!field) return defaultVal;
      if (field.doubleValue !== undefined) return Number(field.doubleValue);
      if (field.integerValue !== undefined) return Number(field.integerValue);
      return defaultVal;
    };

    return {
      semantic: parseNumber(fields.semantic_weight, DEFAULT_WEIGHTS.semantic),
      visual: parseNumber(fields.visual_weight, DEFAULT_WEIGHTS.visual),
      quality: parseNumber(fields.quality_weight, DEFAULT_WEIGHTS.quality),
      version: fields.version?.stringValue ?? DEFAULT_WEIGHTS.version
    };
  } catch (error) {
    console.error("[Config] Failed to fetch ranking weights:", error);
    return DEFAULT_WEIGHTS;
  }
}

