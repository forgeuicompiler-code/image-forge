import express from "express";
import { verifyToken } from "../middleware/auth.ts";
import { tagCandidateServer } from "../services/ai.service.ts";

const router = express.Router();

// Governance: Rate limiting and Logging could be added here
router.post("/tag", async (req, res) => {
  try {
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({ error: "Missing description" });
    }

    // 1. Tagging (Probabilistic)
    const tags = await tagCandidateServer(description);
    res.json({ success: true, tags });
  } catch (error) {
    console.error("AI Route Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ success: false, error: message });
  }
});

router.get("/debug-env", (req, res) => {
  res.json({
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    keyLength: process.env.GEMINI_API_KEY?.length,
    keyPrefix: process.env.GEMINI_API_KEY?.substring(0, 5),
    keys: Object.keys(process.env).filter(k => k.includes("GEMINI") || k.includes("API")),
    dotenvError: (global as any).envResultError,
    dotenvParsed: (global as any).envResultParsed,
  });
});

export default router;
