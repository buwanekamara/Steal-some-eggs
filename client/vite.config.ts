import { defineConfig, type Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODELS_DIR = fileURLToPath(new URL("./public/models", import.meta.url));
const MODEL_EXT = /\.(glb|gltf|fbx|png|jpg|jpeg|bin)$/i;

function readBody(req: import("node:http").IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Dev-only endpoints used by the Model Viewer (?viewer):
 *   GET  /__dev/files             → model/texture files in client/public/models
 *   POST /__dev/manifest          body = manifest JSON → client/public/models/manifest.json
 *   POST /__dev/upload?name=x.glb body = file bytes    → client/public/models/x.glb
 */
function modelDevApi(): Plugin {
  return {
    name: "egg-model-dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method === "GET" && req.url === "/__dev/files") {
          const files = fs.readdirSync(MODELS_DIR).filter((f) => MODEL_EXT.test(f));
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(files));
          return;
        }
        if (req.method !== "POST" || !req.url?.startsWith("/__dev/")) return next();
        try {
          const url = new URL(req.url, "http://localhost");
          const body = await readBody(req);
          if (url.pathname === "/__dev/manifest") {
            const parsed = JSON.parse(body.toString("utf8"));
            fs.writeFileSync(path.join(MODELS_DIR, "manifest.json"), JSON.stringify(parsed, null, 2) + "\n");
            res.end("ok");
            return;
          }
          if (url.pathname === "/__dev/upload") {
            const name = path.basename(url.searchParams.get("name") ?? "");
            if (!MODEL_EXT.test(name)) throw new Error("unsupported file type");
            fs.writeFileSync(path.join(MODELS_DIR, name), body);
            res.end(name);
            return;
          }
          next();
        } catch (e) {
          res.statusCode = 400;
          res.end(String(e));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [modelDevApi()],
  server: { port: 5173 },
});
