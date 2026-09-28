import { defineRoom, defineServer } from "colyseus";
import { ROOM_NAME } from "@egg/shared";
import { GameRoom } from "./rooms/GameRoom.ts";

const PORT = Number(process.env.PORT ?? 2567);

const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(GameRoom),
  },
  greet: false,
});

// Optional round-trip latency simulation for testing: LATENCY=150 npm run dev
if (process.env.LATENCY) server.simulateLatency(Number(process.env.LATENCY));

await server.listen(PORT);
console.log(`[server] Egg Heist listening on ws://localhost:${PORT}`);
