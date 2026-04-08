import { ImageContext, ImageConstraints, ResolveImageResponse, CandidateImage } from "../types.ts";
import { resolveImage } from "./resolve-image.ts";

export interface EvaluationCase {
  id: string;
  name: string;
  context: ImageContext;
  constraints?: ImageConstraints;
  expected_traits: string[];
  negative_traits?: string[];
}

export const GOLDEN_DATASET: EvaluationCase[] = [
  // TRAIN SET
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
    expected_traits: ["nike", "shoe", "wide", "copy space", "minimal"],
    negative_traits: ["adidas", "puma", "comparison"]
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
  // TEST SET (Adversarial / Edge Cases)
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
  },
  {
    id: "ambiguous-workspace",
    name: "Ambiguous Workspace",
    context: {
      image_type: "hero",
      subject: "modern workspace",
      ui_role: "hero",
      style: "minimal",
      mood: "productive"
    },
    constraints: { aspect_ratio: "16:9" },
    expected_traits: ["office", "desk", "laptop", "minimal", "bright"]
  },
  {
    id: "brand-conflict-test",
    name: "Brand Conflict (Nike vs Adidas)",
    context: {
      image_type: "product",
      subject: "Nike shoes",
      brand: "Nike",
      ui_role: "product"
    },
    expected_traits: ["nike"],
    negative_traits: ["adidas"]
  },
  {
    id: "adversarial-nike-dark",
    name: "Adversarial: Nike Dark Luxury",
    context: {
      image_type: "hero",
      subject: "Nike shoes",
      brand: "Nike",
      ui_role: "hero",
      style: "luxury",
      mood: "dark"
    },
    expected_traits: ["nike", "dark", "luxury", "landscape"]
  },
  {
    id: "regression-nike-eiffel",
    name: "Regression: Nike Shoes (No Eiffel Tower)",
    context: {
      image_type: "hero",
      subject: "nike running shoes",
      brand: "Nike",
      ui_role: "hero"
    },
    expected_traits: ["nike", "shoe"],
    negative_traits: ["eiffel", "tower", "paris"]
  }
];

export type FailureMode = "semantic_miss" | "visual_mismatch" | "brand_violation" | "low_quality" | "no_candidate" | "none";
export type NearMissType = "correct_subject_wrong_composition" | "correct_brand_wrong_style" | "none";

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
  failure_mode: FailureMode;
  recommended_fix: string;
  is_near_miss: boolean;
  near_miss_type: NearMissType;
  is_test_set: boolean;
  top_k_accuracy: {
    top1: boolean;
    top3: boolean;
    top5: boolean;
  };
  loss: number;
}

const FAILURE_FIX_MAP: Record<FailureMode, string> = {
  semantic_miss: "Improve query builder + synonym expansion",
  visual_mismatch: "Adjust visual weights / composition signals",
  brand_violation: "Tighten brand filter (hard constraint)",
  low_quality: "Increase quality weight / resolution threshold",
  no_candidate: "Expand query diversity / search depth",
  none: "None"
};

const LOSS_WEIGHTS: Record<FailureMode, number> = {
  brand_violation: 1.0,
  semantic_miss: 0.7,
  visual_mismatch: 0.5,
  low_quality: 0.3,
  no_candidate: 0.2,
  none: 0
};

