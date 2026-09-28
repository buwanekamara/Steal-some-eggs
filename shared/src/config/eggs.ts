// Eggs, nests and guardians. Add a biome's content here; server and client read it as data.

import { biomeStartZ, BIOMES } from "./world.ts";

// ---------------------------------------------------------------- eggs

export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Mythic" | "Secret";

/** Label colors from the reference (Common white … Mythic red). */
export const RARITY_COLOR: Record<Rarity, string> = {
  Common: "#ffffff",
  Uncommon: "#5ee04a",
  Rare: "#2f9bff",
  Epic: "#c04dff",
  Legendary: "#ffc21f",
  Mythic: "#ff3b3b",
  Secret: "#1b1b1b",
};

export interface EggDef {
  id: string;
  name: string;
  biome: string;
  rarity: Rarity;
  /** Relative spawn weight within its biome. */
  weight: number;
  /** Shell colors for the placeholder model (base, spots). */
  colors: [string, string];
  /** Model id in manifest.json (defaults to `egg_<id>`). */
  model?: string;
}

export const EGGS: EggDef[] = [
  { id: "forest_speckled", name: "Speckled Egg", biome: "forest", rarity: "Common", weight: 65, colors: ["#f3ead6", "#8a6a45"] },
  { id: "forest_mossy", name: "Mossy Egg", biome: "forest", rarity: "Uncommon", weight: 25, colors: ["#7ccf5a", "#3f8a2c"] },
  { id: "forest_acorn", name: "Acorn Egg", biome: "forest", rarity: "Rare", weight: 10, colors: ["#b8743a", "#5a3a1c"] },
  // Shop-only limited egg (never spawns in nests: no guardian lives in "limited").
  { id: "limited_nugget", name: "Golden Nugget Egg", biome: "limited", rarity: "Legendary", weight: 1, colors: ["#ffcf3a", "#b8860b"] },
];

export const EGG_BY_ID = new Map(EGGS.map((e) => [e.id, e]));

export function eggModelId(def: EggDef) {
  return def.model ?? `egg_${def.id}`;
}

/** Visual size multiplier range rolled when an egg spawns (bigger eggs → bigger pets later). */
export const EGG_SIZE = { min: 0.85, max: 1.6 } as const;

// ---------------------------------------------------------------- guardians and nests

export interface GuardianDef {
  id: string;
  name: string;
  biome: string;
  /** Sleeping spot (the nests surround it). */
  home: { x: number; z: number };
  /** Units/s while chasing. Player walk speed is 8 at 0 Speed, ~14 at 100, ~17 at 1K. */
  chaseSpeed: number;
  /** Units/s while fetching an egg / walking home. */
  walkSpeed: number;
  /** Seconds between waking and starting the chase (the thief's head start). */
  alertTime: number;
  /** Distance at which it hits the carrier. */
  catchRadius: number;
  /** Knockback applied to the carrier: horizontal and upward speed. */
  knockback: { horizontal: number; up: number };
  /** Gives up the chase after this many seconds. */
  maxChaseSec: number;
  /** Model id in manifest.json (defaults to `guardian_<biome>`). */
  model?: string;
}

const forestZ = biomeStartZ(BIOMES.findIndex((b) => b.id === "forest"));

export const GUARDIANS: GuardianDef[] = [
  {
    id: "forest_hen",
    name: "Broody Hen",
    biome: "forest",
    home: { x: 0, z: forestZ + 120 },
    chaseSpeed: 10.5,
    walkSpeed: 7,
    alertTime: 1.2,
    catchRadius: 2.6,
    knockback: { horizontal: 22, up: 16 },
    maxChaseSec: 45,
  },
];

export function guardianModelId(def: GuardianDef) {
  return def.model ?? `guardian_${def.biome}`;
}

export interface NestDef {
  index: number;
  guardian: string;
  biome: string;
  x: number;
  z: number;
}

/** Nests ring each guardian's home. */
export const NESTS: NestDef[] = GUARDIANS.flatMap((g) => {
  const count = 6;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + 0.3;
    const r = i % 2 ? 9 : 12;
    return { index: 0, guardian: g.id, biome: g.biome, x: g.home.x + Math.cos(a) * r, z: g.home.z + Math.sin(a) * r };
  });
}).map((n, index) => ({ ...n, index }));

export const NEST_TOP = 0.35;

export const EGG_RULES = {
  /** Hold E this long to steal. */
  stealHoldSec: 0.8,
  /** Max distance from an egg to steal it (server-checked). */
  stealRange: 6,
  /** A stolen egg's nest refills this long after the egg is secured. */
  respawnSec: 15,
  /** A loose egg nobody picks up returns to its nest after this long. */
  looseReturnSec: 60,
  /** Stun after being hit by a guardian (no control): ~0.6 s flying + ~1 s lying in a ragdoll heap. */
  stunSec: 1.7,
} as const;

/** Weighted random pick of an egg for a biome. `rnd` in [0, 1). */
export function rollEgg(biome: string, rnd: number): EggDef {
  const pool = EGGS.filter((e) => e.biome === biome);
  const total = pool.reduce((a, e) => a + e.weight, 0);
  let r = rnd * total;
  for (const e of pool) if ((r -= e.weight) < 0) return e;
  return pool[pool.length - 1];
}
