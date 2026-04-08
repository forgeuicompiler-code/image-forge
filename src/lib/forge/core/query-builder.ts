import { ImageContext, UIRole } from "../types.ts";

export function buildQueries(context: ImageContext): string[] {
  const queries: string[] = [];

  const { subject, brand, ui_role, style, mood, composition } = context;

  const roleModifiers = getRoleModifiers(ui_role);
  const compModifiers = getCompositionModifiers(composition);
  const styleMood = `${style} ${mood}`.trim();

  // Q1: The Sniper (Exact Match)
  const q1 = `${brand || ""} ${subject} ${roleModifiers} ${compModifiers} ${styleMood}`.trim();
  queries.push(q1);

  // Q2: The Specialist (Brand + Subject)
  if (brand) {
    const q2 = `${brand} ${subject} ${roleModifiers}`.trim();
    queries.push(q2);
  }

  // Q3: The Generalist (Subject Only)
  const q3 = `${subject} ${roleModifiers}`.trim();
  queries.push(q3);

  return queries;
}

function getRoleModifiers(role: UIRole): string {
  switch (role) {
    case "hero":
      return "wide shot minimal background cinematic lighting landscape";
    case "thumbnail":
      return "centered studio shot clean";
    case "avatar":
      return "portrait headshot blurred background bokeh";
    case "background":
      return "abstract texture minimalist ambient pattern";
    default:
      return "clean high quality";
  }
}

function getCompositionModifiers(comp: any): string {
  if (!comp) return "";
  let mods = "";
  if (comp.copy_space === "left") mods += "subject on right side empty space on left ";
  if (comp.copy_space === "right") mods += "subject on left side empty space on right ";
  if (comp.framing === "wide") mods += "wide angle spacious ";
  return mods.trim();
}
