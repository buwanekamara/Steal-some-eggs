import * as THREE from "three";
import { TRAIL_BY_ID } from "@egg/shared";

/** Number of squares in the trail. */
const POINTS = 16;
/** Distance between recorded feet positions. */
const SPACING = 0.5;
/** How far behind the feet the first square sits, so the trail starts clear of the player. */
const START_GAP = 0.8;
/** Square size at the player's feet and at the far tail. */
const HEAD_SIZE = 0.95;
const TAIL_SIZE = 0.2;

let squareTex: THREE.CanvasTexture | null = null;
/** A glowing square: soft halo around a bright rim and a lighter core, tinted per trail by the sprite color. */
function squareTexture(): THREE.Texture {
  if (squareTex) return squareTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const halo = g.createRadialGradient(32, 32, 14, 32, 32, 45);
  halo.addColorStop(0, "rgba(255,255,255,0.55)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.fillRect(12, 12, 40, 40);
  g.strokeStyle = "rgba(255,255,255,1)";
  g.lineWidth = 4;
  g.strokeRect(12, 12, 40, 40);
  squareTex = new THREE.CanvasTexture(c);
  squareTex.colorSpace = THREE.SRGBColorSpace;
  return squareTex;
}

/**
 * A trail of translucent squares behind a moving player (reference trails): each square sits where the feet
 * recently were, shrinking and fading toward the tail, and they rise from the ground up toward the player so the
 * line reads as a slanted streak. Rainbow trails cycle colors along the line.
 */
export class TrailRibbon {
  readonly mesh = new THREE.Group();
  private squares: THREE.Sprite[] = [];
  private pts: THREE.Vector3[] = [];
  /** Feet position last frame, to detect the player being truly stationary. */
  private lastFeet: THREE.Vector3 | null = null;
  private id = "";
  private color = new THREE.Color();
  private time = 0;
  /** 0..1, eased: the trail only shows while the player is actually moving. */
  private active = 0;

  constructor(scene: THREE.Scene) {
    const map = squareTexture();
    for (let i = 0; i < POINTS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false;
      this.squares.push(s);
      this.mesh.add(s);
    }
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
    for (const s of this.squares) s.visible = false;
  }

  /** Feed the player's feet position every frame. */
  update(dt: number, feet: THREE.Vector3) {
    if (!this.id) return;
    this.time += dt;
    const head = feet.clone();

    const stationary = !!this.lastFeet && this.lastFeet.distanceTo(head) < 0.005;
    this.lastFeet = head.clone();
    this.active += ((stationary ? 0 : 1) - this.active) * Math.min(1, dt * 8);

    const anchor = this.pts[0];
    if (!anchor || anchor.distanceTo(head) > SPACING) {
      this.pts.unshift(head);
      if (this.pts.length > POINTS + Math.ceil(START_GAP / SPACING) + 1) this.pts.pop();
    } else if (stationary && this.pts.length > 1) {
      this.pts.pop(); // standing still: the tail catches up and the trail shrinks away
    }

    const rainbow = this.id === "rainbow";
    // Walk back along the recorded path (head first) to place square i at START_GAP + i × SPACING behind the feet.
    const path = [head, ...this.pts];
    const along = (dist: number): THREE.Vector3 | null => {
      let left = dist;
      for (let k = 0; k < path.length - 1; k++) {
        const seg = path[k].distanceTo(path[k + 1]);
        if (left <= seg) return path[k].clone().lerp(path[k + 1], seg > 1e-6 ? left / seg : 0);
        left -= seg;
      }
      return null; // the path isn't that long yet
    };
    for (let i = 0; i < POINTS; i++) {
      const sq = this.squares[i];
      const p = along(START_GAP + i * SPACING);
      if (!p) {
        sq.visible = false;
        continue;
      }
      const t = i / (POINTS - 1);
      const size = HEAD_SIZE + (TAIL_SIZE - HEAD_SIZE) * t;
      sq.visible = true;
      sq.scale.setScalar(size * (0.6 + 0.4 * this.active));
      // Sits on the ground at the tail and lifts toward the player's hips at the head.
      sq.position.set(p.x, p.y + size * 0.5 + 0.15 * (1 - t), p.z);
      const c = rainbow ? new THREE.Color().setHSL((this.time * 0.5 + t) % 1, 1, 0.6) : this.color;
      const mat = sq.material as THREE.SpriteMaterial;
      mat.color.copy(c);
      mat.opacity = 0.95 * (1 - t) ** 1.3 * this.active;
    }
  }

  dispose() {
    for (const s of this.squares) (s.material as THREE.SpriteMaterial).dispose();
    this.mesh.removeFromParent();
  }
}
