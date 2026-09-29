import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEV, EGG_BY_ID, HATCH, HOTBAR_SIZE, MUTATION_BY_ID, newUid, PEN, PEN_LEVELS, PET_BY_ID, STARTER_TOOLS, TOOLS, TRAIL_BY_ID, type FusionResult, type ToolKind } from "@egg/shared";
import { cleanHotbar, grantTool, stash } from "../systems/Inventory.ts";

/** A bat, or a stack of bear traps. */
export interface OwnedTool {
  uid: string;
  kind: ToolKind;
  qty: number;
  obtainedAt: number;
}

/** A secured egg waiting in the backpack (not planted yet). */
export interface OwnedEgg {
  uid: string;
  defId: string;
  size: number;
  obtainedAt: number;
  /** Eggs from the Fusion Machine hatch into exactly this. */
  fusion?: FusionResult;
}

/** An egg growing in the pen. Growth uses wall-clock time, so it keeps growing while offline. */
export interface PenEgg {
  uid: string;
  defId: string;
  size: number;
  x: number;
  z: number;
  plantedAt: number;
  readyAt: number;
  fusion?: FusionResult;
}

export interface OwnedPet {
  uid: string;
  species: string;
  weight: number;
  /** "" = normal, else a mutation id ("golden", "rainbow"). */
  mutation: string;
  /** In the pen (earning), or benched in the backpack. */
  equipped: boolean;
  obtainedAt: number;
}

/** Everything saved about a player. Add fields with defaults in `migrate()`. */
export interface Profile {
  version: 1;
  name: string;
  speedStat: number;
  money: number;
  treadmillLevel: number;
  eggs: OwnedEgg[];
  penEggs: PenEgg[];
  pets: OwnedPet[];
  penSlots: number;
  penLevel: number;
  /** Premium currency (Shop). */
  gems: number;
  trailsOwned: string[];
  trail: string;
  /** x2 treadmill Speed until this time (ms). */
  boostUntil: number;
  /** Free chest: ms timestamp when it's claimable again (0 = ready now). */
  nextChestAt: number;
  tools: OwnedTool[];
  /** HOTBAR_SIZE item uids (eggs, benched pets, tools); "" = empty slot. */
  hotbar: string[];
  /** Pet species ever hatched (for the Index and "NEW!" tags). */
  discovered: string[];
  /** Species whose Index reward was claimed. */
  claimed: string[];
  /** Index pages (biomes) whose completion reward was given. */
  completed: string[];
  stats: {
    steps: number;
    playSeconds: number;
    eggsStolen: number;
    eggsSecured: number;
    timesCaught: number;
    eggsHatched: number;
  };
  createdAt: number;
  lastSeen: number;
}

export function newProfile(name: string): Profile {
  const profile = blankProfile(name);
  for (const t of STARTER_TOOLS) grantTool(profile, t.kind, t.qty, profile.createdAt);
  return profile;
}

function blankProfile(name: string): Profile {
  const now = Date.now();
  return {
    version: 1,
    name,
    speedStat: DEV.startingSpeedStat,
    money: DEV.startingMoney,
    treadmillLevel: 1,
    eggs: [],
    penEggs: [],
    pets: [],
    penSlots: PEN.startSlots,
    penLevel: 1,
    gems: DEV.startingGems,
    trailsOwned: [],
    trail: "",
    boostUntil: 0,
    nextChestAt: 0,
    tools: [],
    hotbar: Array(HOTBAR_SIZE).fill(""),
    discovered: [],
    claimed: [],
    completed: [],
    stats: { steps: 0, playSeconds: 0, eggsStolen: 0, eggsSecured: 0, timesCaught: 0, eggsHatched: 0 },
    createdAt: now,
    lastSeen: now,
  };
}

/** A saved fusion result, if it is a sane one. */
function fusionOf(raw: unknown): { fusion?: FusionResult } {
  const f = raw as Partial<FusionResult> | undefined;
  if (!f || !(typeof f.weight === "number" && f.weight > 0)) return {};
  return { fusion: { weight: f.weight, mutation: typeof f.mutation === "string" && MUTATION_BY_ID.has(f.mutation) ? f.mutation : "" } };
}

function migrateTools(raw: unknown): OwnedTool[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .filter((t) => t && typeof t.uid === "string" && t.uid && !seen.has(t.uid) && seen.add(t.uid) && TOOLS[t.kind as ToolKind])
    .map((t) => ({ uid: t.uid, kind: t.kind as ToolKind, qty: Math.min(TOOLS[t.kind as ToolKind].maxStack, Math.floor(num(t.qty, 0))), obtainedAt: num(t.obtainedAt, 0) }))
    .filter((t) => t.qty > 0);
}

const num = (v: unknown, fallback: number, min = 0) => (typeof v === "number" && Number.isFinite(v) && v >= min ? v : fallback);

