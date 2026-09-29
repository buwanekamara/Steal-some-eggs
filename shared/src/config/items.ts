// Hotbar and tool items (baseball bat, bear trap). Eggs and pets are items too, defined in eggs.ts / pets.ts.

/** Hotbar slots: keys 1–9, then 0 for the tenth. */
export const HOTBAR_SIZE = 10;

export type ToolKind = "bat" | "trap";

/** What can be in your hand: nothing, or the kind of item in the selected hotbar slot. */
export type HeldKind = "" | "egg" | "pet" | ToolKind;

export interface ToolDef {
  kind: ToolKind;
  name: string;
  icon: string;
  /** 1 = not stackable (every bat is its own item). */
  maxStack: number;
}

export const TOOLS: Record<ToolKind, ToolDef> = {
  bat: { kind: "bat", name: "Baseball Bat", icon: "🏏", maxStack: 1 },
  trap: { kind: "trap", name: "Bear Trap", icon: "🪤", maxStack: 99 },
};

/** Granted once to every profile: brand-new ones, and saves from before tools were items. */
export const STARTER_TOOLS: { kind: ToolKind; qty: number }[] = [
  { kind: "bat", qty: 1 },
  { kind: "trap", qty: 3 },
];
