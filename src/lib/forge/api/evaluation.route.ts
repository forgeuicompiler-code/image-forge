import express from "express";
import { runEvaluation, autoTuneWeights } from "../core/evaluation.ts";

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

router.post("/tune", async (req, res) => {
  try {
    const results = await autoTuneWeights();
    res.json(results);
  } catch (error) {
    console.error("Tuning Error:", error);
    res.status(500).json({ error: "Internal server error during tuning" });
  }
});

export default router;
