import * as THREE from "three";
import { EGG_BY_ID, PET_BY_ID } from "@egg/shared";
import { beltTexture, eggShellTexture, propTexture, questionTexture } from "./textures.ts";

/**
 * Blocky stand-in models used when a manifest entry has no file (or it fails to load).
 * Each faces +Z, stands on y = 0, and uses real-world size in units.
 */

const mat = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, map: propTexture(), ...opts });

const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
  const o = new THREE.Mesh(geo, m);
  o.castShadow = o.receiveShadow = true;
  o.position.set(x, y, z);
  return o;
};

/** World units covered by one repeat of the stud texture. */
const STUD_TILE = 2;

/** Scales a box's UVs by its real face sizes so studs stay square instead of stretching over big faces. */
function tileUVs(geo: THREE.BoxGeometry, w: number, h: number, d: number) {
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 vertices each); [u size, v size] per face.
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  faces.forEach(([fu, fv], f) => {
    for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, (uv.getX(i) * fu) / STUD_TILE, (uv.getY(i) * fv) / STUD_TILE);
  });
  uv.needsUpdate = true;
}

/** Extrudes a 2D outline (in the XY plane, points as [x, y]) into a slanted/curved solid centred on z. */
function prism(pts: [number, number][], depth: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const shape = new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px, py)));
  return extrudeShape(shape, depth, material, x, y, z);
}

function extrudeShape(shape: THREE.Shape, depth: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 20 });
  geo.translate(0, 0, -depth / 2);
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / STUD_TILE, uv.getY(i) / STUD_TILE);
  const m = shaded(new THREE.Mesh(geo, material));
  m.position.set(x, y, z);
  return m;
}

function box(w: number, h: number, d: number, color: string | THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  tileUVs(geo, w, h, d);
  const m = new THREE.Mesh(geo, typeof color === "string" ? mat(color) : color);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Marks any mesh (cylinder, torus, …) as shadow-casting, for pieces box() can't build. */
function shaded<T extends THREE.Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A box stretched and rotated to connect two points, e.g. a diagonal brace between posts of different heights. */
function beam(a: THREE.Vector3, b: THREE.Vector3, thickness: number, material: THREE.Material): THREE.Mesh {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(thickness, thickness, len), material);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
  return shaded(m);
}

/** Limb pivot group: the returned group rotates around the joint at its origin. */
function limb(name: string, w: number, h: number, d: number, color: string, x: number, y: number): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, 0);
  g.add(box(w, h, d, color, 0, -h / 2, 0));
  return g;
}

/** 2-unit-tall blocky character with pivot groups named like our rig ("LegL1", "ArmR1", …). */
function player(): THREE.Object3D {
  const root = new THREE.Group();
  const shirt = "#1f7a68";
  const pants = "#153f3a";
  const skin = "#e9a56b";
  root.add(limb("LegL1", 0.45, 0.8, 0.45, pants, 0.24, 0.8));
  root.add(limb("LegR1", 0.45, 0.8, 0.45, pants, -0.24, 0.8));
  root.add(box(0.95, 0.75, 0.48, shirt, 0, 1.18, 0));
  root.add(limb("ArmL1", 0.36, 0.75, 0.4, shirt, 0.66, 1.52));
  root.add(limb("ArmR1", 0.36, 0.75, 0.4, shirt, -0.66, 1.52));
  const head = box(0.5, 0.5, 0.5, skin, 0, 1.8, 0);
  head.name = "Neck1";
  root.add(head);
  // Face: two eyes so the facing direction (+Z) is obvious.
  const eye = new THREE.MeshBasicMaterial({ color: "#1b1b1b" });
  root.add(box(0.08, 0.1, 0.02, eye, 0.12, 1.84, 0.26), box(0.08, 0.1, 0.02, eye, -0.12, 1.84, 0.26));
  return root;
}

/** Visual tiers a treadmill can be upgraded to (Phase 5 will pick the tier from the player's level). */
export type TreadmillTier = 1 | 2 | 3 | 4;

const TREADMILL_TIERS: Record<TreadmillTier, { frame: string; accent: string; belt: string; glow: string; loop: boolean }> = {
  1: { frame: "#2f6fd6", accent: "#4f95f0", belt: "#2a2d36", glow: "#5fe8ff", loop: false },
  2: { frame: "#c9cdd6", accent: "#3ad16a", belt: "#1d2229", glow: "#7dffa8", loop: false },
  3: { frame: "#f4f7fb", accent: "#2f9bff", belt: "#182430", glow: "#7fd4ff", loop: false },
  4: { frame: "#f2b632", accent: "#ffdf80", belt: "#15181f", glow: "#39e6ff", loop: true },
};

