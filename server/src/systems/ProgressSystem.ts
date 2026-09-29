import {
  DEV,
  EGG_BY_ID,
  EGG_SIZE,
  FEATURED,
  HUB_BUILDINGS,
  INDEX_COMPLETE_REWARD,
  INDEX_REWARD,
  PEN,
  PEN_LEVELS,
  PETS,
  PET_BY_ID,
  SHOP_BY_ID,
  TRAIL_BY_ID,
  TREADMILL,
  USE_RANGE,
  basePlot,
  formatShort,
  newUid,
  petIncome,
  treadmillLevel,
  useSpot,
  type ShopBuyMsg,
} from "@egg/shared";
import type { OwnedPet } from "../persistence/ProfileStore.ts";
import type { PenSystem } from "./PenSystem.ts";

export interface ProgressHooks {
  notify(sessionId: string, text: string, kind?: "info" | "good" | "bad"): void;
}

/**
 * Upgrades (treadmill, pen), trails, the Gems Shop and Pet Index rewards.
 * Every purchase is validated here: location (where it matters), price, and ownership.
 */
export class ProgressSystem {
  constructor(
    private pens: PenSystem,
    private hooks: ProgressHooks,
    private now: () => number = Date.now,
  ) {}

  // ------------------------------------------------------------------ upgrades

  upgradeTreadmill(sessionId: string) {
    const o = this.pens.owner(sessionId);
    if (!o) return;
    const { p, profile } = o;
    const plot = basePlot(p.baseIndex);
    if (Math.hypot(p.x - plot.treadmillSign.x, p.z - plot.treadmillSign.z) > USE_RANGE) return this.hooks.notify(sessionId, "Go to your treadmill's Upgrade sign.", "bad");
    if (profile.treadmillLevel >= TREADMILL.levels.length) return this.hooks.notify(sessionId, "Your treadmill is maxed out!", "bad");
    const next = treadmillLevel(profile.treadmillLevel + 1);
    if (p.money < next.cost) return this.hooks.notify(sessionId, `You need $${formatShort(next.cost)}.`, "bad");
    p.money -= next.cost;
    profile.treadmillLevel = next.level;
    p.treadmillLevel = next.level;
    this.hooks.notify(sessionId, `Treadmill upgraded to Level ${next.level}! (+${next.gainPerStep}/step)`, "good");
    this.pens.changed(sessionId);
  }

  upgradePen(sessionId: string) {
    const o = this.pens.owner(sessionId);
    if (!o) return;
    const { p, profile } = o;
    const plot = basePlot(p.baseIndex);
    if (Math.hypot(p.x - plot.penSign.x, p.z - plot.penSign.z) > USE_RANGE) return this.hooks.notify(sessionId, "Go to your pen's Upgrade sign.", "bad");
    if (profile.penLevel >= PEN_LEVELS.length) return this.hooks.notify(sessionId, "Your pen is maxed out!", "bad");
    const next = PEN_LEVELS[profile.penLevel];
    if (p.money < next.cost) return this.hooks.notify(sessionId, `You need $${formatShort(next.cost)}.`, "bad");
    p.money -= next.cost;
    profile.penLevel = next.level;
    this.hooks.notify(sessionId, `${next.name}! Pets now earn +${Math.round(next.incomeBonus * 100)}%.`, "good");
    this.pens.refresh(sessionId);
  }

  // ------------------------------------------------------------------ trails

  buyTrail(sessionId: string, id: unknown) {
    const o = this.pens.owner(sessionId);
    const trail = typeof id === "string" ? TRAIL_BY_ID.get(id) : undefined;
    if (!o || !trail) return;
    const { p, profile } = o;
    const spot = useSpot(HUB_BUILDINGS.trails);
    if (Math.hypot(p.x - spot.x, p.z - spot.z) > USE_RANGE) return this.hooks.notify(sessionId, "Go to the Trails Shop.", "bad");
    if (profile.trailsOwned.includes(trail.id)) return this.equipTrail(sessionId, trail.id);
    if (p.money < trail.price) return this.hooks.notify(sessionId, `You need $${formatShort(trail.price)}.`, "bad");
    p.money -= trail.price;
    profile.trailsOwned.push(trail.id);
    profile.trail = trail.id;
    this.hooks.notify(sessionId, `${trail.name} equipped! x${trail.speedMult} speed`, "good");
    this.pens.refresh(sessionId);
  }

  /** Equip an owned trail, or "" to take it off. Works anywhere. */
  equipTrail(sessionId: string, id: unknown) {
    const o = this.pens.owner(sessionId);
    if (!o || typeof id !== "string") return;
    if (id && !o.profile.trailsOwned.includes(id)) return;
    o.profile.trail = id;
    this.pens.refresh(sessionId);
  }

  // ------------------------------------------------------------------ world events

  /** Grants a temporary x2 Speed-gain boost free of Gems (e.g. from the potion pickup), stacking onto any boost already running. */
  grantSpeedBoost(sessionId: string, minutes: number) {
    const o = this.pens.owner(sessionId);
    if (!o) return;
    o.profile.boostUntil = Math.max(o.profile.boostUntil, this.now()) + minutes * 60_000;
    this.pens.changed(sessionId);
  }

