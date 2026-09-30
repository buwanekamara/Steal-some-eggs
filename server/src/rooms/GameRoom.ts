import { Room, type Client } from "colyseus";
import {
  Anim,
  CHEST,
  CLOSE,
  HUB_BUILDINGS,
  MAX_PLAYERS,
  MOVEMENT,
  MSG,
  NETWORK,
  OFFLINE,
  PVP,
  SAFE_ZONE_Z,
  SAVE,
  TRAP,
  TREADMILL,
  USE_RANGE,
  MIN_TRAPS_ON_JOIN,
  WORLD_EVENTS,
  basePlot,
  GUARDIANS,
  OFFLINE_CASH_SERVER_RADIUS,
  offlineCashSpot,
  clampToWorld,
  formatShort,
  groundHeightAt,
  isOnBelt,
  newUid,
  sanitizeName,
  treadmillLevel,
  trailMult,
  useSpot,
  walkSpeedFromStat,
  biomeSpeedMult,
  type CooldownMsg,
  type CorrectMsg,
  type UseMsg,
  type JoinOptions,
  type KnockMsg,
  type MoveMsg,
  type NotifyMsg,
  type ShopBuyMsg,
  type SecuredMsg,
} from "@egg/shared";
import { JsonFileProfileStore, isValidProfileId, type Profile, type ProfileStore } from "../persistence/ProfileStore.ts";
import { GameState, PlayerState, TrapState } from "../schema/GameState.ts";
import { HeistSystem } from "../systems/HeistSystem.ts";
import { PenSystem } from "../systems/PenSystem.ts";
import { ProgressSystem } from "../systems/ProgressSystem.ts";
import { consumeTool, grantTool, resolveItem, stash } from "../systems/Inventory.ts";

/** Server-side bookkeeping that is not synced to clients. */
interface PlayerMeta {
  profileId: string;
  profile: Profile;
  lastMoveAt: number;
  lastSaveAt: number;
  /** Fractional steps carried between ticks. */
  stepAccum: number;
  /** Set when another tab took over this profile; that session already saved. */
  released: boolean;
  /** While knocked back (ms timestamp): no actions, and bigger moves are allowed. */
  knockUntil: number;
  knockSpeed: number;
  /** Server-side knockback flight (same physics as the client): horizontal + vertical velocity while stunned. */
  knockV: { x: number; z: number; y: number };
  /** Next time (ms timestamp) this player's bat is ready to swing again. */
  batReadyAt: number;
}

/** Testing shortcuts; disabled when NODE_ENV=production. */
const DEV_CHEATS = process.env.NODE_ENV !== "production";

const TICK_MS = 50;
const PERF_EVERY_SEC = 10;
/** A player whose last move message is older than this counts as idle. */
const INPUT_STALE_MS = 250;
const SERVER_START = Date.now();

const store: ProfileStore = new JsonFileProfileStore();

/**
 * One live session per profile across all rooms in this process.
 * The value saves that session and disconnects it (used when the profile joins again elsewhere).
 */
const activeSessions = new Map<string, () => Promise<void>>();

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * One shared world: up to 8 players, each owning a base plot in the hub.
 * Movement is client-driven but validated here; Speed, money and progress are server-owned and saved.
 */
export class GameRoom extends Room<{ state: GameState }> {
  maxClients = MAX_PLAYERS;
  maxMessagesPerSecond = 60;
  state = new GameState();

  private meta = new Map<string, PlayerMeta>();
  private heist = new HeistSystem(this.state, {
    knock: (id, msg) => this.knock(id, msg),
    secured: (id, def, size) => {
      const m = this.meta.get(id);
      const p = this.state.players.get(id);
      if (!m || !p) return;
      const eggUid = newUid("e");
      m.profile.eggs.push({ uid: eggUid, defId: def.id, size, obtainedAt: Date.now() });
      stash(m.profile, eggUid);
      m.profile.stats.eggsSecured++;
      p.eggCount = m.profile.eggs.length;
      const msg: SecuredMsg = { defId: def.id, size, total: p.eggCount };
      this.clients.getById(id)?.send(MSG.Secured, msg);
      this.pens.eggsChanged(id);
      void this.saveProfile(id); // valuable transaction: save right away
    },
    canAct: (id) => (this.meta.get(id)?.knockUntil ?? 0) < Date.now(),
  });
  private pens = new PenSystem({
    inventory: (id, msg) => this.clients.getById(id)?.send(MSG.Inventory, msg),
    hatched: (id, msg) => this.clients.getById(id)?.send(MSG.Hatched, msg),
    fused: (id, msg) => this.clients.getById(id)?.send(MSG.Fused, msg),
    notify: (id, text, kind) => {
      const c = this.clients.getById(id);
      if (c) this.notify(c, text, kind);
    },
    save: (id) => void this.saveProfile(id),
  });
  private progress = new ProgressSystem(this.pens, {
    notify: (id, text, kind) => {
      const c = this.clients.getById(id);
      if (c) this.notify(c, text, kind);
    },
  });

