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
  /** client → server (cheats): set exact values. payload: { speed?: number, money?: number, gems?: number } */
  DevSet: "devSet",
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
  /** server → client: fusion made an egg. payload: FusedMsg */
  Fused: "fused",
  /** client → server: buy from the Shop with Gems. payload: ShopBuyMsg */
  ShopBuy: "shopBuy",
  /** client → server: claim a Pet Index reward. payload: species id or "all" */
  ClaimIndex: "claimIndex",
  /** client → server (dev builds only): +$1M, +100 Gems, or a specific pet. */
  DevMoney: "devMoney",
  DevGems: "devGems",
  DevPet: "devPet",
  /** client → server (dev builds only): jump to the other phase of the day/night cycle. */
  DevToggleNight: "devToggleNight",

  // ---- world events (Phase 6)
  /** client → server: claim the potion pickup (must be standing at its spot while it's available). */
  ClaimPotion: "claimPotion",

  // ---- PvP and social (Phase 7)
  /** client → server: claim the free chest (must be standing at its spot, off cooldown). */
  ClaimChest: "claimChest",
  /** client → server: claim my pending offline earnings (shown as a banner after joining). */
  ClaimOffline: "claimOffline",

  // ---- hotbar and held items
  /** client → server: hold the item in this hotbar slot (0–9); the same slot again, or -1, empties your hand. */
  SelectSlot: "selectSlot",
  /** client → server: put an item into a hotbar slot. payload: HotbarSetMsg */
  HotbarSet: "hotbarSet",
  /** client → server: take the item in this slot (0–9) back to the inventory. */
  HotbarClear: "hotbarClear",
  /** client → server: swap two hotbar slots. payload: HotbarSwapMsg */
  HotbarSwap: "hotbarSwap",
  /** client → server: use the held item — the server decides what that means (swing, place trap, plant egg, place pet). payload: UseMsg */
  Use: "use",
  /** server → client: an item went on cooldown. payload: CooldownMsg */
  Cooldown: "cooldown",
  /** server → all clients: this player swung their bat (drives the swing animation). payload: session id */
  Swing: "swing",
} as const;

export interface HotbarSetMsg {
  uid: string;
  /** 0–9; omitted = the first free slot. Whatever was in that slot goes back to the inventory. */
  slot?: number;
}

export interface HotbarSwapMsg {
  a: number;
  b: number;
}

export interface UseMsg {
  /** Where to place a trap (the client's preview). The server validates it. */
  x?: number;
  z?: number;
}

export interface CooldownMsg {
  kind: "bat";
  sec: number;
}

export interface ShopBuyMsg {
  /** "featured" (with count) or a ShopItem id. */
  item: string;
  count?: number;
}

export interface InvTool {
  uid: string;
  kind: "bat" | "trap";
  qty: number;
}

/** A fused egg's pre-rolled result: hatching it gives exactly this weight and mutation. */
export interface FusionResult {
  weight: number;
  /** "" = Normal. */
  mutation: string;
}

export interface InvEgg {
  uid: string;
  defId: string;
  size: number;
  /** Set on eggs from the Fusion Machine. */
  fusion?: FusionResult;
}

export interface FusedMsg {
  /** The new egg. */
  uid: string;
  defId: string;
  /** Hotbar slot it went to (-1 = hotbar full, it's in the inventory). */
  slot: number;
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
  /** Seconds until the free chest is claimable again (0 = ready now). */
  chestReadyIn: number;
  tools: InvTool[];
  /** 10 slots of item uids (an egg, a benched pet or a tool); "" = empty. */
  hotbar: string[];
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
  /** Name of the player who hit you with a bat or whose trap caught you (absent = a guardian caught you). */
  by?: string;
  /** What caused it, when `by` is set (bat swing vs. a stepped-on trap). */
  kind?: "bat" | "trap";
  /** Whether you were actually carrying an egg that got dropped (you can get bapped/trapped empty-handed too). */
  droppedEgg?: boolean;
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
