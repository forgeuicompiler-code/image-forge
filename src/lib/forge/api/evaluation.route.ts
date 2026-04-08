import express from "express";
import { runEvaluation } from "../core/evaluation.ts";

const router = express.Router();

router.get("/run", async (req, res) => {
  try {
    const results = await runEvaluation();
    res.json(results);
  } catch (error) {
    console.error("Evaluation Error:", error);
    res.status(500).json({ error: "Internal server error during evaluation" });
  }
});

export default router;
