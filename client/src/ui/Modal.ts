/**
 * Reference-style modal: striped colored header with a big title and a red X, dark studded body,
 * and optional big tab buttons outside on the right (Shop: Featured/Speed/Money, Index: World/Limited).
 * Only one modal is open at a time.
 */
let openModal: Modal | null = null;

export interface ModalTab {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export class Modal {
  readonly el: HTMLElement;
  readonly body: HTMLElement;
  readonly headerExtra: HTMLElement;
  private tabsEl: HTMLElement;
  tab = "";
  onTab?: (id: string) => void;
  onClose?: () => void;

  constructor(root: HTMLElement, title: string, color: string, tabs: ModalTab[] = []) {
    root.insertAdjacentHTML(
      "beforeend",
      `<div class="modal-wrap" hidden>
        <div class="modal" style="--mc:${color}">
          <div class="modal-head"><span class="modal-title">${title}</span><span class="modal-extra"></span><button class="modal-x">X</button></div>
          <div class="modal-body"></div>
        </div>
        <div class="modal-tabs"></div>
      </div>`,
    );
    this.el = root.lastElementChild as HTMLElement;
    this.body = this.el.querySelector(".modal-body") as HTMLElement;
    this.headerExtra = this.el.querySelector(".modal-extra") as HTMLElement;
    this.tabsEl = this.el.querySelector(".modal-tabs") as HTMLElement;
    this.el.querySelector(".modal-x")!.addEventListener("click", () => this.close());
    this.el.addEventListener("pointerdown", (e) => {
      if (e.target === this.el) this.close(); // click outside the window closes it
    });
    this.tabsEl.innerHTML = tabs
      .map((t) => `<button class="modal-tab" data-tab="${t.id}" style="--tc:${t.color}"><span>${t.icon}</span>${t.label}</button>`)
      .join("");
    this.tabsEl.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("[data-tab]") as HTMLElement | null;
      if (b) this.setTab(b.dataset.tab!);
    });
    if (tabs.length) this.tab = tabs[0].id;
  }

  get isOpen() {
    return !this.el.hidden;
  }

  setTab(id: string) {
    this.tab = id;
    this.tabsEl.querySelectorAll(".modal-tab").forEach((b) => b.classList.toggle("sel", (b as HTMLElement).dataset.tab === id));
    this.onTab?.(id);
  }

  open() {
    if (openModal && openModal !== this) openModal.close();
    openModal = this;
    this.el.hidden = false;
    if (this.tab) this.setTab(this.tab);
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    if (openModal === this) openModal = null;
    this.onClose?.();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }
}

/** Closes whichever modal is open (Escape key). Returns whether one was open. */
export function closeOpenModal() {
  const m = openModal;
  m?.close();
  return !!m;
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
