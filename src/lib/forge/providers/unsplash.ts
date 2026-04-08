import axios from "axios";
import { CandidateImage } from "../types.ts";

export async function searchUnsplash(query: string): Promise<CandidateImage[]> {
  const apiKey = process.env.UNSPLASH_ACCESS_KEY;

  if (!apiKey) {
    console.warn("UNSPLASH_ACCESS_KEY not found. Returning mock data.");
    return getMockData(query);
  }

  try {
    const response = await axios.get("https://api.unsplash.com/search/photos", {
      params: {
        query,
        per_page: 30,
        orientation: "landscape",
      },
      headers: {
        Authorization: `Client-ID ${apiKey}`,
      },
    });

    return response.data.results.map((img: any) => ({
      id: img.id,
      url: img.urls.regular,
      width: img.width,
      height: img.height,
      likes: img.likes,
      description: img.alt_description || img.description || "",
      source: "unsplash",
      attribution: {
        photographer: img.user.name,
        service: "Unsplash",
        license_url: "https://unsplash.com/license",
      },
    }));
  } catch (error) {
    console.error("Unsplash API error:", error);
    return [];
  }
}

function getMockData(query: string): CandidateImage[] {
  // Return some picsum images as mock candidates
  return Array.from({ length: 5 }).map((_, i) => ({
    id: `mock-${i}`,
    url: `https://picsum.photos/seed/${query.replace(/\s/g, "")}-${i}/800/600`,
    width: 800,
    height: 600,
    likes: 10 + i * 5,
    description: `Mock image for ${query}`,
    source: "mock",
    attribution: {
      photographer: "Mock Photographer",
      service: "Mock Service",
      license_url: "#",
    },
  }));
}
