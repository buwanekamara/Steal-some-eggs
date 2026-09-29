import {
  EGG_BY_ID,
  EGG_SIZE,
  FUSE,
  HATCH,
  HUB_BUILDINGS,
  MUTATION_BY_ID,
  rollEgg,
  PEN,
  penSlotsTotal,
  PET_BY_ID,
  SELL_MULT,
  eggSellValue,
  USE_RANGE,
  WORLD_EVENTS,
  basePlot,
  penLevel,
  useSpot,
  inPen,
  petIncome,
  rollMutation,
  rollPet,
  rollWeight,
  slotCost,
  type HatchedMsg,
  type FusedMsg,
  fusedEggId,
  fusionFee,
  rollFusionMutation,
  rollFusionWeight,
  type InvPet,
  formatShort,
  newUid,
  HOTBAR_SIZE,
  type HotbarSetMsg,
  type HotbarSwapMsg,
  type InventoryMsg,
} from "@egg/shared";
import type { OwnedEgg, OwnedPet, PenEgg, Profile } from "../persistence/ProfileStore.ts";
import { cleanHotbar, resolveItem, stash, whyNotInInventory } from "./Inventory.ts";
import { PenEggState, PenPetState, type PlayerState } from "../schema/GameState.ts";

export interface PenHooks {
  inventory(sessionId: string, msg: InventoryMsg): void;
  hatched(sessionId: string, msg: HatchedMsg): void;
  fused(sessionId: string, msg: FusedMsg): void;
  notify(sessionId: string, text: string, kind?: "info" | "good" | "bad"): void;
  /** A valuable change happened: save now. */
  save(sessionId: string): void;
}

export interface Owner {
  p: PlayerState;
  profile: Profile;
}


/**
 * Each player's pen: planted eggs grow (wall-clock, so also while offline), hatch into pets,
 * equipped pets stand in the pen and pay money every second. Slots are shared by growing
 * eggs and equipped pets and can be bought with money.
 *
 * Saved positions are relative to the pen center, because a player may get a different base next time.
 */
export class PenSystem {
  private owners = new Map<string, Owner>();
  /** Whether it's currently night (eggs grow WORLD_EVENTS.nightGrowMult times faster). */
  private nightActive = false;

  constructor(
    private hooks: PenHooks,
    private now: () => number = Date.now,
  ) {}

  /** Night just started or ended: rescale every growing egg's remaining time so it keeps a consistent finish time. */
  setNight(active: boolean) {
    if (active === this.nightActive) return;
    this.nightActive = active;
    const now = this.now();
    // Starting night compresses remaining time by nightGrowMult; ending it restores the normal pace.
    const factor = active ? 1 / WORLD_EVENTS.nightGrowMult : WORLD_EVENTS.nightGrowMult;
    for (const { profile } of this.owners.values()) {
      for (const egg of profile.penEggs) {
        const remaining = egg.readyAt - now;
        if (remaining > 0) egg.readyAt = now + remaining * factor;
      }
    }
  }

  /** Player joined: mirror their saved pen into the synced state. */
  attach(sessionId: string, p: PlayerState, profile: Profile) {
    this.owners.set(sessionId, { p, profile });
    p.penSlots = this.slotsOf(profile);
    p.penLevel = profile.penLevel;
    p.trail = profile.trail;
    p.pets.clear();
    p.penEggs.clear();
    for (const pet of profile.pets) if (pet.equipped) this.showPet(p, pet);
    // More equipped than slots (e.g. hand-edited save): bench the extras.
    while (this.used(profile) > this.slotsOf(profile)) {
      const extra = profile.pets.find((x) => x.equipped);
      if (!extra) break;
      extra.equipped = false;
      p.pets.delete(extra.uid);
    }
    for (const egg of profile.penEggs) this.showEgg(p, egg);
    this.refreshIncome(p, profile);
    this.sendInventory(sessionId);
  }

  detach(sessionId: string) {
    this.owners.delete(sessionId);
  }

  /** Once a second: pay income and count down growing eggs. */
  tickSecond() {
    const now = this.now();
    for (const { p, profile } of this.owners.values()) {
      p.money += p.income;
      for (const egg of profile.penEggs) {
        const s = p.penEggs.get(egg.uid);
        if (s) s.readyIn = Math.max(0, Math.ceil((egg.readyAt - now) / 1000));
      }
    }
  }

