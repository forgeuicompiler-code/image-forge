import express from "express";
import { verifyToken } from "../middleware/auth.ts";
import { tagCandidateServer, auditCandidateImageServer, auditPageStatusServer } from "../services/ai.service.ts";

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

router.post("/audit", async (req, res) => {
  try {
    const { imageUrl, requestedSubject, candidateDescription } = req.body;

    if (!imageUrl || !requestedSubject) {
      return res.status(400).json({ error: "Missing imageUrl or requestedSubject" });
    }

    const audit = await auditCandidateImageServer(imageUrl, requestedSubject, candidateDescription || "");
    res.json({ success: true, audit });
  } catch (error) {
    console.error("AI Image Audit Route Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ success: false, error: message });
  }
});

router.post("/page-status", async (req, res) => {
  try {
    const { subject, brand, uiRole, candidates } = req.body;

    if (!subject || !candidates) {
      return res.status(400).json({ error: "Missing subject or candidates list" });
    }

    const report = await auditPageStatusServer(subject, brand || "", uiRole || "hero", candidates);
    res.json({ success: true, report });
  } catch (error) {
    console.error("AI Page Status Audit Route Error:", error);
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
