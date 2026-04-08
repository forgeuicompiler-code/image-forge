import { parseContext } from "./context-parser.ts";
import { buildQueries } from "./query-builder.ts";
import { searchUnsplash } from "../providers/unsplash.ts";
import { scoreCandidates } from "./scorer.ts";
import { applyFallback } from "./fallback.ts";
import { ImageContext, ImageConstraints, ResolveImageResponse } from "../types.ts";

export async function resolveImage(input: {
  context: any;
  constraints?: ImageConstraints;
}): Promise<ResolveImageResponse> {
  const context = parseContext(input.context);
  const constraints = input.constraints || {};

  // 1. Build queries
  const queries = buildQueries(context);

  // 2. Retrieve (MVP: Parallel search for top 2 queries)
  const candidatePromises = queries.slice(0, 2).map(q => searchUnsplash(q));
  const results = await Promise.all(candidatePromises);
  
  // Flatten and deduplicate by ID
  const allCandidates = Array.from(
    new Map(results.flat().map(c => [c.id, c])).values()
  );

  // 3. Score
  const scored = scoreCandidates(allCandidates, context, constraints);

  // 4. Rank
  const best = scored.sort((a, b) => (b.score || 0) - (a.score || 0))[0];

  // 5. FSM decision & Fallback
  const final = applyFallback(best, context);

  return final;
}
