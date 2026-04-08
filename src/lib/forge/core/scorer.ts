import { CandidateImage, ImageContext, ImageConstraints, UIRole } from "../types.ts";

const NEGATIVE_TERMS = ["vs", "versus", "alternative", "compared to", "comparison"];

export function scoreCandidates(
  candidates: CandidateImage[],
  context: ImageContext,
  constraints: ImageConstraints
): CandidateImage[] {
  return candidates.map((c) => {
    const semantic = calculateSemanticScore(c, context);
    const visual = calculateVisualScore(c, context, constraints);
    const quality = calculateQualityScore(c);

    const weights = getWeights(context.ui_role);

    let score =
      weights.semantic * semantic +
      weights.visual * visual +
      weights.quality * quality;

    // Hard Brand Override
    if (context.brand && containsCompetingBrand(c, context.brand)) {
      score = 0;
    }

    // Clamp
    score = Math.max(0, Math.min(1, score));

    return { ...c, score };
  });
}

function calculateSemanticScore(c: CandidateImage, context: ImageContext): number {
  const text = (c.description + " " + c.id).toLowerCase();
  const subjectWords = context.subject.split(" ");
  
  let matches = 0;
  subjectWords.forEach(word => {
    if (text.includes(word)) matches++;
  });

  let score = matches / subjectWords.length;

  if (context.brand && text.includes(context.brand.toLowerCase())) {
    score += 0.5; // Brand bonus
  }

  // Negative keyword penalty
  if (NEGATIVE_TERMS.some(term => text.includes(term))) {
    score *= 0.5;
  }

  return Math.min(1, score);
}

function calculateVisualScore(c: CandidateImage, context: ImageContext, constraints: ImageConstraints): number {
  let score = 0.5; // Baseline

  // Aspect Ratio Penalty
  if (constraints.aspect_ratio) {
    const [targetW, targetH] = constraints.aspect_ratio.split(":").map(Number);
    const targetRatio = targetW / targetH;
    const actualRatio = c.width / c.height;
    
    const diff = Math.abs(targetRatio - actualRatio);
    if (diff < 0.1) score += 0.3;
    else if (diff > 0.5) score -= 0.3;
  }

  // UI Role Composition Keywords
  const text = c.description.toLowerCase();
  if (context.ui_role === "hero" && (text.includes("copy space") || text.includes("minimal"))) {
    score += 0.2;
  }
  if (context.ui_role === "product" && (text.includes("white background") || text.includes("studio"))) {
    score += 0.2;
  }

  return Math.max(0, Math.min(1, score));
}

function calculateQualityScore(c: CandidateImage): number {
  // Simple popularity proxy
  const likesScore = Math.min(1, c.likes / 100);
  return likesScore;
}

function getWeights(role: UIRole) {
  switch (role) {
    case "product": return { semantic: 0.6, visual: 0.3, quality: 0.1 };
    case "hero": return { semantic: 0.3, visual: 0.6, quality: 0.1 };
    case "avatar": return { semantic: 0.4, visual: 0.4, quality: 0.2 };
    case "background": return { semantic: 0.1, visual: 0.7, quality: 0.2 };
    default: return { semantic: 0.4, visual: 0.4, quality: 0.2 };
  }
}

function containsCompetingBrand(c: CandidateImage, brand: string): boolean {
  const text = c.description.toLowerCase();
  // This would ideally be a list of known competitors
  const competitors = ["adidas", "nike", "puma", "reebok", "under armour"].filter(b => b !== brand.toLowerCase());
  return competitors.some(comp => text.includes(comp));
}
