import * as THREE from "three";
import { box, mat } from "./placeholders.ts";

// One blocky guardian per biome. All face +Z, stand on y = 0, and name their joints like our rig
// (LegL1/LegR1/ArmL1/ArmR1/Neck1) so the procedural walk animation works on them.

type Part = [number, number, number, string | THREE.Material, number, number, number]; // w h d color x y z

/** Joint group at (x, y, z) holding boxes (part positions are relative to the joint). */
function joint(name: string, x: number, y: number, z: number, parts: Part[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  for (const [w, h, d, c, px, py, pz] of parts) g.add(box(w, h, d, c, px, py, pz));
  return g;
}
const glow = (color: string, k = 0.9) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
const dark = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
const eyes = (g: THREE.Group, y: number, z: number, spread: number, size: number, m: THREE.Material = dark("#111111")) =>
  g.add(box(size, size * 1.3, size, m, spread, y, z), box(size, size * 1.3, size, m, -spread, y, z));

/** Lake: Mother Swan, a huge white swan with a long S-neck. */
export function swan(): THREE.Object3D {
  const g = new THREE.Group();
  const white = mat("#fbfbff", { roughness: 0.8 });
  const orange = mat("#ff9a1f");
  const black = dark("#161616");
  g.add(joint("LegL1", 0.8, 1.6, 0, [[0.3, 1.6, 0.3, orange, 0, -0.8, 0], [0.9, 0.16, 1.1, orange, 0, -1.55, 0.3]]));
  g.add(joint("LegR1", -0.8, 1.6, 0, [[0.3, 1.6, 0.3, orange, 0, -0.8, 0], [0.9, 0.16, 1.1, orange, 0, -1.55, 0.3]]));
  g.add(box(3, 2.2, 4.4, white, 0, 2.7, 0), box(2.2, 1.2, 1.4, white, 0, 3.0, -2.6), box(1.4, 0.9, 1.2, white, 0, 3.3, -3.4));
  g.add(joint("ArmL1", 1.6, 3.6, 0, [[0.3, 1.6, 3.4, white, 0.15, -0.6, 0], [0.3, 1.0, 2.2, "#e9eaf5", 0.15, -1.7, -0.3]]));
  g.add(joint("ArmR1", -1.6, 3.6, 0, [[0.3, 1.6, 3.4, white, -0.15, -0.6, 0], [0.3, 1.0, 2.2, "#e9eaf5", -0.15, -1.7, -0.3]]));
  g.add(box(0.8, 1.6, 0.8, white, 0, 4.3, 1.9), box(0.8, 1.4, 0.8, white, 0, 5.6, 1.5), box(0.8, 1.0, 0.8, white, 0, 6.6, 1.9));
  const head = joint("Neck1", 0, 7.3, 2.1, [[1.0, 0.9, 1.5, white, 0, 0, 0.1], [0.55, 0.3, 1.1, orange, 0, -0.1, 1.15], [0.35, 0.3, 0.3, black, 0, 0.15, 0.85]]);
  eyes(head, 0.25, 0.4, 0.52, 0.16);
  g.add(head);
  return g;
}

/** Desert: Scorpion Queen, with pincers and a curled stinger tail. */
export function scorpion(): THREE.Object3D {
  const g = new THREE.Group();
  const tan = mat("#d9a441", { roughness: 0.7 });
  const brown = mat("#8a5a22");
  const red = glow("#ff3b1f", 0.6);
  for (const s of [1, -1]) for (const z of [1.8, 0.4, -1.0]) g.add(box(0.35, 1.6, 0.35, brown, s * 1.9, 1.0, z), box(0.3, 1.2, 0.3, brown, s * 2.5, 0.5, z));
  g.add(joint("LegL1", 1.2, 1.8, 0.2, [[0.5, 1.8, 0.5, brown, 0, -0.9, 0]]), joint("LegR1", -1.2, 1.8, 0.2, [[0.5, 1.8, 0.5, brown, 0, -0.9, 0]]));
  g.add(box(3.6, 1.6, 4.6, tan, 0, 2.6, 0), box(2.8, 0.5, 3.6, brown, 0, 3.55, 0));
  g.add(box(1.0, 1.0, 1.4, tan, 0, 3.0, -3.0), box(0.9, 1.2, 0.9, tan, 0, 3.9, -3.7), box(0.9, 1.3, 0.9, tan, 0, 5.0, -3.5), box(0.8, 1.0, 0.9, tan, 0, 6.0, -2.7), box(0.35, 1.0, 0.35, red, 0, 6.4, -1.8));
  for (const [n, s] of [["ArmL1", 1], ["ArmR1", -1]] as const)
    g.add(joint(n, s * 1.8, 3.0, 2.0, [[0.7, 0.7, 2.2, tan, 0, 0, 1.0], [0.5, 0.6, 1.4, brown, s * 0.55, 0, 2.5], [0.5, 0.6, 1.4, brown, -s * 0.55, 0, 2.5]]));
  const head = joint("Neck1", 0, 3.2, 2.4, [[1.8, 1.2, 1.4, tan, 0, 0.2, 0.3]]);
  eyes(head, 0.6, 1.0, 0.55, 0.28, glow("#ff3b1f"));
  g.add(head);
  return g;
}

/** Jungle: Jaguar Shaman, standing upright with a feather headdress and a glowing staff. */
export function jaguar(): THREE.Object3D {
  const g = new THREE.Group();
  const gold = mat("#e6a42b", { roughness: 0.8 });
  const spot = mat("#2a1a0c");
  const skin = mat("#6b3f1e");
  const feather = glow("#3ad16a", 0.4);
  g.add(joint("LegL1", 0.8, 2.6, 0, [[0.9, 2.6, 1.0, gold, 0, -1.3, 0], [1.0, 0.3, 1.5, skin, 0, -2.5, 0.3]]));
  g.add(joint("LegR1", -0.8, 2.6, 0, [[0.9, 2.6, 1.0, gold, 0, -1.3, 0], [1.0, 0.3, 1.5, skin, 0, -2.5, 0.3]]));
  g.add(box(2.6, 2.8, 1.6, gold, 0, 4.0, 0), box(2.7, 0.7, 1.7, skin, 0, 2.7, 0));
  for (const [x, y] of [[-0.8, 4.6], [0.7, 3.8], [-0.2, 3.2], [0.9, 4.9]]) g.add(box(0.4, 0.4, 0.1, spot, x, y, 0.85));
  g.add(joint("ArmL1", 1.7, 5.1, 0, [[0.8, 2.6, 0.9, gold, 0, -1.3, 0]]));
  g.add(joint("ArmR1", -1.7, 5.1, 0, [[0.8, 2.6, 0.9, gold, 0, -1.3, 0], [0.25, 4.5, 0.25, skin, 0, -2.6, 0.9], [0.7, 0.7, 0.7, glow("#7dff4a", 0.9), 0, -0.2, 0.9]]));
  const head = joint("Neck1", 0, 5.4, 0.1, [[1.7, 1.5, 1.6, gold, 0, 0.75, 0.2], [0.9, 0.6, 0.6, "#f1d9a3", 0, 0.35, 1.05], [0.3, 0.25, 0.25, spot, 0, 0.55, 1.35], [0.5, 0.5, 0.4, gold, 0.9, 1.7, 0], [0.5, 0.5, 0.4, gold, -0.9, 1.7, 0]]);
  eyes(head, 0.95, 1.0, 0.5, 0.2, glow("#c6ff3a"));
  for (let i = -2; i <= 2; i++) head.add(box(0.3, 1.4 - Math.abs(i) * 0.25, 0.15, i % 2 ? feather : glow("#ff5e3a", 0.4), i * 0.42, 2.1, -0.4));
  g.add(head);
  return g;
}

/** Snow: Frost Yeti, a huge shaggy white ape with an icicle crown. */
export function yeti(): THREE.Object3D {
  const g = new THREE.Group();
  const fur = mat("#f2f7fb", { roughness: 0.95 });
  const shade = mat("#d5e3ef", { roughness: 0.95 });
  const ice = glow("#7fe0ff", 0.5);
  g.add(joint("LegL1", 1.1, 2.4, 0, [[1.5, 2.4, 1.6, fur, 0, -1.2, 0], [1.6, 0.4, 2.2, shade, 0, -2.3, 0.4]]));
  g.add(joint("LegR1", -1.1, 2.4, 0, [[1.5, 2.4, 1.6, fur, 0, -1.2, 0], [1.6, 0.4, 2.2, shade, 0, -2.3, 0.4]]));
  g.add(box(4.2, 3.8, 2.8, fur, 0, 4.3, 0), box(3.4, 1.6, 2.6, shade, 0, 2.7, 0.1));
  g.add(joint("ArmL1", 2.6, 5.7, 0, [[1.3, 4.2, 1.3, fur, 0.2, -2.1, 0.3], [1.7, 1.5, 1.7, shade, 0.2, -4.4, 0.3]]));
  g.add(joint("ArmR1", -2.6, 5.7, 0, [[1.3, 4.2, 1.3, fur, -0.2, -2.1, 0.3], [1.7, 1.5, 1.7, shade, -0.2, -4.4, 0.3]]));
  const head = joint("Neck1", 0, 6.2, 0.3, [[2.4, 2.0, 2.2, fur, 0, 1.0, 0], [1.6, 1.1, 0.4, "#9fd8f2", 0, 0.9, 1.15], [1.0, 0.4, 0.3, "#ffffff", 0, 0.35, 1.3], [0.4, 0.9, 0.4, ice, 1.0, 2.4, 0], [0.4, 0.9, 0.4, ice, -1.0, 2.4, 0]]);
  eyes(head, 1.25, 1.35, 0.55, 0.3, glow("#2f9bff", 1));
  g.add(head);
  for (const x of [-1.6, -0.5, 0.6, 1.7]) g.add(box(0.5, 1.1, 0.5, ice, x, 6.6, -0.6));
  return g;
}

/** Volcano: Magma Golem, dark rock with glowing lava cracks. */
export function golem(): THREE.Object3D {
  const g = new THREE.Group();
  const rock = mat("#3a3238", { roughness: 0.95 });
  const rock2 = mat("#2a2429", { roughness: 0.95 });
  const lava = glow("#ff6a1a", 1.1);
  g.add(joint("LegL1", 1.3, 3.0, 0, [[1.9, 3.0, 2.0, rock, 0, -1.5, 0], [0.3, 1.4, 0.1, lava, 0, -1.2, 1.05]]));
  g.add(joint("LegR1", -1.3, 3.0, 0, [[1.9, 3.0, 2.0, rock, 0, -1.5, 0], [0.3, 1.4, 0.1, lava, 0, -1.2, 1.05]]));
  g.add(box(5.2, 4.4, 3.4, rock, 0, 5.2, 0), box(3.0, 0.3, 0.1, lava, 0, 5.8, 1.75), box(0.3, 2.4, 0.1, lava, -1.2, 5.0, 1.75), box(0.3, 1.8, 0.1, lava, 1.4, 4.6, 1.75), box(4.0, 1.4, 3.0, rock2, 0, 3.2, 0));
  g.add(joint("ArmL1", 3.4, 6.9, 0, [[1.8, 4.4, 1.8, rock, 0, -2.2, 0], [2.4, 2.2, 2.4, rock2, 0, -5.0, 0.2], [0.25, 3.0, 0.1, lava, 0, -2.4, 0.95]]));
  g.add(joint("ArmR1", -3.4, 6.9, 0, [[1.8, 4.4, 1.8, rock, 0, -2.2, 0], [2.4, 2.2, 2.4, rock2, 0, -5.0, 0.2], [0.25, 3.0, 0.1, lava, 0, -2.4, 0.95]]));
  g.add(box(0.9, 1.6, 0.9, rock2, 1.7, 7.9, -0.8), box(0.9, 2.2, 0.9, rock2, -1.2, 8.1, -1.0));
  const head = joint("Neck1", 0, 7.4, 0.2, [[2.6, 2.0, 2.4, rock2, 0, 1.0, 0], [1.4, 0.35, 0.2, lava, 0, 0.45, 1.25]]);
  eyes(head, 1.35, 1.25, 0.65, 0.4, lava);
  g.add(head);
  return g;
}

/** Abyss: the Abyss Shark, a huge great-white with no legs (it swims along the ground), with a dorsal fin, tail fin and rows of teeth. */
export function shark(): THREE.Object3D {
  const g = new THREE.Group();
  const grey = mat("#6d84a3", { roughness: 0.55 });
  const dk = mat("#4a5f80", { roughness: 0.55 });
  const belly = mat("#eef4fa", { roughness: 0.6 });
  const tooth = mat("#ffffff");
  const gum = mat("#d8506a");
  // Torpedo body: grey back, pale belly, a tall dorsal fin and a two-lobed tail fin.
  g.add(box(3.8, 3.8, 5.6, grey, 0, 5.2, -0.4), box(3.2, 1.6, 5.0, belly, 0, 3.8, 0.0), box(3.0, 3.0, 3.0, grey, 0, 5.0, -4.0), box(2.2, 2.2, 2.4, dk, 0, 4.8, -6.2));
  g.add(box(0.4, 3.4, 2.6, dk, 0, 8.6, -1.0), box(0.35, 1.6, 1.4, dk, 0, 7.2, -1.2));
  g.add(box(0.4, 3.2, 1.2, dk, 0, 6.6, -8.0), box(0.4, 1.8, 1.0, dk, 0, 3.4, -7.6));
  // Pectoral fins double as arms.
  for (const [n, s] of [["ArmL1", 1], ["ArmR1", -1]] as const)
    g.add(joint(n, s * 2.2, 6.0, 0.6, [[0.5, 3.6, 1.6, dk, s * 0.3, -1.8, 0.2], [0.5, 1.2, 2.2, grey, s * 0.4, -3.8, 0.5]]));
  // Big blunt head with an open, toothy mouth.
  const head = joint("Neck1", 0, 6.0, 2.2, [[3.4, 2.4, 3.6, grey, 0, 1.2, 1.0], [2.8, 0.8, 3.2, gum, 0, 0.1, 1.2], [3.0, 0.9, 3.4, belly, 0, -0.6, 1.1], [1.2, 0.9, 1.0, grey, 0, 1.4, 3.0]]);
  for (let i = 0; i < 5; i++) {
    head.add(box(0.35, 0.6, 0.3, tooth, 1.15 - i * 0.05, 0.55, 0.0 + i * 0.7), box(0.35, 0.6, 0.3, tooth, -1.15 + i * 0.05, 0.55, 0.0 + i * 0.7));
    head.add(box(0.3, 0.5, 0.3, tooth, 1.0, 0.05, 0.1 + i * 0.7), box(0.3, 0.5, 0.3, tooth, -1.0, 0.05, 0.1 + i * 0.7));
  }
  head.add(box(0.5, 0.5, 0.3, dark("#0b0b0b"), 1.65, 1.7, 1.6), box(0.5, 0.5, 0.3, dark("#0b0b0b"), -1.65, 1.7, 1.6)); // small black eyes
  head.add(box(0.06, 0.6, 0.8, dk, 1.72, 0.9, 0.6), box(0.06, 0.6, 0.8, dk, -1.72, 0.9, 0.6)); // gills
  g.add(head);
  g.position.y = -2.6; // no legs: the body rests low, on the ground
  return g;
}

/** Prehistoric: Tyrant Rex, a green tyrannosaur with tiny arms and a big toothy head. */
export function rex(): THREE.Object3D {
  const g = new THREE.Group();
  const green = mat("#5b8f3a", { roughness: 0.85 });
  const dk = mat("#3f6a28", { roughness: 0.85 });
  const belly = mat("#d7cf8a");
  const tooth = mat("#fffdf0");
  g.add(joint("LegL1", 1.4, 3.6, -0.3, [[1.6, 3.6, 1.8, green, 0, -1.8, 0], [1.7, 0.4, 2.8, dk, 0, -3.4, 0.7]]));
  g.add(joint("LegR1", -1.4, 3.6, -0.3, [[1.6, 3.6, 1.8, green, 0, -1.8, 0], [1.7, 0.4, 2.8, dk, 0, -3.4, 0.7]]));
  g.add(box(3.4, 3.6, 5.0, green, 0, 5.2, -0.4), box(2.4, 2.4, 4.0, belly, 0, 4.4, 0.4));
  g.add(box(2.4, 2.2, 2.6, green, 0, 4.6, -4.2), box(1.6, 1.4, 2.6, green, 0, 4.2, -6.6), box(0.8, 0.8, 2.0, dk, 0, 4.0, -8.6));
  for (let i = 0; i < 5; i++) g.add(box(0.4, 0.7, 0.6, dk, 0, 7.3 - i * 0.25, -2.6 + (i - 2) * -0.9));
  g.add(joint("ArmL1", 1.8, 6.2, 1.6, [[0.5, 1.6, 0.5, green, 0, -0.8, 0.3], [0.7, 0.3, 0.9, tooth, 0, -1.7, 0.6]]));
  g.add(joint("ArmR1", -1.8, 6.2, 1.6, [[0.5, 1.6, 0.5, green, 0, -0.8, 0.3], [0.7, 0.3, 0.9, tooth, 0, -1.7, 0.6]]));
  const head = joint("Neck1", 0, 7.0, 1.8, [[2.4, 2.2, 3.4, green, 0, 0.8, 1.0], [2.0, 0.7, 3.0, belly, 0, -0.3, 1.2]]);
  for (let i = 0; i < 4; i++) head.add(box(0.25, 0.5, 0.25, tooth, 0.9, -0.05, 0.1 + i * 0.75), box(0.25, 0.5, 0.25, tooth, -0.9, -0.05, 0.1 + i * 0.75));
  eyes(head, 1.5, 1.4, 1.2, 0.35, glow("#ffb020", 0.8));
  g.add(head);
  return g;
}

/** Cosmic: Void Watcher, a floating armoured eye with dangling tendrils and orbiting shards. */
export function voidwatcher(): THREE.Object3D {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: "#150b2b", roughness: 0.3, metalness: 0.6, emissive: "#3b1a7a", emissiveIntensity: 0.5 });
  const cyan = glow("#5ff0ff", 1.2);
  const violet = glow("#a44dff", 0.9);
  for (const [n, x] of [["LegL1", 0.9], ["LegR1", -0.9]] as const) g.add(joint(n, x, 3.4, 0, [[0.5, 3.2, 0.5, shell, 0, -1.6, 0], [0.3, 0.3, 0.3, violet, 0, -3.3, 0]]));
  g.add(box(4.4, 4.4, 4.4, shell, 0, 6.0, 0), box(3.0, 3.0, 4.6, violet, 0, 6.0, 0));
  g.add(box(3.0, 3.0, 0.4, "#f3eaff", 0, 6.0, 2.3), box(1.6, 1.6, 0.4, cyan, 0, 6.0, 2.6), box(0.7, 1.2, 0.4, dark("#000000"), 0, 6.0, 2.85));
  for (const [x, y, z] of [[3.6, 8.2, 1], [-3.8, 7.4, -1], [3.2, 3.8, -2], [-3.2, 4.4, 2]] as const) g.add(box(0.8, 1.6, 0.8, cyan, x, y, z));
  g.add(joint("ArmL1", 2.6, 6.2, 0, [[0.6, 3.6, 0.6, shell, 0.3, -1.8, 0], [0.9, 0.9, 0.9, violet, 0.3, -3.8, 0]]));
  g.add(joint("ArmR1", -2.6, 6.2, 0, [[0.6, 3.6, 0.6, shell, -0.3, -1.8, 0], [0.9, 0.9, 0.9, violet, -0.3, -3.8, 0]]));
  g.add(joint("Neck1", 0, 8.4, 0, [[1.4, 1.0, 1.4, violet, 0, 0.5, 0]]));
  return g;
}

