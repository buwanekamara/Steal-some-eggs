/**
 * Keyboard + touch input. Produces a move vector in camera space
 * (x = right, y = forward, each -1..1) and a jump flag.
 */
export class Input {
  readonly move = { x: 0, y: 0 };
  jump = false;
  readonly isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

  private keys = new Set<string>();
  private stick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private stickBase?: HTMLDivElement;
  private stickKnob?: HTMLDivElement;
  private listeners: Array<(key: string) => void> = [];

  constructor(private ui: HTMLElement) {
    addEventListener("keydown", (e) => {
      if (isTyping(e)) return;
      if (!e.repeat) this.listeners.forEach((l) => l(e.code));
      this.keys.add(e.code);
      if (e.code === "Space" || e.code === "Tab") e.preventDefault();
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    if (this.isTouch) this.buildTouchControls();
  }

  isDown(code: string) {
    return this.keys.has(code);
  }

  /** Called once per key press (not on auto-repeat). */
  onKey(fn: (code: string) => void) {
    this.listeners.push(fn);
  }

  /** Dev/testing: when set, replaces player input with this camera-space move vector. */
  autopilot: { x: number; y: number } | null = null;

  update() {
    if (this.autopilot) {
      this.move.x = this.autopilot.x;
      this.move.y = this.autopilot.y;
      this.jump = false;
      return;
    }
    const k = (c: string) => this.keys.has(c);
    let x = (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0);
    let y = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0);
    if (this.stick.active) {
      x = this.stick.x;
      y = this.stick.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = x;
    this.move.y = y;
    this.jump = k("Space") || this.touchJump;
  }

  // ------------------------------------------------------------------ touch

  private touchJump = false;

  /** True when a touch at this point belongs to the joystick area (left 45% of screen). */
  isStickArea(x: number) {
    return this.isTouch && x < innerWidth * 0.45;
  }

  private buildTouchControls() {
    this.stickBase = el("div", "stick-base");
    this.stickKnob = el("div", "stick-knob");
    this.stickBase.appendChild(this.stickKnob);
    this.stickBase.hidden = true;
    this.ui.appendChild(this.stickBase);

    const jump = el("button", "jump-btn");
    jump.innerHTML = "⬆";
    jump.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.touchJump = true;
    });
    jump.addEventListener("touchend", () => (this.touchJump = false));
    this.ui.appendChild(jump);

    const bat = el("button", "bat-btn");
    bat.innerHTML = "🏏";
    bat.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.listeners.forEach((l) => l("KeyF"));
    });
    this.ui.appendChild(bat);

    const R = 60;
    addEventListener(
      "touchstart",
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (this.stick.active || !this.isStickArea(t.clientX) || (t.target as HTMLElement).closest("button,.panel")) continue;
          Object.assign(this.stick, { active: true, id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 });
          this.stickBase!.hidden = false;
          this.stickBase!.style.transform = `translate(${t.clientX - R}px, ${t.clientY - R}px)`;
          this.stickKnob!.style.transform = "translate(0px, 0px)";
        }
      },
      { passive: true },
    );
    addEventListener(
      "touchmove",
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier !== this.stick.id) continue;
          let dx = t.clientX - this.stick.ox;
          let dy = t.clientY - this.stick.oy;
          const d = Math.hypot(dx, dy);
          if (d > R) {
            dx = (dx / d) * R;
            dy = (dy / d) * R;
          }
          this.stick.x = dx / R;
          this.stick.y = -dy / R;
          this.stickKnob!.style.transform = `translate(${dx}px, ${dy}px)`;
        }
      },
      { passive: true },
    );
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.stick.id) continue;
        Object.assign(this.stick, { active: false, id: -1, x: 0, y: 0 });
        this.stickBase!.hidden = true;
      }
    };
    addEventListener("touchend", end);
    addEventListener("touchcancel", end);
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
}
