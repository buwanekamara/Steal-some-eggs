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

// ---------------------------------------------------------------- world events

export const WORLD_EVENTS = {
  /** Seconds between the start of one night and the start of the next: a 3m 30s day plus the 30s night. */
  nightEverySec: 240,
  /** How long a night lasts: every biome is sealed off and everyone is pulled back to the hub. */
  nightDurationSec: 30,
  /** Eggs growing in the pen finish this many times faster while it's night. */
  nightGrowMult: 30,
  /** Seconds between potion spawns. Once spawned, it waits at its spot until someone claims it. */
  potionEverySec: 900,
  /** Shifts the potion cycle so it doesn't land on the same moment as a night. */
  potionOffsetSec: 150,
  /** x2 Speed-gain boost granted by claiming the potion. */
  potionBoostMin: 5,
} as const;

// ---------------------------------------------------------------- PvP (bat)

/** The baseball bat. */
export const PVP = {
  /** Range a bat swing can reach (the hitbox is this range × the arc below). */
  hitRange: 4,
  /** How wide the frontal swing arc is (degrees each side of where you're facing). */
  arcDeg: 60,
  /** Guardians are big: their hitbox reaches this much further than a player's. */
  guardianHitPadding: 1.5,
  /** Seconds between swings (a swing that misses still uses it). */
  cooldownSec: 0.6,
  /** Ragdoll/stun after being hit — shorter than a guardian's catch. */
  stunSec: 1,
  knockback: { horizontal: 18, up: 12 },
  hitsPlayers: true,
  hitsGuardians: true,
  /** A bapped guardian stands dazed this long (and drops an egg it was carrying home). */
  guardianStunSec: 2,
  /** No swinging from inside the safe zone, and nobody in it can be hit. */
  blockedInSafeZone: true,
} as const;

/** What happens to a bear trap once it has caught someone. */
export type TrapAfterTrigger = "consume" | "return";

export const TRAP = {
  /** Traps one player can have out in the world at once. */
  maxActive: 3,
  /** Farthest from you a trap can be placed. */
  placeRange: 4,
  /** Where the placement preview sits, in front of you. */
  previewDistance: 2.5,
  /** Traps can't be placed right on top of each other. */
  minSpacing: 1.2,
  /** A trap nobody steps in is picked back up after this long (it returns to its owner's stack). */
  lifetimeSec: 90,
  /** How close someone has to step to set it off. */
  triggerRadius: 1.6,
  /** Guardians are big: they set traps off from this much further away. */
  guardianTriggerPadding: 1,
  /** Immobilized this long once caught. */
  stunSec: 1.5,
  guardianStunSec: 3,
  affectsPlayers: true,
  affectsGuardians: true,
  ownerCanTrigger: false,
  allowInSafeZone: false,
  /** "consume": the trap is used up; "return": it goes back into its owner's inventory. */
  afterTrigger: "consume" as TrapAfterTrigger,
} as const;

// ---------------------------------------------------------------- offline earnings and free chest

export const OFFLINE = {
  /** Fraction of your pen income you keep earning per second while away. */
  rate: 0.5,
  /** Longest offline gap that counts. */
  maxHours: 4,
  /** Ignore gaps shorter than this (avoid noise from quick reconnects/tab refreshes). */
  minSec: 60,
} as const;

export const CHEST = {
  /** Minutes between claims (per player). */
  cooldownMin: 20,
  moneyMin: 100,
  moneyMax: 400,
  /** Chance of a small Gems bonus on top of the money. */
  gemChance: 0.2,
  gemAmount: 5,
} as const;

// ---------------------------------------------------------------- persistence

export const SAVE = {
  /** Autosave interval for everyone in a room. */
  autosaveSec: 30,
} as const;

/**
 * Debug cheats (the 🛠️ panel in the top-left bar, and their server handlers) are available while this is true, even in a
 * production build. Set it to false before the game is released for real.
 */
export const CHEATS_ENABLED = true;

export const DEV = {
  /** Speed stat given to brand-new profiles. */
  startingSpeedStat: 0,
  startingMoney: 0,
  startingGems: 0,
  /** Dev cheat amounts (dev builds only). */
  cheatMoney: 1_000_000,
  cheatGems: 100,
} as const;
