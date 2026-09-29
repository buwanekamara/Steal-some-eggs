import {
  BIOMES,
  EGG_BY_ID,
  FEATURED,
  FUSE,
  HATCH,
  INDEX_COMPLETE_REWARD,
  INDEX_REWARD,
  MUTATION_BY_ID,
  PETS,
  PET_BY_ID,
  RARITY_COLOR,
  SELL_MULT,
  SHOP_ITEMS,
  TRAILS,
  formatShort,
  hatchOdds,
  petDisplayName,
  petIncome,
  eggSellValue,
  fusedEggId,
  fusionFee,
  rollFusionWeight,
  type InvEgg,
  type InvPet,
  type InventoryMsg,
} from "@egg/shared";
import { Modal, esc } from "./Modal.ts";

/** Everything the menus need to draw, refreshed whenever the inventory or money changes. */
export interface MenuData {
  inv: InventoryMsg | null;
  money: number;
  trail: string;
}

export interface MenuActions {
  shopBuy(item: string, count?: number): void;
  claim(which: string): void;
  sell(uids: string[]): void;
  fuse(uids: string[]): void;
  buyTrail(id: string): void;
  equipTrail(id: string): void;
}

const petCard = (p: InvPet, extra = "", selected = false) => {
  const def = PET_BY_ID.get(p.species)!;
  const mut = p.mutation ? MUTATION_BY_ID.get(p.mutation) : undefined;
  return `<button class="pet-card${selected ? " sel" : ""}${p.equipped ? " on" : ""}" data-uid="${p.uid}" style="--rc:${RARITY_COLOR[def.rarity]}">
    <span class="pc-kg">${p.weight}Kg</span>
    <span class="pc-icon">${def.icon}</span>
    <span class="pc-name" style="color:${mut ? mut.color : "#fff"}">${esc(petDisplayName(def, p.mutation))}</span>
    <span class="pc-inc">$${formatShort(p.income)}/s</span>${extra}
  </button>`;
};

const price = (v: number) => `<span class="pc-price">$${formatShort(v)}</span>`;

/** An unhatched egg, styled like a pet card (size where the pet shows Kg, rarity where it shows $/s). */
const eggCard = (e: InvEgg, extra = "", selected = false) => {
  const def = EGG_BY_ID.get(e.defId)!;
  return `<button class="pet-card${selected ? " sel" : ""}" data-uid="${e.uid}" style="--rc:${RARITY_COLOR[def.rarity]}">
    <span class="pc-kg">size ${e.size.toFixed(2)}</span>
    <span class="pc-icon">🥚</span>
    <span class="pc-name">${esc(def.name)}</span>
    <span class="pc-inc">${def.rarity} egg</span>${extra}
  </button>`;
};

/** Biomes with pets to discover, in corridor order (drives the Pet Index's World tab paging). */
const WORLD_BIOMES = BIOMES.filter((b) => PETS.some((p) => p.biome === b.id));

