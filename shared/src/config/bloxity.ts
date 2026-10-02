// Bloxity character look, shared by client and server so every player sees everyone's Bloxity avatar.

/** Avatar slots a Bloxity player can wear (ids from Legion.SDK.avatar.getEquipped()). */
export const LOOK_SLOTS = [
  "hatId",
  "backId",
  "skinId",
  "headId",
  "armLId",
  "armRId",
  "legLId",
  "legRId",
  "torsoId",
  "hairId",
  "maskId",
  "neckId",
  "chestId",
  "waistId",
  "handId",
  "shoesId",
  "faceId",
  "pantsId",
  "shirtId",
] as const;

export type LookSlot = (typeof LOOK_SLOTS)[number];

/** Body proportions and their allowed ranges (all default to 1). */
export const PROPORTION_RANGES = {
  height: [0.5, 1.6],
  shoulderWidth: [0.5, 1.5],
  armLength: [0.05, 3],
  legOffsetX: [-0.7, 5],
  torsoScaleX: [0.3, 2],
  neckHeight: [0.94, 1.2],
  headScale: [0.3, 2.6],
} as const;

export type ProportionKey = keyof typeof PROPORTION_RANGES;
export type Proportions = Record<ProportionKey, number>;

/** A player's Bloxity look: what they wear and their body proportions. */
export interface BloxityLook {
  /** Only slots with a real equipped id are present. */
  eq: Partial<Record<LookSlot, string>>;
  props: Proportions;
}

/** Longest look string the server accepts (JSON). */
export const MAX_LOOK_LENGTH = 1500;

/** '-1' / '' / 'undefined' / null all mean "not equipped" (use the default mesh). */
export function isEquippedId(id: unknown): id is string {
  return typeof id === "string" && id !== "" && id !== "-1" && id !== "undefined" && id !== "null";
}

export function defaultProportions(): Proportions {
  const p = {} as Proportions;
  for (const k of Object.keys(PROPORTION_RANGES) as ProportionKey[]) p[k] = 1;
  return p;
}

/** Builds a clean look from untrusted input (SDK data or a client message); null if it isn't one. */
export function sanitizeLook(raw: unknown): BloxityLook | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { eq?: Record<string, unknown>; props?: Record<string, unknown> };
  const eq: BloxityLook["eq"] = {};
  for (const slot of LOOK_SLOTS) {
    const id = r.eq?.[slot];
    if (isEquippedId(id) && /^[\w-]{1,64}$/.test(id)) eq[slot] = id;
  }
  const props = defaultProportions();
  for (const [k, [min, max]] of Object.entries(PROPORTION_RANGES) as [ProportionKey, readonly [number, number]][]) {
    const v = Number(r.props?.[k]);
    if (Number.isFinite(v)) props[k] = Math.min(max, Math.max(min, v));
  }
  return { eq, props };
}

/** Parses a synced look string ("" = no Bloxity look: use the game's own character). */
export function parseLook(s: string): BloxityLook | null {
  if (!s || s.length > MAX_LOOK_LENGTH) return null;
  try {
    return sanitizeLook(JSON.parse(s));
  } catch {
    return null;
  }
}
