import * as THREE from "three";
import { EGG_BY_ID, PET_BY_ID } from "@egg/shared";
import { beltTexture, eggShellTexture, propTexture, questionTexture } from "./textures.ts";

/**
 * Blocky stand-in models used when a manifest entry has no file (or it fails to load).
 * Each faces +Z, stands on y = 0, and uses real-world size in units.
 */

const mat = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, map: propTexture(), ...opts });

function box(w: number, h: number, d: number, color: string | THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === "string" ? mat(color) : color);
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
  1: { frame: "#9196a3", accent: "#e0344a", belt: "#20242c", glow: "#ff4d4d", loop: false },
  2: { frame: "#c9cdd6", accent: "#3ad16a", belt: "#1d2229", glow: "#7dffa8", loop: false },
  3: { frame: "#f4f7fb", accent: "#2f9bff", belt: "#182430", glow: "#7fd4ff", loop: false },
  4: { frame: "#f2b632", accent: "#ffdf80", belt: "#15181f", glow: "#39e6ff", loop: true },
};

function treadmill(tier: TreadmillTier = 1): THREE.Object3D {
  const p = TREADMILL_TIERS[tier];
  const g = new THREE.Group();
  const frameMat = mat(p.frame, { roughness: 0.35, metalness: 0.4 });
  const accentMat = mat(p.accent, { roughness: 0.3, metalness: 0.15, emissive: p.accent, emissiveIntensity: 0.12 });

  // Deck with a slightly raised lip so the belt reads as recessed.
  g.add(box(2.5, 0.42, 5.2, frameMat, 0, 0.21, 0));
  g.add(box(2.62, 0.14, 5.32, mat("#1c1f26", { roughness: 0.5 }), 0, 0.47, 0));

  const belt = shaded(
    new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 4.7),
      new THREE.MeshStandardMaterial({ color: p.belt, roughness: 0.7, emissive: p.glow, emissiveMap: beltTexture(), emissiveIntensity: 1.3 }),
    ),
  );
  belt.rotation.x = -Math.PI / 2;
  belt.position.set(0, 0.55, 0);
  g.add(belt);

  // Rear roller (visible below the belt's far end) and front wheel hub.
  const roller = shaded(
    new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 2.1, 12), mat("#2b2e36", { metalness: 0.5, roughness: 0.4 })),
  );
  roller.rotation.z = Math.PI / 2;
  roller.position.set(0, 0.4, -2.55);
  g.add(roller);

  for (const side of [-1, 1]) {
    g.add(box(0.24, 2.1, 0.24, frameMat, side * 1.15, 1.26, 2.15));
    g.add(box(0.22, 0.22, 3.1, accentMat, side * 1.15, 1.36, 0.6));
  }

  // Console bar with a glowing display, facing the runner.
  g.add(box(2.6, 0.34, 0.55, accentMat, 0, 2.35, 2.15));
  g.add(
    box(0.95, 0.52, 0.1, new THREE.MeshStandardMaterial({ color: "#0e1116", emissive: p.glow, emissiveIntensity: 0.55 }), 0, 2.05, 2.46),
  );

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
  const postMat = mat("#4a4a55", { roughness: 0.6, metalness: 0.15 });
  const FRONT_POST_H = 3.4;
  const BACK_POST_H = 2.9;
  for (const x of [-2.4, 2.4]) {
    g.add(box(0.25, FRONT_POST_H, 0.25, postMat, x, FRONT_POST_H / 2, 1.4));
    g.add(box(0.25, BACK_POST_H, 0.25, postMat, x, BACK_POST_H / 2, -1.4));
  }
  // Diagonal brace along the left side so it doesn't read as floating posts.
  const braceMat = mat("#3a3a44", { roughness: 0.7 });
  g.add(beam(new THREE.Vector3(-2.4, FRONT_POST_H * 0.82, 1.4), new THREE.Vector3(-2.4, BACK_POST_H * 0.82, -1.4), 0.16, braceMat));

  g.add(box(5, 1.1, 1, mat(counter, { roughness: 0.75 }), 0, 0.55, 1.2));
  g.add(box(5.16, 0.14, 1.16, mat("#2c2c33", { roughness: 0.5 }), 0, 1.13, 1.2));

  for (let i = 0; i < 6; i++) {
    const s = box(0.86, 0.2, 3.6, i % 2 ? awningA : awningB, -2.15 + i * 0.86, 3.3, 0);
    s.rotation.x = -0.14;
    g.add(s);
  }
  g.add(box(5.3, 0.22, 0.5, mat(roof, { roughness: 0.4 }), 0, 3.55, -1.55));
  return g;
}

