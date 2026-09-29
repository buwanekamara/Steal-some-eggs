// Eggs, nests and guardians. Add a biome's content here; server and client read it as data.

import { biomeLength, biomeStartZ, BIOMES } from "./world.ts";

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
  { id: "lake_pebble", name: "Pebble Egg", biome: "lake", rarity: "Common", weight: 65, colors: ["#dfe9ea", "#7d9096"] },
  { id: "lake_reed", name: "Reed Egg", biome: "lake", rarity: "Uncommon", weight: 25, colors: ["#cfe08a", "#6f9a3c"] },
  { id: "lake_pearl", name: "Pearl Egg", biome: "lake", rarity: "Rare", weight: 10, colors: ["#eef8ff", "#b9e0ff"] },
  { id: "desert_sand", name: "Sand Egg", biome: "desert", rarity: "Common", weight: 65, colors: ["#ecd49a", "#c9a05a"] },
  { id: "desert_cactus", name: "Cactus Egg", biome: "desert", rarity: "Uncommon", weight: 25, colors: ["#8fae52", "#4f6e2a"] },
  { id: "desert_scarab", name: "Scarab Egg", biome: "desert", rarity: "Rare", weight: 10, colors: ["#2f6e6e", "#c9a227"] },
  { id: "jungle_vine", name: "Vine Egg", biome: "jungle", rarity: "Common", weight: 65, colors: ["#4a7a2a", "#2a4a18"] },
  { id: "jungle_bamboo", name: "Bamboo Egg", biome: "jungle", rarity: "Uncommon", weight: 25, colors: ["#c9d98a", "#8aa84a"] },
  { id: "jungle_orchid", name: "Orchid Egg", biome: "jungle", rarity: "Rare", weight: 10, colors: ["#c94dff", "#7a2aae"] },
  { id: "snow_frost", name: "Frost Egg", biome: "snow", rarity: "Common", weight: 65, colors: ["#eef6ff", "#b9d9f2"] },
  { id: "snow_icicle", name: "Icicle Egg", biome: "snow", rarity: "Uncommon", weight: 25, colors: ["#bfe8ff", "#5fb8e0"] },
  { id: "snow_aurora", name: "Aurora Egg", biome: "snow", rarity: "Rare", weight: 10, colors: ["#c9fff0", "#5affd0"] },
  { id: "volcano_ember", name: "Ember Egg", biome: "volcano", rarity: "Common", weight: 65, colors: ["#ff7a3a", "#8a2a0a"] },
  { id: "volcano_obsidian", name: "Obsidian Egg", biome: "volcano", rarity: "Uncommon", weight: 25, colors: ["#2a2a2a", "#5a2a2a"] },
  { id: "volcano_molten", name: "Molten Egg", biome: "volcano", rarity: "Rare", weight: 10, colors: ["#ff3a1a", "#ffb02a"] },
  { id: "abyss_barnacle", name: "Barnacle Egg", biome: "abyss", rarity: "Common", weight: 65, colors: ["#5a7a7a", "#2a4a4a"] },
  { id: "abyss_coral", name: "Coral Egg", biome: "abyss", rarity: "Uncommon", weight: 25, colors: ["#ff7aa0", "#a83a5a"] },
  { id: "abyss_abyssal", name: "Abyssal Egg", biome: "abyss", rarity: "Rare", weight: 10, colors: ["#0a1a3a", "#3a6a9a"] },
  { id: "prehistoric_fossil", name: "Fossil Egg", biome: "prehistoric", rarity: "Common", weight: 65, colors: ["#cfae6c", "#8f6d3c"] },
  { id: "prehistoric_amber", name: "Amber Egg", biome: "prehistoric", rarity: "Uncommon", weight: 25, colors: ["#e8a13a", "#8a5a1a"] },
  { id: "prehistoric_raptor", name: "Raptor Egg", biome: "prehistoric", rarity: "Rare", weight: 10, colors: ["#8a3a1a", "#2a1a0a"] },
  { id: "cosmic_comet", name: "Comet Egg", biome: "cosmic", rarity: "Common", weight: 65, colors: ["#c9d9ff", "#5a7aff"] },
  { id: "cosmic_nebula", name: "Nebula Egg", biome: "cosmic", rarity: "Uncommon", weight: 25, colors: ["#c94dff", "#5a1a8a"] },
  { id: "cosmic_starlight", name: "Starlight Egg", biome: "cosmic", rarity: "Rare", weight: 10, colors: ["#ffffff", "#8ad9ff"] },
  { id: "cherry_petal", name: "Petal Egg", biome: "cherry", rarity: "Common", weight: 65, colors: ["#ffd9e6", "#ff9ec4"] },
  { id: "cherry_sakura", name: "Sakura Egg", biome: "cherry", rarity: "Uncommon", weight: 25, colors: ["#ffb3d1", "#e0608f"] },
  { id: "cherry_koi", name: "Koi Egg", biome: "cherry", rarity: "Rare", weight: 10, colors: ["#ff7a5a", "#c94a2a"] },
  { id: "titan_rubble", name: "Rubble Egg", biome: "titan", rarity: "Common", weight: 65, colors: ["#9aa0ab", "#4a4f5a"] },
  { id: "titan_rune", name: "Rune Egg", biome: "titan", rarity: "Uncommon", weight: 25, colors: ["#5a70b0", "#2a3a6a"] },
  { id: "titan_idol", name: "Idol Egg", biome: "titan", rarity: "Rare", weight: 10, colors: ["#ffc21f", "#8a6a10"] },
  { id: "celestial_halo", name: "Halo Egg", biome: "celestial", rarity: "Common", weight: 65, colors: ["#f2f5ff", "#d8c68e"] },
  { id: "celestial_rift", name: "Rift Egg", biome: "celestial", rarity: "Uncommon", weight: 25, colors: ["#c9a2ff", "#6a2ae0"] },
  { id: "celestial_divine", name: "Divine Egg", biome: "celestial", rarity: "Rare", weight: 10, colors: ["#ffffff", "#ffd966"] },
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