/** Fills missing/invalid fields so old or hand-edited save files always load safely. */
function migrate(raw: Partial<Profile>, name: string): Profile {
  const base = blankProfile(name);
  const profile: Profile = {
    version: 1,
    name: typeof raw.name === "string" && raw.name ? raw.name : name,
    speedStat: num(raw.speedStat, base.speedStat),
    money: num(raw.money, base.money),
    treadmillLevel: Math.floor(num(raw.treadmillLevel, 1, 1)),
    eggs: Array.isArray(raw.eggs)
      ? raw.eggs
          .filter((e) => e && typeof e.defId === "string" && EGG_BY_ID.has(e.defId))
          .map((e) => ({ uid: typeof e.uid === "string" && e.uid ? e.uid : newUid("e"), defId: e.defId, size: num(e.size, 1), obtainedAt: num(e.obtainedAt, 0), ...fusionOf(e.fusion) }))
      : [],
    penEggs: Array.isArray(raw.penEggs)
      ? raw.penEggs
          .filter((e) => e && typeof e.uid === "string" && HATCH[e.defId])
          .map((e) => ({
            uid: e.uid,
            defId: e.defId,
            size: num(e.size, 1),
            x: typeof e.x === "number" ? e.x : 0,
            z: typeof e.z === "number" ? e.z : 0,
            plantedAt: num(e.plantedAt, 0),
            readyAt: num(e.readyAt, 0),
            ...fusionOf(e.fusion),
          }))
      : [],
    pets: Array.isArray(raw.pets)
      ? raw.pets
          .filter((p) => p && typeof p.uid === "string" && PET_BY_ID.has(p.species))
          .map((p) => ({
            uid: p.uid,
            species: p.species,
            weight: num(p.weight, PET_BY_ID.get(p.species)!.baseWeight, 0.01),
            mutation: typeof p.mutation === "string" && MUTATION_BY_ID.has(p.mutation) ? p.mutation : "",
            equipped: !!p.equipped,
            obtainedAt: num(p.obtainedAt, 0),
          }))
      : [],
    penSlots: Math.min(PEN.maxSlots, Math.floor(num(raw.penSlots, PEN.startSlots, PEN.startSlots))),
    penLevel: Math.min(PEN_LEVELS.length, Math.floor(num(raw.penLevel, 1, 1))),
    gems: Math.floor(num(raw.gems, DEV.startingGems)),
    trailsOwned: Array.isArray(raw.trailsOwned) ? raw.trailsOwned.filter((t) => typeof t === "string" && TRAIL_BY_ID.has(t)) : [],
    trail: typeof raw.trail === "string" && TRAIL_BY_ID.has(raw.trail) && raw.trailsOwned?.includes(raw.trail) ? raw.trail : "",
    boostUntil: num(raw.boostUntil, 0),
    nextChestAt: num(raw.nextChestAt, 0),
    tools: migrateTools(raw.tools),
    hotbar: Array.from({ length: HOTBAR_SIZE }, (_, i) => (Array.isArray(raw.hotbar) && typeof raw.hotbar[i] === "string" ? raw.hotbar[i] : "")),
    discovered: Array.isArray(raw.discovered) ? raw.discovered.filter((s) => typeof s === "string" && PET_BY_ID.has(s)) : [],
    claimed: Array.isArray(raw.claimed) ? raw.claimed.filter((s) => typeof s === "string" && PET_BY_ID.has(s)) : [],
    completed: Array.isArray(raw.completed) ? raw.completed.filter((s) => typeof s === "string") : [],
    stats: {
      steps: num(raw.stats?.steps, 0),
      playSeconds: num(raw.stats?.playSeconds, 0),
      eggsStolen: num(raw.stats?.eggsStolen, 0),
      eggsSecured: num(raw.stats?.eggsSecured, 0),
      timesCaught: num(raw.stats?.timesCaught, 0),
      eggsHatched: num(raw.stats?.eggsHatched, 0),
    },
    createdAt: num(raw.createdAt, base.createdAt),
    lastSeen: num(raw.lastSeen, base.lastSeen),
  };
  cleanHotbar(profile);
  // Saves from before tools were items (everyone had a bat and traps built in): hand out the starter kit once.
  if (!Array.isArray(raw.tools)) for (const t of STARTER_TOOLS) grantTool(profile, t.kind, t.qty, Date.now());
  // Saves from before the hotbar existed: fill it the way new items arrive (tools first, then backpack eggs).
  if (!Array.isArray(raw.hotbar)) for (const item of [...profile.tools, ...profile.eggs]) stash(profile, item.uid);
  return profile;
}

export interface ProfileStore {
  load(id: string, name: string): Promise<Profile>;
  save(id: string, profile: Profile): Promise<void>;
}

/** Profile ids are client-generated guest UUIDs (optionally with a ":suffix" for test profiles). */
export function isValidProfileId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9-]{8,64}(:[A-Za-z0-9_-]{1,24})?$/.test(id);
}

/**
 * Stores each profile as server/data/profiles/<id>.json.
 * Writes go to a temp file first and are renamed into place, so a crash never leaves half a file.
 * Swap for a database-backed store later without touching game code.
 */
export class JsonFileProfileStore implements ProfileStore {
  private dir: string;
  private writing = new Map<string, Promise<void>>();

  /** DATA_DIR moves saves elsewhere (e.g. a host's persistent disk); by default they go in server/data/profiles. */
  constructor(dir = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, "profiles") : fileURLToPath(new URL("../../data/profiles", import.meta.url))) {
    this.dir = dir;
  }

  private file(id: string) {
    return path.join(this.dir, `${id.replace(":", "__")}.json`);
  }

  async load(id: string, name: string): Promise<Profile> {
    await this.writing.get(id); // never read while our own write is in flight
    try {
      const raw = JSON.parse(await fs.readFile(this.file(id), "utf8"));
      return migrate(raw, name);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`[profiles] ${id}: unreadable, starting fresh`, e);
      return newProfile(name);
    }
  }

  async save(id: string, profile: Profile): Promise<void> {
    const prev = this.writing.get(id) ?? Promise.resolve();
    const next = prev.then(async () => {
      await fs.mkdir(this.dir, { recursive: true });
      const target = this.file(id);
      const tmp = `${target}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(profile, null, 2));
      await fs.rename(tmp, target);
    });
    this.writing.set(
      id,
      next.catch((e) => console.error(`[profiles] ${id}: save failed`, e)),
    );
    return next;
  }
}