/** Small treasure chest, sat on a stall counter for the trails shop. */
function chest(): THREE.Object3D {
  const g = new THREE.Group();
  g.add(box(1.3, 0.8, 0.9, mat("#8a5a33", { roughness: 0.7 }), 0, 0.4, 0));
  const lid = box(1.36, 0.4, 0.96, mat("#a9713f", { roughness: 0.6 }), 0, 0.98, 0);
  lid.rotation.x = -0.12;
  g.add(lid);
  g.add(box(0.32, 0.28, 0.12, mat("#f2c94c", { metalness: 0.6, roughness: 0.25, emissive: "#f2c94c", emissiveIntensity: 0.15 }), 0, 0.7, 0.46));
  return g;
}

function fuseMachine(): THREE.Object3D {
  const g = new THREE.Group();
  const body = mat("#2f5fd6", { roughness: 0.4, metalness: 0.25 });
  const trim = mat("#3c3f4a", { roughness: 0.55, metalness: 0.3 });
  g.add(box(5, 3.6, 3, body, 0, 1.9, 0));
  g.add(box(5.4, 0.6, 3.4, trim, 0, 0.3, 0));
  g.add(box(5.4, 0.5, 3.4, mat("#22252d", { roughness: 0.5 }), 0, 3.95, 0));
  g.add(box(1.9, 1, 1.9, mat("#22252d", { roughness: 0.5 }), 0, 4.7, -0.3));

  for (const x of [-1.5, 0.1]) {
    const stack = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.1, 10), trim));
    stack.position.set(x, 5.4, -0.5);
    g.add(stack);
  }
  const pipe = shaded(new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 6, 16, Math.PI), trim));
  pipe.rotation.set(0, Math.PI / 2, 0);
  pipe.position.set(-2.15, 3.3, 0);
  g.add(pipe);

  // Mystery-egg screen (front) and an energy meter strip beside it.
  g.add(
    box(
      2.3,
      2.15,
      0.15,
      new THREE.MeshStandardMaterial({ map: questionTexture(), emissive: "#5ec8f0", emissiveIntensity: 0.45, roughness: 0.35 }),
      0.9,
      2.15,
      1.58,
    ),
  );
  g.add(box(0.5, 1.7, 0.15, mat("#e0344a", { emissive: "#ff5a68", emissiveIntensity: 0.6, roughness: 0.4 }), -1.8, 1.55, 1.58));
  for (let i = 0; i < 3; i++) g.add(box(0.3, 0.24, 0.05, "#ffffff", -1.8, 0.95 + i * 0.4, 1.66));
  return g;
}

function leaderboard(): THREE.Object3D {
  const g = new THREE.Group();
  const frame = mat("#2a72c9", { roughness: 0.4, metalness: 0.2 });
  g.add(box(6.4, 8.4, 0.6, frame, 0, 5, 0));
  g.add(box(5.4, 7.2, 0.1, new THREE.MeshStandardMaterial({ color: "#111418" }), 0, 5, 0.32));
  g.add(box(6.8, 0.8, 1.4, frame, 0, 0.4, 0));
  g.add(box(6.8, 0.5, 1, mat("#1f5aa8", { roughness: 0.45 }), 0, 9.35, 0));
  for (const x of [-3.35, 3.35]) g.add(box(0.4, 8.4, 0.4, mat("#1f5aa8", { roughness: 0.45 }), x, 5, 0));
  return g;
}

function unknown(): THREE.Object3D {
  const g = new THREE.Group();
  g.add(box(1.5, 1.5, 1.5, "#ff2bd6", 0, 0.75, 0));
  return g;
}

function trailsShop(): THREE.Object3D {
  const g = stall("#ffd21f", "#ffffff", "#8a5a33", "#d9a80f");
  const c = chest();
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
  sellStall: () => stall("#e53935", "#ffffff", "#6b6f7a", "#b32d26"),
  trailsShop,
  fuseMachine,
  leaderboard,
};

export function makePlaceholder(id: string): THREE.Object3D {
  if (id.startsWith("egg_")) return egg(id);
  if (id.startsWith("pet_")) return pet(id);
  return (PLACEHOLDERS[id] ?? unknown)();
}