  // ------------------------------------------------------------------ actions (all validated)

  /** Use with an egg in hand: plants it at your current spot, which must be in your own pen. */
  plant(sessionId: string) {
    const o = this.owners.get(sessionId);
    if (!o) return;
    const { p, profile } = o;
    if (p.equipped !== "egg") return;
    const index = profile.eggs.findIndex((e) => e.uid === p.equippedUid);
    if (index < 0) return this.changed(sessionId); // stale hand: resync
    // Growing eggs have their own room: a full set of active pets never stops you planting.
    if (profile.penEggs.length >= this.slotsOf(profile)) return this.hooks.notify(sessionId, "Your pen has no room for more eggs — hatch one first.", "bad");
    if (!inPen(p.baseIndex, p.x, p.z, PEN.inset, profile.penLevel)) return this.hooks.notify(sessionId, "Go to your pen to place it.", "bad");

    const plot = basePlot(p.baseIndex);
    const dx = p.x - plot.cx;
    const dz = p.z - plot.cz;
    if (!this.spotFree(profile, dx, dz)) return this.hooks.notify(sessionId, "Too close to another egg.", "bad");

    const [owned] = profile.eggs.splice(index, 1);
    const now = this.now();
    const egg: PenEgg = {
      uid: newUid("g"),
      defId: owned.defId,
      size: owned.size,
      x: +dx.toFixed(2),
      z: +dz.toFixed(2),
      plantedAt: now,
      readyAt: now + (HATCH[owned.defId].growSec * 1000) / (this.nightActive ? WORLD_EVENTS.nightGrowMult : 1),
      ...(owned.fusion ? { fusion: owned.fusion } : {}),
    };
    profile.penEggs.push(egg);
    p.eggCount = profile.eggs.length;
    this.showEgg(p, egg);
    this.changed(sessionId); // the egg left the hotbar: the slot empties and the hand with it
  }

  /** Use with a pet in hand: puts it in your pen (it then earns there and leaves the hotbar). */
  placePet(sessionId: string) {
    const o = this.owners.get(sessionId);
    if (!o) return;
    const { p, profile } = o;
    if (p.equipped !== "pet") return;
    if (!inPen(p.baseIndex, p.x, p.z, PEN.inset, profile.penLevel)) return this.hooks.notify(sessionId, "Go to your pen to place it.", "bad");
    this.equip(sessionId, p.equippedUid, true);
  }

  // ------------------------------------------------------------------ hotbar

  /** Hold the item in slot `slot`; the same slot again (or -1 / an empty slot) empties your hand. */
  select(sessionId: string, slot: unknown) {
    const o = this.owners.get(sessionId);
    if (!o || !Number.isInteger(slot) || (slot as number) < -1 || (slot as number) >= HOTBAR_SIZE) return;
    const { p, profile } = o;
    const s = slot as number;
    p.selectedSlot = s === p.selectedSlot || s < 0 || !resolveItem(profile, profile.hotbar[s]) ? -1 : s;
    this.syncHeld(p, profile);
  }

  /** Put an owned item into a slot (or the first free one). It moves if it was elsewhere; the slot's old item goes back to the inventory. */
  hotbarSet(sessionId: string, msg: unknown) {
    const o = this.owners.get(sessionId);
    if (!o || typeof msg !== "object" || !msg) return;
    const { uid, slot } = msg as HotbarSetMsg;
    const { profile } = o;
    if (typeof uid !== "string" || !resolveItem(profile, uid)) return;
    let target = slot;
    if (target === undefined) {
      if (profile.hotbar.includes(uid)) return;
      target = profile.hotbar.indexOf("");
      if (target < 0) return this.hooks.notify(sessionId, "Your hotbar is full — take something out first.", "bad");
    }
    if (!Number.isInteger(target) || target < 0 || target >= HOTBAR_SIZE) return;
    profile.hotbar = profile.hotbar.map((x) => (x === uid ? "" : x));
    profile.hotbar[target] = uid;
    this.changed(sessionId);
  }

