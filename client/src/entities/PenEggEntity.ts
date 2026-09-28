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
    this.model.scale.setScalar(scale);
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
