import { WORLD_EVENTS, biomeAt, formatShort } from "@egg/shared";

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
  onEquip?: (tool: "bat" | "trap" | "egg") => void;

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
        <div class="hotbar panel">
          <div class="hb-slot" data-tool="bat" title="Bat (1) — knocks a nearby carrier's egg loose"><span class="hb-key">1</span><span class="hb-icon">🏏</span></div>
          <div class="hb-slot" data-tool="trap" title="Trap (2) — place it, another player stepping on it drops their egg"><span class="hb-key">2</span><span class="hb-icon">🪤</span><span class="hb-count"></span></div>
          <div class="hb-slot" data-tool="egg" title="Equip an egg from your backpack (🥚), then use it to place it in your pen"><span class="hb-key">3</span><span class="hb-icon egg-icon">🥚</span></div>
        </div>
        <div class="overlay" hidden></div>
        <div class="player-list panel">
          <div class="pl-head">
            <span data-key="name">People</span><span data-key="moneyPerSec">Money/s</span><span data-key="speed">Speed</span>
          </div>
          <div class="pl-rows"></div>
        </div>
        <div class="debug" hidden></div>
        <div class="help panel">
          <b>Controls</b><br/>
          ${isTouch ? "Left thumb: move · Right side drag: camera · ⬆: jump · Tap 1/2/3 to equip bat/trap/egg, 🏏 to use it · Hold 👆 on an egg: steal" : "WASD / arrows: move · Space: jump · Hold E: steal egg · 1/2/3: equip bat/trap/egg · F: use it · Drag mouse: camera · Wheel: zoom"}<br/>
          ${isTouch ? "" : "C: Slow Mode · Tab: pets · F3: debug info · H: hide this help<br/><i>Dev: = ×10 Speed stat · - reset · J: free egg · G: finish growing eggs · M: +$1M · K: +100 💎 · P: 3 Chicks · URL ?profile=name for a 2nd test player</i>"}
        </div>
      </div>`,
    );
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    this.speedEl = q(".stat.speed .val");
    this.moneyEl = q(".stat.money .val");
    this.listEl = q(".pl-rows");
    this.statusEl = q(".hud-status");
    this.debugEl = q(".debug");
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
    for (const slot of this.hotbarEl.querySelectorAll<HTMLElement>(".hb-slot")) {
      slot.addEventListener("click", () => this.onEquip?.(slot.dataset.tool as "bat" | "trap"));
    }
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

  /** Persistent banner while night is active (biomes sealed off), shown/hidden on the isNight transition. */
  showNightBanner(isNight: boolean) {
    this.nightBannerEl.hidden = !isNight;
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

  setDebug(fps: number, x: number, y: number, z: number, walkSpeed: number) {
    if (this.debugEl.hidden) return;
    const biome = biomeAt(z);
    this.debugEl.textContent = `FPS ${fps.toFixed(0)} · pos ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)} · ${biome ? biome.name : "Hub"} · walk ${walkSpeed.toFixed(1)} u/s`;
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

  /** Banner + Claim button shown once after joining if there's pending offline income (null hides it). */
  showOfflineClaim(amount: number | null) {
    this.offlineBannerEl.hidden = !amount;
    if (amount) (this.offlineBannerEl.querySelector(".amt") as HTMLElement).textContent = `$${formatShort(amount)}`;
  }

  /** Highlights the equipped hotbar slot ("" = bare hands). */
  setEquipped(tool: string) {
    for (const slot of this.hotbarEl.querySelectorAll<HTMLElement>(".hb-slot")) slot.classList.toggle("on", slot.dataset.tool === tool);
  }

  /** "x3" stock badge on the trap slot. */
  setTrapCount(n: number) {
    (this.hotbarEl.querySelector('.hb-slot[data-tool="trap"] .hb-count') as HTMLElement).textContent = `x${n}`;
  }
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