  hotbarClear(sessionId: string, slot: unknown) {
    const o = this.owners.get(sessionId);
    if (!o || !Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= HOTBAR_SIZE) return;
    o.profile.hotbar[slot as number] = "";
    this.changed(sessionId);
  }

  hotbarSwap(sessionId: string, msg: unknown) {
    const o = this.owners.get(sessionId);
    if (!o || typeof msg !== "object" || !msg) return;
    const { a, b } = msg as HotbarSwapMsg;
    const ok = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < HOTBAR_SIZE;
    if (!ok(a) || !ok(b) || a === b) return;
    const hb = o.profile.hotbar;
    [hb[a], hb[b]] = [hb[b], hb[a]];
    // The hand follows the item you were holding.
    if (o.p.selectedSlot === a) o.p.selectedSlot = b;
    else if (o.p.selectedSlot === b) o.p.selectedSlot = a;
    this.changed(sessionId);
  }

  /** Stores a newly obtained item: first free hotbar slot, else it simply stays in the inventory. */
  stash(sessionId: string, uid: string) {
    const o = this.owners.get(sessionId);
    if (o) stash(o.profile, uid);
  }

  /** The hand always shows what's in the selected slot; an emptied slot empties the hand. */
  private syncHeld(p: PlayerState, profile: Profile) {
    const ref = p.selectedSlot >= 0 ? resolveItem(profile, profile.hotbar[p.selectedSlot]) : null;
    if (!ref) p.selectedSlot = -1;
    p.equipped = ref?.kind ?? "";
    p.equippedUid = ref?.uid ?? "";
    p.equippedModel = ref?.model ?? "";
  }

  hatch(sessionId: string, eggUid: unknown) {
    const o = this.owners.get(sessionId);
    if (!o || typeof eggUid !== "string") return;
    const { p, profile } = o;
    const i = profile.penEggs.findIndex((e) => e.uid === eggUid);
    if (i < 0) return;
    const egg = profile.penEggs[i];
    if (egg.readyAt > this.now()) return this.hooks.notify(sessionId, "That egg isn't ready yet.", "bad");

    profile.penEggs.splice(i, 1);
    p.penEggs.delete(egg.uid);
    const def = rollPet(egg.defId, Math.random());
    const pet: OwnedPet = {
      uid: newUid("p"),
      species: def.id,
      // A fused egg was rolled when it was made; anything else rolls now.
      weight: egg.fusion ? egg.fusion.weight : rollWeight(def, egg.size, Math.random()),
      mutation: egg.fusion ? egg.fusion.mutation : (rollMutation(Math.random())?.id ?? ""),
      equipped: false, // goes to the hotbar / backpack; put it in the pen from there
      obtainedAt: this.now(),
    };
    profile.pets.push(pet);
    const isNew = !profile.discovered.includes(def.id);
    if (isNew) profile.discovered.push(def.id);
    profile.stats.eggsHatched++;
    stash(profile, pet.uid); // first free hotbar slot; with a full hotbar it stays in the backpack
    this.hooks.hatched(sessionId, { pet: this.invPet(pet, profile), isNew });
    this.changed(sessionId);
  }

  equip(sessionId: string, petUid: unknown, on: boolean) {
    const o = this.owners.get(sessionId);
    if (!o || typeof petUid !== "string") return;
    const { p, profile } = o;
    const pet = profile.pets.find((x) => x.uid === petUid);
    if (!pet || pet.equipped === on) return;
    if (on && this.used(profile) >= this.slotsOf(profile)) return this.hooks.notify(sessionId, "Your pen is full! Buy a slot or take a pet out.", "bad");
    pet.equipped = on;
    if (on) this.showPet(p, pet);
    else p.pets.delete(pet.uid);
    this.refreshIncome(p, profile);
    this.changed(sessionId);
  }

  /** Fills the free slots (after growing eggs) with the highest-earning pets. */
  equipBest(sessionId: string) {
    const o = this.owners.get(sessionId);
    if (!o) return;
    const { p, profile } = o;
    const room = this.slotsOf(profile);
    const ranked = [...profile.pets].sort((a, b) => this.income(b, profile) - this.income(a, profile));
    ranked.forEach((pet, i) => {
      const on = i < room;
      if (pet.equipped === on) return;
      pet.equipped = on;
      if (on) this.showPet(p, pet);
      else p.pets.delete(pet.uid);
    });
    this.refreshIncome(p, profile);
    this.changed(sessionId);
  }

