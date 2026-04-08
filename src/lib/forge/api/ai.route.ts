import express from "express";
import { verifyToken } from "../middleware/auth.ts";
import { tagCandidateServer, logTraceServer } from "../services/ai.service.ts";

const router = express.Router();

// Governance: Rate limiting and Logging could be added here
router.post("/tag", verifyToken, async (req, res) => {
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
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
