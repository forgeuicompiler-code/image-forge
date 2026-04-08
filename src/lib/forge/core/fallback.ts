import { ResolveImageResponse, UIRole, ImageContext } from "../types.ts";

const ROLE_THRESHOLDS: Record<string, number> = {
  product: 0.55,     // Precision critical
  hero: 0.45,        // Composition matters
  avatar: 0.5,
  background: 0.35   // Tolerant
};

const MIN_MARGIN = 0.05;
const HIGH_CONFIDENCE = 0.8;
const MIN_VARIANCE = 0.001;

export function applyFallback(
  best: any, 
  context: ImageContext, 
  stats: { margin: number; variance: number; candidates: any[] }
): ResolveImageResponse {
  const threshold = ROLE_THRESHOLDS[context.ui_role] || 0.4;
  const { margin, variance } = stats;
  
  // 1. Absolute Threshold Check
  const isTooLow = !best || best.score < threshold;
  
  // 2. Refined Margin Logic (Final Form)
  // Interpretation:
  // Strong candidates -> always allowed
  // Low-variance pools -> don't penalize (likely similar images)
  // True ambiguity -> abstain
  const isTooFragile = 
    margin < MIN_MARGIN && 
    best?.score < HIGH_CONFIDENCE && 
    variance > MIN_VARIANCE;

  if (isTooLow || isTooFragile || !best) {
    const reason = !best ? "no_candidates" : (isTooLow ? "low_confidence" : "low_margin");
    const fallbackType = !best ? "no_candidates" : (isTooLow ? "low_confidence" : "low_margin");
    
    const placeholder = getPlaceholder(context.ui_role, reason, context.subject);
    placeholder.metadata.fallback_type = fallbackType;
    placeholder.metadata.margin = margin;
    placeholder.metadata.variance = variance;
    return placeholder;
  }

  // Confidence Calibration
  let confidenceLevel: "high" | "medium" | "low" = "low";
  if (best.score > 0.85) confidenceLevel = "high";
  else if (best.score > 0.6) confidenceLevel = "medium";

  return {
    url: best.url,
    confidence: best.score,
    match_level: inferMatchLevel(best, context),
    attribution: best.attribution,
    metadata: {
      alt_text: best.description || context.subject,
      fallback_applied: best.score < 0.75,
      confidence_level: confidenceLevel,
      reason: "none",
      margin,
      variance,
      contribution: best.breakdown
    },
  };
}

function getPlaceholder(role: UIRole, reason: string, subject: string): ResolveImageResponse {
  const seed = `${subject}_${role}`.replace(/\s/g, "").toLowerCase();
  let url = `https://picsum.photos/seed/${seed}/1920/1080?blur=2`;
  
  switch (role) {
    case "avatar":
      url = `https://picsum.photos/seed/${seed}-avatar/200/200`;
      break;
    case "product":
      url = `https://picsum.photos/seed/${seed}-product/800/800`;
      break;
    case "hero":
      url = `https://picsum.photos/seed/${seed}-hero/1920/1080`;
      break;
  }

  return {
    url,
    confidence: 0,
    match_level: "none",
    metadata: {
      alt_text: `Placeholder for ${subject}`,
      fallback_applied: true,
      reason,
    },
  };
}

function inferMatchLevel(best: any, context: ImageContext): "exact" | "brand" | "category" | "none" {
  const text = (best.description || "").toLowerCase();
  if (context.brand && text.includes(context.brand.toLowerCase())) {
    return "brand";
  }
  return "category";
}