/** Cherry Blossom: Blossom Spirit, a pink-robed spirit with branch arms and a hat of blossoms. */
export function blossomSpirit(): THREE.Object3D {
  const g = new THREE.Group();
  const pink = mat("#ffb7d3", { roughness: 0.8, emissive: "#ff8ab8", emissiveIntensity: 0.18 });
  const white = mat("#fff3f8");
  const bark = mat("#6b3f2e");
  const petal = glow("#ff8ac0", 0.5);
  for (const [n, x] of [["LegL1", 0.8], ["LegR1", -0.8]] as const) g.add(joint(n, x, 2.6, 0, [[0.9, 2.6, 0.9, white, 0, -1.3, 0]]));
  g.add(box(3.6, 1.2, 3.6, pink, 0, 2.6, 0), box(3.0, 3.0, 2.4, pink, 0, 4.4, 0), box(2.2, 1.0, 2.0, white, 0, 6.2, 0));
  g.add(joint("ArmL1", 1.8, 5.8, 0, [[0.5, 3.4, 0.5, bark, 0.4, -1.6, 0.3], [1.2, 1.2, 1.2, petal, 0.5, -3.6, 0.3], [0.7, 0.7, 0.7, white, 1.2, -3.0, 0.3]]));
  g.add(joint("ArmR1", -1.8, 5.8, 0, [[0.5, 3.4, 0.5, bark, -0.4, -1.6, 0.3], [1.2, 1.2, 1.2, petal, -0.5, -3.6, 0.3], [0.7, 0.7, 0.7, white, -1.2, -3.0, 0.3]]));
  const head = joint("Neck1", 0, 6.7, 0, [[1.8, 1.8, 1.8, white, 0, 0.9, 0], [3.4, 1.0, 3.4, petal, 0, 2.3, 0], [2.2, 0.9, 2.2, pink, 0, 3.1, 0]]);
  eyes(head, 1.0, 0.95, 0.4, 0.2, glow("#c2247a", 0.8));
  g.add(head);
  for (const [x, y, z] of [[2.6, 8.4, 1.4], [-2.8, 7.6, -0.8], [1.2, 9.0, -1.8], [-1.4, 3.0, 2.4]] as const) g.add(box(0.5, 0.15, 0.5, petal, x, y, z));
  return g;
}

