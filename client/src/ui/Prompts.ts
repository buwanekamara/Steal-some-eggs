import * as THREE from "three";
import type { Input } from "../game/Input.ts";
import type { HeistHud } from "./HeistHud.ts";

export interface PromptOffer {
  /** Stable id of the thing (egg uid…), so switching targets restarts the hold. */
  key: string;
  title: string;
  titleColor?: string;
  action: string;
  /** World point the prompt floats next to. */
  at: THREE.Vector3;
  /** Distance from the player; the nearest offer wins. */
  dist: number;
  holdSec: number;
  onComplete: () => void;
}

const _v = new THREE.Vector3();

/**
 * One on-screen "hold E" prompt shared by every system (steal eggs, plant, hatch…).
 * Systems call `offer()` each frame; `commit()` shows the nearest one and runs the hold timer.
 */
export class Prompts {
  private offers: PromptOffer[] = [];
  private hold = { key: "", start: 0 };
  private cooldownUntil = 0;

  constructor(
    private hud: HeistHud,
    private input: Input,
    private camera: THREE.Camera,
  ) {}

  offer(o: PromptOffer) {
    this.offers.push(o);
  }

  commit() {
    const best = this.offers.reduce<PromptOffer | null>((a, o) => (!a || o.dist < a.dist ? o : a), null);
    this.offers.length = 0;
    if (!best) {
      this.hold = { key: "", start: 0 };
      return this.hud.setPrompt(null);
    }
    const now = performance.now();
    if (this.hold.key !== best.key) this.hold = { key: best.key, start: 0 };
    // Real time (not the capped frame dt), so a hold takes the same time on slow devices.
    const holding = (this.input.isDown("KeyE") || this.hud.pointerHolding) && now >= this.cooldownUntil;
    if (!holding) this.hold.start = 0;
    else if (!this.hold.start) this.hold.start = now;
    const progress = this.hold.start ? Math.min(1, (now - this.hold.start) / 1000 / Math.max(0.01, best.holdSec)) : 0;
    if (progress >= 1) {
      this.hold.start = 0;
      this.cooldownUntil = now + 700;
      best.onComplete();
    }

    _v.copy(best.at).project(this.camera);
    if (_v.z > 1) return this.hud.setPrompt(null);
    const x = ((_v.x + 1) / 2) * innerWidth + 16;
    const y = ((1 - _v.y) / 2) * innerHeight - 28;
    this.hud.setPrompt({ title: best.title, color: best.titleColor ?? "#ffffff" }, x, y, progress, best.action);
  }
}