  buySlot(sessionId: string) {
    const o = this.owners.get(sessionId);
    if (!o) return;
    const { p, profile } = o;
    if (profile.penSlots >= PEN.maxSlots) return this.hooks.notify(sessionId, "Your pen is already as big as it gets.", "bad");
    const cost = slotCost(profile.penSlots);
    if (p.money < cost) return this.hooks.notify(sessionId, "Not enough money for another slot.", "bad");
    p.money -= cost;
    profile.penSlots++;
    p.penSlots = this.slotsOf(profile);
    this.hooks.notify(sessionId, `Pen slot unlocked! (${this.slotsOf(profile)} slots)`, "good");
    this.changed(sessionId);
  }

  /** Dev only: every growing egg becomes ready now. */
  devGrow(sessionId: string) {
    const o = this.owners.get(sessionId);
    if (!o) return;
    const now = this.now();
    for (const e of o.profile.penEggs) e.readyAt = Math.min(e.readyAt, now);
    this.tickSecond();
  }

  /** Dev only: a random egg from the Forest pool straight into the backpack. */
  devEgg(sessionId: string) {
    const o = this.owners.get(sessionId);
    if (!o) return;
    const def = rollEgg("forest", Math.random());
    const eggUid = newUid("e");
    o.profile.eggs.push({ uid: eggUid, defId: def.id, size: +(EGG_SIZE.min + Math.random() * (EGG_SIZE.max - EGG_SIZE.min)).toFixed(2), obtainedAt: this.now() });
    stash(o.profile, eggUid);
    o.p.eggCount = o.profile.eggs.length;
    this.hooks.notify(sessionId, `Dev: ${def.name} added to your backpack`, "info");
    this.changed(sessionId);
  }

  /** Called after an egg is secured (the backpack changed). */
  eggsChanged(sessionId: string) {
    this.sendInventory(sessionId);
  }

  // ------------------------------------------------------------------ helpers

  /** Active pets standing in the pen (growing eggs are counted separately). */
  private used(profile: Profile) {
    return profile.pets.filter((x) => x.equipped).length;
  }

  /** Pet slots: the ones you bought plus what your pen level unlocks. Growing eggs may also fill this many. */
  private slotsOf(profile: Profile) {
    return penSlotsTotal(profile.penSlots, profile.penLevel);
  }

  /** $/s of a pet in this owner's pen (includes the pen level bonus). */
  income(pet: OwnedPet, profile: Profile) {
    const base = petIncome(PET_BY_ID.get(pet.species)!, pet.weight, pet.mutation);
    return Math.round(base * (1 + penLevel(profile.penLevel).incomeBonus));
  }

  private refreshIncome(p: PlayerState, profile: Profile) {
    p.income = profile.pets.filter((x) => x.equipped).reduce((a, x) => a + this.income(x, profile), 0);
  }

  private showPet(p: PlayerState, pet: OwnedPet, profile = this.profileOf(p)) {
    const s = new PenPetState();
    s.species = pet.species;
    s.weight = pet.weight;
    s.mutation = pet.mutation;
    s.income = profile ? this.income(pet, profile) : 0;
    p.pets.set(pet.uid, s);
  }

  private profileOf(p: PlayerState) {
    for (const o of this.owners.values()) if (o.p === p) return o.profile;
    return undefined;
  }

  owner(sessionId: string): Owner | undefined {
    return this.owners.get(sessionId);
  }

  /** Re-sync everything visible after an upgrade (pen level, slots, pet incomes) and send the inventory. */
  refresh(sessionId: string) {
    const o = this.owners.get(sessionId);
    if (!o) return;
    const { p, profile } = o;
    p.penSlots = this.slotsOf(profile);
    p.penLevel = profile.penLevel;
    p.trail = profile.trail;
    for (const pet of profile.pets) if (pet.equipped) this.showPet(p, pet, profile);
    this.refreshIncome(p, profile);
    this.changed(sessionId);
  }

  private near(p: PlayerState, x: number, z: number) {
    return Math.hypot(p.x - x, p.z - z) <= USE_RANGE;
  }

