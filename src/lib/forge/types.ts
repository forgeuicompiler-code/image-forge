export type ImageType = "product" | "avatar" | "hero" | "illustration" | "background";
export type UIRole = "hero" | "product" | "thumbnail" | "avatar" | "background" | "content";
export type Framing = "wide" | "centered" | "cropped";
export type CopySpace = "left" | "right" | "none";

export interface ImageContext {
  image_type: ImageType;
  subject: string;
  brand?: string;
  ui_role: UIRole;
  style?: string;
  mood?: string;
  composition?: {
    framing?: Framing;
    copy_space?: CopySpace;
  };
}

export interface ImageConstraints {
  aspect_ratio?: string;
  min_width?: number;
  color_dominance?: string;
}

export interface CandidateImage {
  id: string;
  url: string;
  width: number;
  height: number;
  likes: number;
  description: string;
  source: string;
  attribution: {
    photographer: string;
    service: string;
    license_url: string;
  };
  score?: number;
}

export interface ResolveImageResponse {
  url: string;
  confidence: number;
  match_level: "exact" | "brand" | "category" | "none";
  attribution?: CandidateImage["attribution"];
  metadata: {
    alt_text: string;
    fallback_applied: boolean;
    confidence_level?: "high" | "medium" | "low";
    reason?: string;
  };
}
