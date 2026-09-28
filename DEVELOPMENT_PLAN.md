# Egg Heist — Development Plan (Three.js + Colyseus)

A browser multiplayer egg-stealing simulator in the style of Roblox's *Steal An Egg*.
Gameplay is recreated from observation ([REFERENCE_NOTES.md](REFERENCE_NOTES.md)); **all names, models, textures, sounds and UI are original.**

Work is split into **phases**. Each phase ends with a **checkpoint**: what was built, how to test it, and what to review (including 3D models). The next phase starts only after you approve.

---

## 1. Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (client, server and shared code) |
| Repo | npm workspaces: `shared/`, `server/`, `client/` |
| Client | Vite + Three.js, DOM/CSS HUD overlay |
| Server | Node + Colyseus (authoritative room) |
| Persistence | JSON file store in dev → PostgreSQL later (Phase 4+) |
| Models | `.glb` / `.gltf` / `.fbx` loaded through a **model manifest**, so any model can be swapped without code changes |
| Mobile | Virtual joystick + touch buttons |

## 2. Architecture (short)

- **Server is authoritative** for Speed, money, eggs, pets, rolls, purchases and guardians.
- **Movement:** the client moves its own character instantly and sends its position about 20 times a second. The server **validates** each update (max distance per tick from the server-known walk speed, world bounds, walls) and **snaps back** anything illegal. Remote players are interpolated. It's simpler than full rollback netcode and cheat-resistant enough for this genre.
- **Speed stat → walk speed** via a log curve (the Speed stat reaches billions; running speed can't).
- **One room = one server** with up to 8 players, each owning a base plot in the hub.
- **All balance values** live in `shared/src/config/*`.

## 3. World layout (from reference)

```
 z →   [ HUB: bases side by side | shops | treadmills ] | SAFE ZONE line | Forest | Lake | Desert | Jungle | Snow | Volcano | Abyss | Prehistoric | Cosmic | Cherry | Titan | Celestial →
        (tall walls on both sides of one long straight corridor; biomes switch floor/wall/sky; entry banner)
```

## 4. Swapping 3D models (you supervise these)

- All models live in `client/public/models/`.
- `client/public/models/manifest.json` maps a **model id** → file plus transform:
  ```json
  { "player": { "file": "player.fbx", "scale": 0.01, "rotationY": 0, "offsetY": 0 } }
  ```
- Any id **without a file** (or with a missing file) renders as a **blocky placeholder**, so the game always runs.
- **Model Viewer:** open `http://localhost:5173/?viewer`. It lists every manifest id, shows the model on a turntable next to a 1.8 m reference figure, has sliders for scale/rotation/offset, and a **Copy JSON** button to paste back into the manifest.
- Supported formats: `.glb` (preferred), `.gltf`, `.fbx`.

---

## 5. Phases and checkpoints

### Phase 0: Project setup and model pipeline ✅ *built, awaiting your review*
- Monorepo, Colyseus server, Vite client, shared config.
- Model manifest, loader (GLB/FBX), placeholder fallback, **Model Viewer page**.
- **Checkpoint:** `npm run dev` starts both; the viewer shows `player.fbx`.

### Phase 1: Hub world, movement, multiplayer ✅ *built, awaiting your review*
- Studded blocky ground, tall checker walls, the SAFE ZONE line, 8 base plots with fences and name signs, placeholder shops.
- Third-person camera, WASD + Space jump, Shift/Slow Mode toggle, mobile joystick + jump button.
- Server-validated movement, remote interpolation, nameplates, procedural run/idle animation.
- **Checkpoint:** open 2+ tabs, walk around and see each other move smoothly; each player is assigned a base.

### Phase 2: Treadmill, Speed and core HUD ✅ *built, awaiting your review*
- Treadmill in each base: `+N/step` Speed while running on it, flying `+N` numbers.
- HUD: Speed and money (bottom-left), Shop/Index/Slow Mode (left), Egg/Paw (right), timers (bottom-right), player list (top-right).
- The Speed stat drives walk speed. Persistence (JSON store) for Speed and money.
- **Checkpoint:** train, watch your speed grow, rejoin and keep your progress.

### Phase 3: Forest biome, stealing and guardian ✅ *built, awaiting your review*
- Nests with eggs, **hold E to steal**, egg on your back, **RUN!!** banner, red vignette, Drop button, other HUD hidden.
- Guardian: sleeps (ZZ) → alert (!) → chase → hit (sound + ragdoll fling) → carries the egg back to its nest (inside its biome) or gives up (outside).
- Picking up a dropped egg re-aggroes the guardian; crossing the safe zone turns the egg into a held item.
- **Checkpoint:** steal an egg, escape or get caught; test both drop cases.

### Phase 4: Pen, incubation, hatching, pets, income ✅ *built, awaiting your review*
- Place the egg in the pen → it grows with a countdown → "Ready!" → hatch prompt → pet (with weight in Kg, rarity, mutation roll).
- Pets roam the pen with billboards (rarity/name/$ per second) and `+$` popups; automatic income.
- Active pet slots (`6/7 Active`, `+1 EQUIP`, Equip Best), Growing Eggs panel, hotbar/backpack.
- **Checkpoint:** the full loop: steal → grow → hatch → earn → rejoin with everything saved.

### Phase 5: Upgrades and menus
- Treadmill levels (visual tiers), pen levels (fence tiers), trails (movement speed ×), Sell Pets, Fuse Machine (3 same → 1 heavier), Shop (Featured egg, Speed, Money; premium currency stubbed), Pet Index (8 per biome, silhouettes, rewards, Claim All).
- **Checkpoint:** every menu works; balance values are editable in config.

### Phase 6: All biomes and world events
- The remaining biomes with their own floor, walls, sky, guardian and egg pool, plus an entry banner.
- Day/night cycle (night = egg bonus), potion event, rare-spawn announcements, soft "Speed recommended" signs.
- **Checkpoint:** run the whole corridor; every guardian works.

### Phase 7: PvP and social
- Bat hit makes the target drop their egg (not in the safe zone; cooldown).
- Offline earnings claim marker, Most Money/s leaderboard board, sortable player list, free chest.
- **Checkpoint:** a 2-player test of bat stealing and the offline claim.

### Phase 8: Polish, performance, deploy
- Instancing and LOD, sound, low/high graphics settings, mobile tuning, load test with bots, deployment.

---

## 6. Security checklist (applies from Phase 2 on)
- Validate the type and shape of every message; rate limits per message type.
- Distance/state/ownership checks against **server** state.
- All RNG on the server; drop tables never trusted from the client.
- Atomic save on delivery, hatch and purchase; money never negative.

## 7. Open items
- `player.fbx` textures (`test.png`, `small_bevel.png`) are missing, so the player renders with flat colors until they're provided.
- Premium currency name and real payments: later.
- Potion event effect: our own design (proposal: a 5-minute x2 Speed-gain boost, collectible from a spawn point).