function treadmill(tier: TreadmillTier = 1): THREE.Object3D {
  const p = TREADMILL_TIERS[tier];
  const g = new THREE.Group();
  const frameMat = mat(p.frame, { roughness: 0.35, metalness: 0.4 });
  const accentMat = mat(p.accent, { roughness: 0.3, metalness: 0.15, emissive: p.accent, emissiveIntensity: 0.12 });

  // Low base with two side beams, so the belt sits recessed between them.
  g.add(box(2.5, 0.3, 5.2, frameMat, 0, 0.15, 0));
  for (const side of [-1, 1]) g.add(box(0.3, 0.45, 5.2, frameMat, side * 1.1, 0.325, 0));
  g.add(box(2.5, 0.45, 0.4, frameMat, 0, 0.325, -2.4));
  g.add(box(2.5, 0.45, 0.4, frameMat, 0, 0.325, 2.4));

  const belt = shaded(
    new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 4.7),
      new THREE.MeshStandardMaterial({ color: p.belt, roughness: 0.7, emissive: p.glow, emissiveMap: beltTexture(), emissiveIntensity: 1.3 }),
    ),
  );
  belt.rotation.x = -Math.PI / 2;
  belt.position.set(0, 0.55, 0);
  g.add(belt);

  // Each side: a slanted upright at the front and two handrails running back from it.
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  for (const side of [-1, 1]) {
    const x = side * 1.1;
    g.add(beam(V(x, 0.5, 1.7), V(x, 2.1, 2.25), 0.24, frameMat));
    g.add(beam(V(x, 2.05, 2.25), V(x, 2.05, -0.4), 0.17, accentMat));
    g.add(beam(V(x, 1.35, 1.95), V(x, 1.35, 0.4), 0.17, accentMat));
    g.add(beam(V(x, 2.05, -0.4), V(x, 1.35, 0.4), 0.14, accentMat));
  }

  if (p.loop) {
    // Tier 4: a tall looping arch of rail over the deck, like the reference gold treadmill.
    const arch = shaded(new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.17, 10, 36, Math.PI * 1.6), accentMat));
    arch.rotation.set(0, Math.PI / 2, Math.PI * 0.52);
    arch.position.set(0, 1.55, -1.45);
    g.add(arch);
    const support = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.9, 8), frameMat));
    support.position.set(0, 1.2, 0.3);
    g.add(support);
  }
  return g;
}

/** Market stall: posts (shorter at the back for a lean-to roof), a striped awning, a trimmed counter. */
function stall(awningA: string, awningB: string, counter: string, roof: string): THREE.Object3D {
  const g = new THREE.Group();
  const postMat = mat("#4a4a55", { roughness: 0.6, metalness: 0.15, map: null });
  const FRONT_POST_H = 3.4;
  const BACK_POST_H = 3.02; // reaches the underside of the sloping awning
  for (const x of [-2.4, 2.4]) {
    g.add(box(0.25, FRONT_POST_H, 0.25, postMat, x, FRONT_POST_H / 2, 1.4));
    g.add(box(0.25, BACK_POST_H, 0.25, postMat, x, BACK_POST_H / 2, -1.4));
  }
  // Diagonal brace along the left side so it doesn't read as floating posts.
  const braceMat = mat("#3a3a44", { roughness: 0.7, map: null });
  g.add(beam(new THREE.Vector3(-2.4, FRONT_POST_H * 0.82, 1.4), new THREE.Vector3(-2.4, BACK_POST_H * 0.82, -1.4), 0.16, braceMat));

  g.add(box(5, 1.1, 1, mat(counter, { roughness: 0.75 }), 0, 0.55, 1.2));
  g.add(box(5.16, 0.14, 1.16, mat("#2c2c33", { roughness: 0.5 }), 0, 1.13, 1.2));

  for (let i = 0; i < 6; i++) {
    const s = box(0.86, 0.2, 3.6, i % 2 ? awningA : awningB, -2.15 + i * 0.86, 3.3, 0);
    s.rotation.x = -0.14;
    g.add(s);
  }
  // Back trim sits on the awning's rear edge (it slopes down toward the back).
  const trim = box(5.3, 0.22, 0.5, mat(roof, { roughness: 0.4 }), 0, 3.1, -1.7);
  trim.rotation.x = -0.14;
  g.add(trim);
  return g;
}

/** SELL stall: four slim posts, a red/white striped canopy, and a counter with a plank top over two open slats. */
function sellStall(): THREE.Object3D {
  const g = new THREE.Group();
  // No stud map on the long thin parts: the box UVs would stretch it into streaks.
  const post = mat("#6f6a7a", { roughness: 0.6, metalness: 0.1, map: null });
  const slat = mat("#645e70", { roughness: 0.65, map: null });
  const HALF_W = 2.4;
  const FRONT_H = 3.4;
  const BACK_H = 3.25; // meets the canopy frame, which slopes down toward the back
  for (const x of [-HALF_W, HALF_W]) {
    g.add(box(0.26, FRONT_H, 0.26, post, x, FRONT_H / 2, 1.3));
    g.add(box(0.26, BACK_H, 0.26, post, x, BACK_H / 2, -1.3));
  }
  // Counter: overhanging plank top, then two slats resting against the front posts (no gaps).
  g.add(box(5.2, 0.14, 1.1, mat("#7d8298", { roughness: 0.6 }), 0, 1.2, 1.3));
  for (const [y, h, tilt] of [[1.0, 0.3, 0.012], [0.52, 0.34, -0.015]] as const) {
    const s = box(4.7, h, 0.12, slat, 0, y, 1.42);
    s.rotation.z = tilt;
    g.add(s);
  }
  // Side rails tie the counter to the back posts.
  for (const x of [-HALF_W, HALF_W]) g.add(box(0.12, 0.3, 2.6, slat, x, 1.0, 0));
  // Striped canopy, sloping down toward the back, with a thin frame underneath.
  const stripes = 8;
  const w = 5.5 / stripes;
  for (let i = 0; i < stripes; i++) {
    const s = box(w, 0.16, 3.7, i % 2 ? "#ffffff" : "#e53935", -2.75 + w / 2 + i * w, 3.42, 0);
    s.rotation.x = -0.1;
    g.add(s);
  }
  const frame = box(5.5, 0.1, 3.7, post, 0, 3.3, 0);
  frame.rotation.x = -0.1;
  g.add(frame);
  return g;
}

