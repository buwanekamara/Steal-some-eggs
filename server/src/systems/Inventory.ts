import { HOTBAR_SIZE, TOOLS, newUid, type HeldKind, type ToolKind } from "@egg/shared";
import type { Profile } from "../persistence/ProfileStore.ts";

/** An item that can sit in a hotbar slot and be held. */
export interface ItemRef {
  kind: Exclude<HeldKind, "">;
  uid: string;
  /** Egg def id / pet species / tool kind — what model to draw in the hand. */
  model: string;
}

/** What a uid is in this profile, or null if it's gone or can't be held (a pet standing in the pen). */
export function resolveItem(profile: Profile, uid: string): ItemRef | null {
  if (!uid) return null;
  const egg = profile.eggs.find((e) => e.uid === uid);
  if (egg) return { kind: "egg", uid, model: egg.defId };
  const pet = profile.pets.find((p) => p.uid === uid);
  if (pet) return pet.equipped ? null : { kind: "pet", uid, model: pet.species };
  const tool = profile.tools.find((t) => t.uid === uid);
  if (tool && tool.qty > 0) return { kind: tool.kind, uid, model: tool.kind };
  return null;
}

/**
 * Only items sitting in the inventory can be sold or fused — not a pet standing in the pen, and not anything on
 * the hotbar. Returns why an item can't be, or null if it can.
 */
export function whyNotInInventory(profile: Profile, uid: string): string | null {
  if (profile.pets.find((p) => p.uid === uid)?.equipped) return "Take it out of your pen first — only pets in your inventory can be sold or fused.";
  if (profile.hotbar.includes(uid)) return "Take it off your hotbar first — only items in your inventory can be sold or fused.";
  return null;
}

/** Empties slots whose item is gone (planted, sold, used up, put in the pen) and drops duplicates. */
export function cleanHotbar(profile: Profile) {
  const seen = new Set<string>();
  profile.hotbar = Array.from({ length: HOTBAR_SIZE }, (_, i) => {
    const uid = profile.hotbar[i] ?? "";
    if (!uid || seen.has(uid) || !resolveItem(profile, uid)) return "";
    seen.add(uid);
    return uid;
  });
}

/** A newly obtained item goes to the first free hotbar slot; with a full hotbar it just stays in the inventory. */
export function stash(profile: Profile, uid: string) {
  if (profile.hotbar.includes(uid)) return;
  const free = profile.hotbar.indexOf("");
  if (free >= 0) profile.hotbar[free] = uid;
}

/** Adds tools: tops up existing stacks first, then opens new stacks (each stored like any new item). */
export function grantTool(profile: Profile, kind: ToolKind, qty: number, now: number) {
  const max = TOOLS[kind].maxStack;
  for (const t of profile.tools) {
    if (qty <= 0) break;
    if (t.kind !== kind || t.qty >= max) continue;
    const add = Math.min(qty, max - t.qty);
    t.qty += add;
    qty -= add;
  }
  while (qty > 0) {
    const add = Math.min(qty, max);
    const uid = newUid("t");
    profile.tools.push({ uid, kind, qty: add, obtainedAt: now });
    stash(profile, uid);
    qty -= add;
  }
}

/** Uses up one of a stackable tool; the stack disappears (and leaves its slot) at zero. */
export function consumeTool(profile: Profile, uid: string): boolean {
  const i = profile.tools.findIndex((t) => t.uid === uid);
  if (i < 0 || profile.tools[i].qty <= 0) return false;
  if (--profile.tools[i].qty <= 0) profile.tools.splice(i, 1);
  cleanHotbar(profile);
  return true;
}
