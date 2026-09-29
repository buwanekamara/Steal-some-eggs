# Egg Heist

A browser multiplayer egg-stealing simulator (Three.js + Colyseus).
Plan: [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) · Reference notes: [REFERENCE_NOTES.md](REFERENCE_NOTES.md)

## Requirements
- Node.js 20+ (tested on 24)

## Run
```bash
npm install
npm run dev
```
- Game: http://localhost:5173
- Model Viewer: http://localhost:5173/?viewer
- Game server: ws://localhost:2567

Both the client and the server restart automatically when you edit code.

## Project layout
```
shared/   config (world layout, balance), protocol, helpers — used by client and server
server/   Colyseus game server (GameRoom, state schema, test bots)
client/   Three.js game, HUD, Model Viewer
client/public/models/   3D models + manifest.json (swap models here)
```

## Useful commands
| Command | What it does |
|---|---|
| `npm run dev` | Start the server and client |
| `npm run bots` | Add 3 wandering bot players (`npm run bots -- 6` for 6) |
| `npm run test:net` | Automated checks (sync, bases, anti-cheat, treadmill, saving, tab takeover, egg heist, pen/hatching/income), prints PASS/FAIL (~1.5 min) |
| `npm run typecheck` | TypeScript check of all packages |

Bots gather in front of one base with `BOT_BASE=3 npm run bots` (PowerShell: `$env:BOT_BASE=3; npm run bots`).
Simulate network lag with `LATENCY=150 npm run dev` (PowerShell: `$env:LATENCY=150; npm run dev`).

## Content data
- Eggs, nests and guardians: `shared/src/config/eggs.ts` (egg types and spawn weights per biome, guardian speed / alert time / knockback, steal hold time, respawn timers).
- Pets, hatching, mutations, pen slots, income: `shared/src/config/pets.ts` (pet species, which pets each egg hatches and how likely, grow times, Golden/Rainbow chances, slot prices).
- World layout and biomes: `shared/src/config/world.ts`. Treadmill levels and movement: `shared/src/config/balance.ts`.

## Save data
- Each browser gets a random guest id (stored in localStorage); progress is saved on the server in `server/data/profiles/<id>.json`.
- Saved on leave, every 30 s, and when the room closes. Delete a file (or the whole folder) to reset that player.
- `?profile=alice` in the URL plays as a separate test profile. Without it, opening a second tab moves your session to the new tab.
- Dev URL flags: `?autoplay&name=X` skips the start screen, `?autotrain` walks onto your treadmill and runs by itself.
- Dev keys (not in production builds): `=` ×10 Speed, `-` reset Speed, `J` free egg in the backpack, `G` finish growing all your eggs.

## Swapping 3D models
1. Open http://localhost:5173/?viewer
2. Pick a model id on the left (e.g. `treadmillTier1`), or add a new id.
3. Drag a `.glb` / `.gltf` / `.fbx` file onto the page. It's copied into `client/public/models/` and assigned to that id.
4. Adjust **Scale** (or click *Fit to 2 units tall* for characters), **Rotation Y** (the model must face the red arrow, +Z) and **Offset Y** (feet on the ground).
5. Click **Save manifest**, then refresh the game tab.

Textures: drop a `.png` in the same way. For `player.fbx`, dropping the original `test.png` is enough; the loader finds it by file name.
Ids without a file use built-in blocky placeholders, so the game always runs.