/** Free Chest: a big red treasure chest with gold trim, an arched lid, spikes, a green gem and a keyhole plate. */
function chest(): THREE.Object3D {
  const g = new THREE.Group();
  const red = mat("#d32a1c", { roughness: 0.4, map: null });
  const gold = mat("#ffc928", { roughness: 0.35, metalness: 0.3, emissive: "#ffb300", emissiveIntensity: 0.18 });
  const orange = mat("#f0a020", { roughness: 0.5 });
  const gem = new THREE.MeshStandardMaterial({ color: "#2fe07a", emissive: "#1fd060", emissiveIntensity: 0.8, roughness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: "#0d0d10", roughness: 0.8 });
  const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);

  // Two-step orange plinth.
  g.add(box(5, 0.3, 3.8, orange, 0, 0.15, 0));
  g.add(box(4.6, 0.25, 3.4, gold, 0, 0.42, 0));

  // Body: red panels leaning out toward the top, with gold corner posts and a gold rim.
  g.add(prism([[-2, 0], [2, 0], [2.1, 1.5], [-2.1, 1.5]], 2.8, red, 0, 0.55, 0));
  for (const x of [-2.05, 2.05]) for (const z of [-1.4, 1.4]) g.add(box(0.4, 1.6, 0.4, gold, x, 1.35, z));
  g.add(box(0.4, 1.5, 0.15, gold, -0.85, 1.3, 1.45));
  g.add(box(0.4, 1.5, 0.15, gold, 0.85, 1.3, 1.45));
  g.add(box(4.5, 0.32, 3.3, gold, 0, 2.15, 0));

  // Arched lid: side profile extruded across the width, with three gold bands over it.
  const profile = (grow: number): [number, number][] => [
    [-1.65 - grow, 0], [1.65 + grow, 0], [1.3 + grow, 0.65 + grow], [0.6, 1.05 + grow], [-0.6, 1.05 + grow], [-1.3 - grow, 0.65 + grow],
  ];
  const lid = prism(profile(0), 4.2, red, 0, 2.3, 0);
  lid.rotation.y = Math.PI / 2;
  g.add(lid);
  for (const x of [-1.9, 0, 1.9]) {
    const band = prism(profile(0.08), 0.42, gold, x, 2.3, 0);
    band.rotation.y = Math.PI / 2;
    g.add(band);
  }

  // Green gem in a gold setting on the centre band, and the keyhole plate on the front.
  const gemRing = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.16, 8), gold, 0, 3.05, 0.98);
  gemRing.rotation.x = Math.PI / 2 - 0.6;
  g.add(gemRing);
  const gemStone = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.2, 8), gem, 0, 3.08, 1.03);
  gemStone.rotation.x = Math.PI / 2 - 0.6;
  g.add(gemStone);
  g.add(box(1.1, 1.0, 0.18, gold, 0, 1.75, 1.5));
  const hole = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 12), dark, 0, 1.9, 1.6);
  hole.rotation.x = Math.PI / 2;
  g.add(hole);
  g.add(box(0.12, 0.34, 0.06, dark, 0, 1.6, 1.6));

  // Gold spikes on the lid corners and body sides.
  const spike = (x: number, y: number, z: number, rx: number, rz: number) => {
    const m = mesh(new THREE.ConeGeometry(0.14, 0.42, 8), gold, x, y, z);
    m.rotation.set(rx, 0, rz);
    g.add(m);
  };
  for (const x of [-2.1, 2.1]) {
    spike(x, 2.95, 1.0, 0.5, x > 0 ? -0.25 : 0.25);
    spike(x, 2.95, -1.0, -0.5, x > 0 ? -0.25 : 0.25);
    spike(x * 1.05, 1.2, 0.55, 0, x > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  return g;
}

function fuseMachine(): THREE.Object3D {
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.position.x = -1.6; // puts the gate's centre near the stand-here pad
  root.add(g);
  const blue = mat("#2b45c0", { roughness: 0.4, metalness: 0.15 });
  const deepBlue = mat("#1f3196", { roughness: 0.45 });
  const wedge = mat("#6b7290", { roughness: 0.55 });
  const stone = mat("#5a6072", { roughness: 0.6 });
  const slate = mat("#2c3350", { roughness: 0.45, metalness: 0.3, map: null });
  const console_ = mat("#3a3f52", { roughness: 0.5, metalness: 0.25 });
  const cyan = new THREE.MeshStandardMaterial({ color: "#d8f8ff", emissive: "#39d8ff", emissiveIntensity: 1.8, roughness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: "#ff6a6a", emissive: "#ff2a2a", emissiveIntensity: 1.5, roughness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#e6f8ff", emissiveIntensity: 1.5, roughness: 0.3 });
  const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);

  // Stepped stone base with a wide step in front of the gate.
  g.add(box(9.6, 0.3, 5.4, stone, 0, 0.15, -0.6)); // extends back under the rear block
  g.add(box(5.4, 0.2, 0.7, stone, 2.2, 0.1, 2.45));

  // Machine body behind the control station.
  g.add(box(4.2, 2.8, 1.8, deepBlue, -2.7, 1.7, -0.6));

  // Solid rear block behind the gate, carrying the dome (no see-through gap under it).
  g.add(box(5.9, 4.7, 2.2, blue, 2.2, 2.65, -1.7));

  // Gate: two pillars and a lintel with a sloped grey cap, around a glowing "?" doorway.
  for (const x of [-0.25, 4.65]) g.add(box(1.0, 4.1, 1.5, blue, x, 2.35, 0));
  g.add(box(5.9, 1.0, 1.6, blue, 2.2, 4.15, 0));
  g.add(prism([[-3.1, 0], [3.1, 0], [2.3, 0.65], [-2.3, 0.65]], 1.7, wedge, 2.2, 4.65, 0));
  g.add(box(3.9, 3.7, 0.15, new THREE.MeshStandardMaterial({ map: questionTexture(), emissive: "#9fe8ff", emissiveIntensity: 1.3, roughness: 0.3 }), 2.2, 2.15, 0.35));

  // Dark dome behind the gate: stacked drum, cap, and a glowing cyan screen.
  g.add(mesh(new THREE.CylinderGeometry(2.0, 2.2, 1.4, 28), slate, 2.2, 5.7, -0.7));
  g.add(mesh(new THREE.CylinderGeometry(1.5, 1.9, 0.6, 28), slate, 2.2, 6.7, -0.7));
  g.add(mesh(new THREE.SphereGeometry(1.5, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), slate, 2.2, 7.0, -0.7));
  const screen = box(1.7, 0.85, 0.1, cyan, 2.2, 5.9, 1.25);
  screen.rotation.x = -0.12;
  g.add(screen);

  // Curved dark pipe arching from the dome down to the machine body.
  // Both ends sink into the body top and the dome's side so nothing floats.
  const pipeCurve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(-2.4, 2.7, -0.7),
    new THREE.Vector3(-2.4, 6.0, -0.7),
    new THREE.Vector3(-1.4, 6.0, -0.7),
    new THREE.Vector3(0.4, 5.6, -0.7),
  );
  g.add(mesh(new THREE.TubeGeometry(pipeCurve, 32, 0.32, 10), slate, 0, 0, 0));

  // Control station: console with a star screen, joystick, red button box and heart lights.
  g.add(box(2.2, 1.4, 1.4, console_, -3.6, 1.0, 0.7));
  // The star panel stands on the console (console top is y 1.7).
  const panel = box(1.5, 1.5, 0.25, mat("#1a2038", { roughness: 0.5 }), -3.7, 2.45, 0.5);
  panel.rotation.y = 0.3;
  g.add(panel);
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.14 : 0.34;
    const ang = Math.PI / 2 + (i * Math.PI) / 5;
    const px = Math.cos(ang) * r;
    const py = Math.sin(ang) * r;
    if (i) star.lineTo(px, py);
    else star.moveTo(px, py);
  }
  star.closePath();
  const bigStar = extrudeShape(star, 0.1, white, -3.7, 2.6, 0.7);
  bigStar.rotation.y = 0.3;
  g.add(bigStar);
  g.add(box(1.7, 0.28, 0.12, cyan, -2.6, 2.45, 0.5));
  g.add(box(0.8, 0.5, 0.8, console_, -4.1, 1.95, 1.0));
  const stick = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), slate, -4.1, 2.5, 1.0);
  stick.rotation.z = 0.25;
  g.add(stick);
  g.add(mesh(new THREE.SphereGeometry(0.2, 12, 10), red, -4.0 - 0.3, 3.0, 1.0));
  g.add(box(1.4, 0.7, 1.0, console_, -2.5, 0.65, 1.4));
  g.add(box(0.7, 0.1, 0.4, red, -2.5, 1.05, 1.45));
  g.add(box(0.8, 1.6, 0.4, console_, -1.7, 2.3, 0.5));
  for (const y of [1.95, 2.55]) g.add(box(0.4, 0.4, 0.1, red, -1.7, y, 0.72));
  for (const x of [-4.6, -4.2]) g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 8), slate, x, 4.1, -0.2));
  return root;
}