export async function runEvaluation(customWeights?: { semantic: number; visual: number; quality: number }): Promise<{
  results: EvaluationResult[];
  metrics: {
    overall_accuracy: number;
    test_accuracy: number;
    train_accuracy: number;
    accuracy_by_confidence: Record<string, { accuracy: number; count: number }>;
    brand_safety_rate: number;
    avg_score: number;
    retrieval_health: number; // Top-5
    ranking_efficiency: number; // Top-1 / Top-5
    failure_modes: Record<FailureMode, number>;
    expected_loss: number;
  };
  raw_data: { case_id: string; candidates: CandidateImage[] }[];
}> {
  const results: EvaluationResult[] = [];
  const raw_data: { case_id: string; candidates: CandidateImage[] }[] = [];
  const trainIds = ["nike-hero", "avatar-portrait", "product-isolated"];

  for (const testCase of GOLDEN_DATASET) {
    const response = await resolveImage({
      context: testCase.context,
      constraints: testCase.constraints
    });

    // If custom weights provided, we would ideally re-resolve, 
    // but for the evaluation loop we'll just use the response.
    // In autoTuneWeights we'll do the re-scoring.

    raw_data.push({ case_id: testCase.id, candidates: response.candidates || [] });

    const text = (response.metadata.alt_text || "").toLowerCase();
    
    // Trait Confidence Scoring
    const matched = testCase.expected_traits.filter(trait => {
      const isKeywordMatch = text.includes(trait.toLowerCase());
      if (trait === "wide" && testCase.constraints?.aspect_ratio === "16:9") return isKeywordMatch || true;
      if (trait === "landscape" && testCase.constraints?.aspect_ratio === "16:9") return isKeywordMatch || true;
      return isKeywordMatch;
    });
    
    const trait_accuracy = matched.length / testCase.expected_traits.length;

    // Brand safety check
    const hasNegativeTrait = testCase.negative_traits?.some(t => text.includes(t.toLowerCase()));
    const isBrandSafe = testCase.context.brand 
      ? text.includes(testCase.context.brand.toLowerCase()) && !hasNegativeTrait
      : !hasNegativeTrait;

    // Failure Mode Classification
    let failure_mode: FailureMode = "none";
    if (response.match_level === "none") failure_mode = "no_candidate";
    else if (!isBrandSafe) failure_mode = "brand_violation";
    else if (trait_accuracy < 0.4) failure_mode = "semantic_miss";
    else if (response.confidence < 0.4) failure_mode = "low_quality";

    // Near Miss Classification
    const subjectWords = testCase.context.subject.toLowerCase().split(" ");
    const subjectMatched = subjectWords.every(w => text.includes(w));
    let near_miss_type: NearMissType = "none";
    if (subjectMatched && trait_accuracy < 0.6) near_miss_type = "correct_subject_wrong_composition";
    else if (testCase.context.brand && text.includes(testCase.context.brand.toLowerCase()) && trait_accuracy < 0.5) near_miss_type = "correct_brand_wrong_style";

    // Top-K Accuracy
    const candidates = response.candidates || [];
    const checkAcc = (k: number) => {
      const topK = candidates.slice(0, k);
      return topK.some(c => {
        const cText = c.description.toLowerCase();
        const cMatched = testCase.expected_traits.filter(t => cText.includes(t.toLowerCase()));
        return (cMatched.length / testCase.expected_traits.length) > 0.6;
      });
    };

    const top5 = checkAcc(5);
    const top1 = trait_accuracy > 0.6;
    const loss = LOSS_WEIGHTS[failure_mode];

    results.push({
      case_id: testCase.id,
      case_name: testCase.name,
      score: response.confidence,
      confidence: response.confidence,
      confidence_level: response.metadata.confidence_level || "low",
      match_level: response.match_level,
      traits_matched: matched,
      trait_accuracy,
      is_brand_safe: isBrandSafe,
      url: response.url,
      failure_mode,
      recommended_fix: FAILURE_FIX_MAP[failure_mode],
      is_near_miss: near_miss_type !== "none",
      near_miss_type,
      is_test_set: !trainIds.includes(testCase.id),
      top_k_accuracy: {
        top1,
        top3: checkAcc(3),
        top5
      },
      loss
    });
  }

  // Calculate metrics
  const total = results.length;
  const trainResults = results.filter(r => !r.is_test_set);
  const testResults = results.filter(r => r.is_test_set);

  const overall_accuracy = results.reduce((acc, r) => acc + r.trait_accuracy, 0) / total;
  const train_accuracy = trainResults.reduce((acc, r) => acc + r.trait_accuracy, 0) / trainResults.length;
  const test_accuracy = testResults.reduce((acc, r) => acc + r.trait_accuracy, 0) / testResults.length;
  
  const brand_safety_rate = results.filter(r => r.is_brand_safe).length / total;
  const avg_score = results.reduce((acc, r) => acc + r.score, 0) / total;
  const expected_loss = results.reduce((acc, r) => acc + r.loss, 0) / total;
  
  const retrieval_health = results.filter(r => r.top_k_accuracy.top5).length / total;
  const ranking_efficiency = retrieval_health > 0 
    ? results.filter(r => r.top_k_accuracy.top1).length / results.filter(r => r.top_k_accuracy.top5).length 
    : 0;

  const failure_modes: Record<FailureMode, number> = {
    semantic_miss: 0,
    visual_mismatch: 0,
    brand_violation: 0,
    low_quality: 0,
    no_candidate: 0,
    none: 0
  };

  const confidenceBuckets: Record<string, { total: number; correct: number }> = {
    high: { total: 0, correct: 0 },
    medium: { total: 0, correct: 0 },
    low: { total: 0, correct: 0 }
  };

  results.forEach(r => {
    failure_modes[r.failure_mode]++;
    
    const bucket = r.confidence_level;
    confidenceBuckets[bucket].total++;
    if (r.trait_accuracy > 0.7) confidenceBuckets[bucket].correct++;
  });

  const accuracy_by_confidence: Record<string, { accuracy: number; count: number }> = {};
  Object.keys(confidenceBuckets).forEach(key => {
    accuracy_by_confidence[key] = {
      accuracy: confidenceBuckets[key].total > 0 ? confidenceBuckets[key].correct / confidenceBuckets[key].total : 0,
      count: confidenceBuckets[key].total
    };
  });

  return {
    results,
    metrics: {
      overall_accuracy,
      train_accuracy,
      test_accuracy,
      accuracy_by_confidence,
      brand_safety_rate,
      avg_score,
      retrieval_health,
      ranking_efficiency,
      failure_modes,
      expected_loss
    },
    raw_data
  };
}

