import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { makePlaceholder } from "./placeholders.ts";

/**
 * Data-driven 3D models.
 *
 * `client/public/models/manifest.json` maps a model id to a file plus a transform.
 * Any id without a file, or whose file fails to load, gets a blocky placeholder,
 * so the game always runs and models can be swapped without touching code.
 */

export interface ModelEntry {
  /** File inside client/public/models (.glb, .gltf or .fbx), or null for the placeholder. */
  file: string | null;
  scale: number;
  /** Degrees. Models must face +Z after this rotation. */
  rotationY: number;
  offsetY: number;
  /** Optional texture file (in client/public/models) applied as the base color map. */
  texture?: string | null;
  /** Paint body parts by bone when the model has no working texture. */
  autoColor?: boolean;
  note?: string;
}

export type Manifest = Record<string, ModelEntry>;

export type ModelSource = "file" | "placeholder" | "fallback";

export interface ModelStatus {
  source: ModelSource;
  message: string;
}

export interface InstanceOptions {
  /** Shirt color used by autoColor (lets players look different). */
  tint?: THREE.ColorRepresentation;
}

const MODELS_URL = "/models/";
const IMAGE_EXT = /\.(png|jpe?g|webp|tga)$/i;

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

export class ModelLibrary {
  manifest: Manifest = {};
  readonly status = new Map<string, ModelStatus>();
  private templates = new Map<string, THREE.Object3D>();

  async loadManifest(): Promise<Manifest> {
    const res = await fetch(`${MODELS_URL}manifest.json`, { cache: "no-store" });
    this.manifest = res.ok ? await res.json() : {};
    return this.manifest;
  }

  /** Loads the manifest and every model in it. Never throws: failures fall back to placeholders. */
  async loadAll(onProgress?: (done: number, total: number) => void): Promise<void> {
    await this.loadManifest();
    const ids = Object.keys(this.manifest);
    let done = 0;
    await Promise.all(
      ids.map(async (id) => {
        await this.load(id);
        onProgress?.(++done, ids.length);
      }),
    );
  }