  // ------------------------------------------------------------------ Shop (Gems)

  shopBuy(sessionId: string, msg: ShopBuyMsg | undefined) {
    const o = this.pens.owner(sessionId);
    if (!o || !msg || typeof msg.item !== "string") return;
    const { p, profile } = o;

    if (msg.item === "featured") {
      const bundle = FEATURED.bundles.find((b) => b.count === msg.count);
      if (!bundle) return;
      if (this.now() > FEATURED.endsAt) return this.hooks.notify(sessionId, "That event has ended.", "bad");
      if (profile.gems < bundle.gems) return this.hooks.notify(sessionId, `You need ${bundle.gems} 💎.`, "bad");
      profile.gems -= bundle.gems;
      const def = EGG_BY_ID.get(FEATURED.eggId)!;
      for (let i = 0; i < bundle.count; i++) {
        profile.eggs.push({ uid: newUid("e"), defId: def.id, size: +(EGG_SIZE.min + Math.random() * (EGG_SIZE.max - EGG_SIZE.min)).toFixed(2), obtainedAt: this.now() });
      }
      p.eggCount = profile.eggs.length;
      this.hooks.notify(sessionId, `${bundle.count}× ${def.name} added to your backpack!`, "good");
      return this.pens.changed(sessionId);
    }

    const item = SHOP_BY_ID.get(msg.item);
    if (!item) return;
    if (profile.gems < item.gems) return this.hooks.notify(sessionId, `You need ${item.gems} 💎.`, "bad");
    profile.gems -= item.gems;
    if (item.speedBoostMin) profile.boostUntil = Math.max(profile.boostUntil, this.now()) + item.speedBoostMin * 60_000;
    if (item.speed) p.speedStat += item.speed;
    if (item.money) p.money += Math.max(item.money.flat, Math.round(p.income * item.money.incomeSeconds));
    this.hooks.notify(sessionId, `Bought ${item.title}!`, "good");
    this.pens.changed(sessionId);
  }

  /** Treadmill Speed multiplier from an active boost. */
  boostMult(sessionId: string) {
    const o = this.pens.owner(sessionId);
    return o && o.profile.boostUntil > this.now() ? 2 : 1;
  }

  // ------------------------------------------------------------------ Pet Index

  /** Claims the discovery reward of one species (or every unclaimed one with "all"). */
  claimIndex(sessionId: string, which: unknown) {
    const o = this.pens.owner(sessionId);
    if (!o || typeof which !== "string") return;
    const { p, profile } = o;
    const todo = profile.discovered.filter((s) => !profile.claimed.includes(s) && (which === "all" || which === s));
    if (!todo.length) return;
    let money = 0;
    let speed = 0;
    for (const s of todo) {
      const def = PET_BY_ID.get(s)!;
      const r = INDEX_REWARD[def.rarity];
      money += petIncome(def, def.baseWeight, "") * r.incomeMult;
      speed += r.speed;
      profile.claimed.push(s);
    }
    p.money += money;
    p.speedStat += speed;
    let text = `Index reward: +$${formatShort(money)} and +${formatShort(speed)} Speed!`;

    // Completed a whole page (every pet of a biome discovered)?
    for (const biome of new Set(PETS.map((x) => x.biome))) {
      if (profile.completed.includes(biome)) continue;
      if (!PETS.filter((x) => x.biome === biome).every((x) => profile.discovered.includes(x.id))) continue;
      profile.completed.push(biome);
      profile.gems += INDEX_COMPLETE_REWARD.gems;
      profile.penSlots = Math.min(PEN.maxSlots, profile.penSlots + INDEX_COMPLETE_REWARD.slots);
      text += ` Page complete: +${INDEX_COMPLETE_REWARD.gems} 💎 and +1 pen slot!`;
    }
    this.hooks.notify(sessionId, text, "good");
    this.pens.refresh(sessionId);
  }

  // ------------------------------------------------------------------ dev cheats

  devMoney(sessionId: string) {
    const o = this.pens.owner(sessionId);
    if (!o) return;
    o.p.money += DEV.cheatMoney;
    this.pens.changed(sessionId);
  }

  devGems(sessionId: string) {
    const o = this.pens.owner(sessionId);
    if (!o) return;
    o.profile.gems += DEV.cheatGems;
    this.pens.changed(sessionId);
  }

  /** Gives a pet of a species (benched), for testing fusing and selling. */
  devPet(sessionId: string, species: unknown) {
    const o = this.pens.owner(sessionId);
    const def = typeof species === "string" ? PET_BY_ID.get(species) : undefined;
    if (!o || !def) return;
    const pet: OwnedPet = {
      uid: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      species: def.id,
      weight: def.baseWeight,
      mutation: "",
      equipped: false,
      obtainedAt: this.now(),
    };
    o.profile.pets.push(pet);
    if (!o.profile.discovered.includes(def.id)) o.profile.discovered.push(def.id);
    this.pens.changed(sessionId);
  }
}
