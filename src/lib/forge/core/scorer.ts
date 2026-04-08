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
  let arScore = 1;
  if (constraints.aspect_ratio) {
    const [targetW, targetH] = constraints.aspect_ratio.split(":").map(Number);
    const targetAR = targetW / targetH;
    const actualAR = c.width / c.height;
    arScore = 1 - Math.min(1, Math.abs(actualAR - targetAR) / targetAR);
  }

  // Composition Signal Strength
  const text = c.description.toLowerCase();
  let compScore = 0.5;
  const signals = {
    hero: ["copy space", "minimal", "wide", "cinematic"],
    product: ["white background", "studio", "centered", "isolated"],
    avatar: ["portrait", "headshot", "bokeh", "natural"],
    background: ["abstract", "texture", "pattern", "ambient"]
  };

  const roleSignals = signals[context.ui_role as keyof typeof signals] || [];
  if (roleSignals.length > 0) {
    const matches = roleSignals.filter(s => text.includes(s)).length;
    compScore = matches / roleSignals.length;
  }

  const score = 0.4 * arScore + 0.6 * compScore;
  return Math.max(0, Math.min(1, score));
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