/** Guardian's sleeping spot: partway into its biome, offset toward one wall so it (and its nest ring) reads as a corner cluster, not a big centered arena. */
function guardianHome(biomeId: string): { x: number; z: number } {
  const i = BIOMES.findIndex((b) => b.id === biomeId);
  return { x: (i % 2 === 0 ? -1 : 1) * 16, z: biomeStartZ(i) + biomeLength(i) * 0.4 };
}

export const GUARDIANS: GuardianDef[] = [
  {
    id: "forest_hen",
    name: "Broody Hen",
    biome: "forest",
    home: guardianHome("forest"),
    chaseSpeed: 10.5,
    walkSpeed: 7,
    alertTime: 1.2,
    catchRadius: 2.6,
    knockback: { horizontal: 22, up: 16 },
    maxChaseSec: 45,
  },
  {
    id: "lake_swan",
    name: "Mother Swan",
    biome: "lake",
    home: guardianHome("lake"),
    chaseSpeed: 11.5,
    walkSpeed: 7.5,
    alertTime: 1.1,
    catchRadius: 2.6,
    knockback: { horizontal: 24, up: 16 },
    maxChaseSec: 45,
  },
  {
    id: "desert_scorpion",
    name: "Scorpion Queen",
    biome: "desert",
    home: guardianHome("desert"),
    chaseSpeed: 13,
    walkSpeed: 8.5,
    alertTime: 1,
    catchRadius: 2.6,
    knockback: { horizontal: 26, up: 16 },
    maxChaseSec: 45,
  },
  {
    id: "jungle_jaguar",
    name: "Jaguar Shaman",
    biome: "jungle",
    home: guardianHome("jungle"),
    chaseSpeed: 14.1,
    walkSpeed: 8.8,
    alertTime: 1.05,
    catchRadius: 2.6,
    knockback: { horizontal: 26.5, up: 16 },
    maxChaseSec: 45,
  },
  {
    id: "snow_yeti",
    name: "Frost Yeti",
    biome: "snow",
    home: guardianHome("snow"),
    chaseSpeed: 15.3,
    walkSpeed: 9.4,
    alertTime: 1,
    catchRadius: 2.6,
    knockback: { horizontal: 28, up: 16 },
    maxChaseSec: 45,
  },
  {
    id: "volcano_golem",
    name: "Magma Golem",
    biome: "volcano",
    home: guardianHome("volcano"),
    chaseSpeed: 16.5,
    walkSpeed: 10,
    alertTime: 0.95,
    catchRadius: 2.6,
    knockback: { horizontal: 29.5, up: 16 },
    maxChaseSec: 45,
  },
  {
    id: "abyss_kraken",
    name: "Abyss Kraken",
    biome: "abyss",
    home: guardianHome("abyss"),
    chaseSpeed: 17.7,
    walkSpeed: 10.6,
    alertTime: 0.9,
    catchRadius: 2.6,
    knockback: { horizontal: 31, up: 16 },
    maxChaseSec: 45,
  },
  {
    id: "prehistoric_rex",
    name: "Tyrant Rex",
    biome: "prehistoric",
    home: guardianHome("prehistoric"),
    chaseSpeed: 18.9,
    walkSpeed: 11.2,
    alertTime: 0.85,
    catchRadius: 2.6,
    knockback: { horizontal: 32.5, up: 16 },
    maxChaseSec: 45,
  },
  {
    id: "cosmic_voidwatcher",
    name: "Void Watcher",
    biome: "cosmic",
    home: guardianHome("cosmic"),
    chaseSpeed: 20.1,
    walkSpeed: 11.8,
    alertTime: 0.8,
    catchRadius: 2.6,
    knockback: { horizontal: 34, up: 16 },
    maxChaseSec: 45,
  },
  {
    id: "cherry_spirit",
    name: "Blossom Spirit",
    biome: "cherry",
    home: guardianHome("cherry"),
    chaseSpeed: 21.3,
    walkSpeed: 12.4,
    alertTime: 0.75,
    catchRadius: 2.6,
    knockback: { horizontal: 35.5, up: 16 },
    maxChaseSec: 45,
  },
  {
    id: "titan_guardian",
    name: "Stone Titan",
    biome: "titan",
    home: guardianHome("titan"),
    chaseSpeed: 22.5,
    walkSpeed: 13,
    alertTime: 0.7,
    catchRadius: 2.6,
    knockback: { horizontal: 37, up: 16 },
    maxChaseSec: 45,
  },
  {
    id: "celestial_seraph",
    name: "Seraph Warden",
    biome: "celestial",
    home: guardianHome("celestial"),
    chaseSpeed: 23.7,
    walkSpeed: 13.6,
    alertTime: 0.7,
    catchRadius: 2.6,
    knockback: { horizontal: 38.5, up: 16 },
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
    const r = i % 2 ? 6 : 8;
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
