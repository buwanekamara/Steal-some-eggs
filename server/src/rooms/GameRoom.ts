import { Room, type Client } from "colyseus";
import {
  Anim,
  CLOSE,
  MAX_PLAYERS,
  MOVEMENT,
  MSG,
  NETWORK,
  SAVE,
  TREADMILL,
  WORLD_EVENTS,
  basePlot,
  clampToWorld,
  isOnBelt,
  sanitizeName,
  treadmillLevel,
  trailMult,
  walkSpeedFromStat,
  type CorrectMsg,
  type JoinOptions,
  type KnockMsg,
  type MoveMsg,
  type NotifyMsg,
  type PlantMsg,
  type ShopBuyMsg,
  type SecuredMsg,
} from "@egg/shared";
import { JsonFileProfileStore, isValidProfileId, type Profile, type ProfileStore } from "../persistence/ProfileStore.ts";
import { GameState, PlayerState } from "../schema/GameState.ts";
import { HeistSystem } from "../systems/HeistSystem.ts";
import { PenSystem } from "../systems/PenSystem.ts";
import { ProgressSystem } from "../systems/ProgressSystem.ts";

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
}

/** Testing shortcuts; disabled when NODE_ENV=production. */
const DEV_CHEATS = process.env.NODE_ENV !== "production";

const TICK_MS = 50;
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
      m.profile.eggs.push({ defId: def.id, size, obtainedAt: Date.now() });
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

    this.onMessage(MSG.Plant, (client, msg: unknown) => this.pens.plant(client.sessionId, typeof msg === "object" && msg ? (msg as PlantMsg) : undefined));
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

    if (DEV_CHEATS) {
      this.onMessage(MSG.DevSpeed, (client, action: unknown) => {
        const p = this.state.players.get(client.sessionId);
        if (!p) return;
        p.speedStat = action === "up" ? Math.min(1e12, p.speedStat * 10 + 10) : 0;
      });
      this.onMessage(MSG.DevGrow, (client) => this.pens.devGrow(client.sessionId));
      this.onMessage(MSG.DevEgg, (client) => this.pens.devEgg(client.sessionId));
      this.onMessage(MSG.DevMoney, (client) => this.progress.devMoney(client.sessionId));
      this.onMessage(MSG.DevGems, (client) => this.progress.devGems(client.sessionId));
      this.onMessage(MSG.DevPet, (client, species: unknown) => this.progress.devPet(client.sessionId, species));
    }

    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), TICK_MS);
    this.clock.setInterval(() => this.saveAll(), SAVE.autosaveSec * 1000);
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
    const meta: PlayerMeta = { profileId, profile, lastMoveAt: now, lastSaveAt: now, stepAccum: 0, released: false, knockUntil: 0, knockSpeed: 0 };
    this.meta.set(client.sessionId, meta);
    this.pens.attach(client.sessionId, p, profile);

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

  // ------------------------------------------------------------------ simulation

  private tick(dt: number) {
    this.state.players.forEach((p, sessionId) => {
      const m = this.meta.get(sessionId);
      if (!m) return;
      this.train(p, m, dt);
    });
    this.heist.tick(dt);
    this.updateWorldTimers();
  }

  private sessionOf(p: PlayerState) {
    for (const [id, s] of this.state.players) if (s === p) return id;
    return "";
  }

  private knock(sessionId: string, msg: KnockMsg) {
    const m = this.meta.get(sessionId);
    if (!m) return;
    m.knockUntil = Date.now() + msg.stunMs;
    m.knockSpeed = Math.hypot(msg.vx, msg.vz);
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

  private updateWorldTimers() {
    const elapsed = (Date.now() - SERVER_START) / 1000;
    this.state.nightIn = Math.ceil(WORLD_EVENTS.nightEverySec - (elapsed % WORLD_EVENTS.nightEverySec));
    this.state.potionIn = Math.ceil(WORLD_EVENTS.potionEverySec - ((elapsed + WORLD_EVENTS.potionOffsetSec) % WORLD_EVENTS.potionEverySec));
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

    // Knockback flings players faster than they can walk; allow it for the stun window (+ landing time).
    const knocked = now < m.knockUntil + 500;
    const speed = Math.max(walkSpeedFromStat(p.speedStat, p.slowMode, trailMult(p.trail)), knocked ? m.knockSpeed : 0);
    const maxStep = speed * dt * NETWORK.moveTolerance + NETWORK.moveSlack;
    const dx = msg.x - p.x;
    const dz = msg.z - p.z;
    const bounded = clampToWorld(msg.x, msg.z);
    const outOfBounds = Math.abs(bounded.x - msg.x) > 0.01 || Math.abs(bounded.z - msg.z) > 0.01;

    if (Math.hypot(dx, dz) > maxStep || outOfBounds || msg.y < -1 || msg.y > MOVEMENT.maxY) {
      const back: CorrectMsg = { x: p.x, y: Math.max(0, Math.min(p.y, MOVEMENT.maxY)), z: p.z };
      client.send(MSG.Correct, back);
      return;
    }

    p.x = msg.x;
    p.y = msg.y;
    p.z = msg.z;
    p.ry = msg.ry;
    p.anim = msg.anim === Anim.Run || msg.anim === Anim.Air || (msg.anim === Anim.Knocked && knocked) ? msg.anim : Anim.Idle;
  }
}
