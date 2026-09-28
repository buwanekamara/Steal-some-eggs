import * as THREE from "three";
import { EGG_BY_ID, EggStatus, eggModelId, type EggDef } from "@egg/shared";
import type { ModelLibrary } from "../assets/ModelLibrary.ts";

/** An egg in the world: in a nest, lying loose, or attached to whoever carries it. */
export class EggEntity {
  readonly root = new THREE.Group();
  readonly def: EggDef;
  status: EggStatus = EggStatus.InNest;
  /** Target world position when not attached to anyone. */
  readonly target = new THREE.Vector3();
  private model: THREE.Group;
  private time = Math.random() * 10;
  private glow: THREE.Mesh;

  constructor(lib: ModelLibrary, defId: string, readonly size: number) {
    this.def = EGG_BY_ID.get(defId)!;
    this.model = lib.instance(eggModelId(this.def));
    this.model.scale.setScalar(size);
    this.root.add(this.model);
    // Soft ring on the ground under loose eggs so they're easy to spot.
    this.glow = new THREE.Mesh(
      new THREE.RingGeometry(0.5 * size, 0.75 * size, 24),
      new THREE.MeshBasicMaterial({ color: "#fff27a", transparent: true, opacity: 0.7, depthWrite: false }),
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.04;
    this.glow.visible = false;
    this.root.add(this.glow);
  }

  get height() {
    return this.size;
  }

  /** Moves the egg under `parent` (a carry slot) or back into the world. */
  attach(parent: THREE.Object3D) {
    if (this.root.parent === parent) return;
    parent.add(this.root);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
  }

  update(dt: number, attached: boolean) {
    this.time += dt;
    this.glow.visible = this.status === EggStatus.Loose;
    if (attached) {
      // Bob gently on the carrier's back.
      this.model.position.y = Math.sin(this.time * 9) * 0.05;
      this.model.rotation.z = 0;
      return;
    }
    this.root.position.lerp(this.target, Math.min(1, dt * 12));
    // Nest eggs wobble now and then; loose eggs bounce.
    const wobble = this.status === EggStatus.InNest ? Math.sin(this.time * 3) * Math.max(0, Math.sin(this.time * 0.7)) * 0.12 : 0;
    this.model.rotation.z = wobble;
    this.model.position.y = this.status === EggStatus.Loose ? Math.abs(Math.sin(this.time * 4)) * 0.25 : 0;
  }

  dispose() {
    this.root.removeFromParent();
  }
}
