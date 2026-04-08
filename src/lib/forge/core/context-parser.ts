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
  const lemmatize = (word: string) => {
    if (word.endsWith("ies")) return word.slice(0, -3) + "y";
    if (word.endsWith("es") && !word.endsWith("ees")) return word.slice(0, -2);
    if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
    return word;
  };

  context.subject = context.subject.split(" ").map(lemmatize).join(" ");

  return context;
}
