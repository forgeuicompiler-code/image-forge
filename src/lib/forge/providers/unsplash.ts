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
  const queryLower = query.toLowerCase();
  
  // Controlled Simulation Scenarios
  const scenarios = [
    {
      id: "sim-1",
      description: `${query} - high quality studio shot centered`,
      likes: 150,
      quality_boost: 1.2
    },
    {
      id: "sim-2",
      description: `${query} - wide cinematic landscape minimal`,
      likes: 80,
      quality_boost: 1.0
    },
    {
      id: "sim-3",
      description: `${query} - portrait headshot bokeh`,
      likes: 45,
      quality_boost: 0.8
    },
    {
      id: "sim-4",
      description: `${query} - abstract texture pattern`,
      likes: 20,
      quality_boost: 0.5
    },
    {
      id: "sim-5",
      description: `Irrelevant object unrelated to ${query}`,
      likes: 10,
      quality_boost: 0.3
    }
  ];

  return scenarios.map((s, i) => ({
    id: s.id,
    url: `https://picsum.photos/seed/${query.replace(/\s/g, "")}-${i}/800/600`,
    width: 800,
    height: 600,
    likes: s.likes,
    description: s.description,
    source: "mock_simulator",
    attribution: {
      photographer: `Simulator Agent ${i}`,
      service: "Forge Mock Engine",
      license_url: "#",
    },
  }));
}
