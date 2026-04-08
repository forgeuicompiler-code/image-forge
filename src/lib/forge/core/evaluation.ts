import { ImageContext, ImageConstraints } from "../types.ts";
import { resolveImage } from "./resolve-image.ts";

export interface EvaluationCase {
  id: string;
  name: string;
  context: ImageContext;
  constraints?: ImageConstraints;
  expected_traits: string[];
}

export const GOLDEN_DATASET: EvaluationCase[] = [
  {
    id: "nike-hero",
    name: "Nike Hero Banner",
    context: {
      image_type: "hero",
      subject: "running shoes",
      brand: "Nike",
      ui_role: "hero",
      style: "modern",
      mood: "energetic",
      composition: { framing: "wide", copy_space: "right" }
    },
    constraints: { aspect_ratio: "16:9" },
    expected_traits: ["nike", "shoe", "wide", "copy space", "minimal"]
  },
  {
    id: "avatar-portrait",
    name: "User Avatar",
    context: {
      image_type: "avatar",
      subject: "smiling woman",
      ui_role: "avatar",
      style: "natural",
      mood: "friendly"
    },
    constraints: { aspect_ratio: "1:1" },
    expected_traits: ["portrait", "face", "centered", "bokeh"]
  },
  {
    id: "product-isolated",
    name: "Isolated Product",
    context: {
      image_type: "product",
      subject: "mechanical keyboard",
      ui_role: "product",
      style: "tech",
      mood: "professional"
    },
    constraints: { aspect_ratio: "1:1" },
    expected_traits: ["keyboard", "white background", "centered", "studio"]
  },
  {
    id: "abstract-bg",
    name: "Abstract Background",
    context: {
      image_type: "background",
      subject: "geometric shapes",
      ui_role: "background",
      style: "minimalist",
      mood: "calm"
    },
    constraints: { aspect_ratio: "16:9" },
    expected_traits: ["abstract", "texture", "minimal", "pattern"]
  }
];

export interface EvaluationResult {
  case_id: string;
  case_name: string;
  score: number;
  confidence: number;
  confidence_level: string;
  match_level: string;
  traits_matched: string[];
  trait_accuracy: number;
  is_brand_safe: boolean;
  url: string;
}

export async function runEvaluation(): Promise<{
  results: EvaluationResult[];
  metrics: {
    overall_accuracy: number;
    accuracy_by_confidence: Record<string, number>;
    brand_safety_rate: number;
    avg_score: number;
  };
}> {
  const results: EvaluationResult[] = [];

  for (const testCase of GOLDEN_DATASET) {
    const response = await resolveImage({
      context: testCase.context,
      constraints: testCase.constraints
    });

    const text = (response.metadata.alt_text || "").toLowerCase();
    const matched = testCase.expected_traits.filter(trait => text.includes(trait.toLowerCase()));
    
    // Brand safety check
    const isBrandSafe = testCase.context.brand 
      ? text.includes(testCase.context.brand.toLowerCase()) && !text.includes("adidas") // Simple check
      : true;

    results.push({
      case_id: testCase.id,
      case_name: testCase.name,
      score: response.confidence,
      confidence: response.confidence,
      confidence_level: response.metadata.confidence_level || "low",
      match_level: response.match_level,
      traits_matched: matched,
      trait_accuracy: matched.length / testCase.expected_traits.length,
      is_brand_safe: isBrandSafe,
      url: response.url
    });
  }

  // Calculate metrics
  const overall_accuracy = results.reduce((acc, r) => acc + r.trait_accuracy, 0) / results.length;
  const brand_safety_rate = results.filter(r => r.is_brand_safe).length / results.length;
  const avg_score = results.reduce((acc, r) => acc + r.score, 0) / results.length;

  const confidenceBuckets: Record<string, { total: number; correct: number }> = {
    high: { total: 0, correct: 0 },
    medium: { total: 0, correct: 0 },
    low: { total: 0, correct: 0 }
  };

  results.forEach(r => {
    const bucket = r.confidence_level;
    confidenceBuckets[bucket].total++;
    if (r.trait_accuracy > 0.7) confidenceBuckets[bucket].correct++;
  });

  const accuracy_by_confidence: Record<string, number> = {};
  Object.keys(confidenceBuckets).forEach(key => {
    accuracy_by_confidence[key] = confidenceBuckets[key].total > 0 
      ? confidenceBuckets[key].correct / confidenceBuckets[key].total 
      : 0;
  });

  return {
    results,
    metrics: {
      overall_accuracy,
      accuracy_by_confidence,
      brand_safety_rate,
      avg_score
    }
  };
}
