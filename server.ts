import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import imageRoutes from "./src/lib/forge/api/images.route.ts";
import evaluationRoutes from "./src/lib/forge/api/evaluation.route.ts";
import aiRoutes from "./src/lib/forge/api/ai.route.ts";

const envResult = dotenv.config();
const isEnoent = envResult.error && (envResult.error as any).code === "ENOENT";
(global as any).envResultError = envResult.error && !isEnoent ? envResult.error.message : null;
(global as any).envResultParsed = envResult.parsed || {};
console.log("Dotenv result:", envResult);

let safeFilename = "";
try {
  if (typeof __filename !== "undefined") {
    safeFilename = __filename;
  } else if (typeof import.meta !== "undefined" && import.meta.url) {
    safeFilename = fileURLToPath(import.meta.url);
  }
} catch (err) {
  // safe fallback
}

let safeDirname = process.cwd();
try {
  if (typeof __dirname !== "undefined") {
    safeDirname = __dirname;
  } else if (safeFilename) {
    safeDirname = path.dirname(safeFilename);
  }
} catch (err) {
  // safe fallback
}

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
