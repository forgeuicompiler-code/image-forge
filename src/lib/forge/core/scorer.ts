import { CandidateImage, ImageContext, ImageConstraints, UIRole } from "../types.ts";

const NEGATIVE_TERMS = ["vs", "versus", "alternative", "compared to", "comparison", "review", "top 10", "best of"];

const SYNONYMS: Record<string, string[]> = {
  "shoe": ["sneaker", "footwear", "kicks"],
  "shoes": ["sneaker", "footwear", "kicks"],
  "running": ["sport", "fitness", "athletic"],
  "nike": ["swoosh"],
  "adidas": ["three stripes"],
  "hero": ["banner", "header", "main"],
  "product": ["item", "object", "merchandise"],
  "avatar": ["profile", "portrait", "user", "person"],
};

export interface ScoredCandidate extends CandidateImage {
  score: number;
  breakdown: {
    semantic: number;
    visual: number;
    quality: number;
  };
}

export function scoreCandidates(
  candidates: CandidateImage[],
  context: ImageContext,
  constraints: ImageConstraints,
  dynamicWeights?: { semantic: number; visual: number; quality: number }
): ScoredCandidate[] {
  return candidates.map((c) => {
    const semantic = Math.max(0, Math.min(1, calculateSemanticScore(c, context)));
    const visual = Math.max(0, Math.min(1, calculateVisualScore(c, context, constraints)));
    const quality = Math.max(0, Math.min(1, calculateQualityScore(c)));

    const weights = dynamicWeights || getWeights(context.ui_role);

    const weightedSemantic = weights.semantic * semantic;
    const weightedVisual = weights.visual * visual;
    const weightedQuality = weights.quality * quality;

    let score = weightedSemantic + weightedVisual + weightedQuality;

    // Hard Brand Override
    if (context.brand && containsCompetingBrand(c, context.brand)) {
      score = 0;
    }

    // Clamp final score
    score = Math.max(0, Math.min(1, score));

    return { 
      ...c, 
      score,
      breakdown: {
        semantic: weightedSemantic,
        visual: weightedVisual,
        quality: weightedQuality
      }
    };
  });
}

function calculateSemanticScore(c: CandidateImage, context: ImageContext): number {
  const text = (c.description + " " + c.id).toLowerCase();
  
  // Subject Match
  const subjectWords = context.subject.toLowerCase().split(" ");
  let subjectMatches = 0;
  subjectWords.forEach(word => {
    const variants = [word, ...(SYNONYMS[word] || [])];
    if (variants.some(v => text.includes(v))) subjectMatches++;
  });
  const subjectScore = subjectMatches / subjectWords.length;

  // Brand Match
  let brandScore = 0;
  if (context.brand) {
    const brand = context.brand.toLowerCase();
    const variants = [brand, ...(SYNONYMS[brand] || [])];
    if (variants.some(v => text.includes(v))) brandScore = 1;
  }

  // Modifier Match (Style/Mood)
  let modifierMatches = 0;
  const modifiers = [context.style, context.mood].filter(Boolean) as string[];
  modifiers.forEach(mod => {
    const modLower = mod.toLowerCase();
    const variants = [modLower, ...(SYNONYMS[modLower] || [])];
    if (variants.some(v => text.includes(v))) modifierMatches++;
  });
  const modifierScore = modifiers.length > 0 ? modifierMatches / modifiers.length : 1;

  // Weighted Aggregation
  let score = 0.5 * subjectScore + 0.3 * brandScore + 0.2 * modifierScore;

  // Negative keyword penalty (cumulative)
  const negativeCount = NEGATIVE_TERMS.filter(term => text.includes(term)).length;
  if (negativeCount > 0) {
    score *= (1 - 0.2 * negativeCount);
  }

  // Soft penalty for missing brand if requested
  if (context.brand && brandScore === 0) {
    score *= 0.6;
  }

  return Math.min(1, Math.max(0, score));
}

function calculateVisualScore(c: CandidateImage, context: ImageContext, constraints: ImageConstraints): number {
  // Grouped Visual Fit: f(aspect_ratio, composition, role_alignment)
  
  // 1. Aspect Ratio Fit
  let arScore = 1;
  if (constraints.aspect_ratio) {
    const [targetW, targetH] = constraints.aspect_ratio.split(":").map(Number);
    const targetAR = targetW / targetH;
    const actualAR = c.width / c.height;
    arScore = 1 - Math.min(1, Math.abs(actualAR - targetAR) / targetAR);
  }

  // 2. Composition & Role Alignment
  const text = c.description.toLowerCase();
  let compScore = 0.5;
  const signals = {
    hero: ["copy space", "minimal", "wide", "cinematic", "landscape"],
    product: ["white background", "studio", "centered", "isolated", "clean"],
    avatar: ["portrait", "headshot", "bokeh", "natural", "face"],
    background: ["abstract", "texture", "pattern", "ambient", "blurred"]
  };

  const roleSignals = signals[context.ui_role as keyof typeof signals] || [];
  if (roleSignals.length > 0) {
    const matches = roleSignals.filter(s => text.includes(s)).length;
    compScore = matches / roleSignals.length;
  }

  // Weighted Visual Fit
  const visualFit = 0.4 * arScore + 0.6 * compScore;
  return Math.max(0, Math.min(1, visualFit));
}

function calculateQualityScore(c: CandidateImage): number {
  // Resolution score (penalize extremes, target min dimension)
  const targetMin = 800;
  const minDim = Math.min(c.width, c.height);
  const resScore = Math.min(1, minDim / targetMin);

  // Normalized likes
  const likesScore = Math.min(1, c.likes / 100);

  return 0.4 * resScore + 0.6 * likesScore;
}

function getWeights(role: UIRole) {
  let weights;
  switch (role) {
    case "product": weights = { semantic: 0.6, visual: 0.3, quality: 0.1 }; break;
    case "hero": weights = { semantic: 0.3, visual: 0.6, quality: 0.1 }; break;
    case "avatar": weights = { semantic: 0.4, visual: 0.4, quality: 0.2 }; break;
    case "background": weights = { semantic: 0.1, visual: 0.7, quality: 0.2 }; break;
    default: weights = { semantic: 0.4, visual: 0.4, quality: 0.2 }; break;
  }

  // Ensure normalization (sum = 1)
  const total = weights.semantic + weights.visual + weights.quality;
  return {
    semantic: weights.semantic / total,
    visual: weights.visual / total,
    quality: weights.quality / total
  };
}

const COMPETING_BRANDS: Record<string, string[]> = {
  "nike": ["adidas", "puma", "reebok", "under armour", "asics", "new balance"],
  "adidas": ["nike", "puma", "reebok", "under armour", "asics", "new balance"],
  "apple": ["samsung", "google", "microsoft", "huawei", "xiaomi"],
  "tesla": ["ford", "gm", "toyota", "honda", "bmw", "mercedes"],
};

function containsCompetingBrand(c: CandidateImage, brand: string): boolean {
  const text = c.description.toLowerCase();
  const brandLower = brand.toLowerCase();
  const competitors = COMPETING_BRANDS[brandLower] || 
    Object.keys(COMPETING_BRANDS).filter(b => b !== brandLower);
    
  return competitors.some(comp => text.includes(comp));
}