/** Titan Temple: Stone Titan, a mossy stone giant with glowing blue runes. */
export function titanGuardian(): THREE.Object3D {
  const g = new THREE.Group();
  const stone = mat("#7d8aa6", { roughness: 0.95 });
  const dk = mat("#5b6785", { roughness: 0.95 });
  const moss = mat("#4e9a3c", { roughness: 1 });
  const rune = glow("#5fe8ff", 1.2);
  g.add(joint("LegL1", 1.6, 3.4, 0, [[2.2, 3.4, 2.4, stone, 0, -1.7, 0], [2.4, 0.5, 3.0, dk, 0, -3.2, 0.3]]));
  g.add(joint("LegR1", -1.6, 3.4, 0, [[2.2, 3.4, 2.4, stone, 0, -1.7, 0], [2.4, 0.5, 3.0, dk, 0, -3.2, 0.3]]));
  g.add(box(6.0, 5.2, 3.8, stone, 0, 6.0, 0), box(6.4, 0.8, 4.2, dk, 0, 3.6, 0), box(5.0, 0.6, 0.1, rune, 0, 5.4, 1.95), box(0.5, 2.6, 0.1, rune, 0, 6.2, 1.95), box(2.4, 1.2, 0.5, moss, -1.6, 8.6, 0.4));
  g.add(joint("ArmL1", 3.9, 8.0, 0, [[2.2, 5.0, 2.2, stone, 0, -2.5, 0], [3.0, 2.8, 3.0, dk, 0, -6.0, 0.3], [0.5, 1.2, 0.1, rune, 0, -2.0, 1.15]]));
  g.add(joint("ArmR1", -3.9, 8.0, 0, [[2.2, 5.0, 2.2, stone, 0, -2.5, 0], [3.0, 2.8, 3.0, dk, 0, -6.0, 0.3], [0.5, 1.2, 0.1, rune, 0, -2.0, 1.15]]));
  const head = joint("Neck1", 0, 8.6, 0.2, [[3.2, 2.6, 3.0, stone, 0, 1.3, 0], [3.6, 0.6, 3.4, dk, 0, 2.9, 0], [1.6, 0.5, 0.3, dk, 0, 0.5, 1.6]]);
  eyes(head, 1.6, 1.55, 0.8, 0.5, rune);
  g.add(head);
  return g;
}

