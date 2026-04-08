import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import imageRoutes from "./src/lib/forge/api/images.route.ts";
import evaluationRoutes from "./src/lib/forge/api/evaluation.route.ts";
import aiRoutes from "./src/lib/forge/api/ai.route.ts";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.use("/api/images", imageRoutes);
  app.use("/api/evaluation", evaluationRoutes);
  app.use("/api/ai", aiRoutes);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Forge Server running on http://localhost:${PORT}`);
  });
}

startServer();