  /** Validated list of distinct pet uids the player owns. */
  private ownPets(profile: Profile, uids: unknown, max: number): OwnedPet[] | null {
    if (!Array.isArray(uids) || uids.length === 0 || uids.length > max) return null;
    const set = new Set(uids);
    if (set.size !== uids.length) return null;
    const pets = uids.map((u) => (typeof u === "string" ? profile.pets.find((x) => x.uid === u) : undefined));
    return pets.every(Boolean) ? (pets as OwnedPet[]) : null;
  }

  // ------------------------------------------------------------------ selling and fusing

  /**
   * Sell pets and unhatched eggs at the SELL stall — only ones in the inventory (not in the pen, not on the hotbar).
   * Pets fetch (their $/s × SELL_MULT), eggs `eggSellValue`.
   */
  sell(sessionId: string, uids: unknown) {
    const o = this.owners.get(sessionId);
    if (!o) return;
    const { p, profile } = o;
    const spot = useSpot(HUB_BUILDINGS.sell);
    if (!this.near(p, spot.x, spot.z)) return this.hooks.notify(sessionId, "Go to the SELL stall to sell.", "bad");
    if (!Array.isArray(uids) || uids.length === 0 || uids.length > 200 || new Set(uids).size !== uids.length) return;
    const pets: OwnedPet[] = [];
    const eggs: OwnedEgg[] = [];
    for (const uid of uids) {
      if (typeof uid !== "string") return;
      const pet = profile.pets.find((x) => x.uid === uid);
      const egg = pet ? undefined : profile.eggs.find((x) => x.uid === uid);
      if (!pet && !egg) return; // not yours
      const why = whyNotInInventory(profile, uid);
      if (why) return this.hooks.notify(sessionId, why, "bad");
      if (pet) pets.push(pet);
      else eggs.push(egg!);
    }
    const total = pets.reduce((a, x) => a + this.income(x, profile) * SELL_MULT, 0) + eggs.reduce((a, e) => a + eggSellValue(e.defId, e.size), 0);
    const gone = new Set(uids as string[]);
    profile.pets = profile.pets.filter((x) => !gone.has(x.uid));
    profile.eggs = profile.eggs.filter((x) => !gone.has(x.uid));
    p.eggCount = profile.eggs.length;
    p.money += total;
    const what = [pets.length && `${pets.length} pet${pets.length === 1 ? "" : "s"}`, eggs.length && `${eggs.length} egg${eggs.length === 1 ? "" : "s"}`].filter(Boolean).join(" and ");
    this.hooks.notify(sessionId, `Sold ${what} for $${formatShort(total)}!`, "good");
    this.changed(sessionId);
  }