function leaderboard(): THREE.Object3D {
  const g = new THREE.Group();
  const blue = mat("#1e9be8", { roughness: 0.45 });
  const deep = mat("#1479cc", { roughness: 0.45 });
  const light = mat("#a6def7", { roughness: 0.5 });
  const face = mat("#c4ecfc", { roughness: 0.5 });

  // Plinth with sloped sides, and a rounded dome-shaped stem that holds the board up.
  g.add(prism([[-4, 0], [4, 0], [3.5, 0.6], [-3.5, 0.6]], 2.2, light));
  const dome = new THREE.Shape();
  dome.moveTo(-1.9, 0);
  dome.absarc(0, 0, 1.9, Math.PI, 0, true);
  g.add(extrudeShape(dome, 0.9, deep, 0, 0.6, 0));

  // Board: blue frame, side pillars that flare out at the foot, black screen set slightly in.
  g.add(box(6.8, 7.6, 0.8, blue, 0, 5.0, 0));
  for (const side of [-1, 1]) {
    g.add(prism([[side * 2.75, 0], [side * 3.75, 0], [side * 3.5, 7.4], [side * 2.75, 7.4]].map(([px, py]) => [px, py] as [number, number]), 1.0, light, 0, 1.3, 0));
  }
  g.add(box(6.8, 0.6, 1.0, light, 0, 1.6, 0));
  g.add(box(5.2, 6.4, 0.1, new THREE.MeshStandardMaterial({ color: "#0b0d12", roughness: 0.6 }), 0, 4.9, 0.42));

  // Header: a trapezoid cap that widens toward the top edge's corners, pale title plate, raised sloped crest.
  g.add(prism([[-4, 0], [4, 0], [3.5, 1.5], [-3.5, 1.5]], 1.1, blue, 0, 8.6, 0));
  g.add(prism([[-3.4, 0.2], [3.4, 0.2], [3.1, 1.25], [-3.1, 1.25]], 0.12, face, 0, 8.6, 0.58));
  g.add(prism([[-2.6, 0], [2.6, 0], [1.9, 0.7], [-1.9, 0.7]], 0.9, deep, 0, 10.1, 0));
  return g;
}

