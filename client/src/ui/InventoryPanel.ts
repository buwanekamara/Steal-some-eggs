import { EGG_BY_ID, MUTATION_BY_ID, PET_BY_ID, RARITY_COLOR, formatShort, petDisplayName, type InventoryMsg } from "@egg/shared";
import { formatClock } from "../entities/PenEggEntity.ts";

export interface GrowingEggView {
  uid: string;
  defId: string;
  readyIn: number;
  growSec: number;
}

export interface PanelData {
  inv: InventoryMsg | null;
  growing: GrowingEggView[];
  slots: number;
  money: number;
}

export interface PanelActions {
  /** Put a pet in the pen / take it out. */
  equip(uid: string, on: boolean): void;
  equipBest(): void;
  buySlot(): void;
  hatch(uid: string): void;
  /** Dev builds only (instant grow). */
  growAll?: () => void;
}

export type PanelMode = "pets" | "eggs";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Right-docked pen panel (reference layout), opened by the Egg and Paw buttons. Items themselves live in the
 * 🎒 backpack; this panel manages what's in the pen:
 * - Pets: "N/M Active", "+1 SLOT [$cost]", each pet with Equip (into the pen) / Unequip, and Equip Best
 * - Eggs: "Growing Eggs" with progress bars / Open buttons
 */
export class InventoryPanel {
  private el: HTMLElement;
  private body: HTMLElement;
  private title: HTMLElement;
  private headerBtn: HTMLButtonElement;
  mode: PanelMode | null = null;
  private data: PanelData = { inv: null, growing: [], slots: 0, money: 0 };

  constructor(root: HTMLElement, private actions: PanelActions) {
    root.insertAdjacentHTML(
      "beforeend",
      `<div class="inv-panel" hidden>
        <button class="inv-close" title="Close">&gt;</button>
        <div class="inv-head"><span class="inv-title"></span><button class="inv-head-btn"></button></div>
        <div class="inv-body"></div>
      </div>`,
    );
    this.el = root.querySelector(".inv-panel") as HTMLElement;
    this.body = this.el.querySelector(".inv-body") as HTMLElement;
    this.title = this.el.querySelector(".inv-title") as HTMLElement;
    this.headerBtn = this.el.querySelector(".inv-head-btn") as HTMLButtonElement;
    this.el.querySelector(".inv-close")!.addEventListener("click", () => this.close());
    this.headerBtn.addEventListener("click", () => {
      if (this.mode === "pets") actions.buySlot();
      else actions.growAll?.();
    });
    // One delegated handler for every row button.
    this.body.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button[data-act]") as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      const { act, id } = b.dataset;
      if (act === "equip") actions.equip(id!, true);
      if (act === "unequip") actions.equip(id!, false);
      if (act === "best") actions.equipBest();
      if (act === "hatch") actions.hatch(id!);
    });
  }

  toggle(mode: PanelMode) {
    if (this.mode === mode) return this.close();
    this.mode = mode;
    this.el.hidden = false;
    this.render();
  }

  close() {
    this.mode = null;
    this.el.hidden = true;
  }

  update(data: PanelData) {
    this.data = data;
    if (this.mode) this.render();
  }

  private render() {
    if (this.mode === "pets") this.renderPets();
    else if (this.mode === "eggs") this.renderEggs();
  }

  private renderPets() {
    const { inv, slots, money, growing } = this.data;
    const pets = [...(inv?.pets ?? [])].sort((a, b) => Number(b.equipped) - Number(a.equipped) || b.income - a.income);
    const active = pets.filter((p) => p.equipped).length;
    const used = active + growing.length;
    this.title.textContent = `${active}/${slots - growing.length} Active`;
    const cost = inv?.nextSlotCost ?? 0;
    this.headerBtn.hidden = !cost;
    this.headerBtn.textContent = `+1 SLOT [$${formatShort(cost)}]`;
    this.headerBtn.className = `inv-head-btn ${money >= cost ? "ok" : "no"}`;
    this.headerBtn.disabled = money < cost;
    this.headerBtn.title = growing.length ? `Growing eggs use ${growing.length} of your ${slots} slots` : "";

    if (!pets.length) {
      this.body.innerHTML = `<div class="inv-empty">No pets yet — hatch an egg in your pen!</div>`;
      return;
    }
    this.body.innerHTML =
      pets
        .map((p) => {
          const def = PET_BY_ID.get(p.species)!;
          const mut = p.mutation ? MUTATION_BY_ID.get(p.mutation) : undefined;
          const name = esc(petDisplayName(def, p.mutation));
          const full = !p.equipped && used >= slots;
          return `<div class="inv-row${p.equipped ? " on" : ""}">
            <div class="inv-icon" style="border-color:${RARITY_COLOR[def.rarity]}">${def.icon}</div>
            <div class="inv-info"><div class="inv-name" style="color:${mut ? mut.color : RARITY_COLOR[def.rarity]}">${name}</div>
              <div class="inv-sub">${p.weight}Kg · <b>$${formatShort(p.income)}/s</b></div></div>
            ${
              p.equipped
                ? `<button class="inv-btn red" data-act="unequip" data-id="${p.uid}">Unequip</button>`
                : `<button class="inv-btn green" data-act="equip" data-id="${p.uid}" ${full ? "disabled title='Pen is full'" : ""}>Equip</button>`
            }
          </div>`;
        })
        .join("") + `<button class="inv-best" data-act="best">Equip Best</button>`;
  }

  private renderEggs() {
    const { growing } = this.data;
    this.title.textContent = "Growing Eggs";
    this.headerBtn.hidden = false;
    this.headerBtn.textContent = "Grow All";
    this.headerBtn.className = "inv-head-btn gold";
    this.headerBtn.disabled = !this.actions.growAll || !growing.some((g) => g.readyIn > 0);
    this.headerBtn.title = this.actions.growAll ? "Dev build: finish growing now" : "Coming with the Shop (Phase 5)";

    const rows = growing.map((g) => {
      const def = EGG_BY_ID.get(g.defId)!;
      const pct = g.growSec ? Math.round((1 - g.readyIn / g.growSec) * 100) : 100;
      return `<div class="inv-row">
        <div class="inv-icon" style="border-color:${RARITY_COLOR[def.rarity]}">🥚</div>
        ${
          g.readyIn > 0
            ? `<div class="inv-bar"><div style="width:${pct}%"></div><span>${formatClock(g.readyIn)}</span></div>`
            : `<button class="inv-btn green wide" data-act="hatch" data-id="${g.uid}">Open</button>`
        }
      </div>`;
    });
    this.body.innerHTML =
      (rows.length ? rows.join("") : `<div class="inv-empty">Nothing growing. Hold an egg from your hotbar and press F in your pen!</div>`) +
      `<div class="inv-empty">Unplanted eggs are in your backpack (🎒).</div>`;
  }
}
