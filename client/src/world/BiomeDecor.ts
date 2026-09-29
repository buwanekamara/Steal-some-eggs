import * as THREE from "three";
import { BIOMES, CORRIDOR_HALF_WIDTH, GUARDIANS, biomeLength, biomeStartZ } from "@egg/shared";
import { mulberry32 } from "./random.ts";

/** [w, h, d, x, y, z, color, emissive intensity (0 = none)] — boxes relative to the piece's base. */
type Part = [number, number, number, number, number, number, string, number?];

interface Kind {
  parts: Part[];
  /** Random uniform scale range. */
  scale: [number, number];
}

const kind = (parts: Part[], scale: [number, number] = [0.9, 1.3]): Kind => ({ parts, scale });

/** Scenery pieces that give each biome its own look (the forest has its own trees in World). */
const DECOR: Record<string, Kind[]> = {
  lake: [
    kind([[0.25, 3.2, 0.25, 0, 1.6, 0, "#5a8a3a"], [0.25, 3.0, 0.25, 0.5, 1.5, 0.2, "#6a9a44"], [0.35, 0.7, 0.35, 0, 3.3, 0, "#8a5a2a"]], [1, 1.6]),
    kind([[7, 0.1, 5, 0, 0.06, 0, "#3aa0e8", 0.25], [5, 0.12, 3.2, 0.4, 0.07, 0.2, "#7fd4ff", 0.35]], [0.8, 1.4]),
    kind([[3, 1.6, 2.4, 0, 0.8, 0, "#9aa8b0"], [1.8, 1.2, 1.6, 0.8, 2.0, 0.2, "#aab8c0"]]),
  ],
  desert: [
    kind([[1.2, 5, 1.2, 0, 2.5, 0, "#3f9a4a"], [2.2, 0.9, 0.9, -1.4, 3.0, 0, "#3f9a4a"], [0.9, 2.0, 0.9, -2.3, 4.0, 0, "#3f9a4a"], [1.8, 0.9, 0.9, 1.3, 2.4, 0, "#3f9a4a"], [0.9, 1.7, 0.9, 2.1, 3.3, 0, "#3f9a4a"]], [0.9, 1.5]),
    kind([[3, 1.8, 2.4, 0, 0.9, 0, "#b98f4e"], [1.8, 1.2, 1.6, 0.6, 2.2, 0.1, "#c99f5e"]]),
    kind([[5, 0.6, 4, 0, 0.3, 0, "#f0d590"]]),
  ],
  jungle: [
    kind([[1.6, 7, 1.6, 0, 3.5, 0, "#6b4a2a"], [7, 2.2, 7, 0, 7.8, 0, "#1f8a2c"], [4.5, 1.6, 4.5, 0.4, 9.4, 0, "#2fa83a"], [0.2, 4, 0.2, 2.8, 5.6, 0.4, "#3ac03a"], [0.2, 3, 0.2, -2.6, 6.0, -0.6, "#3ac03a"]], [1, 1.4]),
    kind([[2.6, 0.6, 2.6, 0, 0.3, 0, "#2fa83a"], [0.5, 1.6, 0.5, 0.4, 1.0, 0.2, "#4fd04a"]], [1, 1.8]),
    kind([[1.1, 1.1, 1.1, 0, 0.55, 0, "#ff5e8a", 0.3], [1.5, 0.3, 1.5, 0, 0.15, 0, "#2f9a2a"]], [1, 1.6]),
  ],
  snow: [
    kind([[0.9, 2.2, 0.9, 0, 1.1, 0, "#5a3a22"], [5, 1.4, 5, 0, 3.2, 0, "#2f7a4a"], [3.8, 1.3, 3.8, 0, 4.5, 0, "#3a8a58"], [2.5, 1.2, 2.5, 0, 5.7, 0, "#eaf6ff"]], [1, 1.5]),
    kind([[1.2, 4.5, 1.2, 0, 2.25, 0, "#a8e6ff", 0.5], [0.8, 2.6, 0.8, 1.0, 1.3, 0.3, "#c4f0ff", 0.5]], [0.9, 1.5]),
    kind([[4, 1.0, 3, 0, 0.5, 0, "#ffffff"]], [0.9, 1.6]),
  ],
  volcano: [
    kind([[3.5, 3.5, 3, 0, 1.7, 0, "#2b262b"], [2, 2, 2, 1.6, 3.8, 0, "#3a3238"], [0.3, 2.4, 0.1, -0.6, 1.8, 1.52, "#ff6a1a", 1]], [0.9, 1.5]),
    kind([[6, 0.12, 4.5, 0, 0.07, 0, "#ff6a1a", 1], [4, 0.14, 2.8, 0.3, 0.09, 0.1, "#ffb020", 1]], [0.8, 1.4]),
    kind([[1.2, 5, 1.2, 0, 2.5, 0, "#1a1518"], [0.8, 3, 0.8, 0.9, 1.5, 0.3, "#2a2429"]], [0.9, 1.6]),
  ],
  abyss: [
    kind([[0.9, 3.5, 0.9, 0, 1.75, 0, "#ff6a8a"], [0.7, 2.4, 0.7, 0.9, 3.0, 0.2, "#ff9aa8"], [0.7, 2.0, 0.7, -0.9, 2.6, 0, "#ff5e7a"]], [1, 1.6]),
    kind([[0.4, 5, 0.4, 0, 2.5, 0, "#1fbf7a"], [0.4, 4, 0.4, 0.7, 2.0, 0.2, "#2fd48a"]], [1, 1.6]),
    kind([[1.0, 1.0, 1.0, 0, 5.5, 0, "#6ff0ff", 1], [0.2, 4.6, 0.2, 0, 2.7, 0, "#3a7bff", 0.4]], [0.8, 1.4]),
  ],
  prehistoric: [
    kind([[1.2, 6, 1.2, 0, 3, 0, "#7a5a2a"], [6, 0.5, 1.2, 0, 6.3, 0, "#3f8a2a"], [1.2, 0.5, 6, 0, 6.5, 0, "#4f9a34"]], [1, 1.5]),
    kind([[0.5, 4, 0.5, 0, 2, 0, "#f2ecd8"], [0.4, 3.4, 0.4, 1.0, 1.7, 0, "#f2ecd8"], [0.4, 3.0, 0.4, 2.0, 1.5, 0, "#f2ecd8"], [3, 0.5, 0.5, 1.0, 3.9, 0, "#e6dfc6"]]),
    kind([[3, 2, 3, 0, 1, 0, "#8f7a4a"], [1.6, 1.4, 1.6, 0.8, 2.6, 0, "#a08a56"]]),
  ],
  cosmic: [
    kind([[1.4, 6, 1.4, 0, 3, 0, "#8a4dff", 0.8], [0.9, 4, 0.9, 1.3, 2, 0.4, "#5ff0ff", 0.8]], [1, 1.6]),
    kind([[2.4, 2, 2.4, 0, 7, 0, "#3a2f6a", 0.3], [1.2, 1.0, 1.2, 1.4, 8.4, 0.3, "#5a4a9a", 0.3]], [1, 1.5]),
    kind([[0.3, 10, 0.3, 0, 5, 0, "#ffffff", 1]], [1, 1.8]),
  ],
  cherry: [
    kind([[1.4, 5, 1.4, 0, 2.5, 0, "#6b3f2e"], [7, 2.6, 7, 0, 6.2, 0, "#ff9ec4"], [5, 2, 5, 0.3, 8.2, 0, "#ffc2da"]], [1, 1.4]),
    kind([[3, 0.2, 3, 0, 0.1, 0, "#ffb0cf"], [1.6, 0.25, 1.6, 0.6, 0.2, 0.4, "#ffd0e2"]], [1, 1.8]),
    kind([[1.2, 1.4, 1.2, 0, 0.7, 0, "#f6c8d8"], [0.4, 3.4, 0.4, 0, 2.6, 0, "#9a5064"], [1.4, 1.0, 0.2, 0, 4.4, 0, "#ff5e5e", 0.6]]),
  ],
  titan: [
    kind([[2.4, 9, 2.4, 0, 4.5, 0, "#7d8aa6"], [3.2, 1, 3.2, 0, 9.5, 0, "#5b6785"], [3.2, 0.8, 3.2, 0, 0.4, 0, "#5b6785"], [0.4, 3, 0.1, 0, 5, 1.26, "#5fe8ff", 1]], [1, 1.3]),
    kind([[3, 2, 2, 0, 1, 0, "#6a7594"], [2.4, 0.5, 2.4, 0.2, 2.2, 0, "#4e9a3c"]]),
    kind([[1.6, 5, 1.6, 0, 2.5, 0, "#7d8aa6"], [2.2, 2.2, 2.2, 0, 6.1, 0, "#6a7594"], [1.6, 0.3, 0.1, 0, 6.2, 1.15, "#5fe8ff", 1]]),
  ],
  celestial: [
    kind([[3, 1.5, 3, 0, 0.75, 0, "#ffffff"], [2.4, 7, 2.4, 0, 5, 0, "#f7f3e0"], [3, 0.6, 3, 0, 8.7, 0, "#ffd966", 0.7]], [1, 1.4]),
    kind([[3, 0.3, 3, 0, 6, 0, "#ffd966", 0.8], [2.2, 0.3, 2.2, 0, 6.35, 0, "#fff2a8", 0.9]], [1, 1.6]),
    kind([[4, 1.4, 3, 0, 0.7, 0, "#ffffff"], [3, 1.2, 2.4, 1.2, 1.6, 0.2, "#fbfbff"]], [1, 1.6]),
  ],
};