/** Held bat: grip near the origin, barrel extending up — swap for a rigged model later. */
function bat(): THREE.Object3D {
  const g = new THREE.Group();
  const wood = mat("#c9944f", { roughness: 0.55 });
  const grip = mat("#3a2a1a", { roughness: 0.75 });
  const barrel = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.045, 0.72, 10), wood));
  barrel.position.y = 0.42;
  g.add(barrel);
  const handle = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.2, 8), grip));
  handle.position.y = 0.02;
  g.add(handle);
  return g;
}

/** A small steel-jaw trap, sat flat on the ground. */
function trap(): THREE.Object3D {
  const g = new THREE.Group();
  const metal = mat("#5c6570", { roughness: 0.35, metalness: 0.6 });
  const tooth = mat("#aab2bc", { roughness: 0.3, metalness: 0.5 });
  const base = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 16), metal));
  base.position.y = 0.035;
  g.add(base);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const t = box(0.05, 0.16, 0.05, tooth, Math.cos(a) * 0.4, 0.14, Math.sin(a) * 0.4);
    t.rotation.y = -a;
    g.add(t);
  }
  return g;
}

/** Potion pickup: a round glass flask of glowing purple liquid with a cork and a rope. World.update bobs and pulses it. */
function potion(): THREE.Object3D {
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.rotation.z = -0.3;
  g.position.y = 1.6;
  root.add(g);
  const glass = new THREE.MeshStandardMaterial({ color: "#e4d0ff", roughness: 0.08, transparent: true, opacity: 0.32, depthWrite: false });
  const liquid = new THREE.MeshStandardMaterial({ color: "#8a2be2", emissive: "#a63cff", emissiveIntensity: 0.9, roughness: 0.3 });
  const foam = new THREE.MeshStandardMaterial({ color: "#f3e8ff", emissive: "#ffffff", emissiveIntensity: 0.7, roughness: 0.4 });
  const cork = new THREE.MeshStandardMaterial({ color: "#b5793a", roughness: 0.9 });
  const rope = new THREE.MeshStandardMaterial({ color: "#8a6a45", roughness: 0.95 });
  const halo = new THREE.MeshBasicMaterial({ color: "#b04dff", transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
  // The world pulses anything flagged here while the potion is on the ground.
  liquid.userData.pulse = { base: 0.9, amp: 0.5 };
  foam.userData.pulse = { base: 0.7, amp: 0.4 };
  halo.userData.haloPulse = { base: 0.25, amp: 0.12 };

  const R = 1.0;
  g.add(mesh(new THREE.SphereGeometry(R, 32, 20), glass, 0, 0, 0));
  // Liquid fills the lower part of the flask; a pale foam disc caps it at the surface.
  const level = 0.35;
  g.add(mesh(new THREE.SphereGeometry(R * 0.9, 32, 20, 0, Math.PI * 2, Math.PI * level, Math.PI * (1 - level)), liquid, 0, 0, 0));
  const surfaceY = Math.cos(Math.PI * level) * R * 0.9;
  const cap = mesh(new THREE.CircleGeometry(Math.sin(Math.PI * level) * R * 0.9, 28), foam, 0, surfaceY, 0);
  cap.rotation.x = -Math.PI / 2;
  g.add(cap);
  for (const [x, y, z, r] of [[-0.3, -0.2, 0.5, 0.07], [0.35, -0.4, 0.4, 0.05], [0.0, -0.6, 0.6, 0.06], [-0.5, -0.5, 0.2, 0.05], [0.5, -0.1, 0.3, 0.04]] as const)
    g.add(mesh(new THREE.SphereGeometry(r, 8, 6), foam, x, y, z));

  // Neck, lip, cork and a rope tied around the neck with a loose end hanging down the side.
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.8, 16), glass, 0, R + 0.25, 0));
  const lip = mesh(new THREE.TorusGeometry(0.34, 0.07, 8, 20), glass, 0, R + 0.62, 0);
  lip.rotation.x = Math.PI / 2;
  g.add(lip);
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.4, 14), cork, 0, R + 0.85, 0));
  const tie = mesh(new THREE.TorusGeometry(0.34, 0.06, 8, 20), rope, 0, R + 0.2, 0);
  tie.rotation.x = Math.PI / 2;
  g.add(tie);
  const tail = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.3, R + 0.2, 0.15),
    new THREE.Vector3(0.75, R - 0.2, 0.35),
    new THREE.Vector3(0.95, 0.1, 0.35),
    new THREE.Vector3(0.9, -0.5, 0.2),
  ]);
  g.add(mesh(new THREE.TubeGeometry(tail, 20, 0.05, 6), rope, 0, 0, 0));

  g.add(mesh(new THREE.SphereGeometry(R * 1.45, 24, 16), halo, 0, 0, 0));
  return root;
}

