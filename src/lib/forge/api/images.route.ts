import express from "express";
import { resolveImage } from "../core/resolve-image.ts";

const router = express.Router();

router.post("/resolve", async (req, res) => {
  try {
    const { context, constraints } = req.body;
    
    if (!context || !context.subject) {
      return res.status(400).json({ error: "Missing context or subject" });
    }

    const result = await resolveImage({ context, constraints });
    res.json(result);
  } catch (error) {
    console.error("Forge Resolve Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
