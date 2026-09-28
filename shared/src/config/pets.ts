// Pets, hatching, mutations, pen capacity and income. All balance numbers live here.

import type { Rarity } from "./eggs.ts";

export interface PetDef {
  id: string;
  name: string;
  biome: string;
  rarity: Rarity;
  /** $/s at the base weight with no mutation. */
  baseIncome: number;
  /** Typical weight in Kg (income and size scale with weight). */
  baseWeight: number;
  /** Height in units of the placeholder model at base weight. */
  height: number;
  /** Colors for the placeholder model: body, accent. */
  colors: [string, string];
  /** Emoji for menus until real icons exist. */
  icon: string;
  /** Body plan for the placeholder model. */
  shape: "bird" | "quad" | "biped";
  /** Model id in manifest.json (defaults to `pet_<id>`). */
  model?: string;
}

export const PETS: PetDef[] = [
  { id: "forest_chick", name: "Chick", biome: "forest", rarity: "Common", baseIncome: 1, baseWeight: 2, height: 1.8, colors: ["#ffe066", "#ff9f1c"], icon: "🐤", shape: "bird" },
  { id: "forest_bunny", name: "Bunny", biome: "forest", rarity: "Common", baseIncome: 2, baseWeight: 1.5, height: 2.0, colors: ["#f2f2f2", "#ffb3c7"], icon: "🐰", shape: "quad" },
  { id: "forest_piglet", name: "Piglet", biome: "forest", rarity: "Uncommon", baseIncome: 6, baseWeight: 5, height: 2.4, colors: ["#ff9ec4", "#e0608f"], icon: "🐷", shape: "quad" },
  { id: "forest_fox", name: "Fox", biome: "forest", rarity: "Uncommon", baseIncome: 12, baseWeight: 6, height: 2.8, colors: ["#f07b2a", "#ffffff"], icon: "🦊", shape: "quad" },
  { id: "forest_owl", name: "Burrowing Owl", biome: "forest", rarity: "Rare", baseIncome: 40, baseWeight: 3, height: 3.0, colors: ["#8a5a33", "#f2d49b"], icon: "🦉", shape: "bird" },
  { id: "forest_bear", name: "Bear", biome: "forest", rarity: "Epic", baseIncome: 250, baseWeight: 40, height: 4.8, colors: ["#7a4a24", "#c49a6c"], icon: "🐻", shape: "biped" },
  { id: "forest_stag", name: "Stag", biome: "forest", rarity: "Legendary", baseIncome: 900, baseWeight: 30, height: 5.2, colors: ["#a86a3a", "#f4e3c8"], icon: "🦌", shape: "quad" },
  { id: "forest_spirit", name: "Forest Spirit", biome: "forest", rarity: "Mythic", baseIncome: 5000, baseWeight: 8, height: 4.5, colors: ["#7dffb0", "#ffffff"], icon: "🧚", shape: "biped" },
  // Limited pets: only from the Featured shop egg.
  { id: "limited_goldhen", name: "Golden Hen", biome: "limited", rarity: "Rare", baseIncome: 60, baseWeight: 4, height: 2.6, colors: ["#ffcf3a", "#ff7a1a"], icon: "🐔", shape: "bird" },
  { id: "limited_luckycat", name: "Lucky Cat", biome: "limited", rarity: "Epic", baseIncome: 400, baseWeight: 6, height: 2.6, colors: ["#fff6e6", "#ff3b3b"], icon: "🐱", shape: "quad" },
  { id: "limited_crystaldeer", name: "Crystal Deer", biome: "limited", rarity: "Legendary", baseIncome: 1_500, baseWeight: 25, height: 4.6, colors: ["#9ff3ff", "#ffffff"], icon: "🦌", shape: "quad" },
  { id: "limited_nuggetking", name: "Nugget King", biome: "limited", rarity: "Mythic", baseIncome: 8_000, baseWeight: 30, height: 5, colors: ["#ffc21f", "#8a6a10"], icon: "👑", shape: "biped" },
];

export const PET_BY_ID = new Map(PETS.map((p) => [p.id, p]));

export function petModelId(def: PetDef) {
  return def.model ?? `pet_${def.id}`;
}

// ---------------------------------------------------------------- hatching

export interface HatchInfo {
  /** Seconds to grow in the pen before it can hatch. */
  growSec: number;
  /** [petId, weight] — what this egg can hatch into. */
  pets: [string, number][];
}