  onCreate() {
    // So it is obvious in the server log which guardian speeds this process is actually using (restart after editing shared config).
    console.log("[guardians] chase speeds:", GUARDIANS.map((g) => `${g.biome} ${g.chaseSpeed}`).join(", "));
    this.onMessage(MSG.Move, (client, msg: MoveMsg) => this.handleMove(client, msg));
    this.onMessage(MSG.SlowMode, (client, on: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p && typeof on === "boolean") p.slowMode = on;
    });
    this.onMessage(MSG.Steal, (client, eggId: unknown) => {
      const err = this.heist.steal(client.sessionId, eggId);
      if (err) return this.notify(client, `Can't grab that: ${err}`, "bad");
      const m = this.meta.get(client.sessionId);
      if (m) m.profile.stats.eggsStolen++;
    });
    this.onMessage(MSG.Drop, (client) => this.heist.drop(client.sessionId));
    this.heist.init();

    this.onMessage(MSG.Hatch, (client, id: unknown) => this.pens.hatch(client.sessionId, id));
    this.onMessage(MSG.Equip, (client, id: unknown) => this.pens.equip(client.sessionId, id, true));
    this.onMessage(MSG.Unequip, (client, id: unknown) => this.pens.equip(client.sessionId, id, false));
    this.onMessage(MSG.EquipBest, (client) => this.pens.equipBest(client.sessionId));
    this.onMessage(MSG.BuySlot, (client) => this.pens.buySlot(client.sessionId));
    /** The client asks for its inventory once its message handlers are ready. */
    this.onMessage(MSG.Inventory, (client) => this.pens.eggsChanged(client.sessionId));
    this.clock.setInterval(() => this.pens.tickSecond(), 1000);

    this.onMessage(MSG.UpgradeTreadmill, (client) => this.progress.upgradeTreadmill(client.sessionId));
    this.onMessage(MSG.UpgradePen, (client) => this.progress.upgradePen(client.sessionId));
    this.onMessage(MSG.BuyTrail, (client, id: unknown) => this.progress.buyTrail(client.sessionId, id));
    this.onMessage(MSG.EquipTrail, (client, id: unknown) => this.progress.equipTrail(client.sessionId, id));
    this.onMessage(MSG.Sell, (client, uids: unknown) => this.pens.sell(client.sessionId, uids));
    this.onMessage(MSG.Fuse, (client, uids: unknown) => this.pens.fuse(client.sessionId, uids));
    this.onMessage(MSG.ShopBuy, (client, msg: unknown) => this.progress.shopBuy(client.sessionId, typeof msg === "object" && msg ? (msg as ShopBuyMsg) : undefined));
    this.onMessage(MSG.ClaimIndex, (client, which: unknown) => this.progress.claimIndex(client.sessionId, which));
    this.onMessage(MSG.ClaimPotion, (client) => this.claimPotion(client));
    this.onMessage(MSG.ClaimChest, (client) => this.claimChest(client));
    this.onMessage(MSG.ClaimOffline, (client) => this.claimOffline(client));
    this.onMessage(MSG.SelectSlot, (client, slot: unknown) => this.pens.select(client.sessionId, slot));
    this.onMessage(MSG.HotbarSet, (client, msg: unknown) => this.pens.hotbarSet(client.sessionId, msg));
    this.onMessage(MSG.HotbarClear, (client, slot: unknown) => this.pens.hotbarClear(client.sessionId, slot));
    this.onMessage(MSG.HotbarSwap, (client, msg: unknown) => this.pens.hotbarSwap(client.sessionId, msg));
    this.onMessage(MSG.Use, (client, msg: unknown) => this.useItem(client, typeof msg === "object" && msg ? (msg as UseMsg) : {}));

