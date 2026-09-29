// World layout. 1 unit ≈ 1 meter; the player is 2 units tall.
// The hub (bases + shops) sits at z < 0. The biome corridor runs from z = 0 toward +z.

export const WALL_HEIGHT = 22;

export const HUB = {
  xMin: -115,
  xMax: 115,
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
  sideZ: -30,
} as const;

export interface BasePlot {
  index: number;
  /** Yaw of the pen's "front" (gate side, treadmill, signs): 0 faces +z; the two side pens are turned to face each other. */
  rotY: number;
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

/** Turns a pen-local offset (dx sideways, dz toward the gate) into a world offset for a pen turned by `rotY`. */
export function rotateOffset(rotY: number, dx: number, dz: number) {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return { x: dx * c + dz * s, z: -dx * s + dz * c };
}

/** The inverse: a world offset from a pen-local origin, expressed in the pen's own axes. */
export function unrotateOffset(rotY: number, x: number, z: number) {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return { dx: x * c - z * s, dz: x * s + z * c };
}

/** Inner rectangle of a base's pen, shrunk by `inset` from the fence. */
export function penBounds(index: number, inset = 0, level = 1) {
  const { cx, cz, rotY } = basePlot(index);
  // A level-1 pen is W × D around its center with the gate toward local +z. Upgrades push the back (local -z) out.
  const grow = penGrowth(level);
  const corners = [
    [-BASE.penWidth / 2, -BASE.penDepth / 2 - grow],
    [BASE.penWidth / 2, BASE.penDepth / 2],
  ].map(([dx, dz]) => rotateOffset(rotY, dx, dz)); // turned pens swap which axis is which
  return {
    x0: cx + Math.min(corners[0].x, corners[1].x) + inset,
    x1: cx + Math.max(corners[0].x, corners[1].x) - inset,
    z0: cz + Math.min(corners[0].z, corners[1].z) + inset,
    z1: cz + Math.max(corners[0].z, corners[1].z) - inset,
  };
}

/** Extra pen depth (units) at a pen level: each upgrade pushes the back fence out by this much. */
export const PEN_GROWTH_PER_LEVEL = 3;
export function penGrowth(level: number) {
  return Math.max(0, level - 1) * PEN_GROWTH_PER_LEVEL;
}

export function inPen(index: number, x: number, z: number, inset = 0, level = 1) {
  const b = penBounds(index, inset, level);
  return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
}

export function basePlot(index: number): BasePlot {
  let cx: number;
  let cz: number;
  let rotY = 0;
  if (index < BASE.mainRowCount) {
    cx = -((BASE.mainRowCount - 1) * BASE.spacing) / 2 + index * BASE.spacing;
    cz = BASE.penZ;
  } else {
    const side = index - BASE.mainRowCount; // 0 = left, 1 = right
    cx = side === 0 ? -BASE.sideX : BASE.sideX;
    cz = BASE.sideZ;
    rotY = side === 0 ? Math.PI / 2 : -Math.PI / 2; // the two side pens face each other across the hub
  }
  const front = BASE.penDepth / 2;
  // Everything is laid out for a pen facing +z, then turned around the pen's center.
  const at = (dx: number, dz: number) => {
    const o = rotateOffset(rotY, dx, dz);
    return { x: cx + o.x, z: cz + o.z };
  };
  return {
    index,
    rotY,
    cx,
    cz,
    spawn: at(-4, front + 6),
    treadmill: at(5, front + 7),
    sign: at(0, front + 3),
    treadmillSign: at(9.2, front + 7),
    penSign: at(6, front - 2.5),
  };
}

/** Where the floating offline-earnings cash sits in a pen; walk into it to collect. */
export function offlineCashSpot(index: number) {
  const p = basePlot(index);
  return { x: p.cx, z: p.cz };
}
/** How close (xz) a player must be to grab the cash. The server accepts a bit more than the client asks for (lag). */
export const OFFLINE_CASH_GRAB_RADIUS = 3.5;
export const OFFLINE_CASH_SERVER_RADIUS = 7;

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
    const p = basePlot(i);
    const { dx, dz } = unrotateOffset(p.rotY, x - p.treadmill.x, z - p.treadmill.z);
    if (Math.abs(dx) <= TREADMILL_SHAPE.deckHalfWidth && Math.abs(dz) <= TREADMILL_SHAPE.deckHalfLength) return i;
  }
  return -1;
}

