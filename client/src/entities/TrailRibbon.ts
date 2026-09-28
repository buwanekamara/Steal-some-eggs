import * as THREE from "three";
import { TRAIL_BY_ID } from "@egg/shared";

const POINTS = 26;
const SPACING = 0.35;

/**
 * A ribbon streaming behind a moving player (reference trails): records recent positions
 * and draws a vertical strip that fades out toward the tail. Rainbow trails cycle colors.
 */
export class TrailRibbon {
  readonly mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private geo = new THREE.BufferGeometry();
  private mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private id = "";
  private color = new THREE.Color();
  private time = 0;

  constructor(scene: THREE.Scene) {
    const pos = new Float32Array(POINTS * 2 * 3);
    const col = new Float32Array(POINTS * 2 * 4);
    this.geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
    const idx: number[] = [];
    for (let i = 0; i < POINTS - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setTrail(id: string) {
    if (id === this.id) return;
    this.id = id;
    this.pts = [];
    const def = TRAIL_BY_ID.get(id);
    this.mesh.visible = !!def;
    if (def) this.color.set(def.color);
  }

  /** Feed the player's feet position every frame. */
  update(dt: number, feet: THREE.Vector3) {
    if (!this.id) return;
    this.time += dt;
    const head = feet.clone().setY(feet.y + 0.15);
    const last = this.pts[0];
    if (!last || last.distanceTo(head) > SPACING) {
      this.pts.unshift(head);
      if (this.pts.length > POINTS) this.pts.pop();
    } else {
      last.copy(head);
    }
    // Standing still: the tail catches up so the ribbon shrinks away.
    if (last && last.distanceTo(head) < 0.01 && this.pts.length > 1) this.pts.pop();

    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const col = this.geo.attributes.color as THREE.BufferAttribute;
    const rainbow = this.id === "rainbow";
    for (let i = 0; i < POINTS; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)] ?? head;
      const t = i / (POINTS - 1);
      const h = 1.1 * (1 - t * 0.6); // tapers toward the tail
      pos.setXYZ(i * 2, p.x, p.y, p.z);
      pos.setXYZ(i * 2 + 1, p.x, p.y + h, p.z);
      const c = rainbow ? new THREE.Color().setHSL((this.time * 0.5 + t) % 1, 1, 0.55) : this.color;
      const a = i < this.pts.length ? (1 - t) * 0.9 : 0;
      col.setXYZW(i * 2, c.r, c.g, c.b, a);
      col.setXYZW(i * 2 + 1, c.r, c.g, c.b, a * 0.2);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