/** Celestial Rift: Seraph Warden, a white-and-gold six-winged angel with a flaming sword and halo. */
export function seraph(): THREE.Object3D {
  const g = new THREE.Group();
  const white = mat("#ffffff", { roughness: 0.5, emissive: "#fff6d8", emissiveIntensity: 0.3 });
  const gold = glow("#ffd966", 0.7);
  const skin = mat("#ffe6c7");
  for (const [n, x] of [["LegL1", 0.8], ["LegR1", -0.8]] as const) g.add(joint(n, x, 3.0, 0, [[1.0, 3.0, 1.0, white, 0, -1.5, 0], [1.1, 0.3, 1.5, gold, 0, -2.9, 0.3]]));
  g.add(box(3.0, 3.6, 1.8, white, 0, 4.8, 0), box(3.2, 0.6, 2.0, gold, 0, 3.4, 0), box(1.4, 1.4, 0.2, gold, 0, 5.2, 0.95));
  for (const [i, s] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]] as const)
    g.add(box(0.3, 4.2 - i * 0.9, 1.8, i === 1 ? gold : white, s * (2.3 + i * 0.6), 6.4 - i * 1.2 + (i === 2 ? -0.6 : 0), -1.2 - i * 0.2));
  g.add(joint("ArmL1", 1.9, 6.3, 0, [[0.8, 3.0, 0.8, skin, 0.1, -1.5, 0.3]]));
  g.add(joint("ArmR1", -1.9, 6.3, 0, [[0.8, 3.0, 0.8, skin, -0.1, -1.5, 0.3], [0.4, 5.0, 0.2, glow("#ffb020", 0.9), -0.1, -3.0, 1.2], [1.4, 0.3, 0.4, gold, -0.1, -1.6, 1.2]]));
  const head = joint("Neck1", 0, 6.6, 0, [[1.6, 1.6, 1.6, skin, 0, 0.8, 0], [1.9, 0.5, 1.9, gold, 0, 1.9, 0], [3.0, 0.2, 3.0, glow("#fff2a8", 1), 0, 3.0, 0]]);
  eyes(head, 1.0, 0.85, 0.35, 0.18, glow("#3a7bff", 0.8));
  g.add(head);
  return g;
}
