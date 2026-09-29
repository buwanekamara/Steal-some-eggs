import {
  EGG_BY_ID,
  EGG_SIZE,
  FUSE,
  HATCH,
  HUB_BUILDINGS,
  MUTATION_BY_ID,
  rollEgg,
  PEN,
  PET_BY_ID,
  SELL_MULT,
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
  type InvPet,
  formatShort,
  newUid,
  type InventoryMsg,
} from "@egg/shared";
import type { OwnedPet, PenEgg, Profile } from "../persistence/ProfileStore.ts";
import { PenEggState, PenPetState, type PlayerState } from "../schema/GameState.ts";

export interface PenHooks {
  inventory(sessionId: string, msg: InventoryMsg): void;
  hatched(sessionId: string, msg: HatchedMsg): void;
  fused(sessionId: string, msg: HatchedMsg): void;
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
    p.penSlots = profile.penSlots;
    p.penLevel = profile.penLevel;
    p.trail = profile.trail;
    p.pets.clear();
    p.penEggs.clear();
    for (const pet of profile.pets) if (pet.equipped) this.showPet(p, pet);
    // More equipped than slots (e.g. hand-edited save): bench the extras.
    while (this.used(profile) > profile.penSlots) {
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

  /** Places the egg you have equipped, at your current spot in your own pen. */
  plant(sessionId: string) {
    const o = this.owners.get(sessionId);
    if (!o) return;
    const { p, profile } = o;
    if (p.equipped !== "egg" || !p.equippedEggUid) return;
    if (this.used(profile) >= profile.penSlots) return this.hooks.notify(sessionId, "Your pen is full! Buy a slot or take a pet out.", "bad");
    if (!inPen(p.baseIndex, p.x, p.z, PEN.inset)) return this.hooks.notify(sessionId, "Go to your pen to place it.", "bad");

    const index = profile.eggs.findIndex((e) => e.uid === p.equippedEggUid);
    if (index < 0) {
      p.equipped = "";
      p.equippedEggUid = "";
      p.equippedEggDefId = "";
      return;
    }
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
    };
    profile.penEggs.push(egg);
    p.eggCount = profile.eggs.length;
    this.showEgg(p, egg);
    p.equipped = "";
    p.equippedEggUid = "";
    p.equippedEggDefId = "";
    this.changed(sessionId);
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
      weight: rollWeight(def, egg.size, Math.random()),
      mutation: rollMutation(Math.random())?.id ?? "",
      equipped: true, // takes over the egg's slot
      obtainedAt: this.now(),
    };
    profile.pets.push(pet);
    const isNew = !profile.discovered.includes(def.id);
    if (isNew) profile.discovered.push(def.id);
    profile.stats.eggsHatched++;
    this.showPet(p, pet);
    this.refreshIncome(p, profile);
    this.hooks.hatched(sessionId, { pet: this.invPet(pet, profile), isNew });
    this.changed(sessionId);
  }

  equip(sessionId: string, petUid: unknown, on: boolean) {
    const o = this.owners.get(sessionId);
    if (!o || typeof petUid !== "string") return;
    const { p, profile } = o;
    const pet = profile.pets.find((x) => x.uid === petUid);
    if (!pet || pet.equipped === on) return;
    if (on && this.used(profile) >= profile.penSlots) return this.hooks.notify(sessionId, "Your pen is full! Buy a slot or take a pet out.", "bad");
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
    const room = profile.penSlots - profile.penEggs.length;
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
    p.penSlots = profile.penSlots;
    this.hooks.notify(sessionId, `Pen slot unlocked! (${profile.penSlots} slots)`, "good");
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
    o.profile.eggs.push({ uid: newUid("e"), defId: def.id, size: +(EGG_SIZE.min + Math.random() * (EGG_SIZE.max - EGG_SIZE.min)).toFixed(2), obtainedAt: this.now() });
    o.p.eggCount = o.profile.eggs.length;
    this.hooks.notify(sessionId, `Dev: ${def.name} added to your backpack`, "info");
    this.changed(sessionId);
  }

  /** Called after an egg is secured (the backpack changed). */
  eggsChanged(sessionId: string) {
    this.sendInventory(sessionId);
  }

  // ------------------------------------------------------------------ helpers

  private used(profile: Profile) {
    return profile.pets.filter((x) => x.equipped).length + profile.penEggs.length;
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
    p.penSlots = profile.penSlots;
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

  /** Sell pets at the SELL stall for (their $/s × SELL_MULT) each. */
  sell(sessionId: string, uids: unknown) {
    const o = this.owners.get(sessionId);
    if (!o) return;
    const { p, profile } = o;
    const spot = useSpot(HUB_BUILDINGS.sell);
    if (!this.near(p, spot.x, spot.z)) return this.hooks.notify(sessionId, "Go to the SELL stall to sell pets.", "bad");
    const pets = this.ownPets(profile, uids, 200);
    if (!pets) return;
    const total = pets.reduce((a, x) => a + this.income(x, profile) * SELL_MULT, 0);
    const gone = new Set(pets.map((x) => x.uid));
    profile.pets = profile.pets.filter((x) => !gone.has(x.uid));
    for (const uid of gone) p.pets.delete(uid);
    p.money += total;
    this.refreshIncome(p, profile);
    this.hooks.notify(sessionId, `Sold ${pets.length} pet${pets.length === 1 ? "" : "s"} for $${formatShort(total)}!`, "good");
    this.changed(sessionId);
  }

  /** Fuse 3 pets of the same species at the Fuse Machine into one heavier pet. */
  fuse(sessionId: string, uids: unknown) {
    const o = this.owners.get(sessionId);
    if (!o) return;
    const { p, profile } = o;
    const spot = useSpot(HUB_BUILDINGS.fuse);
    if (!this.near(p, spot.x, spot.z)) return this.hooks.notify(sessionId, "Go to the Fuse Machine to fuse pets.", "bad");
    const pets = this.ownPets(profile, uids, FUSE.inputs);
    if (!pets || pets.length !== FUSE.inputs) return this.hooks.notify(sessionId, `Pick ${FUSE.inputs} pets to fuse.`, "bad");
    if (!pets.every((x) => x.species === pets[0].species)) return this.hooks.notify(sessionId, "All three must be the same pet.", "bad");

    // Mutations: each mutated input has a chance to pass its mutation on (best one wins).
    let mutation = "";
    for (const x of [...pets].sort((a, b) => (MUTATION_BY_ID.get(b.mutation)?.incomeMult ?? 1) - (MUTATION_BY_ID.get(a.mutation)?.incomeMult ?? 1))) {
      if (x.mutation && Math.random() < FUSE.mutationKeepChance) {
        mutation = x.mutation;
        break;
      }
    }
    const wasEquipped = pets.filter((x) => x.equipped).length;
    const gone = new Set(pets.map((x) => x.uid));
    profile.pets = profile.pets.filter((x) => !gone.has(x.uid));
    for (const uid of gone) p.pets.delete(uid);
    const fused: OwnedPet = {
      uid: newUid("p"),
      species: pets[0].species,
      weight: +(pets.reduce((a, x) => a + x.weight, 0) * FUSE.weightFactor).toFixed(1),
      mutation,
      equipped: wasEquipped > 0,
      obtainedAt: this.now(),
    };
    profile.pets.push(fused);
    if (fused.equipped) this.showPet(p, fused, profile);
    this.refreshIncome(p, profile);
    this.hooks.fused(sessionId, { pet: this.invPet(fused), isNew: false });
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
    const { profile } = o;
    this.hooks.inventory(sessionId, {
      eggs: profile.eggs.filter((e) => EGG_BY_ID.has(e.defId)).map((e) => ({ uid: e.uid, defId: e.defId, size: e.size })),
      pets: profile.pets.map((x) => this.invPet(x, profile)),
      slots: profile.penSlots,
      nextSlotCost: profile.penSlots >= PEN.maxSlots ? 0 : slotCost(profile.penSlots),
      discovered: profile.discovered,
      claimed: profile.claimed,
      gems: profile.gems,
      trailsOwned: profile.trailsOwned,
      boostLeft: Math.max(0, Math.ceil((profile.boostUntil - this.now()) / 1000)),
      chestReadyIn: Math.max(0, Math.ceil((profile.nextChestAt - this.now()) / 1000)),
    });
  }
}
