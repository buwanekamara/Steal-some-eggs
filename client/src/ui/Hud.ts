import { WORLD_EVENTS, biomeAt, formatShort } from "@egg/shared";
import type { GraphicsChoice, Quality, Settings } from "../game/Settings.ts";

export interface PlayerRow {
  name: string;
  speed: number;
  moneyPerSec: number;
  isYou: boolean;
}

type SortKey = "name" | "speed" | "moneyPerSec";

/**
 * HTML overlay HUD. Layout follows the reference:
 * Speed/money bottom-left, buttons left, player list top-right.
 * Wired so far: Speed, money, Slow Mode, player list, event timers, hints.
 * Shop / Index / Egg / Paw buttons light up in later phases.
 */
export class Hud {
  private speedEl: HTMLElement;
  private moneyEl: HTMLElement;
  private listEl: HTMLElement;
  private statusEl: HTMLElement;
  private debugEl: HTMLElement;
  onDevToggleNight?: () => void;
  private slowToggle: HTMLElement;
  private helpEl: HTMLElement;
  private nightEl: HTMLElement;
  private nightIcon: HTMLElement;
  private nightRow: HTMLElement;
  private potionEl: HTMLElement;
  private hintEl: HTMLElement;
  private overlayEl: HTMLElement;
  private nightBannerEl: HTMLElement;
  private offlineBannerEl: HTMLElement;
  private hotbarEl: HTMLElement;
  private rows: PlayerRow[] = [];
  private sortKey: SortKey = "moneyPerSec";
  private sortDesc = true;
  /** Speed / money counters (targets for the flying gain numbers). */
  readonly speedStat: HTMLElement;
  readonly moneyStat: HTMLElement;
  onSlowModeChange?: (on: boolean) => void;
  onEggButton?: () => void;
  onShopButton?: () => void;
  onIndexButton?: () => void;
  onPawButton?: () => void;
  onOfflineClaim?: () => void;
  onBagButton?: () => void;
  onGraphics?: (choice: GraphicsChoice) => void;
  onSound?: (on: boolean) => void;
  /** A hotbar slot was clicked/tapped (select it, or arrange it while the inventory is open). */
  onSlotClick?: (slot: number) => void;
  /** The ✕ on a slot while arranging: take its item back to the inventory. */
  onSlotClear?: (slot: number) => void;
  private hotbarSig = "";
  private cooldowns: Record<string, { end: number; sec: number }> = {};

