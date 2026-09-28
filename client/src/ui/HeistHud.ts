/**
 * Stealing / chase UI, reference style:
 * - "Egg — Steal [E]" prompt with a hold ring next to the nearest egg
 * - while carrying: big "RUN!!" banner, red screen vignette, red Drop button, normal side buttons hidden
 * - toasts and the biome-name banner
 */
export class HeistHud {
  private prompt: HTMLElement;
  private ring: HTMLElement;
  private promptName: HTMLElement;
  private promptAction: HTMLElement;
  private runBanner: HTMLElement;
  private runSub: HTMLElement;
  private vignette: HTMLElement;
  private dropBtn: HTMLButtonElement;
  private toasts: HTMLElement;
  private biomeBanner: HTMLElement;
  private biomeTimer = 0;
  /** True while the on-screen prompt is being pressed (touch / mouse). */
  pointerHolding = false;
  onDrop?: () => void;

  constructor(private root: HTMLElement, isTouch: boolean) {
    root.insertAdjacentHTML(
      "beforeend",
      `<div class="vignette" hidden></div>
       <div class="run-banner" hidden><div class="run-title">RUN!!</div><div class="run-sub"></div></div>
       <button class="drop-btn" hidden>🗑️ Drop</button>
       <div class="steal-prompt" hidden>
         <div class="key"><div class="ring"></div><span>${isTouch ? "👆" : "E"}</span></div>
         <div class="txt"><div class="name"></div><div class="action"></div></div>
       </div>
       <div class="toasts"></div>
       <div class="biome-banner" hidden></div>`,
    );
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    this.prompt = q(".steal-prompt");
    this.ring = q(".steal-prompt .ring");
    this.promptName = q(".steal-prompt .name");
    this.promptAction = q(".steal-prompt .action");
    this.runBanner = q(".run-banner");
    this.runSub = q(".run-sub");
    this.vignette = q(".vignette");
    this.dropBtn = q(".drop-btn") as HTMLButtonElement;
    this.toasts = q(".toasts");
    this.biomeBanner = q(".biome-banner");
    this.dropBtn.addEventListener("click", () => this.onDrop?.());

    const down = (e: Event) => {
      e.preventDefault();
      this.pointerHolding = true;
    };
    const up = () => (this.pointerHolding = false);
    this.prompt.addEventListener("pointerdown", down);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  }

  /** Shows the prompt at a screen position (or hides it when `info` is null). `progress` 0..1. */
  setPrompt(info: { title: string; color: string } | null, x = 0, y = 0, progress = 0, action = "Steal") {
    this.prompt.hidden = !info;
    if (!info) return;
    this.prompt.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    this.promptName.textContent = info.title;
    this.promptName.style.color = info.color;
    this.promptAction.textContent = action;
    this.ring.style.background = `conic-gradient(#fff ${progress * 360}deg, rgba(255,255,255,0.18) 0deg)`;
  }

  /** Carrying mode: RUN!! banner, vignette, Drop button; hides the regular side buttons. */
  setCarrying(carrying: boolean, sub = "", danger = 0) {
    this.runBanner.hidden = !carrying;
    this.vignette.hidden = !carrying;
    this.dropBtn.hidden = !carrying;
    this.root.classList.toggle("carrying", carrying);
    if (!carrying) return;
    this.runSub.textContent = sub;
    // Vignette gets stronger as the guardian closes in (danger 0..1).
    this.vignette.style.opacity = String(0.45 + danger * 0.55);
  }

  toast(text: string, kind: "info" | "good" | "bad" = "info", ms = 2600) {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild!.remove();
    setTimeout(() => el.classList.add("out"), ms);
    setTimeout(() => el.remove(), ms + 500);
  }

  /** "Forest 🌳" banner when entering a biome. */
  showBiome(name: string, emoji: string, color: string) {
    this.biomeBanner.innerHTML = `<span style="color:${color}">${name}</span> ${emoji}`;
    this.biomeBanner.hidden = false;
    this.biomeBanner.classList.remove("show");
    void this.biomeBanner.offsetWidth;
    this.biomeBanner.classList.add("show");
    clearTimeout(this.biomeTimer);
    this.biomeTimer = window.setTimeout(() => (this.biomeBanner.hidden = true), 3200);
  }
}