export const HATCH: Record<string, HatchInfo> = {
  forest_speckled: {
    growSec: 30,
    pets: [["forest_chick", 45], ["forest_bunny", 35], ["forest_piglet", 12], ["forest_fox", 6], ["forest_owl", 2]],
  },
  forest_mossy: {
    growSec: 60,
    pets: [["forest_bunny", 25], ["forest_piglet", 30], ["forest_fox", 28], ["forest_owl", 12], ["forest_bear", 5]],
  },
  forest_acorn: {
    growSec: 120,
    pets: [["forest_fox", 30], ["forest_owl", 35], ["forest_bear", 25], ["forest_stag", 9], ["forest_spirit", 1]],
  },
  limited_nugget: {
    growSec: 60,
    pets: [["forest_owl", 30], ["limited_goldhen", 35], ["limited_luckycat", 24], ["limited_crystaldeer", 10], ["limited_nuggetking", 1]],
  },
};

/** Drop odds of an egg as percentages (for the Shop's Featured banner). */
export function hatchOdds(eggDefId: string): { petId: string; pct: number }[] {
  const pool = HATCH[eggDefId]?.pets ?? [];
  const total = pool.reduce((a, [, w]) => a + w, 0);
  return pool.map(([petId, w]) => ({ petId, pct: +((w / total) * 100).toFixed(2) }));
}

/** Growing eggs get physically bigger: scale multiplier when ready. */
export const GROW_SCALE = 2.2;

// ---------------------------------------------------------------- mutations

export interface MutationDef {
  id: string;
  /** Name prefix ("Golden Fox"); empty for normal pets. */
  prefix: string;
  chance: number;
  incomeMult: number;
  /** Tint over the pet's colors ("" = none). */
  color: string;
  /** Material look for the placeholder. */
  metallic: boolean;
}

/** Checked rarest first; whatever doesn't roll a mutation is Normal. */
export const MUTATIONS: MutationDef[] = [
  { id: "rainbow", prefix: "Rainbow", chance: 0.005, incomeMult: 5, color: "#ff5ec8", metallic: false },
  { id: "golden", prefix: "Golden", chance: 0.03, incomeMult: 2, color: "#ffc21f", metallic: true },
];

export const MUTATION_BY_ID = new Map(MUTATIONS.map((m) => [m.id, m]));

// ---------------------------------------------------------------- pen capacity

export const PEN = {
  /** Slots a new player starts with (active pets + growing eggs share them). */
  startSlots: 4,
  maxSlots: 20,
  /** Eggs can't be planted closer than this to each other. */
  eggSpacing: 3,
  /** Pets and eggs stay this far inside the fence. */
  inset: 1.8,
} as const;

/** Money cost of the next slot when you own `slots` slots. */
export function slotCost(slots: number): number {
  const k = slots - PEN.startSlots;
  return Math.round(500 * 5 ** k);
}

// ---------------------------------------------------------------- rolls and income

function weighted<T>(items: [T, number][], rnd: number): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rnd * total;
  for (const [item, w] of items) if ((r -= w) < 0) return item;
  return items[items.length - 1][0];
}

export function rollPet(eggDefId: string, rnd: number): PetDef {
  return PET_BY_ID.get(weighted(HATCH[eggDefId].pets, rnd))!;
}

export function rollMutation(rnd: number): MutationDef | null {
  let acc = 0;
  for (const m of MUTATIONS) if (rnd < (acc += m.chance)) return m;
  return null;
}

/** Weight in Kg: bigger eggs give heavier pets, with ±20% randomness. */
export function rollWeight(pet: PetDef, eggSize: number, rnd: number): number {
  return +(pet.baseWeight * eggSize * (0.8 + rnd * 0.45)).toFixed(1);
}

export function petIncome(pet: PetDef, weight: number, mutation: string): number {
  const mult = mutation ? (MUTATION_BY_ID.get(mutation)?.incomeMult ?? 1) : 1;
  return Math.max(1, Math.round(pet.baseIncome * (weight / pet.baseWeight) * mult));
}

/** Model scale for a pet of this weight (volume grows with weight, so size grows with its cube root). */
export function petScale(pet: PetDef, weight: number): number {
  return Math.cbrt(weight / pet.baseWeight);
}

export function petDisplayName(pet: PetDef, mutation: string): string {
  const m = mutation ? MUTATION_BY_ID.get(mutation) : undefined;
  return m ? `${m.prefix} ${pet.name}` : pet.name;
}