  /**
   * Fusion Machine: 3 pets of one species (in the inventory) + a fee → 1 egg of that species, with a freshly rolled
   * weight and mutation that it hatches into. Everything is validated before anything changes, and the whole thing
   * runs in one message handler (the server is single-threaded), so it either happens completely or not at all.
   */
  fuse(sessionId: string, uids: unknown) {
    const o = this.owners.get(sessionId);
    if (!o) return;
    const { p, profile } = o;
    const spot = useSpot(HUB_BUILDINGS.fuse);
    if (!this.near(p, spot.x, spot.z)) return this.hooks.notify(sessionId, "Go to the Fuse Machine to fuse pets.", "bad");
    // Exactly 3 distinct pets that are yours.
    const pets = this.ownPets(profile, uids, FUSE.inputs);
    if (!pets || pets.length !== FUSE.inputs) return this.hooks.notify(sessionId, `Pick ${FUSE.inputs} pets to fuse.`, "bad");
    for (const x of pets) {
      const why = whyNotInInventory(profile, x.uid);
      if (why) return this.hooks.notify(sessionId, why, "bad");
    }
    const species = pets[0].species;
    if (!pets.every((x) => x.species === species)) return this.hooks.notify(sessionId, "All three must be the same pet.", "bad");
    const def = PET_BY_ID.get(species);
    const eggDef = EGG_BY_ID.get(fusedEggId(species));
    if (!def || !eggDef) return this.hooks.notify(sessionId, "Those pets can't be fused.", "bad");
    const fee = fusionFee(species);
    if (p.money < fee) return this.hooks.notify(sessionId, `You don't have enough money to fuse these pets ($${formatShort(fee)}).`, "bad");
    // (The inventory has no size cap, so there's always room for the egg.)

    // All checks passed: consume, charge, and make the egg.
    const gone = new Set(pets.map((x) => x.uid));
    profile.pets = profile.pets.filter((x) => !gone.has(x.uid));
    p.money -= fee;
    const weight = rollFusionWeight(species, pets.map((x) => x.weight), Math.random());
    const mutation = rollFusionMutation(pets.map((x) => x.mutation), Math.random());
    // Egg size is only how big it looks: heavier results make bigger eggs.
    const size = +Math.min(EGG_SIZE.max, Math.max(EGG_SIZE.min, weight / (def.baseWeight * 1.025))).toFixed(2);
    const egg: OwnedEgg = { uid: newUid("e"), defId: eggDef.id, size, obtainedAt: this.now(), fusion: { weight, mutation } };
    profile.eggs.push(egg);
    p.eggCount = profile.eggs.length;
    stash(profile, egg.uid);
    const slot = profile.hotbar.indexOf(egg.uid);
    this.hooks.notify(
      sessionId,
      slot >= 0 ? `Fusion complete! ${eggDef.name} added to hotbar slot ${(slot + 1) % 10}.` : `Fusion complete! Hotbar full — ${eggDef.name} added to your inventory.`,
      "good",
    );
    this.hooks.fused(sessionId, { uid: egg.uid, defId: egg.defId, slot });
    this.changed(sessionId);
  }

  private showEgg(p: PlayerState, egg: PenEgg) {
    const plot = basePlot(p.baseIndex);
    const s = new PenEggState();
    s.defId = egg.defId;
    s.size = egg.size;
    s.x = plot.cx + egg.x;
    s.z = plot.cz + egg.z;
    s.growSec = HATCH[egg.defId].growSec;
    s.readyIn = Math.max(0, Math.ceil((egg.readyAt - this.now()) / 1000));
    p.penEggs.set(egg.uid, s);
  }

  private spotFree(profile: Profile, dx: number, dz: number) {
    return profile.penEggs.every((e) => Math.hypot(e.x - dx, e.z - dz) >= PEN.eggSpacing);
  }

  private invPet(pet: OwnedPet, profile = this.profileOfPet(pet)): InvPet {
    return { uid: pet.uid, species: pet.species, weight: pet.weight, mutation: pet.mutation, income: profile ? this.income(pet, profile) : 0, equipped: pet.equipped };
  }

  private profileOfPet(pet: OwnedPet) {
    for (const o of this.owners.values()) if (o.profile.pets.includes(pet)) return o.profile;
    return undefined;
  }

  changed(sessionId: string) {
    this.sendInventory(sessionId);
    this.hooks.save(sessionId);
  }

  private sendInventory(sessionId: string) {
    const o = this.owners.get(sessionId);
    if (!o) return;
    const { p, profile } = o;
    // Every change to the profile ends here: drop hotbar slots whose item is gone, and keep the hand in sync.
    cleanHotbar(profile);
    this.syncHeld(p, profile);
    this.hooks.inventory(sessionId, {
      eggs: profile.eggs.filter((e) => EGG_BY_ID.has(e.defId)).map((e) => ({ uid: e.uid, defId: e.defId, size: e.size, ...(e.fusion ? { fusion: e.fusion } : {}) })),
      pets: profile.pets.map((x) => this.invPet(x, profile)),
      slots: this.slotsOf(profile),
      nextSlotCost: profile.penSlots >= PEN.maxSlots ? 0 : slotCost(profile.penSlots),
      discovered: profile.discovered,
      claimed: profile.claimed,
      gems: profile.gems,
      trailsOwned: profile.trailsOwned,
      boostLeft: Math.max(0, Math.ceil((profile.boostUntil - this.now()) / 1000)),
      chestReadyIn: Math.max(0, Math.ceil((profile.nextChestAt - this.now()) / 1000)),
      tools: profile.tools.map((t) => ({ uid: t.uid, kind: t.kind, qty: t.qty })),
      hotbar: [...profile.hotbar],
    });
  }
}
