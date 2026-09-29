// World layout. 1 unit ≈ 1 meter; the player is 2 units tall.
// The hub (bases + shops) sits at z < 0. The biome corridor runs from z = 0 toward +z.

export const WALL_HEIGHT = 22;

export const HUB = {
  xMin: -100,
  xMax: 100,
  zMin: -90,
  zMax: 0,
} as const;

/** Half-width of the biome corridor (walls at x = ±CORRIDOR_HALF_WIDTH). */
export const CORRIDOR_HALF_WIDTH = 32;

/** Painted "SAFE ZONE" line. Everything with z < SAFE_ZONE_Z is safe. */
export const SAFE_ZONE_Z = 0;

export const MAX_PLAYERS = 7;

// ---------------------------------------------------------------- bases
//
// 5 pens packed into a main row, plus 2 more further out to the sides and
// pulled forward (closer to the corridor):
//   [x]                     [x]
//       [ ] [ ] [ ] [ ] [ ]

export const BASE = {
  count: MAX_PLAYERS,
  /** How many pens sit in the tight main row (the rest go to the far sides). */
  mainRowCount: 5,
  spacing: 25,
  penWidth: 20,
  penDepth: 22,
  /** z of the main row's pen centers. */
  penZ: -62,
  /** x of the two side pens (mirrored: -sideX and +sideX). */
  sideX: 80,
  /** z of the two side pens — forward of the main row, closer to the corridor. */
  sideZ: -35,
} as const;

export interface BasePlot {
  index: number;
  /** Pen center. */
  cx: number;
  cz: number;
  spawn: { x: number; z: number };
  treadmill: { x: number; z: number };
  /** Owner name painted on the floor in front of the gate. */
  sign: { x: number; z: number };
  /** "Upgrade" board beside the treadmill. */
  treadmillSign: { x: number; z: number };
  /** "Upgrade Pen" board just inside the gate. */
  penSign: { x: number; z: number };
}

/** How close (units) a player must be to use a sign, stall or machine (server-checked). */
export const USE_RANGE = 7;

/** Inner rectangle of a base's pen, shrunk by `inset` from the fence. */
export function penBounds(index: number, inset = 0) {
  const { cx, cz } = basePlot(index);
  return {
    x0: cx - BASE.penWidth / 2 + inset,
    x1: cx + BASE.penWidth / 2 - inset,
    z0: cz - BASE.penDepth / 2 + inset,
    z1: cz + BASE.penDepth / 2 - inset,
  };
}

export function inPen(index: number, x: number, z: number, inset = 0) {
  const b = penBounds(index, inset);
  return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
}

export function basePlot(index: number): BasePlot {
  let cx: number;
  let cz: number;
  if (index < BASE.mainRowCount) {
    cx = -((BASE.mainRowCount - 1) * BASE.spacing) / 2 + index * BASE.spacing;
    cz = BASE.penZ;
  } else {
    const side = index - BASE.mainRowCount; // 0 = left, 1 = right
    cx = side === 0 ? -BASE.sideX : BASE.sideX;
    cz = BASE.sideZ;
  }
  const front = cz + BASE.penDepth / 2;
  return {
    index,
    cx,
    cz,
    spawn: { x: cx - 4, z: front + 6 },
    treadmill: { x: cx + 5, z: front + 7 },
    sign: { x: cx, z: front + 3 },
    treadmillSign: { x: cx + 9.2, z: front + 7 },
    penSign: { x: cx + 6, z: front - 2.5 },
  };
}

// ---------------------------------------------------------------- treadmills

/** Treadmill footprint (centered on BasePlot.treadmill, runner faces +Z). Matches the placeholder model. */
export const TREADMILL_SHAPE = {
  deckHalfWidth: 1.25,
  deckHalfLength: 2.6,
  /** Height of the belt surface. */
  deckTop: 0.55,
  beltHalfWidth: 0.95,
  beltHalfLength: 2.35,
} as const;

/** Base index whose treadmill deck is under (x, z), or -1. */
export function treadmillDeckAt(x: number, z: number): number {
  for (let i = 0; i < BASE.count; i++) {
    const t = basePlot(i).treadmill;
    if (Math.abs(x - t.x) <= TREADMILL_SHAPE.deckHalfWidth && Math.abs(z - t.z) <= TREADMILL_SHAPE.deckHalfLength) return i;
  }
  return -1;
}

/** True when (x, y, z) is standing on the moving belt of base `index`'s treadmill. */
export function isOnBelt(index: number, x: number, y: number, z: number): boolean {
  const t = basePlot(index).treadmill;
  return (
    Math.abs(x - t.x) <= TREADMILL_SHAPE.beltHalfWidth &&
    Math.abs(z - t.z) <= TREADMILL_SHAPE.beltHalfLength &&
    Math.abs(y - TREADMILL_SHAPE.deckTop) < 0.35
  );
}

/** Height of the walkable surface at (x, z): treadmill decks are raised, everything else is y = 0. */
export function groundHeightAt(x: number, z: number): number {
  return treadmillDeckAt(x, z) >= 0 ? TREADMILL_SHAPE.deckTop : 0;
}

// ---------------------------------------------------------------- shared hub buildings

export const HUB_BUILDINGS = {
  sell: { x: -60, z: -9, label: "SELL" },
  fuse: { x: -30, z: -9, label: "Fuse Machine" },
  potion: { x: 0, z: -18, label: "POTION" },
  trails: { x: 30, z: -9, label: "TRAILS SHOP" },
  leaderboard: { x: 60, z: -10, label: "MOST MONEY/s" },
  chest: { x: 45.5, z: -9.5, label: "FREE CHEST" },
} as const;