/** True when (x, y, z) is standing on the moving belt of base `index`'s treadmill. */
export function isOnBelt(index: number, x: number, y: number, z: number): boolean {
  const p = basePlot(index);
  const { dx, dz } = unrotateOffset(p.rotY, x - p.treadmill.x, z - p.treadmill.z);
  return Math.abs(dx) <= TREADMILL_SHAPE.beltHalfWidth && Math.abs(dz) <= TREADMILL_SHAPE.beltHalfLength && Math.abs(y - TREADMILL_SHAPE.deckTop) < 0.35;
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

/** What makes each biome feel different: a walking-speed modifier, a fog color for the atmosphere and a name/blurb shown on entry. */
export interface BiomeTrait {
  name: string;
  desc: string;
  /** Multiplier on walk speed while inside (client and server agree, so boosts don't rubber-band). */
  speedMult: number;
  fog: string;
}

export const BIOME_TRAITS: Record<string, BiomeTrait> = {
  forest: { name: "Cozy Woods", desc: "Calm and safe: a gentle place to start.", speedMult: 1, fog: "#bfe3ff" },
  lake: { name: "Misty Shores", desc: "Cool mist drifts over the water.", speedMult: 1, fog: "#c8f0f4" },
  desert: { name: "Scorching Sands", desc: "Loose sand and heat: you move 8% slower.", speedMult: 0.92, fog: "#f3dca0" },
  jungle: { name: "Thick Vines", desc: "Tangled undergrowth: you move 5% slower.", speedMult: 0.95, fog: "#a6d98a" },
  snow: { name: "Icy Slide", desc: "Slippery ice: you move 8% faster.", speedMult: 1.08, fog: "#e4f1fb" },
  volcano: { name: "Ash & Heat", desc: "Choking ash: you move 8% slower.", speedMult: 0.92, fog: "#5a2a22" },
  abyss: { name: "Deep Currents", desc: "Heavy water: you move 10% slower.", speedMult: 0.9, fog: "#1a3a9a" },
  prehistoric: { name: "Primal Stomp", desc: "Ancient and wild. Watch for the Rex.", speedMult: 1, fog: "#d9c48a" },
  cosmic: { name: "Low Gravity", desc: "Floating between stars: you move 10% faster.", speedMult: 1.1, fog: "#1b1447" },
  cherry: { name: "Petal Breeze", desc: "A warm wind at your back: 5% faster.", speedMult: 1.05, fog: "#ffd9e8" },
  titan: { name: "Ancient Weight", desc: "Heavy stone air: you move 5% slower.", speedMult: 0.95, fog: "#a9b9dc" },
  celestial: { name: "Heavenly Winds", desc: "Winds lift you: you move 12% faster.", speedMult: 1.12, fog: "#fff4d0" },
};

/** Walk speed multiplier at a world z (1 in the hub). */
export function biomeSpeedMult(z: number): number {
  const b = biomeAt(z);
  return b ? (BIOME_TRAITS[b.id]?.speedMult ?? 1) : 1;
}

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
  const sideLimit = CORRIDOR_HALF_WIDTH - radius;
  const hubFrontZ = HUB.zMax - radius;
  if (Math.abs(x) > sideLimit && z > hubFrontZ) {
    // Past the corridor's side wall AND beyond the hub's front wall line: either you pushed sideways into a corridor wall
    // (slide along it) or you walked into the hub's front wall from inside the hub (stop at it). Fix whichever is the
    // smaller move; snapping a corridor runner back into the hub was the "teleport to the safe zone" glitch.
    if (Math.abs(x) - sideLimit < z - hubFrontZ) x = Math.sign(x) * sideLimit;
    else z = hubFrontZ;
  }
  if (Math.abs(x) > sideLimit) {
    // Beside the corridor mouth: blocked by the hub's front wall.
    z = clamp(z, HUB.zMin + radius, hubFrontZ);
  } else {
    z = clamp(z, HUB.zMin + radius, CORRIDOR_END_Z - radius);
  }
  return { x, z };
}