    if (DEV_CHEATS) {
      this.onMessage(MSG.DevSpeed, (client, action: unknown) => {
        const p = this.state.players.get(client.sessionId);
        if (!p) return;
        p.speedStat = action === "up" ? Math.min(1e12, p.speedStat * 10 + 10) : 0;
      });
      this.onMessage(MSG.DevToggleNight, () => this.devToggleNight());
      this.onMessage(MSG.DevGrow, (client) => this.pens.devGrow(client.sessionId));
      this.onMessage(MSG.DevEgg, (client) => this.pens.devEgg(client.sessionId));
      this.onMessage(MSG.DevMoney, (client) => this.progress.devMoney(client.sessionId));
      this.onMessage(MSG.DevGems, (client) => this.progress.devGems(client.sessionId));
      this.onMessage(MSG.DevPet, (client, species: unknown) => this.progress.devPet(client.sessionId, species));
    }

    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), TICK_MS);
    this.clock.setInterval(() => this.saveAll(), SAVE.autosaveSec * 1000);
    if (process.env.PERF) this.clock.setInterval(() => this.reportPerf(), PERF_EVERY_SEC * 1000);
    this.updateWorldTimers();
  }

  async onJoin(client: Client, options: JoinOptions = {}) {
    const profileId = options.profileId;
    if (!isValidProfileId(profileId)) throw new Error("invalid profile id");

    // Same profile already playing (another tab/device)? Save and disconnect it first.
    const previous = activeSessions.get(profileId);
    if (previous) await previous();

    const requestedName = typeof options.name === "string" && options.name.trim() ? sanitizeName(options.name) : null;
    const profile = await store.load(profileId, requestedName ?? sanitizeName(""));
    if (requestedName) profile.name = requestedName;

    const baseIndex = this.freeBaseIndex();
    const plot = basePlot(baseIndex);
    const p = new PlayerState();
    p.name = profile.name;
    p.baseIndex = baseIndex;
    p.x = plot.spawn.x;
    p.z = plot.spawn.z;
    p.speedStat = profile.speedStat;
    p.money = profile.money;
    p.treadmillLevel = profile.treadmillLevel;
    p.eggCount = profile.eggs.length;
    this.state.players.set(client.sessionId, p);

    const now = Date.now();
    const meta: PlayerMeta = { profileId, profile, lastMoveAt: now, lastSaveAt: now, stepAccum: 0, released: false, knockUntil: 0, knockSpeed: 0, knockV: { x: 0, z: 0, y: 0 }, batReadyAt: 0 };
    this.meta.set(client.sessionId, meta);
    this.topUpTraps(profile, now);
    this.pens.attach(client.sessionId, p, profile);

    // Offline earnings: your pen income kept paying out (at a reduced rate) while you were away.
    const offlineSec = Math.min(OFFLINE.maxHours * 3600, Math.max(0, (now - profile.lastSeen) / 1000));
    if (offlineSec >= OFFLINE.minSec && p.income > 0) p.offlineEarnings = Math.round(p.income * offlineSec * OFFLINE.rate);

    activeSessions.set(profileId, async () => {
      await this.saveProfile(client.sessionId);
      meta.released = true;
      client.leave(CLOSE.TakenOver, "You joined from another tab or device.");
    });

    console.log(`[room ${this.roomId}] ${p.name} joined → base ${baseIndex} (speed ${p.speedStat}, $${p.money})`);
  }

  async onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    const m = this.meta.get(client.sessionId);
    this.heist.playerLeft(client.sessionId);
    // Their traps leave with them; any that are still set go back into their stack (saved just below).
    this.state.traps.forEach((t, id) => {
      if (t.ownerId !== client.sessionId) return;
      this.state.traps.delete(id);
      if (m) grantTool(m.profile, "trap", 1, Date.now());
    });
    if (m && !m.released) {
      await this.saveProfile(client.sessionId);
      activeSessions.delete(m.profileId);
    }
    this.pens.detach(client.sessionId);
    console.log(`[room ${this.roomId}] ${p?.name ?? client.sessionId} left`);
    this.state.players.delete(client.sessionId);
    this.meta.delete(client.sessionId);
  }

  async onDispose() {
    await this.saveAll();
  }

  /** Every game starts with at least MIN_TRAPS_ON_JOIN bear traps, and one trap stack on the hotbar. */
  private topUpTraps(profile: Profile, now: number) {
    const have = profile.tools.filter((t) => t.kind === "trap").reduce((n, t) => n + t.qty, 0);
    if (have < MIN_TRAPS_ON_JOIN) grantTool(profile, "trap", MIN_TRAPS_ON_JOIN - have, now);
    const stacks = profile.tools.filter((t) => t.kind === "trap" && t.qty > 0);
    if (!stacks.length || stacks.some((t) => profile.hotbar.includes(t.uid))) return;
    // Not on the hotbar: first free slot, or the last slot if it's full (whatever was there just goes back to the backpack).
    const free = profile.hotbar.indexOf("");
    profile.hotbar[free >= 0 ? free : profile.hotbar.length - 1] = stacks[0].uid;
  }

  // ------------------------------------------------------------------ simulation

  private tick(dt: number) {
    const t0 = performance.now();
    this.state.players.forEach((p, sessionId) => {
      const m = this.meta.get(sessionId);
      if (!m) return;
      // Knocked state is server-driven for the whole stun; it ends when the stun does.
      if (Date.now() < m.knockUntil) {
        p.anim = Anim.Knocked;
        this.flyKnocked(p, m, dt);
      } else if (p.anim === Anim.Knocked) p.anim = Anim.Idle;
      this.train(p, m, dt);
    });
    this.heist.tick(dt);
    this.tickTraps();
    this.updateWorldTimers();
    const ms = performance.now() - t0;
    this.perf.ticks++;
    this.perf.tickMs += ms;
    this.perf.maxMs = Math.max(this.perf.maxMs, ms);
  }

  /** Simulation cost and traffic, reported every PERF_EVERY_SEC when the server runs with PERF=1 (load testing). */
  private perf = { ticks: 0, tickMs: 0, maxMs: 0, moves: 0 };

  private reportPerf() {
    const { ticks, tickMs, maxMs, moves } = this.perf;
    const heap = process.memoryUsage().heapUsed / 1024 / 1024;
    console.log(
      `[perf room ${this.roomId}] ${this.state.players.size} players · tick avg ${(tickMs / Math.max(1, ticks)).toFixed(2)} ms, max ${maxMs.toFixed(2)} ms (budget ${TICK_MS} ms) · ${(moves / PERF_EVERY_SEC).toFixed(0)} moves/s · heap ${heap.toFixed(0)} MB`,
    );
    this.perf = { ticks: 0, tickMs: 0, maxMs: 0, moves: 0 };
  }

  private sessionOf(p: PlayerState) {
    for (const [id, s] of this.state.players) if (s === p) return id;
    return "";
  }

  /**
   * The server flies a knocked player along the knockback itself (same drag and gravity as their own game), so everyone sees
   * the throw even when the victim's window is throttled and isn't sending positions.
   */
  private flyKnocked(p: PlayerState, m: PlayerMeta, dt: number) {
    const v = m.knockV;
    const ground = groundHeightAt(p.x, p.z);
    const grounded = p.y <= ground + 0.001 && v.y <= 0;
    p.x += v.x * dt;
    p.z += v.z * dt;
    const drag = Math.exp(-dt * (grounded ? 7 : 0.8));
    v.x *= drag;
    v.z *= drag;
    v.y -= MOVEMENT.gravity * dt;
    p.y += v.y * dt;
    const floor = groundHeightAt(p.x, p.z);
    if (p.y <= floor) {
      p.y = floor;
      v.y = 0;
    }
    const c = clampToWorld(p.x, p.z);
    p.x = c.x;
    p.z = c.z;
  }

  private knock(sessionId: string, msg: KnockMsg) {
    const m = this.meta.get(sessionId);
    if (!m) return;
    m.knockUntil = Date.now() + msg.stunMs;
    m.knockSpeed = Math.hypot(msg.vx, msg.vz);
    m.knockV = { x: msg.vx, z: msg.vz, y: msg.vy };
    // The server marks the victim as knocked itself, so everyone else sees the ragdoll even if the victim's own game
    // isn't sending updates (e.g. its browser tab is in the background).
    const victim = this.state.players.get(sessionId);
    if (victim) victim.anim = Anim.Knocked;
    m.profile.stats.timesCaught++;
    this.clients.getById(sessionId)?.send(MSG.Knock, msg);
  }

  private notify(client: Client, text: string, kind: NotifyMsg["kind"] = "info") {
    const msg: NotifyMsg = { text, kind };
    client.send(MSG.Notify, msg);
  }

  /** Treadmill: running on your own belt earns Speed at a fixed step rate (server-timed, so it can't be sped up). */
  private train(p: PlayerState, m: PlayerMeta, dt: number) {
    // Needs live input: a paused/backgrounded client stops sending moves and stops training.
    const active = Date.now() - m.lastMoveAt < INPUT_STALE_MS;
    p.training = active && p.anim === Anim.Run && isOnBelt(p.baseIndex, p.x, p.y, p.z);
    if (!p.training) {
      m.stepAccum = 0;
      return;
    }
    m.stepAccum += dt * TREADMILL.stepsPerSecond;
    const steps = Math.floor(m.stepAccum);
    if (steps <= 0) return;
    m.stepAccum -= steps;
    p.speedStat += steps * treadmillLevel(p.treadmillLevel).gainPerStep * this.progress.boostMult(this.sessionOf(p));
    m.profile.stats.steps += steps;
  }

  /** Which potionEverySec cycle we've last spawned the potion for (-1 = none yet). */
  private potionCycleSeen = -1;

  /** Dev-only: ms added to the day/night clock so the debug button can jump straight to the other phase. */
  private nightShiftMs = 0;

  private nightCyclePos() {
    return (((Date.now() - SERVER_START + this.nightShiftMs) / 1000) % WORLD_EVENTS.nightEverySec + WORLD_EVENTS.nightEverySec) % WORLD_EVENTS.nightEverySec;
  }

  /** Dev-only: skip to the start of night (if it's day) or the start of day (if it's night). */
  private devToggleNight() {
    const pos = this.nightCyclePos();
    const target = this.state.isNight ? WORLD_EVENTS.nightDurationSec : WORLD_EVENTS.nightEverySec;
    this.nightShiftMs += (target - pos) * 1000 + 50;
  }

  private updateWorldTimers() {
    const elapsed = (Date.now() - SERVER_START) / 1000;
    const cyclePos = this.nightCyclePos();
    const wasNight = this.state.isNight;
    this.state.isNight = cyclePos < WORLD_EVENTS.nightDurationSec;
    this.state.nightIn = Math.ceil(this.state.isNight ? WORLD_EVENTS.nightDurationSec - cyclePos : WORLD_EVENTS.nightEverySec - cyclePos);
    if (wasNight !== this.state.isNight) {
      this.pens.setNight(this.state.isNight);
      if (this.state.isNight) this.beginNight();
    }

    const potionElapsed = elapsed + WORLD_EVENTS.potionOffsetSec;
    this.state.potionIn = Math.ceil(WORLD_EVENTS.potionEverySec - (potionElapsed % WORLD_EVENTS.potionEverySec));
    const potionCycle = Math.floor(potionElapsed / WORLD_EVENTS.potionEverySec);
    if (potionCycle !== this.potionCycleSeen) {
      this.potionCycleSeen = potionCycle;
      this.state.potionAvailable = true; // freshly spawned; stays true until someone claims it
    }
  }

  /** Use: the server decides what the held item does (the client only asks). */
  private useItem(client: Client, msg: UseMsg) {
    const p = this.state.players.get(client.sessionId);
    const m = this.meta.get(client.sessionId);
    if (!p || !m) return;
    if (Date.now() < m.knockUntil) return; // stunned: can't act
    switch (p.equipped) {
      case "egg":
        return this.pens.plant(client.sessionId);
      case "pet":
        return this.pens.placePet(client.sessionId);
      case "bat":
        return this.batHit(client, p, m);
      case "trap":
        return this.placeTrap(client, p, m, msg);
      default:
        return this.notify(client, "Pick an item on your hotbar first (keys 1–0).", "bad");
    }
  }

  /** The held item must still be owned and be what the hand says it is. */
  private heldTool(p: PlayerState, m: PlayerMeta, kind: "bat" | "trap") {
    const ref = resolveItem(m.profile, p.equippedUid);
    return ref?.kind === kind ? ref : null;
  }

  /**
   * Swing the bat at the nearest valid target roughly in front of you: a player (carrying or not — racing for an
   * egg is a fair fight too) or a guardian. A swing that misses still uses the cooldown.
   */
  private batHit(client: Client, p: PlayerState, m: PlayerMeta) {
    if (!this.heldTool(p, m, "bat")) return;
    if (PVP.blockedInSafeZone && p.z < SAFE_ZONE_Z) return this.notify(client, "Can't use the sword in the safe zone.", "bad");
    const now = Date.now();
    if (now < m.batReadyAt) return;
    m.batReadyAt = now + PVP.cooldownSec * 1000;
    const cd: CooldownMsg = { kind: "bat", sec: PVP.cooldownSec };
    client.send(MSG.Cooldown, cd);
    this.broadcast(MSG.Swing, client.sessionId);

    const arc = (PVP.arcDeg * Math.PI) / 180;
    const inArc = (x: number, z: number) => {
      let diff = Math.abs(Math.atan2(x - p.x, z - p.z) - p.ry);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      return diff <= arc;
    };
    // Rank by how deep inside its hitbox each target is, so a guardian's bigger box doesn't always win.
    let hit: { kind: "player" | "guardian"; id: string; depth: number } | null = null;
    const consider = (kind: "player" | "guardian", id: string, x: number, z: number, reach: number) => {
      const dist = Math.hypot(x - p.x, z - p.z);
      if (dist > reach || !inArc(x, z)) return;
      if (!hit || dist - reach < hit.depth) hit = { kind, id, depth: dist - reach };
    };
    if (PVP.hitsPlayers) {
      this.state.players.forEach((other, id) => {
        if (id !== client.sessionId && !(PVP.blockedInSafeZone && other.z < SAFE_ZONE_Z)) consider("player", id, other.x, other.z, PVP.hitRange);
      });
    }
    if (PVP.hitsGuardians) this.state.guardians.forEach((g, id) => consider("guardian", id, g.x, g.z, PVP.hitRange + PVP.guardianHitPadding));
    const target0 = hit as { kind: "player" | "guardian"; id: string } | null;
    if (!target0) return;

    if (target0.kind === "guardian") {
      const def = this.heist.stunGuardian(target0.id, PVP.guardianStunSec * 1000);
      if (def) this.notify(client, `Bapped the ${def.name}! It's dazed.`, "good");
      return;
    }
    const targetId = target0.id;
    const target = this.state.players.get(targetId)!;
    const hadEgg = !!target.carrying;
    this.heist.drop(targetId);
    let dx = target.x - p.x;
    let dz = target.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const knockMsg: KnockMsg = {
      vx: dx * PVP.knockback.horizontal,
      vy: PVP.knockback.up,
      vz: dz * PVP.knockback.horizontal,
      stunMs: PVP.stunSec * 1000,
      by: p.name,
      kind: "bat",
      droppedEgg: hadEgg,
    };
    this.knock(targetId, knockMsg);
    this.notify(client, hadEgg ? `Bapped ${target.name}! Their egg dropped.` : `Bapped ${target.name}!`, "good");
  }

  /** Place one bear trap at the requested spot (the client's preview); the server has the final say on where. */
  private placeTrap(client: Client, p: PlayerState, m: PlayerMeta, msg: UseMsg) {
    const tool = this.heldTool(p, m, "trap");
    if (!tool) return;
    const { x, z } = msg;
    if (!isNum(x) || !isNum(z)) return;
    if (!TRAP.allowInSafeZone && (p.z < SAFE_ZONE_Z || z < SAFE_ZONE_Z)) return this.notify(client, "Can't place traps in the safe zone.", "bad");
    if (Math.hypot(x - p.x, z - p.z) > TRAP.placeRange) return this.notify(client, "That's too far away to place a trap.", "bad");
    // Inside the walls and on the floor. With both you and the spot past the safe-zone line, you're both inside
    // the straight corridor, so the line between you can't pass through a wall.
    const inside = clampToWorld(x, z, 0.5);
    if (Math.abs(inside.x - x) > 0.01 || Math.abs(inside.z - z) > 0.01 || groundHeightAt(x, z) !== 0) return this.notify(client, "You can't place a trap there.", "bad");
    if (this.state.isNight && z >= SAFE_ZONE_Z) return this.notify(client, "The biomes are sealed off for the night.", "bad");
    let mine = 0;
    let crowded = false;
    this.state.traps.forEach((t) => {
      if (t.ownerId === client.sessionId) mine++;
      if (Math.hypot(t.x - x, t.z - z) < TRAP.minSpacing) crowded = true;
    });
    if (mine >= TRAP.maxActive) return this.notify(client, `You already have ${TRAP.maxActive} traps out.`, "bad");
    if (crowded) return this.notify(client, "There's already a trap right there.", "bad");
    if (!consumeTool(m.profile, tool.uid)) return this.notify(client, "You're out of bear traps.", "bad");

    const trap = new TrapState();
    trap.x = x;
    trap.z = z;
    trap.ownerId = client.sessionId;
    trap.placedAt = Date.now();
    this.state.traps.set(newUid("t"), trap);
    this.pens.changed(client.sessionId); // the stack count (and the slot, if it ran out) update right away
  }

  /** Traps expire on their own, and catch the first valid target to step in: drop their egg, immobilize them. */
  private tickTraps() {
    const now = Date.now();
    const gone: string[] = [];
    this.state.traps.forEach((trap, id) => {
      if (now - trap.placedAt > TRAP.lifetimeSec * 1000) {
        // Nobody stepped in it: it goes back into its owner's stack.
        gone.push(id);
        const ownerMeta = this.meta.get(trap.ownerId);
        if (ownerMeta) {
          grantTool(ownerMeta.profile, "trap", 1, now);
          this.pens.changed(trap.ownerId);
        }
        return;
      }
      const owner = this.state.players.get(trap.ownerId);
      let caught = "";

      if (TRAP.affectsPlayers) {
        this.state.players.forEach((p, sessionId) => {
          if (caught || (sessionId === trap.ownerId && !TRAP.ownerCanTrigger)) return;
          if (Math.hypot(p.x - trap.x, p.z - trap.z) > TRAP.triggerRadius) return;
          caught = p.name;
          const hadEgg = !!p.carrying;
          this.heist.drop(sessionId);
          const knockMsg: KnockMsg = { vx: 0, vy: 6, vz: 0, stunMs: TRAP.stunSec * 1000, by: owner?.name, kind: "trap", droppedEgg: hadEgg };
          this.knock(sessionId, knockMsg);
        });
      }
      if (!caught && TRAP.affectsGuardians) {
        this.state.guardians.forEach((g, gid) => {
          if (caught || Math.hypot(g.x - trap.x, g.z - trap.z) > TRAP.triggerRadius + TRAP.guardianTriggerPadding) return;
          const def = this.heist.stunGuardian(gid, TRAP.guardianStunSec * 1000);
          if (def) caught = `the ${def.name}`;
        });
      }
      if (!caught) return;

      gone.push(id); // one trigger per trap
      const ownerClient = this.clients.getById(trap.ownerId);
      if (ownerClient) this.notify(ownerClient, `Your trap caught ${caught}!`, "good");
      const ownerMeta = this.meta.get(trap.ownerId);
      if (TRAP.afterTrigger === "return" && ownerMeta) {
        grantTool(ownerMeta.profile, "trap", 1, now);
        this.pens.changed(trap.ownerId);
      }
    });
    for (const id of gone) this.state.traps.delete(id);
  }

  /** Claim the potion pickup: must be standing at its spot while it's available. */
  private claimPotion(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (!p || !this.state.potionAvailable) return;
    const spot = useSpot(HUB_BUILDINGS.potion);
    if (Math.hypot(p.x - spot.x, p.z - spot.z) > USE_RANGE) return this.notify(client, "Go to the potion to claim it.", "bad");
    this.state.potionAvailable = false;
    this.progress.grantSpeedBoost(client.sessionId, WORLD_EVENTS.potionBoostMin);
    this.notify(client, `Potion claimed! x2 Speed for ${WORLD_EVENTS.potionBoostMin} minutes.`, "good");
  }

  /** Claim the free chest: must be standing at its spot and off cooldown. */
  private claimChest(client: Client) {
    const p = this.state.players.get(client.sessionId);
    const m = this.meta.get(client.sessionId);
    if (!p || !m) return;
    const now = Date.now();
    if (now < m.profile.nextChestAt) return;
    const spot = useSpot(HUB_BUILDINGS.chest);
    if (Math.hypot(p.x - spot.x, p.z - spot.z) > USE_RANGE) return this.notify(client, "Go to the Free Chest to claim it.", "bad");

    m.profile.nextChestAt = now + CHEST.cooldownMin * 60_000;
    const money = Math.round(CHEST.moneyMin + Math.random() * (CHEST.moneyMax - CHEST.moneyMin));
    p.money += money;
    let text = `Free Chest: +$${formatShort(money)}`;
    if (Math.random() < CHEST.gemChance) {
      m.profile.gems += CHEST.gemAmount;
      text += ` and +${CHEST.gemAmount} 💎`;
    }
    this.notify(client, text, "good");
    this.pens.changed(client.sessionId); // refreshes the Gems display and saves
  }

  /** Claim the offline-earnings banner shown after joining. */
  private claimOffline(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (!p || p.offlineEarnings <= 0) return;
    // The cash floats in the player's own pen: they have to walk up to it.
    const spot = offlineCashSpot(p.baseIndex);
    if (Math.hypot(p.x - spot.x, p.z - spot.z) > OFFLINE_CASH_SERVER_RADIUS) return;
    p.money += p.offlineEarnings;
    this.notify(client, `Welcome back! Claimed $${formatShort(p.offlineEarnings)} in offline earnings.`, "good");
    p.offlineEarnings = 0;
    void this.saveProfile(client.sessionId);
  }

  /** Night just fell: pull every player still out in a biome back to their base, dropping any carried egg. */
  private beginNight() {
    this.state.players.forEach((p, sessionId) => {
      if (p.z < SAFE_ZONE_Z) return;
      if (p.carrying) this.heist.drop(sessionId);
      const spawn = basePlot(p.baseIndex).spawn;
      p.x = spawn.x;
      p.y = 0;
      p.z = spawn.z;
      const client = this.clients.getById(sessionId);
      if (!client) return;
      const back: CorrectMsg = { x: p.x, y: p.y, z: p.z };
      client.send(MSG.Correct, back);
      this.notify(client, `Night has fallen — everyone's pulled back to the hub, but eggs grow ${WORLD_EVENTS.nightGrowMult}x faster until it passes!`, "info");
    });
  }

  // ------------------------------------------------------------------ persistence

  private async saveProfile(sessionId: string) {
    const p = this.state.players.get(sessionId);
    const m = this.meta.get(sessionId);
    if (!p || !m || m.released) return;
    const now = Date.now();
    const prof = m.profile;
    prof.name = p.name;
    prof.speedStat = p.speedStat;
    prof.money = Math.max(0, p.money);
    prof.treadmillLevel = p.treadmillLevel;
    prof.penLevel = p.penLevel;
    prof.stats.playSeconds += (now - m.lastSaveAt) / 1000;
    prof.lastSeen = now;
    m.lastSaveAt = now;
    await store.save(m.profileId, prof);
  }

  private async saveAll() {
    await Promise.all([...this.meta.keys()].map((id) => this.saveProfile(id)));
  }

  // ------------------------------------------------------------------ movement

  private freeBaseIndex(): number {
    const used = new Set<number>();
    this.state.players.forEach((p) => used.add(p.baseIndex));
    for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
    return 0;
  }

  /**
   * Accepts a position if it is reachable from the last accepted one within the
   * elapsed time at the player's walk speed; otherwise snaps the client back.
   */
  private handleMove(client: Client, msg: MoveMsg) {
    const p = this.state.players.get(client.sessionId);
    const m = this.meta.get(client.sessionId);
    if (!p || !m || !msg) return;
    if (!isNum(msg.x) || !isNum(msg.y) || !isNum(msg.z) || !isNum(msg.ry) || !isNum(msg.anim)) return;

    const now = Date.now();
    const dt = Math.min(1, (now - m.lastMoveAt) / 1000);
    m.lastMoveAt = now;
    this.perf.moves++;

    // While the server is flying a knocked player, their own position reports are ignored (they would fight the flight).
    if (now < m.knockUntil) return;

    // Knockback flings players faster than they can walk; allow it for the stun window (+ landing time).
    const knocked = now < m.knockUntil + 500;
    const speed = Math.max(walkSpeedFromStat(p.speedStat, p.slowMode, trailMult(p.trail)) * Math.max(biomeSpeedMult(p.z), biomeSpeedMult(msg.z)), knocked ? m.knockSpeed : 0);
    const maxStep = speed * dt * NETWORK.moveTolerance + NETWORK.moveSlack;
    const dx = msg.x - p.x;
    const dz = msg.z - p.z;
    const bounded = clampToWorld(msg.x, msg.z);
    const outOfBounds = Math.abs(bounded.x - msg.x) > 0.01 || Math.abs(bounded.z - msg.z) > 0.01;
    // Night: every biome is sealed off, so the corridor is off-limits like a wall at the safe-zone line.
    const blockedByNight = this.state.isNight && msg.z >= SAFE_ZONE_Z;

    if (Math.hypot(dx, dz) > maxStep || outOfBounds || blockedByNight || msg.y < -1 || msg.y > MOVEMENT.maxY) {
      const back: CorrectMsg = { x: p.x, y: Math.max(0, Math.min(p.y, MOVEMENT.maxY)), z: p.z };
      client.send(MSG.Correct, back);
      return;
    }

    p.x = msg.x;
    p.y = msg.y;
    p.z = msg.z;
    p.ry = msg.ry;
    p.anim = now < m.knockUntil ? Anim.Knocked : msg.anim === Anim.Run || msg.anim === Anim.Air || (msg.anim === Anim.Knocked && knocked) ? msg.anim : Anim.Idle;
  }
}
