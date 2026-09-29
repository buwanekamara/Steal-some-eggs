import { EGG_BY_ID, MUTATION_BY_ID, PET_BY_ID, RARITY_COLOR, TOOLS, petDisplayName, type InventoryMsg } from "@egg/shared";

export type BackpackTab = "pets" | "eggs" | "gear";

export interface BackpackActions {
  /** Put an inventory item into a hotbar slot (omitted = the first free one). */
  toSlot(uid: string, slot?: number): void;
  swapSlots(a: number, b: number): void;
  /** Send a hotbar slot's item back to the inventory. */
  clearSlot(slot: number): void;
}

interface Card {
  uid: string;
  icon: string;
  name: string;
  sub: string;
  color: string;
}

/** What's being dragged: an inventory item, or the item in a hotbar slot. */
type DragFrom = { uid: string } | { slot: number };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Pointer travel (px) before a press becomes a drag instead of a click. */
const DRAG_START = 6;

/**
 * "All Items" backpack (🎒 / B / gamepad Y): Pets · Eggs · Gear tabs down the left, a search box, and a grid of
 * everything in the inventory — i.e. not on the hotbar, and pets not standing in the pen.
 * Drag an item onto a hotbar slot to put it there, drag slots onto each other to swap them, and drag a slot back
 * onto the grid to take it off the hotbar. Mouse and touch both use pointer events; a plain click/tap on an
 * item sends it to the first free slot.
 */
export class Backpack {
  private el: HTMLElement;
  private grid: HTMLElement;
  private count: HTMLElement;
  private search: HTMLInputElement;
  private tab: BackpackTab = "pets";
  private inv: InventoryMsg | null = null;
  private sig = "";
  private drag: { from: DragFrom; x0: number; y0: number; ghost: HTMLElement | null; icon: string } | null = null;
  private dragEndedAt = -1e9;

  /** True right after a drag ended, so the click the browser sends after it is ignored. */
  get justDragged() {
    return performance.now() - this.dragEndedAt < 300;
  }

  constructor(
    root: HTMLElement,
    private actions: BackpackActions,
  ) {
    root.insertAdjacentHTML(
      "beforeend",
      `<div class="bp" hidden>
        <div class="bp-tabs">
          <button data-tab="pets"><b>Pets</b><span>🐾</span></button>
          <button data-tab="eggs"><b>Eggs</b><span>🥚</span></button>
          <button data-tab="gear"><b>Gear</b><span>🏏</span></button>
        </div>
        <div class="bp-panel">
          <div class="bp-head">
            <div><div class="bp-title">All Items</div><div class="bp-count"></div></div>
            <input class="bp-search" type="text" placeholder="search" />
          </div>
          <div class="bp-grid"></div>
        </div>
      </div>`,
    );
    this.el = root.querySelector(".bp") as HTMLElement;
    this.grid = this.el.querySelector(".bp-grid") as HTMLElement;
    this.count = this.el.querySelector(".bp-count") as HTMLElement;
    this.search = this.el.querySelector(".bp-search") as HTMLInputElement;
    for (const b of this.el.querySelectorAll<HTMLElement>(".bp-tabs [data-tab]")) {
      b.addEventListener("click", () => {
        this.tab = b.dataset.tab as BackpackTab;
        this.render(true);
      });
    }
    this.search.addEventListener("input", () => this.render(true));

    // Presses on grid cards and (while open) on hotbar slots may become drags.
    addEventListener("pointerdown", (e) => this.pointerDown(e));
    addEventListener("pointermove", (e) => this.pointerMove(e));
    addEventListener("pointerup", (e) => this.pointerUp(e));
    addEventListener("pointercancel", () => this.endDrag());
    this.grid.addEventListener("click", (e) => {
      if (this.justDragged) return;
      const card = (e.target as HTMLElement).closest<HTMLElement>(".bp-card");
      if (card) this.actions.toSlot(card.dataset.uid!);
    });
  }

