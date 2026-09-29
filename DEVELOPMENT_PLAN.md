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

### Phase 5: Upgrades and menus ✅ *built, awaiting your review*
- Treadmill levels (visual tiers), pen levels (fence tiers), trails (movement speed ×), Sell Pets, Fuse Machine (3 same → 1 heavier), Shop (Featured egg, Speed, Money; premium currency stubbed), Pet Index (8 per biome, silhouettes, rewards, Claim All).
- **Checkpoint:** every menu works; balance values are editable in config.
- Model manifest already has `treadmillTier1-4`, `sellStall`, `fuseMachine` and `trailsShop` placeholder entries (see Open Items) — swap in real models via the Model Viewer whenever art is ready.

### Phase 6: All biomes and world events 🚧 *in progress*
- The remaining biomes with their own floor, walls, sky, guardian and egg pool, plus an entry banner.
- Day/night cycle, potion event, rare-spawn announcements, soft "Speed recommended" signs.
- **Checkpoint:** run the whole corridor; every guardian works.
- **All 12 biomes done** ✅ — forest, lake, desert, jungle, snow, volcano, abyss, prehistoric, cosmic, cherry, titan, celestial each have their own guardian, 3 eggs and 8 pets (`shared/src/config/eggs.ts`, `pets.ts`), with manifest placeholders. The Pet Index's World tab pages between all of them. A cross-validation script confirmed no id typos across the ~180 new identifiers (every hatch pool references a real pet, every biome has exactly 1 guardian / 3 eggs / 8 pets in the standard rarity spread, no duplicate ids). Verified live end-to-end from Forest through to Celestial Rift, including the corridor's end landmark.
- **Biome geometry reworked**: biomes used to be a uniform 200 units, with the guardian centered deep inside (mostly empty space around it) — per reference screenshots, biomes should read as small, mostly-open areas with the guardian/nest cluster tucked in one corner. Biomes now start short (90 units) and grow by 14 units each step down the corridor (`biomeLength()` in `shared/src/config/world.ts`), and every guardian's home is computed via `guardianHome()`: 40% into its biome, offset toward alternating walls (not centered), with a tighter nest ring (radius 6–8, was 9–12).
- **Night event done**: real day/night state (not just a decorative countdown) — when night falls, every biome is sealed off by a physical barrier at the corridor mouth, players out in a biome are pulled back to their base (dropping any carried egg), and movement into the corridor is rejected server-side until night ends. Eggs growing in the pen hatch `WORLD_EVENTS.nightGrowMult` (30) times faster while it's night, with remaining grow time rescaled live at the transition so it stays consistent whether an egg was planted before or during the night. Night duration shortened from 45s to 20s (`WORLD_EVENTS.nightDurationSec`) so it reads as a quick event rather than a long lockdown.
- **Potion event done**: our own design per the Open Items proposal — a pickup spawns once every `WORLD_EVENTS.potionEverySec` (15 min) at a new hub spot (`HUB_BUILDINGS.potion`, between the Fuse Machine and Trails Shop) and waits there — visible, with a "Claim (x2 Speed)" prompt — until a player claims it, granting the same x2 Speed-gain boost as the Shop's boost items for `WORLD_EVENTS.potionBoostMin` (5) minutes. The HUD's potion timer swaps from a countdown to a green "Ready!" while it's waiting. Verified live: spawn → prompt → claim → boost applied (⚡ widget lit up) → pickup hidden → timer resets.
- Remaining: rare-spawn announcements, and biome decoration (only Forest has scattered trees/bushes so far — the rest are bare floor + guardian cluster, matching the reference's sparse look, but could use a prop or two per biome later). Speed-recommended signs already exist (biome-entry gate boards show "X recommended").

### Phase 7: PvP and social ✅ *built, awaiting your review*
- Bat hit makes the target drop their egg (not in the safe zone; cooldown).
- Offline earnings claim marker, Most Money/s leaderboard board, sortable player list, free chest.
- **Checkpoint:** a 2-player test of bat stealing and the offline claim.
- **Bat hit**: swing at the nearest player within range and roughly in front of you — carrying or not, so two players racing for the same egg can fight over it before either one's holding it (`shared/src/config/balance.ts` `PVP`: 4-unit range, 60° arc, 3s cooldown). Reuses the exact same drop/knockback/stun pipeline the guardian already uses (`HeistSystem.drop`, `GameRoom.knock`), so the target gets the same ragdoll fling; `KnockMsg` gained an optional `by` field (whose bat/trap) and a `droppedEgg` flag, so the toast only claims "You dropped your egg" when that's actually true — getting bapped or trapped empty-handed still knocks you down, just without the false claim.
- **10-slot hotbar + items** (per your reference screenshots): one hotbar (keys 1–9, 0; click/tap; gamepad LB/RB) holds eggs, benched pets, baseball bats and bear-trap stacks — `Profile.hotbar` (10 item uids) and `Profile.tools` (owned bats / trap stacks with ids) are saved; the rules live in `server/src/systems/Inventory.ts`. Newly obtained items (secured eggs, shop eggs/tools, fused and dev pets) go to the first free slot, stack onto an existing trap stack first, and otherwise just stay in the inventory — inventory has no size cap, so nothing is ever deleted for lack of space and no pending-rewards fallback was needed. Every profile gets a starter bat + 3 traps once (old saves included, so nobody lost the tools they had); more are in the Shop's new Gear tab. Selecting a slot holds that item (`PlayerState.selectedSlot`/`equipped`/`equippedUid`/`equippedModel`, visible to everyone in your hand); `MSG.Use` (F, gamepad X/RT, the touch action button that appears labelled "Swing"/"Place") is routed **server-side** by the held item's type: egg → plant in your pen, pet → put in your pen, bat → swing, trap → place. Whenever the profile changes, the hotbar drops slots whose item is gone and the hand follows (`PenSystem.sendInventory`).
- **Backpack ("All Items")**: 🎒 in the new top-left bar (next to ☰, which toggles the controls help) / B / gamepad Y. Pets · Eggs · Gear tabs down the left, a count and a search box, and a grid of everything in the inventory (not on the hotbar, pets not in the pen) — `client/src/ui/Backpack.ts`. Drag an item onto a hotbar slot to put it there, drag slots onto each other to swap, drag a slot back onto the grid to take it off the hotbar (pointer events, so mouse and touch work the same); a plain click/tap sends an item to the first free slot, and ✕ on a slot sends it back. The hotbar is translucent and only shows filled slots (keeping each item's key number) until the backpack is open, when all 10 show as drop targets. The right-side panel (🥚 / 🐾 buttons) is now just pen management: active pets, Equip / Unequip / Equip Best, buying pen slots, growing eggs. Pets in the pen aren't hotbar items; unequipping one sends it to the inventory.
- **Bat** (`PVP`): server checks ownership, not stunned, cooldown (a miss still uses it; `MSG.Cooldown` drives the slot's countdown curtain), safe zone, then the hitbox (range × arc) against players *and* guardians (bigger hitbox via `guardianHitPadding`). Players get the existing knockback/ragdoll/egg-drop; a guardian is dazed for `guardianStunSec` (frozen, 💫 over its head) and drops an egg it was carrying home. Every behavior has a config flag (`hitsPlayers`, `hitsGuardians`, `blockedInSafeZone`).
- **Bear trap** (`TRAP`): holding one shows a placement preview in front of you (green/red ring, `TrapPreview`); Use sends that spot and the server re-validates everything — owned & held, within `placeRange`, inside the walls on flat ground, not in the safe zone, not at night, `minSpacing` from other traps, under `maxActive` per player — before taking one from the stack. The first valid target to step in (players; guardians too via `affectsGuardians`; never its owner unless `ownerCanTrigger`) is immobilized and drops its egg through the same drop path the guardian uses; one trigger per trap, then it's consumed (or refunded with `afterTrigger: "return"`). Unset traps expire after `lifetimeSec`; leaving the game removes your traps (unused ones stay in your saved inventory). The old recharging trap charges are gone — traps are now finite items.
- **Selling and fusing only from the inventory**: pets standing in the pen and anything on the hotbar can't be sold or fused (server-enforced via `whyNotInInventory`, with a message saying what to do; the Sell/Fuse menus only list eligible items and note how many are held back). Unhatched eggs can now be sold too, for `eggSellValue` = the $/s their average hatch would earn × `EGG_SELL_MULT` (50, half the pet multiplier). A fused pet is a new item, so it goes to the first free hotbar slot.
- **Planting / pets**: the old "hold E in your pen" planting prompt is gone — hold the egg from the hotbar and Use it in your pen. Backpack eggs gained a stable `uid` (backfilled for old saves). Benched pets can be held the same way and placed into the pen with Use.
- **Not built, because the project has no such system yet**: pending-reward storage (not needed without inventory caps), beginner protection, teams/teammate trap rules, and item locking. Gamepad support was added from scratch in `Input` (standard mapping: left stick move, right stick camera, A jump, X/RT use, LB/RB hotbar, Y inventory, B close).
- **Night shortened**: `WORLD_EVENTS.nightDurationSec` 45 → 20, per your ask.
- **Offline earnings**: your pen income keeps paying out at half rate while you're away (`OFFLINE`: 50% rate, 4h cap, 60s minimum gap so a quick reconnect doesn't pop it). Landing on `PlayerState.offlineEarnings`, shown to just that player as a "Welcome back!" banner with a Claim button (`Hud.showOfflineClaim`) until they claim it. Verified live: parked a profile with 3 equipped pets, rewound its saved `lastSeen` by 2 hours on disk, rejoined, and got the correctly-computed banner ("$10.8K"); claiming credited the money and hid the banner.
- **Most Money/s leaderboard**: the previously decorative sign now shows the room's real top 3 earners, refreshed a few times a second straight from the already-synced `PlayerState.income` (`World.setLeaderboard`, no new protocol needed — it's a client-only view over existing state).
- **Sortable player list**: the People/Money-s/Speed headers are clickable (`Hud`), toggling ascending/descending with a ▲/▼ indicator on the active column; defaults to Money/s descending.
- **Free chest**: a new hub building (`HUB_BUILDINGS.chest`, at the end of the shop row) any player can hold-E to open every `CHEST.cooldownMin` (20) minutes for $100–400 (`CHEST`) plus a 20% chance of +5 Gems; per-player cooldown persists in the profile (`Profile.nextChestAt`) and shows a live countdown via the existing inventory snapshot (`InventoryMsg.chestReadyIn`), same pattern as the x2 Speed boost timer. Added to the permanent suite: claims once (fresh profiles start ready), asserts the reward is in range by parsing the notify text (so a same-tick pen-income payout can't skew the check), then asserts a second claim within the cooldown is silently refused.
- Full automated suite (`npm run test:net`) passes clean — it now also covers the starter kit, slot swapping/moving without duplicates, rejecting made-up items, bat cooldown anti-spam, bapping and trapping a guardian, trap range/limit/stack-to-zero/buying more, holding a pet and placing it, trap cleanup on leave, and the hotbar + tools surviving a rejoin.

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
- Phase 5 models still render as blocky placeholders: `treadmillTier1-4`, `sellStall`, `fuseMachine`, `trailsShop`. Reference screenshots for these (treadmill tier progression, SELL/Trails stall look) are on hand for whoever builds the art.
- Phase 7's `leaderboard`, `chest`, `bat` and `trap` models are also still blocky placeholders (see `manifest.json`). Held items sit in a fixed hand slot rather than following an arm bone.