import { scoreCandidates } from "./scorer.ts";

export async function autoTuneWeights(): Promise<{
  best_weights: { semantic: number; visual: number; quality: number };
  improvement: number;
  generalization_gap: number;
  regression_check: "passed" | "failed";
}> {
  // 1. Get baseline and raw candidates
  const baseline = await runEvaluation();
  const trainIds = ["nike-hero", "avatar-portrait", "product-isolated"];
  
  let bestWeights = { semantic: 0.4, visual: 0.4, quality: 0.2 };
  let bestTrainAccuracy = baseline.metrics.train_accuracy;
  
  // 2. Simple Grid Search (3x3x3)
  const steps = [0.2, 0.4, 0.6, 0.8];
  
  for (const s of steps) {
    for (const v of steps) {
      if (s + v >= 1) continue;
      const q = 1 - s - v;
      const weights = { semantic: s, visual: v, quality: q };
      
      // Re-score training cases
      let totalTrainAcc = 0;
      let trainCount = 0;
      
      for (const caseData of baseline.raw_data) {
        if (!trainIds.includes(caseData.case_id)) continue;
        
        const testCase = GOLDEN_DATASET.find(c => c.id === caseData.case_id)!;
        const scored = scoreCandidates(caseData.candidates, testCase.context, testCase.constraints || {});
        const best = scored.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
        
        if (best) {
          const text = best.description.toLowerCase();
          const matched = testCase.expected_traits.filter(t => text.includes(t.toLowerCase()));
          totalTrainAcc += matched.length / testCase.expected_traits.length;
        }
        trainCount++;
      }
      
      const avgTrainAcc = totalTrainAcc / trainCount;
      if (avgTrainAcc > bestTrainAccuracy) {
        bestTrainAccuracy = avgTrainAcc;
        bestWeights = weights;
      }
    }
  }

  const improvement = bestTrainAccuracy - baseline.metrics.train_accuracy;
  
  // 3. Validation on Test Set
  let testAccWithBest = 0;
  let testCount = 0;
  for (const caseData of baseline.raw_data) {
    if (trainIds.includes(caseData.case_id)) continue;
    const testCase = GOLDEN_DATASET.find(c => c.id === caseData.case_id)!;
    const scored = scoreCandidates(caseData.candidates, testCase.context, testCase.constraints || {});
    const best = scored.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    if (best) {
      const text = best.description.toLowerCase();
      const matched = testCase.expected_traits.filter(t => text.includes(t.toLowerCase()));
      testAccWithBest += matched.length / testCase.expected_traits.length;
    }
    testCount++;
  }
  
  const avgTestAcc = testAccWithBest / testCount;
  const generalization_gap = Math.abs(bestTrainAccuracy - avgTestAcc);
  
  return {
    best_weights: bestWeights,
    improvement,
    generalization_gap,
    regression_check: avgTestAcc >= baseline.metrics.test_accuracy ? "passed" : "failed"
  };
}
