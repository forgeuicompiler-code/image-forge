import { db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";

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
    console.log("[Config] Fetching ranking weights (Client SDK)...");
    const docRef = doc(db, "config", "ranking");
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      console.log("[Config] No ranking config found, using defaults.");
      return DEFAULT_WEIGHTS;
    }
    
    const data = docSnap.data()!;
    return {
      semantic: data.semantic_weight || DEFAULT_WEIGHTS.semantic,
      visual: data.visual_weight || DEFAULT_WEIGHTS.visual,
      quality: data.quality_weight || DEFAULT_WEIGHTS.quality,
      version: data.version || DEFAULT_WEIGHTS.version
    };
  } catch (error) {
    console.error("[Config] Failed to fetch ranking weights:", error);
    return DEFAULT_WEIGHTS;
  }
}