function unknown(): THREE.Object3D {
  const g = new THREE.Group();
  g.add(box(1.5, 1.5, 1.5, "#ff2bd6", 0, 0.75, 0));
  return g;
}

function trailsShop(): THREE.Object3D {
  const g = stall("#ffd21f", "#ffffff", "#8a5a33", "#d9a80f");
  const c = chest();
  c.scale.setScalar(0.32);
  c.position.set(0, 1.2, 1.2);
  g.add(c);
  return g;
}

/**
 * Forest guardian: a huge blocky hen (~5 units tall). Legs and wings are named like the player
 * rig ("LegL1", "ArmL1") so the procedural walk animation drives them.
 */
function hen(): THREE.Object3D {
  const g = new THREE.Group();
  const white = mat("#f4f1ea", { roughness: 0.85 });
  const orange = mat("#f39c12", { roughness: 0.6 });
  const red = mat("#e0344a", { roughness: 0.6 });
  const legGroup = (name: string, x: number) => {
    const leg = new THREE.Group();
    leg.name = name;
    leg.position.set(x, 1.9, 0);
    leg.add(box(0.35, 1.9, 0.35, orange, 0, -0.95, 0));
    leg.add(box(0.9, 0.18, 1.1, orange, 0, -1.8, 0.25));
    return leg;
  };
  g.add(legGroup("LegL1", 0.75), legGroup("LegR1", -0.75));
  g.add(box(3, 2.6, 3.8, white, 0, 3.2, 0)); // body
  g.add(box(2.2, 1.6, 1.2, white, 0, 3.8, -2.3)); // tail
  g.add(box(1.6, 1.2, 0.6, white, 0, 4.9, -2.7));
  const wing = (name: string, side: number) => {
    const w = new THREE.Group();
    w.name = name;
    w.position.set(side * 1.55, 4.1, 0.2);
    w.add(box(0.3, 1.8, 2.6, mat("#e6e1d6", { roughness: 0.85 }), side * 0.1, -0.8, 0));
    return w;
  };
  g.add(wing("ArmL1", 1), wing("ArmR1", -1));
  const head = new THREE.Group();
  head.name = "Neck1";
  head.position.set(0, 4.6, 1.6);
  head.add(box(1.6, 1.8, 1.5, white, 0, 0.9, 0));
  head.add(box(0.7, 0.45, 0.8, mat("#ffc21f"), 0, 0.9, 1.1)); // beak
  head.add(box(0.35, 0.6, 0.3, red, 0, 0.35, 0.85)); // wattle
  head.add(box(0.3, 0.55, 1.0, red, 0, 2.05, 0)); // comb
  const eye = new THREE.MeshStandardMaterial({ color: "#111111", roughness: 0.3 });
  head.add(box(0.12, 0.3, 0.3, eye, 0.81, 1.25, 0.35), box(0.12, 0.3, 0.3, eye, -0.81, 1.25, 0.35));
  g.add(head);
  return g;
}

