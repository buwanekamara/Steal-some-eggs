import {
  CORRIDOR_HALF_WIDTH,
  EGG_BY_ID,
  EGG_RULES,
  EGG_SIZE,
  EggStatus,
  GUARDIANS,
  GuardianMode,
  NESTS,
  NEST_TOP,
  SAFE_ZONE_Z,
  biomeAt,
  rollEgg,
  type EggDef,
  type GuardianDef,
  type KnockMsg,
} from "@egg/shared";
import { EggState, GuardianState, type GameState, type PlayerState } from "../schema/GameState.ts";

/** What the heist system needs from the room. */
export interface HeistHooks {
  /** Fling a player (guardian hit). */
  knock(sessionId: string, msg: KnockMsg): void;
  /** An egg reached safety with its carrier. */
  secured(sessionId: string, def: EggDef, size: number): void;
  /** Whether the player may act (not stunned). */
  canAct(sessionId: string): boolean;
}

interface EggMeta {
  nest: number;
  guardian: string;
  /** When the egg became loose (ms), for the auto-return timer. */
  looseSince: number;
}

interface NestMeta {
  eggId: string | null;
  /** When an empty nest refills (ms); 0 = not scheduled. */
  respawnAt: number;
}

interface GuardianMeta {
  def: GuardianDef;
  /** Egg this guardian is dealing with (chasing its carrier / fetching it). */
  eggId: string | null;
  timer: number;
  chaseStartedAt: number;
}

const HOME_EPS = 0.5;
/** Sleeping guardians face the hub, so arriving players see their face. */
const SLEEP_FACING = Math.PI;

/**
 * Eggs, nests and guardians — the whole "steal an egg and run" loop, server-authoritative.
 *
 * Guardian flow: Sleep → (egg stolen) Alert → Chase → hit: knock + egg drops → Attack pause →
 *   egg dropped inside its biome: Fetch it back to the nest; outside: Return home (egg stays loose).
 * Picking up a loose egg makes its guardian chase again. Reaching the safe zone secures the egg.
 */
export class HeistSystem {
  private eggMeta = new Map<string, EggMeta>();
  private nests: NestMeta[] = NESTS.map(() => ({ eggId: null, respawnAt: 0 }));
  private guardians = new Map<string, GuardianMeta>();
  private nextEggId = 1;

  constructor(
    private state: GameState,
    private hooks: HeistHooks,
    private now: () => number = Date.now,
  ) {}

  init() {
    for (const def of GUARDIANS) {
      const g = new GuardianState();
      g.defId = def.id;
      g.x = def.home.x;
      g.z = def.home.z;
      g.ry = SLEEP_FACING;
      g.mode = GuardianMode.Sleep;
      this.state.guardians.set(def.id, g);
      this.guardians.set(def.id, { def, eggId: null, timer: 0, chaseStartedAt: 0 });
    }
    NESTS.forEach((_, i) => this.spawnEgg(i));
  }

  // ------------------------------------------------------------------ player actions

  /** Returns an error string, or null on success. */
  steal(sessionId: string, eggId: unknown): string | null {
    if (typeof eggId !== "string") return "bad egg id";
    const p = this.state.players.get(sessionId);
    const egg = this.state.eggs.get(eggId);
    if (!p || !egg) return "egg not found";
    if (p.carrying) return "already carrying an egg";
    if (!this.hooks.canAct(sessionId)) return "stunned";
    if (egg.state !== EggStatus.InNest && egg.state !== EggStatus.Loose) return "egg not available";
    if (Math.hypot(p.x - egg.x, p.z - egg.z) > EGG_RULES.stealRange) return "too far";

    egg.state = EggStatus.Carried;
    egg.carrier = sessionId;
    p.carrying = eggId;
    this.onEggTaken(eggId);
    return null;
  }

  /** Voluntary drop (Drop button). */
  drop(sessionId: string) {
    const p = this.state.players.get(sessionId);
    if (p?.carrying) this.dropEgg(p);
  }

  playerLeft(sessionId: string) {
    this.drop(sessionId);
  }

  // ------------------------------------------------------------------ simulation

  tick(dt: number) {
    const now = this.now();

    // Secure eggs whose carrier made it past the safe-zone line.
    this.state.eggs.forEach((egg, id) => {
      if (egg.state !== EggStatus.Carried) return;
      const p = this.state.players.get(egg.carrier);
      if (!p) return this.forceLoose(id, egg, egg.x, egg.z);
      egg.x = p.x; // keep the last carried position (used if the carrier vanishes)
      egg.z = p.z;
      if (p.z < SAFE_ZONE_Z) this.secure(egg.carrier, p, id, egg);
    });

    // Loose eggs nobody wants go home; empty nests refill.
    this.state.eggs.forEach((egg, id) => {
      const m = this.eggMeta.get(id)!;
      if (egg.state === EggStatus.Loose && now - m.looseSince > EGG_RULES.looseReturnSec * 1000) this.returnToNest(id, egg);
    });
    this.nests.forEach((n, i) => {
      if (!n.eggId && n.respawnAt && now >= n.respawnAt) this.spawnEgg(i);
    });

    for (const [id, gm] of this.guardians) this.tickGuardian(this.state.guardians.get(id)!, gm, dt, now);
  }