/** Scatters each biome's scenery along both walls (clear of the guardian's nest ring in the middle). */
export function buildBiomeDecor(scene: THREE.Scene) {
  const rnd = mulberry32(2024);
  // Per kind: every instance's base transform, so one InstancedMesh per part covers the whole corridor.
  const placed = new Map<Kind, THREE.Matrix4[]>();
  BIOMES.forEach((biome, i) => {
    const kinds = DECOR[biome.id];
    if (!kinds) return;
    const z0 = biomeStartZ(i) + 8;
    const z1 = biomeStartZ(i) + biomeLength(i) - 8;
    const count = Math.round((z1 - z0) / 5);
    for (let n = 0; n < count; n++) {
      const k = kinds[Math.floor(rnd() * kinds.length)];
      const side = rnd() < 0.5 ? -1 : 1;
      const x = side * (CORRIDOR_HALF_WIDTH - 2.5 - rnd() * 4.5);
      const z = z0 + rnd() * (z1 - z0);
      if (GUARDIANS.some((g) => Math.hypot(g.home.x - x, g.home.z - z) < 14)) continue; // keep the guardian's nest corner clear
      const s = k.scale[0] + rnd() * (k.scale[1] - k.scale[0]);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2), new THREE.Vector3(s, s, s));
      const list = placed.get(k) ?? [];
      list.push(m);
      placed.set(k, list);
    }
  });
  const local = new THREE.Matrix4();
  for (const [k, list] of placed) {
    for (const [w, h, d, px, py, pz, color, emissive] of k.parts) {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: emissive ? color : "#000000", emissiveIntensity: emissive ?? 0 });
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(w, h, d), mat, list.length);
      local.makeTranslation(px, py, pz);
      list.forEach((m, idx) => mesh.setMatrixAt(idx, new THREE.Matrix4().multiplyMatrices(m, local)));
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
}