/** Smooth egg shape (1 unit tall at size 1) with speckles in the egg's colors. */
function egg(id: string): THREE.Object3D {
  const def = EGG_BY_ID.get(id.replace(/^egg_/, ""));
  const [base, spots] = def?.colors ?? ["#f3ead6", "#8a6a45"];
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16; // 0 = bottom, 1 = top
    const a = t * Math.PI;
    const r = Math.sin(a) * 0.38 * (1 - 0.18 * t); // narrower toward the top
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), (1 - Math.cos(a)) * 0.5));
  }
  const m = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 20),
    new THREE.MeshStandardMaterial({ color: "#ffffff", map: eggShellTexture(base, spots), roughness: 0.55 }),
  );
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** Twig nest ring, top surface at y ≈ 0.35. */
function nest(): THREE.Object3D {
  const g = new THREE.Group();
  const twig = mat("#8a5a33", { roughness: 0.95 });
  const dark = mat("#6b4424", { roughness: 0.95 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.24, 8, 18), twig);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.22;
  ring.scale.set(1, 1, 0.8);
  g.add(ring);
  g.add(shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.6, 0.2, 14), dark)));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = box(0.9, 0.08, 0.08, i % 2 ? dark : twig, Math.cos(a) * 0.8, 0.3 + (i % 3) * 0.05, Math.sin(a) * 0.8);
    t.rotation.y = -a + 0.9;
    g.add(t);
  }
  return g;
}

/**
 * Blocky pet built from its species data: birds, four-legged animals and upright bipeds,
 * with a few species-specific extras (ears, antlers, snout…). Built 2 units tall, then scaled
 * to the species' height. Legs/front legs/wings are named like the player rig so they animate.
 */