  get isOpen() {
    return !this.el.hidden;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(tab?: BackpackTab) {
    if (tab) this.tab = tab;
    this.el.hidden = false;
    this.render(true);
  }

  close() {
    this.el.hidden = true;
    this.search.value = "";
    this.endDrag();
  }

  update(inv: InventoryMsg | null) {
    this.inv = inv;
    if (this.isOpen) this.render(false);
  }

  // ------------------------------------------------------------------ rendering

  /** Items in the inventory for the current tab (not on the hotbar; pets not in the pen). */
  private cards(): Card[] {
    const inv = this.inv;
    if (!inv) return [];
    const free = (uid: string) => !inv.hotbar.includes(uid);
    if (this.tab === "pets") {
      return inv.pets
        .filter((p) => !p.equipped && free(p.uid))
        .sort((a, b) => b.income - a.income)
        .map((p) => {
          const def = PET_BY_ID.get(p.species)!;
          const mut = p.mutation ? MUTATION_BY_ID.get(p.mutation) : undefined;
          return { uid: p.uid, icon: def.icon, name: petDisplayName(def, p.mutation), sub: `${p.weight}Kg`, color: mut ? mut.color : RARITY_COLOR[def.rarity] };
        });
    }
    if (this.tab === "eggs") {
      return inv.eggs.filter((e) => free(e.uid)).map((e) => {
        const def = EGG_BY_ID.get(e.defId)!;
        // A fused egg already knows what it hatches into.
        const mut = e.fusion?.mutation ? MUTATION_BY_ID.get(e.fusion.mutation)?.prefix : "";
        const sub = e.fusion ? `${e.fusion.weight}Kg${mut ? ` ${mut}` : ""}` : `size ${e.size.toFixed(2)}`;
        return { uid: e.uid, icon: "🥚", name: def.name, sub, color: RARITY_COLOR[def.rarity] };
      });
    }
    return inv.tools.filter((t) => free(t.uid)).map((t) => {
      const def = TOOLS[t.kind];
      return { uid: t.uid, icon: def.icon, name: def.name, sub: def.maxStack > 1 ? `x${t.qty}` : "", color: "#ffd21f" };
    });
  }

  /** Redraws only when something changed, so a press on a card isn't cut off by a rebuild. */
  private render(force: boolean) {
    const inv = this.inv;
    const total = !inv ? 0 : this.tab === "pets" ? inv.pets.length : this.tab === "eggs" ? inv.eggs.length : inv.tools.length;
    const q = this.search.value.trim().toLowerCase();
    const cards = this.cards().filter((c) => !q || c.name.toLowerCase().includes(q));
    const sig = JSON.stringify([this.tab, total, cards]);
    if (!force && sig === this.sig) return;
    this.sig = sig;
    for (const b of this.el.querySelectorAll<HTMLElement>(".bp-tabs [data-tab]")) b.classList.toggle("on", b.dataset.tab === this.tab);
    this.count.textContent = `${this.tab === "pets" ? "Pets" : this.tab === "eggs" ? "Eggs" : "Gear"}: ${total}`;
    this.grid.innerHTML = cards.length
      ? cards
          .map(
            (c) => `<div class="bp-card" data-uid="${c.uid}" title="Drag onto the hotbar (or click)">
              <span class="bp-icon">${c.icon}</span>
              <span class="bp-name" style="color:${c.color}">${esc(c.name)}${c.sub ? ` (${esc(c.sub)})` : ""}</span>
            </div>`,
          )
          .join("")
      : `<div class="bp-empty">${q ? "Nothing matches." : this.tab === "pets" ? "No pets in your inventory — pets in your pen live there." : "Nothing here."}</div>`;
  }

  // ------------------------------------------------------------------ drag and drop

  private pointerDown(e: PointerEvent) {
    if (!this.isOpen || e.button > 0) return;
    const t = e.target as HTMLElement;
    if (t.closest(".hb-clear")) return;
    const card = t.closest<HTMLElement>(".bp-card");
    const slot = t.closest<HTMLElement>(".hotbar .hb-slot:not(.empty)");
    if (!card && !slot) return;
    const from: DragFrom = card ? { uid: card.dataset.uid! } : { slot: Number(slot!.dataset.slot) };
    const icon = (card ?? slot)!.querySelector(".bp-icon, .hb-icon")?.textContent ?? "";
    this.drag = { from, x0: e.clientX, y0: e.clientY, ghost: null, icon };
  }

  private pointerMove(e: PointerEvent) {
    const d = this.drag;
    if (!d) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_START) return;
      d.ghost = document.createElement("div");
      d.ghost.className = "bp-ghost";
      d.ghost.textContent = d.icon;
      document.body.appendChild(d.ghost);
    }
    d.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    for (const s of document.querySelectorAll(".hotbar .hb-slot.drop")) s.classList.remove("drop");
    this.slotAt(e)?.classList.add("drop");
  }

  private pointerUp(e: PointerEvent) {
    const d = this.drag;
    if (!d) return;
    if (d.ghost) {
      this.dragEndedAt = performance.now();
      const target = this.slotAt(e);
      const to = target ? Number(target.dataset.slot) : -1;
      if ("uid" in d.from) {
        if (to >= 0) this.actions.toSlot(d.from.uid, to);
      } else if (to >= 0) {
        if (to !== d.from.slot) this.actions.swapSlots(d.from.slot, to);
      } else if ((document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest(".bp")) {
        this.actions.clearSlot(d.from.slot); // dropped back into the backpack
      }
    }
    this.endDrag();
  }

  private slotAt(e: PointerEvent) {
    return (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>(".hotbar .hb-slot") ?? null;
  }

  private endDrag() {
    this.drag?.ghost?.remove();
    this.drag = null;
    for (const s of document.querySelectorAll(".hotbar .hb-slot.drop")) s.classList.remove("drop");
  }
}