/** Where players stand to use a hub building: in front of it (buildings face the bases, -Z). */
export function useSpot(b: { x: number; z: number }) {
  return { x: b.x, z: b.z - 4 };
}

// ---------------------------------------------------------------- biomes

export interface BiomeDef {
  id: string;
  name: string;
  emoji: string;
  /** Soft requirement shown on signs ("X recommended"). */
  recommendedSpeed: number;
  floor: string;
  wall: string;
  wallAlt: string;
  wallTop: string;
  sky: "day" | "night";
}

/** Fallback/legacy length some callers still reference; biomes now vary in length (see biomeLength). */
export const BIOME_LENGTH = 200;

export const BIOMES: BiomeDef[] = [
  { id: "forest", name: "Forest", emoji: "🌳", recommendedSpeed: 0, floor: "#5fd12e", wall: "#c07a3c", wallAlt: "#b06c30", wallTop: "#3ad13a", sky: "day" },
  { id: "lake", name: "Lake", emoji: "🦢", recommendedSpeed: 900, floor: "#4cc23a", wall: "#c07a3c", wallAlt: "#b06c30", wallTop: "#3ad13a", sky: "day" },
  { id: "desert", name: "Desert", emoji: "🌵", recommendedSpeed: 10_000, floor: "#ecd49a", wall: "#dcb660", wallAlt: "#cfa650", wallTop: "#f0cf78", sky: "day" },
  { id: "jungle", name: "Jungle", emoji: "😬", recommendedSpeed: 40_000, floor: "#35a92c", wall: "#b8743a", wallAlt: "#a8662e", wallTop: "#2fbf2f", sky: "day" },
  { id: "snow", name: "Snow", emoji: "❄️", recommendedSpeed: 170_000, floor: "#eef2f7", wall: "#c07a3c", wallAlt: "#b06c30", wallTop: "#a8dcff", sky: "day" },
  { id: "volcano", name: "Volcano", emoji: "🌋", recommendedSpeed: 700_000, floor: "#3b3b46", wall: "#2a2a31", wallAlt: "#232329", wallTop: "#ff7a1a", sky: "day" },
  { id: "abyss", name: "Abyss Ocean", emoji: "🌊", recommendedSpeed: 2_500_000, floor: "#1d3fc4", wall: "#2150c8", wallAlt: "#1a45b0", wallTop: "#3a7bff", sky: "day" },
  { id: "prehistoric", name: "Prehistoric", emoji: "🦖", recommendedSpeed: 18_000_000, floor: "#cfae6c", wall: "#8f6d3c", wallAlt: "#7f5f32", wallTop: "#6f9a3a", sky: "day" },
  { id: "cosmic", name: "Cosmic", emoji: "👹", recommendedSpeed: 700_000_000, floor: "#1b2452", wall: "#0c1026", wallAlt: "#10152e", wallTop: "#ffffff", sky: "night" },
  { id: "cherry", name: "Cherry Blossom", emoji: "🌸", recommendedSpeed: 2_500_000_000, floor: "#f6c8d8", wall: "#9a5064", wallAlt: "#8a4658", wallTop: "#ff9ec4", sky: "day" },
  { id: "titan", name: "Titan Temple", emoji: "🗿", recommendedSpeed: 7_000_000_000, floor: "#5fbf4a", wall: "#5a70b0", wallAlt: "#4d62a0", wallTop: "#38b038", sky: "day" },
  { id: "celestial", name: "Celestial Rift", emoji: "😇", recommendedSpeed: 20_000_000_000, floor: "#f2f5ff", wall: "#d8c68e", wallAlt: "#cbb87e", wallTop: "#ffd966", sky: "day" },
];

/** Biomes start short near the hub and gradually stretch out the further you go. */
const BIOME_BASE_LENGTH = 90;
const BIOME_LENGTH_STEP = 14;

export function biomeLength(index: number): number {
  return BIOME_BASE_LENGTH + Math.max(0, index) * BIOME_LENGTH_STEP;
}

const BIOME_STARTS: number[] = (() => {
  const starts: number[] = [];
  let z = 0;
  for (let i = 0; i < BIOMES.length; i++) {
    starts.push(z);
    z += biomeLength(i);
  }
  return starts;
})();

export const CORRIDOR_END_Z = BIOME_STARTS[BIOMES.length - 1] + biomeLength(BIOMES.length - 1);

export function biomeStartZ(index: number): number {
  return BIOME_STARTS[index] ?? 0;
}

/** Biome at a world z, or null inside the hub. */
export function biomeAt(z: number): BiomeDef | null {
  if (z < 0) return null;
  for (let i = BIOMES.length - 1; i >= 0; i--) if (z >= BIOME_STARTS[i]) return BIOMES[i];
  return null;
}

// ---------------------------------------------------------------- bounds

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Keeps a character of the given radius inside the walkable area:
 * the wide hub rectangle plus the narrower corridor in front of it.
 */
export function clampToWorld(x: number, z: number, radius = 0.8): { x: number; z: number } {
  x = clamp(x, HUB.xMin + radius, HUB.xMax - radius);
  if (Math.abs(x) > CORRIDOR_HALF_WIDTH - radius) {
    // Beside the corridor mouth: blocked by the hub's front wall.
    z = clamp(z, HUB.zMin + radius, HUB.zMax - radius);
  } else {
    z = clamp(z, HUB.zMin + radius, CORRIDOR_END_Z - radius);
  }
  return { x, z };
}