const countdown = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m ${String(s % 60).padStart(2, "0")}s`;
};

/**
 * All Phase 5 menus: Shop (Gems), Pet Index, Sell Pets, Fuse Machine and Trails Shop.
 */
export class Menus {
  readonly shop: Modal;
  readonly index: Modal;
  readonly sellM: Modal;
  readonly fuseM: Modal;
  readonly trails: Modal;
  private data: MenuData = { inv: null, money: 0, trail: "" };
  private sellSel = new Set<string>();
  private sellSort: "weight" | "value" = "value";
  private fuseSel: string[] = [];
  private indexPet = "";
  private indexBiome = "";

  constructor(root: HTMLElement, private actions: MenuActions) {
    this.shop = new Modal(root, "Shop", "#4ce11f", [
      { id: "featured", label: "Featured", icon: "🏷️", color: "#ff5a3a" },
      { id: "speed", label: "Speed", icon: "👟", color: "#2f9bff" },
      { id: "money", label: "Money", icon: "💵", color: "#4ce11f" },
      { id: "gear", label: "Gear", icon: "🏏", color: "#c9944f" },
    ]);
    this.index = new Modal(root, "Pet Index", "#1fc0ff", [
      { id: "world", label: "World", icon: "🌍", color: "#1f8bff" },
      { id: "limited", label: "Limited", icon: "⏳", color: "#b8860b" },
    ]);
    this.sellM = new Modal(root, "💰 Sell Pets & Eggs", "#4ce11f");
    this.fuseM = new Modal(root, "Fuse Machine", "#8a4dff");
    this.trails = new Modal(root, "Trails Shop", "#c04dff");
    for (const m of [this.shop, this.index, this.sellM, this.fuseM, this.trails]) m.onTab = () => this.render(m);
    this.sellM.onClose = () => this.sellSel.clear();
    this.fuseM.onClose = () => (this.fuseSel = []);
    this.wire();
  }

  /** Redraws open menus only when their data changed (redrawing under the mouse would swallow clicks). */
  update(data: MenuData) {
    // Money ticks every second; only the Trails Shop shows it, so leave it out of the change check elsewhere.
    // The Fuse Machine only cares whether you can afford the fee of the pets you picked.
    const fuseSpecies = this.fuseM.isOpen ? this.data.inv?.pets.find((p) => p.uid === this.fuseSel[0])?.species : undefined;
    const sig = JSON.stringify({ ...data, money: this.trails.isOpen ? data.money : 0, canFuse: fuseSpecies ? data.money >= fusionFee(fuseSpecies) : null });
    const changed = sig !== this.sig;
    this.sig = sig;
    this.data = data;
    if (changed) for (const m of [this.shop, this.index, this.sellM, this.fuseM, this.trails]) if (m.isOpen) this.render(m);
    // The Featured countdown ticks in place.
    const t = this.shop.isOpen ? this.shop.body.querySelector(".ft-time") : null;
    if (t) t.textContent = FEATURED.endsAt > Date.now() ? countdown(FEATURED.endsAt - Date.now()) : "Ended";
  }

  private sig = "";

  open(which: "shop" | "index" | "sell" | "fuse" | "trails") {
    const m = { shop: this.shop, index: this.index, sell: this.sellM, fuse: this.fuseM, trails: this.trails }[which];
    m.open();
    this.render(m);
  }

  /** Unclaimed Index rewards (red badge on the Index button). */
  get unclaimed() {
    const inv = this.data.inv;
    return inv ? inv.discovered.filter((s) => !inv.claimed.includes(s)).length : 0;
  }

  // ------------------------------------------------------------------ rendering

  private render(m: Modal) {
    if (m === this.shop) this.renderShop();
    else if (m === this.index) this.renderIndex();
    else if (m === this.sellM) this.renderSell();
    else if (m === this.fuseM) this.renderFuse();
    else if (m === this.trails) this.renderTrails();
  }

  private gemsBadge() {
    return `<span class="gems-pill">💎 ${formatShort(this.data.inv?.gems ?? 0)}</span>`;
  }

  private renderShop() {
    this.shop.headerExtra.innerHTML = this.gemsBadge();
    const gems = this.data.inv?.gems ?? 0;
    if (this.shop.tab === "featured") {
      const egg = EGG_BY_ID.get(FEATURED.eggId)!;
      const odds = hatchOdds(egg.id)
        .sort((a, b) => b.pct - a.pct)
        .map(({ petId, pct }) => {
          const d = PET_BY_ID.get(petId)!;
          return `<div class="odd-card${pct <= 2 ? " rare" : ""}" style="--rc:${RARITY_COLOR[d.rarity]}" title="${esc(d.name)} (${d.rarity})"><span>${d.icon}</span><b>${pct}%</b></div>`;
        })
        .join("");
      const left = FEATURED.endsAt - Date.now();
      this.shop.body.innerHTML = `<div class="shop-title">-- FEATURED --</div>
        <div class="featured">
          <div class="ft-top"><span class="ft-new">New!</span><span class="ft-name">${esc(egg.name.toUpperCase())}</span><span class="ft-time">${left > 0 ? countdown(left) : "Ended"}</span></div>
          <div class="ft-sub">Limited Time! · grows in ${HATCH[egg.id].growSec}s · plant it in your pen</div>
          <div class="ft-odds">${odds}</div>
          <div class="ft-buy">${FEATURED.bundles
            .map(
              (b) => `<button class="gem-btn${gems >= b.gems && left > 0 ? "" : " no"}" data-buy="featured" data-count="${b.count}">
                ${"was" in b && b.was ? `<s>💎${b.was}</s>` : ""}💎 ${b.gems}<small>${b.count} Egg${b.count > 1 ? "s" : ""}</small></button>`,
            )
            .join("")}</div>
        </div>
        <div class="shop-note">💎 Gems come from Index page rewards for now (dev: press K for +100). Real purchases aren't hooked up.</div>`;
      return;
    }
    const items = SHOP_ITEMS.filter((i) => i.tab === this.shop.tab);
    this.shop.body.innerHTML = `<div class="shop-grid">${items
      .map(
        (i) => `<div class="shop-item"><div class="si-icon">${i.icon}</div><div class="si-title">${esc(i.title)}</div>
          <div class="si-desc">${esc(i.desc)}</div>
          <button class="gem-btn${gems >= i.gems ? "" : " no"}" data-buy="${i.id}">💎 ${i.gems}</button></div>`,
      )
      .join("")}</div>${
      this.shop.tab === "speed" && (this.data.inv?.boostLeft ?? 0) > 0
        ? `<div class="shop-note">⚡ x2 Speed active: ${Math.ceil((this.data.inv?.boostLeft ?? 0) / 60)} min left</div>`
        : ""
    }`;
  }

  private renderIndex() {
    const inv = this.data.inv;
    const found = new Set(inv?.discovered ?? []);
    const claimed = new Set(inv?.claimed ?? []);
    const isLimited = this.index.tab === "limited";
    if (!isLimited && !WORLD_BIOMES.some((b) => b.id === this.indexBiome)) this.indexBiome = WORLD_BIOMES[0]?.id ?? "";
    const biome = isLimited ? "limited" : this.indexBiome;
    const pets = PETS.filter((p) => p.biome === biome);
    if (!this.indexPet || !pets.some((p) => p.id === this.indexPet)) this.indexPet = pets[0].id;
    const done = pets.filter((p) => found.has(p.id)).length;
    const cards = pets
      .map((p) => {
        const have = found.has(p.id);
        const reward = have && !claimed.has(p.id);
        return `<button class="idx-card${have ? "" : " unknown"}${p.id === this.indexPet ? " sel" : ""}" data-pet="${p.id}" style="--rc:${RARITY_COLOR[p.rarity]}">
          <span class="ic-name">${have ? esc(p.name) : "???"}</span><span class="ic-icon">${p.icon}</span>${reward ? `<span class="ic-dot">!</span>` : ""}</button>`;
      })
      .join("");
    const sel = PET_BY_ID.get(this.indexPet)!;
    const have = found.has(sel.id);
    const r = INDEX_REWARD[sel.rarity];
    const money = petIncome(sel, sel.baseWeight, "") * r.incomeMult;
    const canClaim = have && !claimed.has(sel.id);
    const biomeDef = WORLD_BIOMES.find((b) => b.id === biome);
    const pageLabel = isLimited ? "⏳ Limited" : `${biomeDef?.emoji ?? ""} ${biomeDef?.name ?? ""}`;
    const canPage = !isLimited && WORLD_BIOMES.length > 1;
    this.index.headerExtra.innerHTML = "";
    this.index.body.innerHTML = `<div class="idx">
      <div class="idx-left">
        <div class="idx-page">${canPage ? `<button class="idx-nav" data-page="-1">‹</button>` : ""}<span>${pageLabel}</span>${canPage ? `<button class="idx-nav" data-page="1">›</button>` : ""}</div>
        <div class="idx-grid">${cards}</div>
        <div class="idx-bar"><div style="width:${(done / pets.length) * 100}%"></div><span>${done}/${pets.length}</span><em title="Complete the page: +${INDEX_COMPLETE_REWARD.gems} 💎 and +1 pen slot">🎁</em></div>
      </div>
      <div class="idx-right">
        <div class="idx-detail" style="--rc:${RARITY_COLOR[sel.rarity]}">
          <div class="idd-icon${have ? "" : " unknown"}">${sel.icon}</div>
          <div class="idd-name">${have ? esc(sel.name) : "???"}</div>
          <div class="idd-rarity" style="color:${RARITY_COLOR[sel.rarity]}">${sel.rarity}</div>
          <div class="idd-inc">${have ? `$${formatShort(petIncome(sel, sel.baseWeight, ""))}/s` : "Hatch it to find out"}</div>
        </div>
        <div class="idx-rewards"><b>Rewards:</b>
          <div class="idr-row"><span>💵 $${formatShort(money)}</span><span>👟 +${formatShort(r.speed)}</span></div>
          <button class="claim-btn" data-claim="${sel.id}" ${canClaim ? "" : "disabled"}>${claimed.has(sel.id) ? "CLAIMED" : "CLAIM!"}</button>
        </div>
      </div>
    </div>
    <button class="claim-all" data-claim="all" ${this.unclaimed ? "" : "disabled"}>📘 CLAIM ALL (${this.unclaimed})!</button>`;
  }

  /** Only items sitting in the inventory can be sold or fused: not pets in the pen, not anything on the hotbar. */
  private inInventory(uid: string, inPen = false) {
    return !inPen && !(this.data.inv?.hotbar ?? []).includes(uid);
  }

  /** Why some owned items aren't listed (null when nothing is held back). */
  private heldBackNote(what: string) {
    const inv = this.data.inv;
    if (!inv) return "";
    const held = inv.pets.filter((p) => !this.inInventory(p.uid, p.equipped)).length + (what === "sell" ? inv.eggs.filter((e) => !this.inInventory(e.uid)).length : 0);
    return held ? `<div class="shop-note">${held} item${held === 1 ? " is" : "s are"} in your pen or on your hotbar — take ${held === 1 ? "it" : "them"} out (🎒) to ${what} ${held === 1 ? "it" : "them"}.</div>` : "";
  }

  /** Sellable pets and eggs, with their sale price. */
  private sellList() {
    const inv = this.data.inv;
    if (!inv) return [];
    const items = [
      ...inv.pets
        .filter((p) => this.inInventory(p.uid, p.equipped))
        .map((p) => ({ uid: p.uid, value: p.income * SELL_MULT, weight: p.weight, card: (sel: boolean) => petCard(p, price(p.income * SELL_MULT), sel) })),
      ...inv.eggs
        .filter((e) => this.inInventory(e.uid))
        .map((e) => {
          const value = eggSellValue(e.defId, e.size);
          return { uid: e.uid, value, weight: e.size, card: (sel: boolean) => eggCard(e, price(value), sel) };
        }),
    ];
    return this.sellSort === "weight" ? items.sort((a, b) => b.weight - a.weight) : items.sort((a, b) => b.value - a.value);
  }

  private renderSell() {
    const items = this.sellList();
    for (const uid of [...this.sellSel]) if (!items.some((p) => p.uid === uid)) this.sellSel.delete(uid);
    const total = items.filter((p) => this.sellSel.has(p.uid)).reduce((a, p) => a + p.value, 0);
    this.sellM.body.innerHTML = `<div class="sell">
      <div class="sell-side">
        <b>Sort By:</b>
        <button class="side-btn${this.sellSort === "weight" ? " sel" : ""}" data-sort="weight">Weight</button>
        <button class="side-btn${this.sellSort === "value" ? " sel" : ""}" data-sort="value">Value</button>
        <button class="side-btn" data-selall>Select All</button>
      </div>
      <div class="card-grid">${items.length ? items.map((p) => p.card(this.sellSel.has(p.uid))).join("") : `<div class="inv-empty">Nothing to sell in your inventory.</div>`}</div>
    </div>
    ${this.heldBackNote("sell")}
    <div class="modal-foot"><span>Total Value: <b>$${formatShort(total)}</b></span><button class="big-go" data-sell ${this.sellSel.size ? "" : "disabled"}>Sell</button></div>`;
  }

  private renderFuse() {
    const pets = [...(this.data.inv?.pets ?? [])].filter((p) => this.inInventory(p.uid, p.equipped)).sort((a, b) => a.species.localeCompare(b.species) || b.weight - a.weight);
    this.fuseSel = this.fuseSel.filter((u) => pets.some((p) => p.uid === u));
    const picked = this.fuseSel.map((u) => pets.find((p) => p.uid === u)!);
    const species = picked[0]?.species;
    const slots = Array.from({ length: FUSE.inputs }, (_, i) => {
      const p = picked[i];
      return p ? `<div class="fuse-slot full">${PET_BY_ID.get(p.species)!.icon}<small>${p.weight}Kg</small></div>` : `<div class="fuse-slot">+<small>Empty</small></div>`;
    }).join(`<span class="fuse-pipe"></span>`);
    const eligible = pets.filter((p) => !species || p.species === species);
    const ready = picked.length === FUSE.inputs;
    // Output preview: an egg of the species, with the range its weight can roll in (the server does the real roll).
    const fee = species ? fusionFee(species) : 0;
    const canPay = this.data.money >= fee;
    let out = "❓";
    let info = "3 of one pet → 1 egg of that pet";
    if (ready) {
      const avg = picked.reduce((a, p) => a + p.weight, 0) / picked.length;
      const lo = rollFusionWeight(species!, [avg], 0);
      const hi = rollFusionWeight(species!, [avg], 1);
      out = `🥚<small>${esc(EGG_BY_ID.get(fusedEggId(species!))!.name)}</small>`;
      info = `Hatches a ${esc(PET_BY_ID.get(species!)!.name)} of ${lo}–${hi}Kg · mutation rerolled · cost <b>$${formatShort(fee)}</b>`;
    }
    this.fuseM.body.innerHTML = `<div class="fuse-top"><div class="fuse-title">Bring ${FUSE.inputs} same Pets to Fuse</div>
      <div class="fuse-sub">${info}</div>
      <div class="fuse-row">${slots}<span class="fuse-arrow">➜</span><div class="fuse-slot out">${out}</div></div>
      <div class="fuse-sub">⚠ The 3 pets are used up. It's a reroll, not a guaranteed upgrade: the egg can hatch smaller and lose a mutation.</div></div>
      <div class="card-grid">${eligible.map((p) => petCard(p, "", this.fuseSel.includes(p.uid))).join("") || `<div class="inv-empty">You need 3 of the same pet in your inventory.</div>`}</div>
      ${this.heldBackNote("fuse")}
      <div class="modal-foot"><span>${!ready ? `${FUSE.inputs - picked.length} Pet${FUSE.inputs - picked.length > 1 ? "s" : ""} Left` : canPay ? "Ready!" : `Not enough money ($${formatShort(fee)})`}</span>
      <button class="big-go" data-fuse ${ready && canPay ? "" : "disabled"}>${ready ? `Fuse · $${formatShort(fee)}` : "Fuse"}</button></div>`;
  }

  private renderTrails() {
    const owned = new Set(this.data.inv?.trailsOwned ?? []);
    this.trails.headerExtra.innerHTML = `<span class="gems-pill">💵 $${formatShort(this.data.money)}</span>`;
    this.trails.body.innerHTML = `<div class="trail-row">${TRAILS.map((t) => {
      const on = this.data.trail === t.id;
      const btn = on
        ? `<button class="big-go red" data-trail-eq="">Unequip</button>`
        : owned.has(t.id)
          ? `<button class="big-go" data-trail-eq="${t.id}">Equip</button>`
          : `<button class="big-go${this.data.money >= t.price ? "" : " no"}" data-trail-buy="${t.id}">$${formatShort(t.price)}</button>`;
      return `<div class="trail-card" style="--tc:${t.color}"><div class="tc-name">${esc(t.name)}</div>
        <div class="tc-rarity" style="color:${RARITY_COLOR[t.rarity]}">${t.rarity}</div>
        <div class="tc-art"><span class="tc-streak"></span>🏃</div>
        <div class="tc-mult">x${t.speedMult} Speed</div>${btn}</div>`;
    }).join("")}</div>`;
  }

  // ------------------------------------------------------------------ clicks

  private wire() {
    this.shop.body.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("[data-buy]") as HTMLElement | null;
      if (b) this.actions.shopBuy(b.dataset.buy!, b.dataset.count ? Number(b.dataset.count) : undefined);
    });
    this.index.body.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const page = t.closest("[data-page]") as HTMLElement | null;
      if (page) {
        const i = WORLD_BIOMES.findIndex((b) => b.id === this.indexBiome);
        const n = WORLD_BIOMES.length;
        this.indexBiome = WORLD_BIOMES[(i + Number(page.dataset.page) + n) % n].id;
        this.indexPet = "";
        return this.renderIndex();
      }
      const card = t.closest("[data-pet]") as HTMLElement | null;
      if (card) {
        this.indexPet = card.dataset.pet!;
        return this.renderIndex();
      }
      const c = t.closest("[data-claim]") as HTMLButtonElement | null;
      if (c && !c.disabled) this.actions.claim(c.dataset.claim!);
    });
    this.sellM.body.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const sort = t.closest("[data-sort]") as HTMLElement | null;
      if (sort) this.sellSort = sort.dataset.sort as "weight" | "value";
      else if (t.closest("[data-selall]")) {
        const all = this.sellList();
        if (this.sellSel.size === all.length) this.sellSel.clear();
        else all.forEach((p) => this.sellSel.add(p.uid));
      } else if (t.closest("[data-sell]")) {
        if (this.sellSel.size) this.actions.sell([...this.sellSel]);
        this.sellSel.clear();
      } else {
        const card = t.closest("[data-uid]") as HTMLElement | null;
        if (!card) return;
        const uid = card.dataset.uid!;
        if (this.sellSel.has(uid)) this.sellSel.delete(uid);
        else this.sellSel.add(uid);
      }
      this.renderSell();
    });
    this.fuseM.body.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-fuse]")) {
        if (this.fuseSel.length === FUSE.inputs) this.actions.fuse(this.fuseSel);
        this.fuseSel = [];
      } else {
        const card = t.closest("[data-uid]") as HTMLElement | null;
        if (!card) return;
        const uid = card.dataset.uid!;
        if (this.fuseSel.includes(uid)) this.fuseSel = this.fuseSel.filter((u) => u !== uid);
        else if (this.fuseSel.length < FUSE.inputs) this.fuseSel.push(uid);
      }
      this.renderFuse();
    });
    this.trails.body.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const buy = t.closest("[data-trail-buy]") as HTMLElement | null;
      const eq = t.closest("[data-trail-eq]") as HTMLElement | null;
      if (buy) this.actions.buyTrail(buy.dataset.trailBuy!);
      else if (eq) this.actions.equipTrail(eq.dataset.trailEq!);
    });
  }
}
