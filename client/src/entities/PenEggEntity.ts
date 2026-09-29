import * as THREE from "three";
import { EGG_BY_ID, GROW_SCALE, RARITY_COLOR, eggModelId, type EggDef } from "@egg/shared";
import type { ModelLibrary } from "../assets/ModelLibrary.ts";
import { TextLabel } from "../ui/labels.ts";

/**
 * An egg growing in a pen, reference style: it physically grows while a countdown runs
 * ("Egg / 1m 3s"), then says "Ready!" and wobbles until someone hatches it.
 */
export class PenEggEntity {
  readonly root = new THREE.Group();
  readonly def: EggDef;
  private model: THREE.Group;
  private label: TextLabel;
  private time = Math.random() * 10;
  /** Seconds left, counted down locally between server updates (once a second). */
  private left = 0;
  private lastLabel = "";
  /** Seconds since being planted while the cartoon stretch-and-squash plays; -1 = not playing. */
  private popT = -1;

  /** Cartoon placement: pops in tiny, stretches tall, squashes flat, wobbles, and settles at normal size. */
  playPlaceAnimation() {
    this.popT = 0;
  }

  constructor(
    lib: ModelLibrary,
    defId: string,
    readonly size: number,
    readonly growSec: number,
  ) {
    this.def = EGG_BY_ID.get(defId)!;
    this.model = lib.instance(eggModelId(this.def));
    this.root.add(this.model);
    this.label = new TextLabel("", { lineHeight: 0.6 });
    this.root.add(this.label);
  }

  setReadyIn(sec: number) {
    this.left = sec;
  }

  get ready() {
    return this.left <= 0;
  }

  /** Current visual height (for placing prompts above it). */
  get height() {
    return this.model.scale.y;
  }

  update(dt: number) {
    this.time += dt;
    this.left = Math.max(0, this.left - dt);
    const progress = this.growSec > 0 ? 1 - this.left / this.growSec : 1;
    const scale = this.size * (1 + (GROW_SCALE - 1) * progress);
    if (this.popT >= 0) {
      // [time, sx, sy] keyframes; x and z squash together, y does the opposite (volume-preserving feel).
      const K = [
        [0, 0.15, 0.15],
        [0.14, 0.72, 1.55],
        [0.28, 1.4, 0.58],
        [0.42, 0.86, 1.18],
        [0.56, 1.1, 0.92],
        [0.7, 0.97, 1.03],
        [0.82, 1, 1],
      ];
      this.popT += dt;
      let sx = 1, sy = 1;
      if (this.popT < K[K.length - 1][0]) {
        let i = 0;
        while (i < K.length - 2 && this.popT > K[i + 1][0]) i++;
        const [t0, x0, y0] = K[i];
        const [t1, x1, y1] = K[i + 1];
        const k = (this.popT - t0) / (t1 - t0);
        const e = k * k * (3 - 2 * k);
        sx = x0 + (x1 - x0) * e;
        sy = y0 + (y1 - y0) * e;
      } else this.popT = -1;
      this.model.scale.set(scale * sx, scale * sy, scale * sx);
    } else this.model.scale.setScalar(scale);
    // Gentle rocking while growing, excited wobble when ready.
    const wobble = this.ready ? Math.sin(this.time * 12) * 0.12 : Math.sin(this.time * 2.5) * 0.03;
    this.model.rotation.z = wobble;
    this.label.position.y = scale + 0.35;

    const text = this.ready ? "Ready!" : formatClock(Math.ceil(this.left));
    if (text !== this.lastLabel) {
      this.lastLabel = text;
      this.label.setLines([
        { text: "Egg", color: RARITY_COLOR[this.def.rarity] === "#ffffff" ? "#ff5ef2" : RARITY_COLOR[this.def.rarity] },
        { text, color: this.ready ? "#5dff3a" : "#ffffff" },
      ]);
    }
  }

  dispose() {
    this.label.dispose();
    this.root.removeFromParent();
  }
}

export function formatClock(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
