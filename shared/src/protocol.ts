// Message names and payloads exchanged between client and server.

export const ROOM_NAME = "game";

export const MSG = {
  /** client → server: my current position. */
  Move: "move",
  /** client → server: toggle Slow Mode. */
  SlowMode: "slowMode",
  /** server → client: your position was rejected, snap here. */
  Correct: "correct",
  /** client → server (dev builds only): "up" multiplies your Speed stat, "reset" sets it to 0. */
  DevSpeed: "devSpeed",
  /** client → server: steal / pick up this egg (after holding E). payload: egg id */
  Steal: "steal",
  /** client → server: drop the egg I'm carrying. */
  Drop: "drop",
  /** server → client: you were hit — fly off with this velocity. */
  Knock: "knock",
  /** server → client: an egg you carried reached safety. */
  Secured: "secured",
  /** server → client: short text toast. */
  Notify: "notify",

  // ---- pen / pets (Phase 4)
  /** client → server: plant a backpack egg in my pen. payload: PlantMsg */
  Plant: "plant",
  /** client → server: hatch a ready egg in my pen. payload: pen egg uid */
  Hatch: "hatch",
  /** client → server: put a pet in / take it out of my pen. payload: pet uid */
  Equip: "equip",
  Unequip: "unequip",
  /** client → server: fill the pen with my highest-income pets. */
  EquipBest: "equipBest",
  /** client → server: buy one more pen slot with money. */
  BuySlot: "buySlot",
  /** client → server (dev builds only): finish growing all my eggs now. */
  DevGrow: "devGrow",
  /** client → server (dev builds only): put a random Forest egg in my backpack. */
  DevEgg: "devEgg",
  /** server → client: my private inventory (backpack eggs, all pets, slots). payload: InventoryMsg */
  Inventory: "inventory",
  /** server → client: an egg hatched. payload: HatchedMsg */
  Hatched: "hatched",

  // ---- upgrades, shops and menus (Phase 5)
  /** client → server: buy the next treadmill / pen level (must stand at its sign). */
  UpgradeTreadmill: "upgradeTreadmill",
  UpgradePen: "upgradePen",
  /** client → server: buy / equip a trail (at the Trails Shop). payload: trail id ("" = unequip) */
  BuyTrail: "buyTrail",
  EquipTrail: "equipTrail",
  /** client → server: sell pets (at the SELL stall). payload: pet uids */
  Sell: "sell",
  /** client → server: fuse 3 pets of one species (at the Fuse Machine). payload: pet uids */
  Fuse: "fuse",
  /** server → client: fuse result. payload: HatchedMsg */
  Fused: "fused",
  /** client → server: buy from the Shop with Gems. payload: ShopBuyMsg */
  ShopBuy: "shopBuy",
  /** client → server: claim a Pet Index reward. payload: species id or "all" */
  ClaimIndex: "claimIndex",
  /** client → server (dev builds only): +$1M, +100 Gems, or a specific pet. */
  DevMoney: "devMoney",
  DevGems: "devGems",
  DevPet: "devPet",
} as const;

export interface ShopBuyMsg {
  /** "featured" (with count) or a ShopItem id. */
  item: string;
  count?: number;
}

export interface PlantMsg {
  /** Index into my backpack eggs (defaults to the first). */
  index?: number;
  /** Where to plant (must be inside my pen); omitted = pick a free spot. */
  x?: number;
  z?: number;
}

export interface InvEgg {
  defId: string;
  size: number;
}

export interface InvPet {
  uid: string;
  species: string;
  weight: number;
  mutation: string;
  income: number;
  equipped: boolean;
}

export interface InventoryMsg {
  eggs: InvEgg[];
  pets: InvPet[];
  slots: number;
  /** Price of the next slot (0 = maxed out). */
  nextSlotCost: number;
  discovered: string[];
  /** Species whose Index reward has been claimed. */
  claimed: string[];
  gems: number;
  trailsOwned: string[];
  /** Seconds left on the x2 Speed boost (0 = none). */
  boostLeft: number;
}

export interface HatchedMsg {
  pet: InvPet;
  /** First time this species was hatched. */
  isNew: boolean;
}

/** EggState.state values. */
export const EggStatus = {
  InNest: 0,
  Carried: 1,
  Loose: 2,
  /** Being carried home by its guardian. */
  WithGuardian: 3,
} as const;
export type EggStatus = (typeof EggStatus)[keyof typeof EggStatus];

/** GuardianState.state values. */
export const GuardianMode = {
  Sleep: 0,
  Alert: 1,
  Chase: 2,
  Attack: 3,
  Fetch: 4,
  Return: 5,
} as const;
export type GuardianMode = (typeof GuardianMode)[keyof typeof GuardianMode];

export interface KnockMsg {
  vx: number;
  vy: number;
  vz: number;
  stunMs: number;
}

export interface SecuredMsg {
  defId: string;
  size: number;
  total: number;
}

export interface NotifyMsg {
  text: string;
  kind?: "info" | "good" | "bad";
}

export const Anim = {
  Idle: 0,
  Run: 1,
  Air: 2,
  /** Flung by a guardian (tumbling). */
  Knocked: 3,
} as const;
export type Anim = (typeof Anim)[keyof typeof Anim];

export interface MoveMsg {
  x: number;
  y: number;
  z: number;
  ry: number;
  anim: Anim;
}

export interface CorrectMsg {
  x: number;
  y: number;
  z: number;
}

export interface JoinOptions {
  name?: string;
  /** Guest profile id kept in the browser (see client/src/game/identity.ts). */
  profileId?: string;
}

/** Close codes the server uses when it disconnects a client on purpose. */
export const CLOSE = {
  /** The same profile joined from another tab/device. */
  TakenOver: 4100,
  /** Join refused (bad profile id etc.). */
  Rejected: 4101,
} as const;

export function sanitizeName(raw: unknown): string {
  const s = typeof raw === "string" ? raw.replace(/[^\w .-]/g, "").trim().slice(0, 16) : "";
  return s || `Player${Math.floor(1000 + Math.random() * 9000)}`;
}
