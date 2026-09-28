// Balance values. Edit these to tune the game; services only read from here.

export const MOVEMENT = {
  /** Walk speed (units/s) with 0 Speed stat, also the Slow Mode speed. */
  baseWalkSpeed: 8,
  /** Extra walk speed per power of ten of the Speed stat. */
  walkSpeedPerDecade: 3.2,
  maxWalkSpeed: 48,
  jumpVelocity: 15,
  gravity: 45,
  /** Highest y a player may report (jump apex plus slack). */
  maxY: 12,
} as const;

/**
 * Maps the huge Speed stat (0 … billions) to a playable walk speed.
 * The stat gates progress; this curve keeps movement controllable.
 */
export function walkSpeedFromStat(speedStat: number, slowMode = false, trailMult = 1): number {
  if (slowMode) return MOVEMENT.baseWalkSpeed;
  const v = MOVEMENT.baseWalkSpeed + MOVEMENT.walkSpeedPerDecade * Math.log10(1 + Math.max(0, speedStat));
  // Trails multiply movement speed; the hard cap keeps top players controllable.
  return Math.min(MOVEMENT.maxWalkSpeed * 1.25, Math.min(MOVEMENT.maxWalkSpeed, v) * trailMult);
}

export const NETWORK = {
  /** Client → server position updates per second. */
  sendRate: 20,
  /** Remote players render this many ms in the past for smooth interpolation. */
  interpolationDelayMs: 100,
  /** Multiplier on the allowed distance per update before the server snaps a player back. */
  moveTolerance: 1.6,
  /** Flat extra distance allowed per update (units), covers jitter. */
  moveSlack: 1.5,
} as const;

// ---------------------------------------------------------------- treadmill

export interface TreadmillLevel {
  level: number;
  /** Speed stat gained per step ("+N/step"). */
  gainPerStep: number;
  /** Visual tier 1–4 (placeholder / manifest ids treadmillTier1…4). */
  tier: 1 | 2 | 3 | 4;
  /** Money cost to upgrade TO this level. */
  cost: number;
}

export const TREADMILL = {
  /** Steps counted per second while running on the belt. */
  stepsPerSecond: 4,
  levels: [
    { level: 1, gainPerStep: 2, tier: 1, cost: 0 },
    { level: 2, gainPerStep: 5, tier: 2, cost: 1_000 },
    { level: 3, gainPerStep: 12, tier: 3, cost: 25_000 },
    { level: 4, gainPerStep: 30, tier: 4, cost: 500_000 },
    { level: 5, gainPerStep: 75, tier: 4, cost: 10_000_000 },
  ] as TreadmillLevel[],
};

export function treadmillLevel(level: number): TreadmillLevel {
  const lv = TREADMILL.levels;
  return lv[Math.max(0, Math.min(lv.length - 1, level - 1))];
}

// ---------------------------------------------------------------- world events (effects arrive in Phase 6)

export const WORLD_EVENTS = {
  /** Seconds between nights. */
  nightEverySec: 300,
  /** Seconds between potion spawns. */
  potionEverySec: 900,
  /** Shifts the potion cycle so it doesn't land on the same moment as a night. */
  potionOffsetSec: 150,
} as const;

// ---------------------------------------------------------------- persistence

export const SAVE = {
  /** Autosave interval for everyone in a room. */
  autosaveSec: 30,
} as const;

export const DEV = {
  /** Speed stat given to brand-new profiles. */
  startingSpeedStat: 0,
  startingMoney: 0,
  startingGems: 0,
  /** Dev cheat amounts (dev builds only). */
  cheatMoney: 1_000_000,
  cheatGems: 100,
} as const;