function pet(id: string): THREE.Object3D {
  const def = PET_BY_ID.get(id.replace(/^pet_/, ""));
  if (!def) return unknown();
  const [bodyC, accentC] = def.colors;
  const body = mat(bodyC, { roughness: 0.8 });
  const accent = mat(accentC, { roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.3 });
  const g = new THREE.Group();
  const limbAt = (name: string, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const l = new THREE.Group();
    l.name = name;
    l.position.set(x, y, z);
    l.add(box(w, h, d, m, 0, -h / 2, 0));
    g.add(l);
  };
  const eyes = (y: number, z: number, spread: number, size = 0.14) =>
    g.add(box(size, size * 1.4, 0.06, dark, spread, y, z), box(size, size * 1.4, 0.06, dark, -spread, y, z));
  const tag = def.id.replace(/^\w+_/, "");

  if (def.shape === "bird") {
    const owl = tag === "owl";
    limbAt("LegL1", 0.18, 0.5, 0.18, mat("#f39c12"), 0.3, 0.5, 0);
    limbAt("LegR1", 0.18, 0.5, 0.18, mat("#f39c12"), -0.3, 0.5, 0);
    g.add(box(1.2, 1.1, 1.1, body, 0, 1.0, 0)); // body
    g.add(box(owl ? 1.2 : 0.9, owl ? 0.8 : 0.75, owl ? 1.0 : 0.8, body, 0, owl ? 1.85 : 1.75, owl ? 0.05 : 0.2)); // head
    g.add(box(0.8, 0.5, 0.2, accent, 0, 1.0, 0.56)); // belly
    g.add(box(0.28, 0.2, 0.35, mat("#ff9f1c"), 0, owl ? 1.7 : 1.7, owl ? 0.6 : 0.72)); // beak
    if (owl) {
      g.add(box(0.36, 0.36, 0.06, accent, 0.26, 1.95, 0.56), box(0.36, 0.36, 0.06, accent, -0.26, 1.95, 0.56));
      eyes(1.95, 0.6, 0.26, 0.16);
      g.add(box(0.2, 0.35, 0.2, body, 0.45, 2.35, 0), box(0.2, 0.35, 0.2, body, -0.45, 2.35, 0)); // ear tufts
    } else {
      eyes(1.85, 0.61, 0.22);
      g.add(box(0.12, 0.25, 0.3, mat("#ff9f1c"), 0, 2.2, 0.15)); // tuft
    }
    const wing = (name: string, side: number) => {
      const w = new THREE.Group();
      w.name = name;
      w.position.set(side * 0.62, 1.35, 0);
      w.add(box(0.15, 0.75, 0.8, owl ? accent : body, side * 0.05, -0.35, 0));
      g.add(w);
    };
    wing("ArmL1", 1);
    wing("ArmR1", -1);
  } else if (def.shape === "quad") {
    const legH = tag === "stag" ? 1.0 : tag === "fox" ? 0.6 : 0.45;
    const bodyH = tag === "piglet" ? 0.85 : 0.7;
    const len = tag === "stag" ? 1.8 : 1.4;
    const y0 = legH + bodyH / 2;
    for (const [name, x, z] of [
      ["LegL1", 0.35, -len / 2 + 0.2],
      ["LegR1", -0.35, -len / 2 + 0.2],
      ["ArmL1", 0.35, len / 2 - 0.2],
      ["ArmR1", -0.35, len / 2 - 0.2],
    ] as const)
      limbAt(name, 0.24, legH, 0.24, tag === "fox" ? dark : body, x, legH, z);
    g.add(box(0.95, bodyH, len, body, 0, y0, 0));
    const headY = y0 + bodyH * 0.55;
    const headZ = len / 2 + 0.2;
    g.add(box(0.75, 0.7, 0.7, body, 0, headY, headZ));
    eyes(headY + 0.1, headZ + 0.36, 0.2);
    if (tag === "bunny") {
      g.add(box(0.18, 0.75, 0.12, body, 0.18, headY + 0.7, headZ - 0.1), box(0.18, 0.75, 0.12, body, -0.18, headY + 0.7, headZ - 0.1));
      g.add(box(0.1, 0.55, 0.05, accent, 0.18, headY + 0.72, headZ - 0.03), box(0.1, 0.55, 0.05, accent, -0.18, headY + 0.72, headZ - 0.03));
      g.add(box(0.35, 0.35, 0.3, mat("#ffffff"), 0, y0 + 0.1, -len / 2 - 0.12)); // cotton tail
    } else if (tag === "piglet") {
      g.add(box(0.4, 0.28, 0.12, accent, 0, headY - 0.08, headZ + 0.4)); // snout
      g.add(box(0.2, 0.2, 0.08, accent, 0.25, headY + 0.4, headZ), box(0.2, 0.2, 0.08, accent, -0.25, headY + 0.4, headZ));
    } else if (tag === "fox") {
      g.add(box(0.25, 0.35, 0.12, body, 0.24, headY + 0.5, headZ - 0.1), box(0.25, 0.35, 0.12, body, -0.24, headY + 0.5, headZ - 0.1));
      g.add(box(0.3, 0.22, 0.3, accent, 0, headY - 0.15, headZ + 0.45)); // white muzzle
      const tail = box(0.35, 0.35, 0.9, body, 0, y0 + 0.2, -len / 2 - 0.4);
      tail.rotation.x = 0.5;
      g.add(tail, box(0.36, 0.36, 0.3, accent, 0, y0 + 0.43, -len / 2 - 0.82));
    } else if (tag === "stag") {
      const antler = mat("#f4e3c8", { roughness: 0.6 });
      for (const s of [1, -1]) {
        g.add(box(0.1, 0.8, 0.1, antler, s * 0.25, headY + 0.75, headZ - 0.1));
        g.add(box(0.45, 0.1, 0.1, antler, s * 0.45, headY + 1.0, headZ - 0.1));
        g.add(box(0.1, 0.4, 0.1, antler, s * 0.6, headY + 1.25, headZ - 0.1));
      }
      g.add(box(0.5, 0.3, 0.15, accent, 0, y0 + 0.2, len / 2 + 0.05)); // chest patch
    }
  } else {
    // Biped: bear / forest spirit.
    const spirit = tag === "spirit";
    const bodyM = spirit ? mat(bodyC, { emissive: bodyC, emissiveIntensity: 0.45, roughness: 0.4 }) : body;
    limbAt("LegL1", 0.45, 0.6, 0.45, bodyM, 0.3, 0.6, 0);
    limbAt("LegR1", 0.45, 0.6, 0.45, bodyM, -0.3, 0.6, 0);
    g.add(box(1.3, 1.0, 0.9, bodyM, 0, 1.1, 0));
    g.add(box(0.8, 0.6, 0.1, accent, 0, 1.05, 0.46)); // belly
    limbAt("ArmL1", 0.35, 0.8, 0.4, bodyM, 0.82, 1.5, 0);
    limbAt("ArmR1", 0.35, 0.8, 0.4, bodyM, -0.82, 1.5, 0);
    g.add(box(0.95, 0.8, 0.8, bodyM, 0, 1.95, 0.05)); // head
    eyes(2.02, 0.46, 0.22);
    if (spirit) {
      const leaf = mat("#2f9e2f", { emissive: "#3cff7a", emissiveIntensity: 0.3 });
      for (let i = 0; i < 5; i++) {
        const l = box(0.18, 0.45, 0.1, leaf, -0.4 + i * 0.2, 2.5 + (i % 2) * 0.12, 0);
        l.rotation.z = (i - 2) * 0.25;
        g.add(l);
      }
    } else {
      g.add(box(0.28, 0.28, 0.12, body, 0.38, 2.4, 0), box(0.28, 0.28, 0.12, body, -0.38, 2.4, 0)); // ears
      g.add(box(0.4, 0.28, 0.2, accent, 0, 1.82, 0.5)); // muzzle
      g.add(box(0.14, 0.1, 0.06, dark, 0, 1.92, 0.61)); // nose
    }
  }
  // Built ~2 units tall (quad/bird: a bit less); scale to the species' height.
  g.updateMatrixWorld(true);
  const h = new THREE.Box3().setFromObject(g).max.y || 2;
  g.scale.setScalar(def.height / h);
  const wrap = new THREE.Group();
  wrap.add(g);
  return wrap;
}

export const PLACEHOLDERS: Record<string, () => THREE.Object3D> = {
  guardian_forest: hen,
  nest,
  player,
  treadmill: () => treadmill(1),
  treadmillTier1: () => treadmill(1),
  treadmillTier2: () => treadmill(2),
  treadmillTier3: () => treadmill(3),
  treadmillTier4: () => treadmill(4),
  sellStall,
  trailsShop,
  fuseMachine,
  chest,
  potionPickup: potion,
  leaderboard,
  bat,
  trap,
};

export function makePlaceholder(id: string): THREE.Object3D {
  if (id.startsWith("egg_")) return egg(id);
  if (id.startsWith("pet_")) return pet(id);
  return (PLACEHOLDERS[id] ?? unknown)();
}
