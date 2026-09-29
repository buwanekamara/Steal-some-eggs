import * as THREE from "three";
import { TRAIL_BY_ID } from "@egg/shared";

const POINTS = 26;
const SPACING = 0.35;
/** Full width of the beam near the player. */
const WIDTH = 1.6;
/** Keeps the beam flush with the ground without z-fighting the floor. */
const GROUND_OFFSET = 0.05;

/**
 * A glowing beam painted on the ground behind a moving player (reference trails): records
 * recent feet positions and draws a flat strip — bright core, soft edges — that fades out
 * toward the tail. Rainbow trails cycle colors along its length.
 */
export class TrailRibbon {
  readonly mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  /** Feet position last frame, to detect the player being truly stationary (not just under SPACING this frame). */
  private lastFeet: THREE.Vector3 | null = null;
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
    // 3 columns per sample point (left edge, bright core, right edge) so the beam can
    // fade soft at its sides while staying flat on the ground.
    const pos = new Float32Array(POINTS * 3 * 3);
    const col = new Float32Array(POINTS * 3 * 4);
    this.geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
    const idx: number[] = [];
    for (let i = 0; i < POINTS - 1; i++) {
      const l0 = i * 3, c0 = i * 3 + 1, r0 = i * 3 + 2;
      const l1 = (i + 1) * 3, c1 = (i + 1) * 3 + 1, r1 = (i + 1) * 3 + 2;
      idx.push(l0, l1, c1, l0, c1, c0);
      idx.push(c0, c1, r1, c0, r1, r0);
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
    this.lastFeet = null;
    const def = TRAIL_BY_ID.get(id);
    this.mesh.visible = !!def;
    if (def) this.color.set(def.color);
  }

  /** Feed the player's feet position every frame. */
  update(dt: number, feet: THREE.Vector3) {
    if (!this.id) return;
    this.time += dt;
    const head = feet.clone().setY(feet.y + GROUND_OFFSET);

    // Frame-to-frame movement, independent of the SPACING check below (which tracks
    // cumulative distance since the last sample, not this frame's delta).
    const stationary = !!this.lastFeet && this.lastFeet.distanceTo(head) < 0.005;
    this.lastFeet = head.clone();

    const anchor = this.pts[0];
    if (!anchor || anchor.distanceTo(head) > SPACING) {
      this.pts.unshift(head);
      if (this.pts.length > POINTS) this.pts.pop();
    } else if (stationary && this.pts.length > 1) {
      // Standing still: the tail catches up so the beam shrinks away.
      this.pts.pop();
    }

    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const col = this.geo.attributes.color as THREE.BufferAttribute;
    const rainbow = this.id === "rainbow";
    const up = new THREE.Vector3(0, 1, 0);
    let perp = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < POINTS; i++) {
      // The very front of the beam always tracks the player's feet exactly, even between samples.
      const p = i === 0 ? head : (this.pts[Math.min(i, this.pts.length - 1)] ?? head);
      const prev = this.pts[Math.min(Math.max(i - 1, 0), this.pts.length - 1)] ?? p;
      const next = this.pts[Math.min(i + 1, this.pts.length - 1)] ?? p;
      const tangent = prev.clone().sub(next);
      if (tangent.lengthSq() > 1e-6) perp = tangent.normalize().cross(up).normalize();

      const t = i / (POINTS - 1);
      const w = (WIDTH / 2) * (1 - t * 0.4); // narrows a little toward the tail
      const left = p.clone().addScaledVector(perp, -w);
      const right = p.clone().addScaledVector(perp, w);
      pos.setXYZ(i * 3, left.x, left.y, left.z);
      pos.setXYZ(i * 3 + 1, p.x, p.y, p.z);
      pos.setXYZ(i * 3 + 2, right.x, right.y, right.z);

      const c = rainbow ? new THREE.Color().setHSL((this.time * 0.5 + t) % 1, 1, 0.55) : this.color;
      const a = i < this.pts.length ? (1 - t) * 0.9 : 0;
      col.setXYZW(i * 3, c.r, c.g, c.b, a * 0.12); // soft edge
      col.setXYZW(i * 3 + 1, c.r, c.g, c.b, a); // bright core
      col.setXYZW(i * 3 + 2, c.r, c.g, c.b, a * 0.12); // soft edge
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
