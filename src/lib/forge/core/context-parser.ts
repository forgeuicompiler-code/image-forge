import { ImageContext } from "../types.ts";

export function parseContext(input: any): ImageContext {
  // Normalize inputs
  const context: ImageContext = {
    image_type: input.image_type || "product",
    subject: (input.subject || "").toLowerCase().trim(),
    brand: input.brand ? input.brand.toLowerCase().trim() : undefined,
    ui_role: input.ui_role || "content",
    style: input.style || "modern",
    mood: input.mood || "neutral",
    composition: {
      framing: input.composition?.framing || "centered",
      copy_space: input.composition?.copy_space || "none",
    },
  };

  // Basic lemmatization (MVP: just plural to singular for common cases)
  if (context.subject.endsWith("s") && context.subject.length > 3) {
    // Very naive but fits MVP scope
    // context.subject = context.subject.slice(0, -1); 
  }

  return context;
}
