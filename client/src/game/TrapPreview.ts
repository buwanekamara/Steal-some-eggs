import * as THREE from "three";
import { TRAP } from "@egg/shared";
import type { ModelLibrary } from "../assets/ModelLibrary.ts";

/**
 * Ghost bear trap in front of you while a trap is held: green ring = looks placeable, red = not.
 * Only a hint — the server has the final say on the spot (it gets this position with the Use request).
 */
export class TrapPreview {
  readonly at = new THREE.Vector3();
  valid = false;
  private root = new THREE.Group();
  private ringMat = new THREE.MeshBasicMaterial({ color: "#5dff3a", transparent: true, opacity: 0.8, depthWrite: false });

  constructor(lib: ModelLibrary, scene: THREE.Scene) {
    const ghost = lib.instance("trap");
    // Its own see-through materials (instances share the template's).
    ghost.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
        const c = m.clone();
        c.transparent = true;
        c.opacity = 0.5;
        c.depthWrite = false;
        return c;
      })[0];
      mesh.castShadow = false;
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(TRAP.triggerRadius - 0.15, TRAP.triggerRadius, 32), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    this.root.add(ghost, ring);
    this.root.visible = false;
    scene.add(this.root);
  }

  /** `from`/`facing`: the player's feet and facing; `check` says whether a spot looks placeable. */
  update(show: boolean, from: THREE.Vector3, facing: number, check: (x: number, z: number) => boolean) {
    this.root.visible = show;
    if (!show) return;
    this.at.set(from.x + Math.sin(facing) * TRAP.previewDistance, 0, from.z + Math.cos(facing) * TRAP.previewDistance);
    this.valid = check(this.at.x, this.at.z);
    this.ringMat.color.set(this.valid ? "#5dff3a" : "#ff4040");
    this.root.position.copy(this.at);
  }
}
