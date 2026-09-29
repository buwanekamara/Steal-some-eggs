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
  WORLD_EVENTS,
  basePlot,
  clampToWorld,
  formatShort,
  isOnBelt,
  newUid,
  sanitizeName,
  treadmillLevel,
  trailMult,
  useSpot,
  walkSpeedFromStat,
  type CorrectMsg,
  type EquipMsg,
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
  /** Next time (ms timestamp) this player's bat is ready to swing again. */
  batReadyAt: number;
  /** Next time (ms timestamp) a trap charge regenerates (0 = already full). */
  trapRegenAt: number;
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
      m.profile.eggs.push({ uid: newUid("e"), defId: def.id, size, obtainedAt: Date.now() });
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

    this.onMessage(MSG.Plant, (client) => this.pens.plant(client.sessionId));
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
    this.onMessage(MSG.BatHit, (client) => this.batHit(client));
    this.onMessage(MSG.ClaimChest, (client) => this.claimChest(client));
    this.onMessage(MSG.ClaimOffline, (client) => this.claimOffline(client));
    this.onMessage(MSG.EquipTool, (client, tool: unknown) => this.equipTool(client, tool));
    this.onMessage(MSG.PlaceTrap, (client) => this.placeTrap(client));

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
    const meta: PlayerMeta = { profileId, profile, lastMoveAt: now, lastSaveAt: now, stepAccum: 0, released: false, knockUntil: 0, knockSpeed: 0, batReadyAt: 0, trapRegenAt: 0 };
    this.meta.set(client.sessionId, meta);
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
      this.regenTraps(p, m);
    });
    this.heist.tick(dt);
    this.tickTraps();
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

  /** Which potionEverySec cycle we've last spawned the potion for (-1 = none yet). */
  private potionCycleSeen = -1;

  private updateWorldTimers() {
    const elapsed = (Date.now() - SERVER_START) / 1000;
    const cyclePos = elapsed % WORLD_EVENTS.nightEverySec;
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

  /** Swing the bat: hits the nearest player roughly in front of you, in range and outside the safe zone (carrying or not — racing for an egg is a fair fight too). */
  private batHit(client: Client) {
    const p = this.state.players.get(client.sessionId);
    const m = this.meta.get(client.sessionId);
    if (!p || !m || p.equipped !== "bat") return;
    if (p.z < SAFE_ZONE_Z) return this.notify(client, "Can't use the bat in the safe zone.", "bad");
    const now = Date.now();
    if (now < m.knockUntil || now < m.batReadyAt) return;
    m.batReadyAt = now + PVP.cooldownSec * 1000;

    let targetId: string | null = null;
    let bestDist: number = PVP.hitRange;
    this.state.players.forEach((other, otherId) => {
      if (otherId === client.sessionId || other.z < SAFE_ZONE_Z) return;
      const dx = other.x - p.x;
      const dz = other.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist) return;
      let diff = Math.abs(Math.atan2(dx, dz) - p.ry);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff > (PVP.arcDeg * Math.PI) / 180) return;
      targetId = otherId;
      bestDist = dist;
    });
    if (!targetId) return;

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

  /** Hold "" / "bat" / "trap" — always allowed, even in the safe zone (only using it is restricted). */
  private equipTool(client: Client, msg: unknown) {
    const p = this.state.players.get(client.sessionId);
    const m = this.meta.get(client.sessionId);
    if (!p || !m || typeof msg !== "object" || !msg) return;
    const { tool, eggUid } = msg as EquipMsg;
    if (tool !== "" && tool !== "bat" && tool !== "trap" && tool !== "egg") return;

    if (tool === "egg") {
      const owned = m.profile.eggs.find((e) => e.uid === eggUid);
      if (!owned) return;
      p.equipped = "egg";
      p.equippedEggUid = owned.uid;
      p.equippedEggDefId = owned.defId;
      return;
    }
    p.equipped = tool;
    p.equippedEggUid = "";
    p.equippedEggDefId = "";
  }

  /** A trap charge regenerates every TRAP.rechargeSec while below the cap. */
  private regenTraps(p: PlayerState, m: PlayerMeta) {
    if (p.trapsAvailable >= TRAP.maxCarried) {
      m.trapRegenAt = 0;
      return;
    }
    const now = Date.now();
    if (!m.trapRegenAt) m.trapRegenAt = now + TRAP.rechargeSec * 1000;
    if (now < m.trapRegenAt) return;
    p.trapsAvailable++;
    m.trapRegenAt = p.trapsAvailable >= TRAP.maxCarried ? 0 : now + TRAP.rechargeSec * 1000;
  }

  /** Drop a trap at my feet: must have it equipped, a charge free, and be outside the safe zone. */
  private placeTrap(client: Client) {
    const p = this.state.players.get(client.sessionId);
    const m = this.meta.get(client.sessionId);
    if (!p || !m || p.equipped !== "trap") return;
    if (p.z < SAFE_ZONE_Z) return this.notify(client, "Can't place traps in the safe zone.", "bad");
    if (p.trapsAvailable <= 0) return this.notify(client, "No traps left — wait for one to recharge.", "bad");
    p.trapsAvailable--;
    const trap = new TrapState();
    trap.x = p.x;
    trap.z = p.z;
    trap.ownerId = client.sessionId;
    trap.placedAt = Date.now();
    this.state.traps.set(`t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, trap);
    this.notify(client, "Trap placed!", "good");
  }

  /** Traps expire on their own, and catch the first non-owner who steps within range: drop their egg, stun them. */
  private tickTraps() {
    const now = Date.now();
    const gone: string[] = [];
    this.state.traps.forEach((trap, id) => {
      if (now - trap.placedAt > TRAP.lifetimeSec * 1000) return void gone.push(id);
      let triggered = false;
      this.state.players.forEach((p, sessionId) => {
        if (triggered || sessionId === trap.ownerId) return;
        if (Math.hypot(p.x - trap.x, p.z - trap.z) > TRAP.triggerRadius) return;
        triggered = true;
        const hadEgg = !!p.carrying;
        this.heist.drop(sessionId);
        const owner = this.state.players.get(trap.ownerId);
        const knockMsg: KnockMsg = { vx: 0, vy: 6, vz: 0, stunMs: TRAP.stunSec * 1000, by: owner?.name, kind: "trap", droppedEgg: hadEgg };
        this.knock(sessionId, knockMsg);
        const ownerClient = this.clients.getById(trap.ownerId);
        if (ownerClient) this.notify(ownerClient, `Your trap caught ${p.name}!`, "good");
      });
      if (triggered) gone.push(id);
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

    // Knockback flings players faster than they can walk; allow it for the stun window (+ landing time).
    const knocked = now < m.knockUntil + 500;
    const speed = Math.max(walkSpeedFromStat(p.speedStat, p.slowMode, trailMult(p.trail)), knocked ? m.knockSpeed : 0);
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
    p.anim = msg.anim === Anim.Run || msg.anim === Anim.Air || (msg.anim === Anim.Knocked && knocked) ? msg.anim : Anim.Idle;
  }
}