  // ------------------------------------------------------------------ guardians

  private tickGuardian(g: GuardianState, gm: GuardianMeta, dt: number, now: number) {
    const def = gm.def;
    switch (g.mode) {
      case GuardianMode.Sleep:
      case GuardianMode.Return: {
        this.reevaluate(g, gm, now);
        if (g.mode === GuardianMode.Return && this.moveTo(g, def.home.x, def.home.z, def.walkSpeed, dt) < HOME_EPS) {
          g.mode = GuardianMode.Sleep;
          g.ry = SLEEP_FACING;
        }
        break;
      }
      case GuardianMode.Alert: {
        const target = this.carrierOf(gm.eggId);
        if (!target) return this.reevaluate(g, gm, now);
        this.face(g, target.x, target.z);
        g.target = this.state.eggs.get(gm.eggId!)!.carrier;
        gm.timer -= dt;
        if (gm.timer <= 0) {
          g.mode = GuardianMode.Chase;
          gm.chaseStartedAt = now;
        }
        break;
      }
      case GuardianMode.Chase: {
        const egg = gm.eggId ? this.state.eggs.get(gm.eggId) : undefined;
        const target = this.carrierOf(gm.eggId);
        if (!egg || !target) return this.reevaluate(g, gm, now);
        g.target = egg.carrier;
        if (now - gm.chaseStartedAt > def.maxChaseSec * 1000) {
          gm.eggId = null; // gave up: the thief keeps the egg
          g.target = "";
          g.mode = GuardianMode.Return;
          break;
        }
        const dist = this.moveTo(g, target.x, target.z, def.chaseSpeed, dt);
        if (dist <= def.catchRadius && this.hooks.canAct(egg.carrier)) this.hit(g, gm, target, egg.carrier);
        break;
      }
      case GuardianMode.Attack: {
        gm.timer -= dt;
        if (gm.timer <= 0) this.reevaluate(g, gm, now, true);
        break;
      }
      case GuardianMode.Fetch: {
        const egg = gm.eggId ? this.state.eggs.get(gm.eggId) : undefined;
        if (!egg) return this.reevaluate(g, gm, now);
        if (egg.state === EggStatus.Loose) {
          if (!this.insideBiome(def, egg.z)) return this.reevaluate(g, gm, now);
          if (this.moveTo(g, egg.x, egg.z, def.walkSpeed * 1.3, dt) < 1.6) egg.state = EggStatus.WithGuardian;
        } else if (egg.state === EggStatus.WithGuardian) {
          const nest = NESTS[this.eggMeta.get(gm.eggId!)!.nest];
          const d = this.moveTo(g, nest.x, nest.z, def.walkSpeed, dt);
          egg.x = g.x;
          egg.z = g.z;
          if (d < 1.2) {
            this.placeInNest(egg);
            gm.eggId = null;
            this.reevaluate(g, gm, now);
          }
        } else {
          // Someone grabbed it (Carried) or it went home by itself.
          this.reevaluate(g, gm, now);
        }
        break;
      }
    }
  }

  /**
   * Picks the guardian's next job: chase a carried egg of its own, else fetch a loose one
   * inside its biome, else go home / sleep.
   */
  private reevaluate(g: GuardianState, gm: GuardianMeta, now: number, afterHit = false) {
    const def = gm.def;
    const mine = [...this.state.eggs.entries()].filter(([id]) => this.eggMeta.get(id)?.guardian === def.id);
    const carried = mine.find(([, e]) => e.state === EggStatus.Carried && this.state.players.has(e.carrier));
    if (carried) {
      const wasAsleep = g.mode === GuardianMode.Sleep;
      gm.eggId = carried[0];
      g.target = carried[1].carrier;
      if (wasAsleep) {
        g.mode = GuardianMode.Alert;
        gm.timer = def.alertTime;
      } else if (g.mode !== GuardianMode.Chase) {
        g.mode = GuardianMode.Chase;
        gm.chaseStartedAt = now;
      }
      return;
    }
    g.target = "";
    const loose = mine.find(([, e]) => (e.state === EggStatus.Loose || e.state === EggStatus.WithGuardian) && this.insideBiome(def, e.z));
    if (loose) {
      gm.eggId = loose[0];
      g.mode = GuardianMode.Fetch;
      return;
    }
    gm.eggId = null;
    if (g.mode === GuardianMode.Sleep) return;
    const home = Math.hypot(g.x - def.home.x, g.z - def.home.z) < HOME_EPS;
    g.mode = home && !afterHit ? GuardianMode.Sleep : GuardianMode.Return;
  }