  /** (Re)loads one model id. `data` lets the viewer preview a dropped file before saving it. */
  async load(id: string, data?: { buffer: ArrayBuffer; fileName: string }): Promise<THREE.Object3D> {
    const entry = this.entry(id);
    let obj: THREE.Object3D;
    try {
      if (data) {
        obj = await this.parseFile(data.buffer, data.fileName, entry);
        this.status.set(id, { source: "file", message: `${data.fileName} (preview, not saved)` });
      } else if (entry.file) {
        obj = await this.loadFile(entry.file, entry);
        this.status.set(id, { source: "file", message: entry.file });
      } else {
        obj = makePlaceholder(id);
        this.status.set(id, { source: "placeholder", message: "no file set, using placeholder" });
      }
    } catch (err) {
      console.warn(`[models] ${id}: failed to load, using placeholder`, err);
      obj = makePlaceholder(id);
      this.status.set(id, { source: "fallback", message: `load failed: ${(err as Error).message ?? err}` });
    }
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = !(o as THREE.SkinnedMesh).isSkinnedMesh;
      }
    });
    this.templates.set(id, obj);
    return obj;
  }

  entry(id: string): ModelEntry {
    return this.manifest[id] ?? { file: null, scale: 1, rotationY: 0, offsetY: 0 };
  }

  /**
   * Creates an independent copy of a model, wrapped as:
   *   returned Group (game positions/rotates this)
   *     └─ "model" Group (manifest scale / rotationY / offsetY)
   *          └─ cloned model
   */
  instance(id: string, opts: InstanceOptions = {}): THREE.Group {
    const template = this.templates.get(id) ?? makePlaceholder(id);
    const copy = cloneSkinned(template);
    const entry = this.entry(id);
    const fromFile = this.status.get(id)?.source === "file";
    if (entry.autoColor && fromFile && !hasTexture(copy)) applyAutoColor(copy, opts.tint);

    const inner = new THREE.Group();
    inner.name = "model";
    inner.add(copy);
    // Placeholders are built at real size, so the manifest transform only applies to files.
    applyTransform(inner, fromFile ? entry : PLACEHOLDER_TRANSFORM);

    const outer = new THREE.Group();
    outer.name = `model:${id}`;
    outer.add(inner);
    return outer;
  }

  /**
   * One static model drawn at many places, as a few InstancedMeshes (one draw call per part instead of one per
   * part per copy). For props that never move or animate individually (nests…); skinned parts aren't supported.
   */
  instanceMany(id: string, placements: THREE.Matrix4[]): THREE.Group {
    const group = new THREE.Group();
    group.name = `instanced:${id}`;
    if (!placements.length) return group;
    const template = this.instance(id);
    template.updateMatrixWorld(true);
    template.traverse((o) => {
      const part = o as THREE.Mesh;
      if (!part.isMesh || (part as THREE.SkinnedMesh).isSkinnedMesh) return;
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
      placements.forEach((p, i) => mesh.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(p, part.matrixWorld)));
      mesh.castShadow = part.castShadow;
      mesh.receiveShadow = part.receiveShadow;
      mesh.computeBoundingSphere();
      group.add(mesh);
    });
    return group;
  }

  // ------------------------------------------------------------------ loading

  private makeManager(): { manager: THREE.LoadingManager; idle: Promise<void>; failed: string[] } {
    const manager = new THREE.LoadingManager();
    const failed: string[] = [];
    const idle = new Promise<void>((resolve) => (manager.onLoad = resolve));
    manager.onError = (url) => failed.push(url);
    // Textures referenced by absolute/odd paths inside model files (e.g. "X:\\...\\test.png")
    // are looked up by file name in /models/.
    manager.setURLModifier((url) => {
      if (IMAGE_EXT.test(url) && !url.startsWith("blob:") && !url.startsWith("data:")) {
        return MODELS_URL + basename(decodeURIComponent(url));
      }
      return url;
    });
    return { manager, idle, failed };
  }

  private async loadFile(file: string, entry: ModelEntry): Promise<THREE.Object3D> {
    const url = MODELS_URL + file;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${file} not found (HTTP ${res.status})`);
    return this.parseFile(await res.arrayBuffer(), file, entry);
  }

  private async parseFile(buffer: ArrayBuffer, fileName: string, entry: ModelEntry): Promise<THREE.Object3D> {
    const { manager, idle, failed } = this.makeManager();
    manager.itemStart("__parse");
    let obj: THREE.Object3D;
    try {
      const ext = fileName.split(".").pop()!.toLowerCase();
      if (ext === "fbx") {
        obj = new FBXLoader(manager).parse(buffer, MODELS_URL);
      } else if (ext === "glb" || ext === "gltf") {
        const gltf = await new GLTFLoader(manager).parseAsync(buffer, MODELS_URL);
        obj = gltf.scene;
        obj.animations = gltf.animations;
      } else {
        throw new Error(`unsupported format .${ext}`);
      }
    } finally {
      manager.itemEnd("__parse");
    }
    await idle;
    if (failed.length) console.info(`[models] ${fileName}: missing textures`, failed.map(basename));
    await this.fixTextures(obj, entry);
    return obj;
  }

  /** Drops maps whose image never loaded (they would render black) and applies entry.texture. */
  private async fixTextures(obj: THREE.Object3D, entry: ModelEntry): Promise<void> {
    let override: THREE.Texture | null = null;
    if (entry.texture) {
      try {
        override = await new THREE.TextureLoader().loadAsync(MODELS_URL + entry.texture);
        override.colorSpace = THREE.SRGBColorSpace;
        override.magFilter = THREE.NearestFilter; // crisp pixel-art skins
        override.flipY = true;
      } catch {
        console.warn(`[models] texture ${entry.texture} not found`);
      }
    }
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats as THREE.MeshStandardMaterial[]) {
        if (override) {
          m.map = override;
        } else if (m.map) {
          const img = m.map.image as { width?: number } | undefined;
          if (!img || !img.width) m.map = null;
          else {
            m.map.colorSpace = THREE.SRGBColorSpace;
            m.map.magFilter = THREE.NearestFilter;
          }
        }
        m.needsUpdate = true;
      }
    });
  }
}

const PLACEHOLDER_TRANSFORM: ModelEntry = { file: null, scale: 1, rotationY: 0, offsetY: 0 };

export function applyTransform(inner: THREE.Object3D, e: Pick<ModelEntry, "scale" | "rotationY" | "offsetY">) {
  inner.scale.setScalar(e.scale || 1);
  inner.rotation.set(0, THREE.MathUtils.degToRad(e.rotationY || 0), 0);
  inner.position.set(0, e.offsetY || 0, 0);
}

// ------------------------------------------------------------------ auto color

function hasTexture(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of [mesh.material].flat() as THREE.MeshStandardMaterial[]) if (m.map) found = true;
  });
  return found;
}

const SKIN = new THREE.Color("#e9a56b");
const PANTS = new THREE.Color("#173f3b");
const DEFAULT_SHIRT = new THREE.Color("#1f7a68");

function partColor(boneName: string, shirt: THREE.Color): THREE.Color {
  const n = boneName.toLowerCase();
  if (/neck|head/.test(n)) return SKIN;
  if (/leg|thigh|shin|foot|knee/.test(n)) return /2|shin|foot|knee|lower/.test(n) ? PANTS.clone().multiplyScalar(0.8) : PANTS;
  if (/arm|hand|shoulder/.test(n)) return /2|fore|hand|lower/.test(n) ? shirt.clone().multiplyScalar(0.85) : shirt;
  return shirt;
}

/**
 * Colors each vertex by the bone that moves it most (head = skin, torso/arms = shirt, legs = pants).
 * Used for rigged models whose texture is missing. Geometry is cloned so each instance can differ.
 */
export function applyAutoColor(root: THREE.Object3D, tint?: THREE.ColorRepresentation) {
  const shirt = tint !== undefined ? new THREE.Color(tint) : DEFAULT_SHIRT;
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.geometry.attributes.skinIndex) return;
    const geo = mesh.geometry.clone();
    const idx = geo.attributes.skinIndex;
    const wgt = geo.attributes.skinWeight;
    const colors = new Float32Array(idx.count * 3);
    for (let v = 0; v < idx.count; v++) {
      let best = 0;
      let bestW = -1;
      for (let k = 0; k < 4; k++) {
        const w = wgt.getComponent(v, k);
        if (w > bestW) {
          bestW = w;
          best = idx.getComponent(v, k);
        }
      }
      const c = partColor(mesh.skeleton.bones[best]?.name ?? "", shirt);
      colors.set([c.r, c.g, c.b], v * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    mesh.geometry = geo;
    mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  });
}
