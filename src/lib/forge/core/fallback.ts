import { ResolveImageResponse, UIRole, ImageContext } from "../types.ts";

export function applyFallback(best: any, context: ImageContext): ResolveImageResponse {
  if (!best || best.score < 0.3) {
    return getPlaceholder(context.ui_role);
  }

  return {
    url: best.url,
    confidence: best.score,
    match_level: inferMatchLevel(best, context),
    attribution: best.attribution,
    metadata: {
      alt_text: best.description || context.subject,
      fallback_applied: best.score < 0.75,
    },
  };
}

function getPlaceholder(role: UIRole): ResolveImageResponse {
  let url = "https://picsum.photos/seed/forge/1920/1080?blur=2";
  let reason = "no_valid_candidates";

  switch (role) {
    case "avatar":
      url = "https://picsum.photos/seed/avatar/200/200";
      break;
    case "product":
      url = "https://picsum.photos/seed/product/800/800";
      break;
    case "hero":
      url = "https://picsum.photos/seed/hero/1920/1080?grayscale";
      break;
  }

  return {
    url,
    confidence: 0,
    match_level: "none",
    metadata: {
      alt_text: "Placeholder image",
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