  private hit(g: GuardianState, gm: GuardianMeta, target: PlayerState, sessionId: string) {
    const def = gm.def;
    let dx = target.x - g.x;
    let dz = target.z - g.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    this.hooks.knock(sessionId, {
      vx: dx * def.knockback.horizontal,
      vy: def.knockback.up,
      vz: dz * def.knockback.horizontal,
      stunMs: EGG_RULES.stunSec * 1000,
    });
    this.dropEgg(target);
    g.mode = GuardianMode.Attack;
    g.target = "";
    gm.timer = 0.8;
  }

  /** A guardian's egg was just picked up by a player. */
  private onEggTaken(eggId: string) {
    const m = this.eggMeta.get(eggId)!;
    const g = this.state.guardians.get(m.guardian)!;
    const gm = this.guardians.get(m.guardian)!;
    // Already busy chasing someone else: stay on that target.
    if ((g.mode === GuardianMode.Chase || g.mode === GuardianMode.Alert) && gm.eggId !== eggId && this.carrierOf(gm.eggId)) return;
    // Carrying another egg home? Magic it back into its nest and give chase.
    if (gm.eggId && gm.eggId !== eggId) {
      const other = this.state.eggs.get(gm.eggId);
      if (other?.state === EggStatus.WithGuardian) this.placeInNest(other);
    }
    this.reevaluate(g, gm, this.now());
  }

  // ------------------------------------------------------------------ eggs

  private spawnEgg(nestIndex: number) {
    const nest = NESTS[nestIndex];
    const def = rollEgg(nest.biome, Math.random());
    const id = `e${this.nextEggId++}`;
    const egg = new EggState();
    egg.defId = def.id;
    egg.size = +(EGG_SIZE.min + Math.random() * (EGG_SIZE.max - EGG_SIZE.min)).toFixed(2);
    egg.nest = nestIndex;
    this.eggMeta.set(id, { nest: nestIndex, guardian: nest.guardian, looseSince: 0 });
    this.state.eggs.set(id, egg);
    this.placeInNest(egg);
    this.nests[nestIndex] = { eggId: id, respawnAt: 0 };
  }

  private placeInNest(egg: EggState) {
    const nest = NESTS[egg.nest];
    egg.state = EggStatus.InNest;
    egg.carrier = "";
    egg.x = nest.x;
    egg.y = NEST_TOP;
    egg.z = nest.z;
  }

  private returnToNest(id: string, egg: EggState) {
    this.placeInNest(egg);
    this.eggMeta.get(id)!.looseSince = 0;
  }

  private dropEgg(p: PlayerState) {
    const id = p.carrying;
    const egg = this.state.eggs.get(id);
    p.carrying = "";
    if (egg) this.forceLoose(id, egg, p.x, p.z);
  }

  private forceLoose(id: string, egg: EggState, x: number, z: number) {
    egg.state = EggStatus.Loose;
    egg.carrier = "";
    egg.x = x;
    egg.y = 0;
    egg.z = Math.max(SAFE_ZONE_Z + 1, z);
    this.eggMeta.get(id)!.looseSince = this.now();
  }

  private secure(sessionId: string, p: PlayerState, id: string, egg: EggState) {
    const def = EGG_BY_ID.get(egg.defId)!;
    const m = this.eggMeta.get(id)!;
    p.carrying = "";
    this.state.eggs.delete(id);
    this.eggMeta.delete(id);
    this.nests[m.nest] = { eggId: null, respawnAt: this.now() + EGG_RULES.respawnSec * 1000 };
    this.hooks.secured(sessionId, def, egg.size);
  }

  // ------------------------------------------------------------------ helpers

  private carrierOf(eggId: string | null): PlayerState | undefined {
    if (!eggId) return undefined;
    const egg = this.state.eggs.get(eggId);
    return egg?.state === EggStatus.Carried ? this.state.players.get(egg.carrier) : undefined;
  }

  private insideBiome(def: GuardianDef, z: number) {
    return biomeAt(z)?.id === def.biome;
  }

  private face(g: GuardianState, x: number, z: number) {
    if (Math.hypot(x - g.x, z - g.z) > 0.01) g.ry = Math.atan2(x - g.x, z - g.z);
  }

  /** Moves toward (x, z) without entering the safe zone; returns the remaining distance. */
  private moveTo(g: GuardianState, x: number, z: number, speed: number, dt: number): number {
    const dx = x - g.x;
    const dz = z - g.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.001) {
      const step = Math.min(d, speed * dt);
      g.x += (dx / d) * step;
      g.z += (dz / d) * step;
      g.ry = Math.atan2(dx, dz);
    }
    g.x = Math.max(-CORRIDOR_HALF_WIDTH + 2, Math.min(CORRIDOR_HALF_WIDTH - 2, g.x));
    g.z = Math.max(SAFE_ZONE_Z + 1.5, g.z);
    return Math.hypot(x - g.x, z - g.z);
  }
}
