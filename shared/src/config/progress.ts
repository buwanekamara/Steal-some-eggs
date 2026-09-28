// Upgrades, trails, the Shop, the Pet Index, selling and fusing. All balance numbers live here.

import type { Rarity } from "./eggs.ts";

// ---------------------------------------------------------------- pen levels (fence tiers)

export interface PenLevel {
  level: number;
  name: string;
  /** Fence rail / post colors. */
  rail: string;
  post: string;
  /** Extra income for pets in this pen (0.1 = +10%). */
  incomeBonus: number;
  /** Money cost to upgrade TO this level. */
  cost: number;
}

/** Reference: a new pen is white; upgrading turns it wooden. We keep going from there. */
export const PEN_LEVELS: PenLevel[] = [
  { level: 1, name: "White Fence", rail: "#f4f4f6", post: "#4b4550", incomeBonus: 0, cost: 0 },
  { level: 2, name: "Wooden Fence", rail: "#b86b2e", post: "#5a3a22", incomeBonus: 0.1, cost: 2_500 },
  { level: 3, name: "Stone Fence", rail: "#9aa0ab", post: "#4a4f5a", incomeBonus: 0.25, cost: 60_000 },
  { level: 4, name: "Gold Fence", rail: "#ffc21f", post: "#8a6a10", incomeBonus: 0.5, cost: 1_500_000 },
  { level: 5, name: "Diamond Fence", rail: "#7fe8ff", post: "#2a6f9a", incomeBonus: 1, cost: 40_000_000 },
];

export function penLevel(level: number): PenLevel {
  return PEN_LEVELS[Math.max(0, Math.min(PEN_LEVELS.length - 1, level - 1))];
}

// ---------------------------------------------------------------- trails

export interface TrailDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** Movement speed multiplier while equipped. */
  speedMult: number;
  color: string;
  /** Money price (0 = free / starter). */
  price: number;
}

export const TRAILS: TrailDef[] = [
  { id: "grey", name: "Grey Trail", rarity: "Common", speedMult: 1.1, color: "#c9ccd3", price: 2_000 },
  { id: "green", name: "Green Trail", rarity: "Uncommon", speedMult: 1.2, color: "#5ee04a", price: 20_000 },
  { id: "blue", name: "Blue Trail", rarity: "Rare", speedMult: 1.35, color: "#2f9bff", price: 250_000 },
  { id: "purple", name: "Purple Trail", rarity: "Epic", speedMult: 1.5, color: "#c04dff", price: 3_000_000 },
  { id: "fire", name: "Fire Trail", rarity: "Legendary", speedMult: 1.75, color: "#ff7a1a", price: 50_000_000 },
  { id: "rainbow", name: "Rainbow Trail", rarity: "Mythic", speedMult: 2, color: "#ff5ec8", price: 1_000_000_000 },
];

export const TRAIL_BY_ID = new Map(TRAILS.map((t) => [t.id, t]));

export function trailMult(id: string): number {
  return TRAIL_BY_ID.get(id)?.speedMult ?? 1;
}

// ---------------------------------------------------------------- selling and fusing

/** A pet sells for its $/s times this. Reference: a $1/s pet sells for $100. */
export const SELL_MULT = 100;

export const FUSE = {
  /** How many pets of the same species go in. */
  inputs: 3,
  /** Result weight = sum of input weights × this (a bit less than keeping all three, but one slot instead of three). */
  weightFactor: 0.8,
  /** Chance per mutated input that the result keeps that mutation ("better pets give more luck"). */
  mutationKeepChance: 0.35,
} as const;

// ---------------------------------------------------------------- Pet Index

/** Discovery rewards per rarity: [money multiplier of the pet's $/s, Speed stat]. Claimed once per species. */
export const INDEX_REWARD: Record<Rarity, { incomeMult: number; speed: number }> = {
  Common: { incomeMult: 100, speed: 100 },
  Uncommon: { incomeMult: 100, speed: 300 },
  Rare: { incomeMult: 120, speed: 1_000 },
  Epic: { incomeMult: 150, speed: 5_000 },
  Legendary: { incomeMult: 200, speed: 25_000 },
  Mythic: { incomeMult: 250, speed: 150_000 },
  Secret: { incomeMult: 300, speed: 500_000 },
};

/** Completing a biome page (every pet discovered): Gems + one extra pen slot. */
export const INDEX_COMPLETE_REWARD = { gems: 50, slots: 1 } as const;

// ---------------------------------------------------------------- Shop (priced in Gems)

/** Limited-time Featured egg (reference: a big event egg with drop odds and bundles). */
export const FEATURED = {
  eggId: "limited_nugget",
  /** Event ends at this date (ms since epoch). */
  endsAt: Date.UTC(2026, 10, 30),
  bundles: [
    { count: 1, gems: 25 },
    { count: 3, gems: 65 },
    { count: 10, gems: 200, was: 250 },
  ],
} as const;

export interface ShopItem {
  id: string;
  tab: "speed" | "money";
  title: string;
  desc: string;
  icon: string;
  gems: number;
  /** What it gives. */
  speedBoostMin?: number;
  speed?: number;
  /** Money = max(flat, your $/s × incomeSeconds). */
  money?: { flat: number; incomeSeconds: number };
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "boost10", tab: "speed", title: "x2 Speed (10 min)", desc: "Double Speed from your treadmill for 10 minutes.", icon: "⚡", gems: 15, speedBoostMin: 10 },
  { id: "boost60", tab: "speed", title: "x2 Speed (1 hour)", desc: "Double Speed from your treadmill for an hour.", icon: "⚡", gems: 60, speedBoostMin: 60 },
  { id: "speed5k", tab: "speed", title: "+5K Speed", desc: "An instant Speed boost.", icon: "👟", gems: 20, speed: 5_000 },
  { id: "cash1", tab: "money", title: "Pile of Cash", desc: "$10K, or 10 minutes of your income if that's more.", icon: "💵", gems: 20, money: { flat: 10_000, incomeSeconds: 600 } },
  { id: "cash2", tab: "money", title: "Bag of Cash", desc: "$100K, or 1 hour of your income if that's more.", icon: "💰", gems: 90, money: { flat: 100_000, incomeSeconds: 3_600 } },
  { id: "cash3", tab: "money", title: "Vault of Cash", desc: "$1M, or 8 hours of your income if that's more.", icon: "🏦", gems: 400, money: { flat: 1_000_000, incomeSeconds: 28_800 } },
];

export const SHOP_BY_ID = new Map(SHOP_ITEMS.map((s) => [s.id, s]));

/** Treadmill Speed multiplier while a boost is active. */
export const SPEED_BOOST_MULT = 2;
