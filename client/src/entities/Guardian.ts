import * as THREE from "three";
import { Anim, GUARDIANS, GuardianMode, NETWORK, guardianModelId } from "@egg/shared";
import type { ModelLibrary } from "../assets/ModelLibrary.ts";
import { lerpAngle } from "../game/LocalPlayer.ts";
import { TextLabel } from "../ui/labels.ts";
import { ProceduralRig } from "./Avatar.ts";

interface Snap {
  t: number;
  x: number;
  z: number;
  ry: number;
}

/** A biome guardian: interpolated server position, walk animation, "ZZ" / "!" over its head. */
export class Guardian {
  readonly root = new THREE.Group();
  /** Where a fetched egg sits (in the beak). */
  readonly carrySlot = new THREE.Group();
  /** -1 until the first update, so the initial mode's label ("Z z") gets drawn. */
  mode: GuardianMode | -1 = -1;
  private body: THREE.Group;
  private rig: ProceduralRig;
  private label: TextLabel;
  private buf: Snap[] = [];
  private last = new THREE.Vector3();
  private time = 0;
  private height = 5.5;

  constructor(lib: ModelLibrary, defId: string) {
    const def = GUARDIANS.find((g) => g.id === defId)!;
    this.body = lib.instance(guardianModelId(def));
    this.root.add(this.body);
    this.rig = new ProceduralRig(this.body.getObjectByName("model")!.children[0]);
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.body, true);
    if (Number.isFinite(box.max.y)) this.height = box.max.y;
    this.carrySlot.position.set(0, this.height * 0.8, this.height * 0.4);
    this.root.add(this.carrySlot);
    this.label = new TextLabel("", { lineHeight: 1.6 });
    this.label.position.y = this.height + 0.6;
    this.root.add(this.label);
  }

  push(x: number, z: number, ry: number, mode: GuardianMode) {
    this.buf.push({ t: performance.now(), x, z, ry });
    if (this.buf.length > 30) this.buf.shift();
    if (mode !== this.mode) {
      this.mode = mode;
      if (mode === GuardianMode.Sleep) this.label.setLines([{ text: "Z z", color: "#39c6ff" }]);
      else if (mode === GuardianMode.Alert) this.label.setLines([{ text: "!", color: "#ff3030", size: 1.6 }]);
      else this.label.setLines("");
    }
  }

  update(dt: number) {
    this.time += dt;
    if (this.buf.length) {
      const renderT = performance.now() - NETWORK.interpolationDelayMs;
      let a = this.buf[0];
      let b = this.buf[this.buf.length - 1];
      for (let i = this.buf.length - 1; i > 0; i--) {
        if (this.buf[i - 1].t <= renderT) {
          a = this.buf[i - 1];
          b = this.buf[i];
          break;
        }
      }
      const k = b.t > a.t ? Math.min(1, Math.max(0, (renderT - a.t) / (b.t - a.t))) : 1;
      this.root.position.set(a.x + (b.x - a.x) * k, 0, a.z + (b.z - a.z) * k);
      this.root.rotation.y = lerpAngle(a.ry, b.ry, k);
    }
    const speed = this.root.position.distanceTo(this.last) / Math.max(dt, 1e-3);
    this.last.copy(this.root.position);

    const asleep = this.mode === GuardianMode.Sleep;
    this.rig.update(dt, speed > 0.5 ? Anim.Run : Anim.Idle, speed);
    // Sleeping: hunkered down and breathing; attacking: a quick peck forward.
    const peck = this.mode === GuardianMode.Attack ? Math.max(0, Math.sin(this.time * 14)) * 0.5 : 0;
    this.body.position.y = asleep ? -0.5 + Math.sin(this.time * 1.5) * 0.06 : 0;
    this.body.rotation.x = asleep ? 0.12 : peck;
    this.label.position.y = this.height + 0.6 + (asleep ? Math.sin(this.time * 2) * 0.3 : 0);
    this.label.visible = asleep || this.mode === GuardianMode.Alert;
  }

  dispose() {
    this.label.dispose();
    this.root.removeFromParent();
  }
}
