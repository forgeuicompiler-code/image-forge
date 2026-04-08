import { parseContext } from "./context-parser.ts";
import { buildQueries } from "./query-builder.ts";
import { searchUnsplash } from "../providers/unsplash.ts";
import { scoreCandidates } from "./scorer.ts";
import { applyFallback } from "./fallback.ts";
import { ImageContext, ImageConstraints, ResolveImageResponse } from "../types.ts";
import { getRankingWeights } from "../services/config.service.ts";
import { tagCandidateServer } from "../services/ai.service.ts";

export async function resolveImage(input: {
  context: any;
  constraints?: ImageConstraints;
}): Promise<ResolveImageResponse> {
  const context = parseContext(input.context);
  const constraints = input.constraints || {};

  // 1. Fetch Dynamic Weights
  const weights = await getRankingWeights();

  // 2. Build queries
  const queries = buildQueries(context);

  // 3. Retrieve (Parallel search for all queries to expand pool)
  const candidatePromises = queries.map(q => searchUnsplash(q));
  const results = await Promise.all(candidatePromises);
  
  // Flatten and deduplicate by ID
  const allCandidates = Array.from(
    new Map(results.flat().map(c => [c.id, c])).values()
  );

  // 4. Score with Dynamic Weights
  const scored = scoreCandidates(allCandidates, context, constraints, weights);

  // 4. Rank
  const sorted = scored.sort((a, b) => (b.score || 0) - (a.score || 0));
  const best = sorted[0];
  const secondBest = sorted[1];
  const margin = best && secondBest ? (best.score || 0) - (secondBest.score || 0) : 1;

  // Calculate Variance of Top-K scores
  const topK = sorted.slice(0, 5);
  const scores = topK.map(c => c.score || 0);
  const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const variance = scores.length > 1 
    ? scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length 
    : 0;

  // 5. FSM decision & Fallback
  const final = applyFallback(best, context, { margin, variance, candidates: sorted });
  
  // Attach top candidates for evaluation/debugging
  final.candidates = sorted.slice(0, 5);
  
  // Add Trace Metadata
  final.metadata.trace = {
    queries,
    candidate_count: allCandidates.length,
    top_scores: sorted.slice(0, 5).map(c => Number((c.score || 0).toFixed(3))),
    decision: final.metadata.fallback_applied ? "fallback" : "direct_match"
  };
  final.metadata.variance = variance;
  
  // 6. Real-time Semantic Analysis (Report)
  if (best && !final.metadata.fallback_applied) {
    try {
      final.semantic_report = await tagCandidateServer(best.description);
    } catch (e) {
      console.error("Real-time semantic tagging failed:", e);
    }
  }

  return final;
}
