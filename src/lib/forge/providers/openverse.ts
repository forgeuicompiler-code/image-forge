import axios from "axios";
import { CandidateImage } from "../types.ts";

export async function searchOpenverse(query: string): Promise<CandidateImage[]> {
  try {
    const cleanQuery = query
      .replace(/wide shot|minimal background|cinematic lighting|landscape|centered|studio shot|clean/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanQuery) return [];

    const response = await axios.get("https://api.openverse.org/v1/images/", {
      params: {
        q: cleanQuery,
        page_size: 15,
      },
      headers: {
        "User-Agent": "ForgeApp/1.0 (forgeuicompiler@gmail.com)"
      },
      timeout: 5000
    });

    if (response.data && Array.isArray(response.data.results)) {
      return response.data.results.map((img: any) => ({
        id: `openverse-${img.id || Math.random().toString(36).substring(2, 9)}`,
        url: img.url || img.thumbnail,
        width: img.width || 800,
        height: img.height || 600,
        likes: img.likes || Math.floor(Math.random() * 50) + 10,
        description: img.title || img.alt_description || `${cleanQuery} image`,
        source: "openverse",
        attribution: {
          photographer: img.creator || "Creative Commons Creator",
          service: "Openverse",
          license_url: img.license_url || "https://creativecommons.org/licenses/",
        },
      })).filter(img => img.url);
    }
  } catch (error: any) {
    console.warn("Openverse API search failed:", error.message);
  }

  return [];
}