  constructor(private root: HTMLElement, isTouch: boolean) {
    root.insertAdjacentHTML(
      "beforeend",
      `
      <div class="hud">
        <div class="hud-status"></div>
        <div class="hud-left">
          <button class="big-btn shop">🛒 Shop</button>
          <button class="big-btn index">📘 Index</button>
          <div class="slow-mode"><div class="toggle"><div class="knob"></div></div><span>Slow Mode</span></div>
        </div>
        <div class="hud-topbar">
          <button class="tb-btn menu" title="Menu">☰</button>
          <button class="tb-btn bag" title="Inventory (B)">🎒</button>
          <button class="tb-btn controls" title="Controls (H)">❗</button>
        </div>
        <div class="tb-menu panel" hidden>
          <div class="tm-row"><b>Graphics</b><span class="tm-opts">
            <button data-gfx="auto">Auto</button><button data-gfx="high">High</button><button data-gfx="low">Low</button>
          </span></div>
          <div class="tm-note"></div>
          <div class="tm-row"><b>Sound</b><span class="tm-opts"><button data-sound="on">On</button><button data-sound="off">Off</button></span></div>
          <button class="tm-help">Controls help (H)</button>
        </div>
        <div class="hud-right">
          <button class="sq-btn egg" title="Eggs">🥚</button>
          <button class="sq-btn paw" title="Pets">🐾</button>
        </div>
        <div class="hud-stats">
          <div class="stat speed"><span class="icon">👟</span><span class="val">0</span></div>
          <div class="stat money"><span class="icon">💵</span><span class="val">$0</span></div>
          <div class="stat gems"><span class="icon">💎</span><span class="val">0</span></div>
        </div>
        <div class="hud-timers">
          <div class="timer boost" hidden title="x2 Speed boost"><span class="icon">⚡</span><span class="val"></span></div>
          <div class="timer potion" title="Potion: claim it in the hub for x2 Speed-gain"><span class="icon">🧪</span><span class="val"></span></div>
          <div class="timer night" title="Night: every biome seals off"><span class="icon">🌙</span><span class="val"></span></div>
        </div>
        <div class="hint" hidden></div>
        <div class="night-banner" hidden>🌙 <b>Night has fallen</b> — biomes sealed off, eggs hatch <b>${WORLD_EVENTS.nightGrowMult}x</b> faster!</div>
        <div class="offline-banner" hidden>💰 <b>Welcome back!</b> You earned <span class="amt"></span> while away.<button class="claim-btn">Claim</button></div>
        <div class="hotbar-wrap">
          <div class="hb-action" hidden></div>
          <div class="hotbar panel"></div>
        </div>
        <div class="overlay" hidden></div>
        <div class="player-list panel">
          <div class="pl-head">
            <span data-key="name">People</span><span data-key="moneyPerSec">Money/s</span><span data-key="speed">Speed</span>
          </div>
          <div class="pl-rows"></div>
        </div>
        <div class="debug" hidden></div>
        ${import.meta.env.DEV ? '<button class="dev-night" type="button">🌗 Toggle Night</button>' : ""}
        <div class="help panel">
          <b>Controls</b><br/>
          ${isTouch ? "Left thumb: move · Right side drag: camera · ⬆: jump · Tap a hotbar slot to hold it, the action button to use it · Hold 👆 on an egg: steal" : "WASD / arrows: move · Space: jump · Hold E: steal egg · 1–0: hotbar · F: use held item · B: inventory · Drag mouse: camera · Wheel: zoom"}<br/>
          ${isTouch ? "" : "Gamepad: stick move · A jump · X use · LB/RB hotbar · Y inventory<br/>C: Slow Mode · Tab: pets · F3: debug info · H: hide this help"}
          ${!isTouch && import.meta.env.DEV ? "<br/><i>Dev: = ×10 Speed stat · - reset · J: free egg · G: finish growing eggs · N: toggle night/day · M: +$1M · K: +100 💎 · P: 3 Chicks · URL ?profile=name for a 2nd test player</i>" : ""}
        </div>
      </div>`,
    );
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    this.speedEl = q(".stat.speed .val");
    this.moneyEl = q(".stat.money .val");
    this.listEl = q(".pl-rows");
    this.statusEl = q(".hud-status");
    this.debugEl = q(".debug");
    this.root.querySelector(".dev-night")?.addEventListener("click", (e) => {
      (e.currentTarget as HTMLElement).blur(); // keep Space/Enter from re-triggering it
      this.onDevToggleNight?.();
    });
    this.slowToggle = q(".slow-mode");
    this.helpEl = q(".help");
    this.nightEl = q(".timer.night .val");
    this.nightIcon = q(".timer.night .icon");
    this.nightRow = q(".timer.night");
    this.potionEl = q(".timer.potion .val");
    this.hintEl = q(".hint");
    this.overlayEl = q(".overlay");
    this.nightBannerEl = q(".night-banner");
    this.offlineBannerEl = q(".offline-banner");
    this.hotbarEl = q(".hotbar");
    this.speedStat = q(".stat.speed");
    this.moneyStat = q(".stat.money");
    this.slowToggle.addEventListener("click", () => this.onSlowModeChange?.(!this.slowToggle.classList.contains("on")));
    q(".sq-btn.egg").addEventListener("click", () => this.onEggButton?.());
    q(".big-btn.shop").addEventListener("click", () => this.onShopButton?.());
    q(".big-btn.index").addEventListener("click", () => this.onIndexButton?.());
    q(".sq-btn.paw").addEventListener("click", () => this.onPawButton?.());
    this.offlineBannerEl.querySelector(".claim-btn")!.addEventListener("click", () => this.onOfflineClaim?.());
    q(".tb-btn.bag").addEventListener("click", () => this.onBagButton?.());
    q(".tb-btn.controls").addEventListener("click", (e) => {
      (e.currentTarget as HTMLElement).blur(); // keep Space/Enter from re-triggering it
      this.toggleHelp();
    });
    const menu = q(".tb-menu");
    q(".tb-btn.menu").addEventListener("click", () => (menu.hidden = !menu.hidden));
    menu.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const gfx = t.closest<HTMLElement>("[data-gfx]");
      const sound = t.closest<HTMLElement>("[data-sound]");
      if (gfx) this.onGraphics?.(gfx.dataset.gfx as GraphicsChoice);
      else if (sound) this.onSound?.(sound.dataset.sound === "on");
      else if (t.closest(".tm-help")) this.toggleHelp();
    });
    // One delegated handler: slots are re-rendered whenever their contents change.
    this.hotbarEl.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const clear = t.closest<HTMLElement>(".hb-clear");
      if (clear) return this.onSlotClear?.(Number(clear.dataset.slot));
      const slot = t.closest<HTMLElement>(".hb-slot");
      if (slot) this.onSlotClick?.(Number(slot.dataset.slot));
    });
    for (const head of root.querySelectorAll<HTMLElement>(".pl-head [data-key]")) {
      head.addEventListener("click", () => {
        const key = head.dataset.key as SortKey;
        this.sortDesc = key === this.sortKey ? !this.sortDesc : true;
        this.sortKey = key;
        this.renderPlayers();
      });
    }
    setTimeout(() => this.helpEl.classList.add("faded"), 12000);
  }

  /** Quick bounce on a stat counter. */
  pulse(el: HTMLElement) {
    el.classList.remove("pulse");
    void el.offsetWidth;
    el.classList.add("pulse");
  }

  setSpeed(v: number) {
    this.speedEl.textContent = formatShort(v);
  }

  setMoney(v: number) {
    this.moneyEl.textContent = `$${formatShort(v)}`;
  }

  /** Countdown timers, reference style: "in 3m 9s", red in the last 15 s. */
  setTimers(nightIn: number, potionIn: number, isNight: boolean, potionAvailable: boolean) {
    for (const [el, secs] of [[this.nightEl, nightIn]] as const) {
      el.textContent = `in ${formatDuration(secs)}`;
      el.classList.toggle("soon", secs <= 15);
    }
    this.nightIcon.textContent = isNight ? "☀️" : "🌙";
    this.nightRow.title = isNight ? "Day resumes and biomes reopen" : "Night: every biome seals off";

    this.potionEl.classList.toggle("ready", potionAvailable);
    if (potionAvailable) {
      this.potionEl.textContent = "Ready!";
      this.potionEl.classList.remove("soon");
    } else {
      this.potionEl.textContent = `in ${formatDuration(potionIn)}`;
      this.potionEl.classList.toggle("soon", potionIn <= 15);
    }
  }

  /** Slides a banner in when the player enters a biome: its name, trait and what the trait does. */
  showBiomeBanner(emoji: string, name: string, trait: string, desc: string) {
    this.root.querySelector(".biome-banner")?.remove();
    const el = document.createElement("div");
    el.className = "biome-banner";
    el.innerHTML = `<div class="bb-name">${emoji} ${name}</div><div class="bb-trait">${trait}</div><div class="bb-desc">${desc}</div>`;
    this.root.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }

  /** Persistent banner while night is active (biomes sealed off), shown/hidden on the isNight transition. */
  showNightBanner(isNight: boolean) {
    this.nightBannerEl.hidden = !isNight;
    if (isNight) {
      this.nightBannerEl.classList.remove("pop");
      void this.nightBannerEl.offsetWidth; // restart the pop animation
      this.nightBannerEl.classList.add("pop");
    }
    // Full-screen transition: bright flash that sinks into darkness (night) or fades out warm (day).
    const fx = document.createElement("div");
    fx.className = `screen-fx ${isNight ? "to-night" : "to-day"}`;
    this.root.appendChild(fx);
    fx.addEventListener("animationend", () => fx.remove());
  }

  setGems(n: number) {
    const el = this.root.querySelector(".stat.gems .val") as HTMLElement;
    const t = formatShort(n);
    if (el.textContent !== t) el.textContent = t;
  }

  /** ⚡ timer while the x2 Speed boost runs (0 hides it). */
  setBoost(secs: number) {
    const row = this.root.querySelector(".timer.boost") as HTMLElement;
    row.hidden = secs <= 0;
    if (secs > 0) (row.querySelector(".val") as HTMLElement).textContent = `x2 · ${formatDuration(secs)}`;
  }

  /** Red badge on the Index button = unclaimed discovery rewards. */
  setIndexBadge(n: number) {
    this.badge(".big-btn.index", n);
  }

  /** Red badge on the Egg button = eggs to plant + eggs ready to hatch. */
  setEggCount(n: number) {
    this.badge(".sq-btn.egg", n);
  }

  private badge(selector: string, n: number) {
    const btn = this.root.querySelector(selector) as HTMLElement;
    let badge = btn.querySelector(".badge") as HTMLElement | null;
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "badge";
      btn.appendChild(badge);
    }
    if (badge.textContent !== String(n)) badge.textContent = String(n);
    badge.hidden = n <= 0;
  }

  /** Tutorial-style hint banner above the hotbar area; null hides it. */
  setHint(html: string | null) {
    this.hintEl.hidden = !html;
    if (html && this.hintEl.innerHTML !== html) this.hintEl.innerHTML = html;
  }

  /** Full-screen message (disconnected / taken over). */
  showOverlay(title: string, text: string) {
    this.overlayEl.innerHTML = `<div class="panel"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p><button class="big-btn shop">Reload</button></div>`;
    this.overlayEl.hidden = false;
    this.overlayEl.querySelector("button")!.addEventListener("click", () => location.reload());
  }

  setSlowMode(on: boolean) {
    this.slowToggle.classList.toggle("on", on);
  }

  setStatus(text: string) {
    this.statusEl.textContent = text;
  }

  toggleDebug() {
    this.debugEl.hidden = !this.debugEl.hidden;
  }

  toggleHelp() {
    this.helpEl.classList.toggle("faded");
  }

  /** F3 line. `perf`: draw calls, triangles, and CPU ms per frame (game logic + submitting the render). */
  setDebug(fps: number, x: number, y: number, z: number, walkSpeed: number, perf?: { calls: number; tris: number; cpuMs: number }) {
    if (this.debugEl.hidden) return;
    const biome = biomeAt(z);
    const p = perf ? ` · ${perf.calls} draws · ${(perf.tris / 1000).toFixed(0)}k tris · cpu ${perf.cpuMs.toFixed(1)} ms` : "";
    this.debugEl.textContent = `FPS ${fps.toFixed(0)} · pos ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)} · ${biome ? biome.name : "Hub"} · walk ${walkSpeed.toFixed(1)} u/s${p}`;
  }

  setPlayers(rows: PlayerRow[]) {
    this.rows = rows;
    this.renderPlayers();
  }

  private renderPlayers() {
    const dir = this.sortDesc ? -1 : 1;
    const sorted = [...this.rows].sort((a, b) => {
      if (this.sortKey === "name") return dir * a.name.localeCompare(b.name);
      return dir * (a[this.sortKey] - b[this.sortKey]);
    });
    this.listEl.innerHTML = sorted
      .map(
        (r) =>
          `<div class="pl-row${r.isYou ? " you" : ""}"><span>${escapeHtml(r.name)}</span><span>${formatShort(r.moneyPerSec)}</span><span>${formatShort(r.speed)}</span></div>`,
      )
      .join("");
    for (const head of this.root.querySelectorAll<HTMLElement>(".pl-head [data-key]")) {
      head.classList.toggle("sorted", head.dataset.key === this.sortKey);
      head.textContent = (head.dataset.key === this.sortKey ? (this.sortDesc ? "▼ " : "▲ ") : "") + (head.dataset.key === "name" ? "People" : head.dataset.key === "moneyPerSec" ? "Money/s" : "Speed");
    }
  }

  /** Highlights the current settings in the ☰ menu; `quality` is what "Auto" resolved to. */
  setSettings(s: Settings, quality: Quality) {
    for (const b of this.root.querySelectorAll<HTMLElement>(".tb-menu [data-gfx]")) b.classList.toggle("on", b.dataset.gfx === s.graphics);
    for (const b of this.root.querySelectorAll<HTMLElement>(".tb-menu [data-sound]")) b.classList.toggle("on", (b.dataset.sound === "on") === s.sound);
    (this.root.querySelector(".tb-menu .tm-note") as HTMLElement).textContent =
      s.graphics === "auto" ? `Auto is using ${quality === "high" ? "High" : "Low"} on this device.` : quality === "low" ? "Low: no shadows and a shorter view — smoother on slow devices." : "";
  }

  /** Banner + Claim button shown once after joining if there's pending offline income (null hides it). */
  showOfflineClaim(amount: number | null) {
    this.offlineBannerEl.hidden = !amount;
    if (amount) (this.offlineBannerEl.querySelector(".amt") as HTMLElement).textContent = `$${formatShort(amount)}`;
  }

  /**
   * Draws the hotbar (keys 1–9, 0). Normally only filled slots show — it grows as items are added, keeping each
   * item's own key number; while arranging (backpack open) all 10 show, with ✕ buttons and drop targets.
   * `picked` highlights a slot waiting for a second click to swap. Re-renders only when something changed.
   */
  setHotbar(slots: (HotbarSlotView | null)[], selected: number, arranging: boolean, picked: number) {
    const sig = JSON.stringify([slots, selected, arranging, picked]);
    if (sig === this.hotbarSig) return;
    this.hotbarSig = sig;
    this.hotbarEl.classList.toggle("arranging", arranging);
    this.hotbarEl.hidden = !arranging && slots.every((s) => !s);
    this.hotbarEl.innerHTML = slots
      .map((s, i) => {
        if (!s && !arranging) return "";
        const cls = ["hb-slot", s ? "" : "empty", i === selected ? "on" : "", i === picked ? "picked" : ""].filter(Boolean).join(" ");
        const body = s
          ? `<span class="hb-icon" style="${s.color ? `--rc:${s.color}` : ""}">${s.icon}</span><span class="hb-name">${escapeHtml(s.name)}</span>${
              s.qty !== undefined ? `<span class="hb-count">x${s.qty}</span>` : ""
            }<span class="hb-cd" data-kind="${s.kind}"></span>${arranging ? `<button class="hb-clear" data-slot="${i}" title="Back to inventory">✕</button>` : ""}`
          : "";
        return `<div class="${cls}" data-slot="${i}" title="${s ? escapeHtml(s.name) : "Empty"}"><span class="hb-key">${(i + 1) % 10}</span>${body}</div>`;
      })
      .join("");
    this.tickCooldowns();
  }

  /** What Use does right now, shown above the hotbar (null hides it). */
  setAction(text: string | null) {
    const el = this.root.querySelector(".hb-action") as HTMLElement;
    el.hidden = !text;
    if (text && el.textContent !== text) el.textContent = text;
  }

  /** An item went on cooldown: its slots show a shrinking dark overlay with the seconds left. */
  startCooldown(kind: string, sec: number) {
    this.cooldowns[kind] = { end: performance.now() + sec * 1000, sec };
    this.tickCooldowns();
  }

  /** Call every frame. */
  tickCooldowns() {
    const now = performance.now();
    for (const el of this.hotbarEl.querySelectorAll<HTMLElement>(".hb-cd")) {
      const cd = this.cooldowns[el.dataset.kind ?? ""];
      const left = cd ? (cd.end - now) / 1000 : 0;
      el.hidden = left <= 0;
      if (left > 0) {
        el.style.height = `${(left / cd!.sec) * 100}%`;
        el.textContent = left.toFixed(1);
      }
    }
  }

  /** Seconds left on an item's cooldown (0 = ready). */
  cooldownLeft(kind: string) {
    const cd = this.cooldowns[kind];
    return cd ? Math.max(0, (cd.end - performance.now()) / 1000) : 0;
  }
}

export interface HotbarSlotView {
  kind: string;
  icon: string;
  name: string;
  /** Stack size, for stackable items (bear traps). */
  qty?: number;
  /** Rarity color for eggs and pets. */
  color?: string;
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
