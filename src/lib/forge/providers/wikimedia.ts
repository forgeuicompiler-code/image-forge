import axios from "axios";
import { CandidateImage } from "../types.ts";

export async function searchWikimedia(query: string): Promise<CandidateImage[]> {
  try {
    // Clean query from visual/layout artifacts to get accurate subject matches
    const cleanQuery = query
      .replace(/wide shot|minimal background|cinematic lighting|landscape|centered|studio shot|clean|bokeh|portrait/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanQuery) return [];

    const response = await axios.get("https://commons.wikimedia.org/w/api.php", {
      params: {
        action: "query",
        generator: "search",
        gsrsearch: `filetype:bitmap ${cleanQuery}`,
        gsrnamespace: 6, // File namespace
        prop: "imageinfo",
        iiprop: "url|size",
        format: "json",
        origin: "*"
      },
      headers: {
        "User-Agent": "ForgeApp/1.0 (forgeuicompiler@gmail.com; contact in workspace)"
      },
      timeout: 5000
    });

    const pages = response.data?.query?.pages;
    if (!pages) {
      return [];
    }

    return Object.values(pages).map((page: any) => {
      const info = page.imageinfo?.[0];
      if (!info || !info.url) return null;

      // Extract a nice user-friendly description from the file name
      const description = page.title
        .replace(/^File:/, "")
        .replace(/\.[^/.]+$/, "") // strip extension
        .replace(/_/g, " ")       // replace underscores with spaces
        .replace(/\s+/g, " ")
        .trim();

      return {
        id: `wikimedia-${page.pageid}`,
        url: info.url,
        width: info.width || 800,
        height: info.height || 600,
        likes: Math.floor(Math.random() * 30) + 15, // Simulate likes since wikimedia doesn't have a direct equivalent
        description: description || `${cleanQuery} image`,
        source: "wikimedia",
        attribution: {
          photographer: "Wikimedia Commons Contributor",
          service: "Wikimedia Commons",
          license_url: info.descriptionurl || "https://commons.wikimedia.org/",
        },
      };
    }).filter((img): img is CandidateImage => img !== null);
  } catch (error: any) {
    console.warn("Wikimedia Commons API error:", error.message);
    return [];
  }
}
