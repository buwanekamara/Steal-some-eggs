import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { defineRoom, defineServer } from "colyseus";
import express from "express";
import { ROOM_NAME } from "@egg/shared";
import { GameRoom } from "./rooms/GameRoom.ts";

const PORT = Number(process.env.PORT ?? 2567);
/** The built client (npm run build). When it exists, the game server also serves the game page on the same port. */
const CLIENT_DIST = fileURLToPath(new URL("../../client/dist", import.meta.url));
const serveClient = fs.existsSync(`${CLIENT_DIST}/index.html`);

const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(GameRoom),
  },
  greet: false,
  express: (app) => {
    // For the host's health checks.
    app.get("/healthz", (_req, res) => {
      res.json({ ok: true });
    });
    if (serveClient) {
      // Hashed build assets can be cached for good; everything else (index.html, models/manifest.json) is re-checked.
      app.use("/assets", express.static(`${CLIENT_DIST}/assets`, { immutable: true, maxAge: "1y" }));
      app.use(express.static(CLIENT_DIST, { maxAge: 0 }));
    }
  },
});

// Optional round-trip latency simulation for testing: LATENCY=150 npm run dev
if (process.env.LATENCY) server.simulateLatency(Number(process.env.LATENCY));

await server.listen(PORT);
console.log(`[server] Egg Heist listening on port ${PORT}${serveClient ? " (serving the game at /)" : " (client not built: run the Vite dev server)"}`);
