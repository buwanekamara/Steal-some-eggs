import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { isEquippedId, type BloxityLook, type Proportions } from "@egg/shared";

/**
 * A Bloxity avatar: the shared base body (player.glb) dressed in the player's equipped skin, body parts, hat, hair,
 * mask, back item and accessories, with their body proportions. Its bones use the same names as the game's own
 * character (ArmL1, LegR1, Neck1…), so the game's procedural walk/ragdoll rig drives it unchanged.
 */

const CDN = "https://static.bloxity.io/avatars";
const API = "https://api.bloxity.io";

/** Body-part meshes inside player.glb, and where each slot's replacement lives on the CDN. */
const PARTS = {
  head: { mesh: "default_head", slot: "headId", dir: "head", suffix: "" },
  arm_L: { mesh: "default_arm_L", slot: "armLId", dir: "arms", suffix: "_L" },
  arm_R: { mesh: "default_arm_R", slot: "armRId", dir: "arms", suffix: "_R" },
  leg_L: { mesh: "default_leg_L", slot: "legLId", dir: "legs", suffix: "_L" },
  leg_R: { mesh: "default_leg_R", slot: "legRId", dir: "legs", suffix: "_R" },
  torso: { mesh: "default_torso", slot: "torsoId", dir: "torso", suffix: "" },
} as const;

/** Accessories fixed to one bone: bone and origin in model space. */
const BONE_ACCESSORIES = {
  neck: { slot: "neckId", bone: "Spine2", origin: [0, 4.8, 0] },
  chest: { slot: "chestId", bone: "Spine2", origin: [0, 3.6, 0] },
  waist: { slot: "waistId", bone: "Spine1", origin: [0, 2.4, 0] },
} as const;

/** Accessories worn as a mirrored pair on the limb tips (following bone position + rotation, not scale). */
const PAIR_ACCESSORIES = {
  hand: { slot: "handId", left: "ArmL2_leaf", right: "ArmR2_leaf" },
  shoes: { slot: "shoesId", left: "LegL2_leaf", right: "LegR2_leaf" },
} as const;

/** How far the skinning tweaks below shift body parts sideways (matches the Bloxity customizer). */
const CS = 0.8;

// ------------------------------------------------------------------ asset cache (shared by every avatar)

const cache = new Map<string, Promise<unknown>>();
function cached<T>(url: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = load();
    p.catch(() => cache.delete(url)); // let a failed download be retried later
    cache.set(url, p);
  }
  return p;
}

const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();
const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin("anonymous");

const loadGltf = (url: string) => cached(url, () => gltfLoader.loadAsync(url) as Promise<GLTF>);
const loadObj = (url: string) => cached(url, () => objLoader.loadAsync(url));
function loadTexture(url: string, flipY = true) {
  return cached(`${url}#${flipY}`, async () => {
    const tex = await texLoader.loadAsync(url);
    tex.flipY = flipY;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  });
}

/**
 * Body texture with the worn face, shirt and pants already drawn on:
 * /v1/avatar/skin-texture/s{skin}[_pn{pants}][_sh{shirt}][_fc{face}].png, or the plain skin when none are worn.
 */
export function skinTextureUrl(eq: BloxityLook["eq"]): string {
  const skin = isEquippedId(eq.skinId) ? eq.skinId : "0";
  const segs = [`s${skin}`];
  if (isEquippedId(eq.pantsId)) segs.push(`pn${eq.pantsId}`);
  if (isEquippedId(eq.shirtId)) segs.push(`sh${eq.shirtId}`);
  if (isEquippedId(eq.faceId)) segs.push(`fc${eq.faceId}`);
  return segs.length > 1 ? `${API}/v1/avatar/skin-texture/${segs.join("_")}.png` : `${CDN}/skins/${skin}.png`;
}

interface BoneRest {
  op: THREE.Vector3;
  oq: THREE.Quaternion;
  os: THREE.Vector3;
}

interface Pair {
  obj: THREE.Object3D;
  bone: THREE.Bone;
  /** restInverse(bone) × (mirror) × translate(origin). */
  local: THREE.Matrix4;
  /** +1 left, -1 right. */
  side: number;
  kind: keyof typeof PAIR_ACCESSORIES;
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

export class BloxityCharacter {
  /** Put this where the game's character model goes: feet at y = 0, scaled to the game's character height. */
  readonly root = new THREE.Group();
  /** The body itself (player.glb's scene), for the animation rig. */
  readonly character: THREE.Object3D;
  private props: Proportions;
  private bones = new Map<string, THREE.Bone>();
  private rest = new Map<string, BoneRest>();
  /** Inverse of each bone's rest transform in model space, captured before any animation or proportions. */
  private restInverse = new Map<string, THREE.Matrix4>();
  private neckOffsetBindY = 0;
  private parts = new Map<string, THREE.SkinnedMesh>();
  private skeleton: THREE.Skeleton | null = null;
  private material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 1 });
  private back: THREE.Object3D | null = null;
  private boneAccessories: { obj: THREE.Object3D; restInv: THREE.Matrix4; origin: readonly number[] }[] = [];
  private pairs: Pair[] = [];

  /**
   * Builds a dressed avatar. `height` is the game's character height (the body is scaled to it);
   * `skinUrl` overrides the body texture (the local player passes the SDK's getSkinTextureUrl()).
   */
  static async create(look: BloxityLook, height: number, skinUrl?: string): Promise<BloxityCharacter> {
    const gltf = await loadGltf(`${CDN}/player.glb`);
    const c = new BloxityCharacter(SkeletonUtils.clone(gltf.scene), look.props, height);
    await c.dress(look, skinUrl ?? skinTextureUrl(look.eq));
    c.setProportions(look.props);
    return c;
  }

  private constructor(model: THREE.Object3D, props: Proportions, height: number) {
    this.character = model;
    this.props = { ...props };
    model.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh) return;
      this.skeleton ??= sm.skeleton;
      sm.material = this.material;
      sm.castShadow = true;
      sm.frustumCulled = false; // skinned bounds don't follow the rig
      for (const [slot, def] of Object.entries(PARTS)) if (sm.name.toLowerCase() === def.mesh.toLowerCase()) this.parts.set(slot, sm);
    });
    // Rest pose, before any animation or proportions: bones as plain TRS, plus their model-space inverses.
    model.updateMatrixWorld(true);
    const modelInv = model.matrixWorld.clone().invert();
    for (const bone of this.skeleton?.bones ?? []) {
      const op = new THREE.Vector3();
      const oq = new THREE.Quaternion();
      const os = new THREE.Vector3();
      bone.matrix.decompose(op, oq, os);
      bone.position.copy(op);
      bone.quaternion.copy(oq);
      bone.scale.copy(os);
      bone.matrixAutoUpdate = true;
      this.bones.set(bone.name, bone);
      this.rest.set(bone.name, { op, oq, os });
      this.restInverse.set(bone.name, modelInv.clone().multiply(bone.matrixWorld).invert());
    }
    const skel = this.skeleton;
    if (skel) {
      const i = skel.bones.findIndex((b) => b.name === "Neck_Offset");
      if (i >= 0) this.neckOffsetBindY = skel.boneInverses[i].clone().invert().elements[13];
    }
    const patched = new Set<THREE.Skeleton>();
    model.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh && !patched.has(sm.skeleton)) {
        patched.add(sm.skeleton);
        this.patchSkeleton(sm.skeleton);
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const modelHeight = box.max.y - box.min.y || 6.4;
    this.root.scale.setScalar(height / modelHeight);
    this.root.add(model);
  }

  /**
   * shoulderWidth / torsoScaleX / legOffsetX are applied by editing the skinning matrices, like the Bloxity
   * customizer: this moves the vertices but not the bones (the hand/shoe pairs are shifted to match in update()).
   */
  private patchSkeleton(skel: THREE.Skeleton) {
    const orig = skel.update.bind(skel);
    const bindPos = new Map<string, THREE.Vector3>();
    skel.bones.forEach((b, i) => bindPos.set(b.name, new THREE.Vector3().setFromMatrixPosition(skel.boneInverses[i].clone().invert())));
    const spine1X = bindPos.get("Spine1")?.x ?? 0;
    const above = new Set(["Spine2", "ArmL_Offset", "ArmL1", "ArmL2", "ArmR_Offset", "ArmR1", "ArmR2", "Neck_Offset", "Neck1"]);
    const props = () => this.props;
    skel.update = function (this: THREE.Skeleton) {
      orig();
      const { shoulderWidth: sw, legOffsetX: lox, torsoScaleX: tsx } = props();
      const bm = this.boneMatrices!;
      for (let i = 0; i < this.bones.length; i++) {
        const name = this.bones[i].name;
        const off = i * 16;
        if ((name === "Spine1" || name === "Spine2") && tsx !== 1) {
          bm[off] *= tsx;
          bm[off + 1] *= tsx;
          bm[off + 2] *= tsx;
          bm[off + 3] *= tsx;
        }
        if (above.has(name) && tsx !== 1) {
          const bp = bindPos.get(name);
          if (bp) bm[off + 12] += (bp.x - spine1X) * (tsx - 1) * CS;
        }
        if (sw !== 1 && name.startsWith("Arm")) {
          const refX = bindPos.get(name.startsWith("ArmL") ? "ArmL_Offset" : "ArmR_Offset")?.x ?? 0;
          if (refX) bm[off + 12] += refX * (sw - 1) * CS;
        }
        if (lox !== 1 && name.startsWith("Leg")) {
          const refX = bindPos.get(name.startsWith("LegL") ? "LegL_Offset" : "LegR_Offset")?.x ?? 0;
          if (refX) bm[off + 12] += refX * (lox - 1) * CS;
        }
      }
    };
  }

  /** Loads everything equipped (only real ids: '-1' / '' / 'undefined' keep the default mesh). */
  private async dress(look: BloxityLook, skinUrl: string) {
    const eq = look.eq;
    const jobs: Promise<unknown>[] = [
      loadTexture(skinUrl, false).then((tex) => {
        this.material.map = tex;
        this.material.needsUpdate = true;
      }),
    ];
    for (const [slot, def] of Object.entries(PARTS)) {
      const id = eq[def.slot];
      if (isEquippedId(id)) jobs.push(this.swapPart(slot, `${CDN}/parts/${def.dir}/${id}${def.suffix}.glb`));
    }
    // Hat, hair and mask all sit on the head bone at the same spot.
    for (const slot of ["hatId", "hairId", "maskId"] as const) {
      const id = eq[slot];
      if (isEquippedId(id)) jobs.push(this.item("hats", id).then((obj) => this.attach(obj, "Neck1", 0, 0.8, 0)));
    }
    if (isEquippedId(eq.backId)) {
      jobs.push(
        this.item("back", eq.backId).then((obj) => {
          this.back = obj;
          this.attach(obj, "Spine2", 0, 0, 0);
        }),
      );
    }
    for (const [kind, def] of Object.entries(BONE_ACCESSORIES)) {
      const id = eq[def.slot];
      const bone = this.bones.get(def.bone);
      const restInv = this.restInverse.get(def.bone);
      if (!isEquippedId(id) || !bone || !restInv) continue;
      jobs.push(
        this.item(kind, id).then((obj) => {
          obj.matrixAutoUpdate = false;
          bone.add(obj);
          this.boneAccessories.push({ obj, restInv, origin: def.origin });
        }),
      );
    }
    for (const [kind, def] of Object.entries(PAIR_ACCESSORIES) as [keyof typeof PAIR_ACCESSORIES, (typeof PAIR_ACCESSORIES)[keyof typeof PAIR_ACCESSORIES]][]) {
      const id = eq[def.slot];
      if (!isEquippedId(id)) continue;
      jobs.push(
        this.item(kind, id).then((left) => {
          const right = left.clone();
          // Mirroring flips the triangle winding: render both faces of the copy.
          right.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
            if (mesh.isMesh) (mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
          });
          for (const [obj, boneName, side] of [
            [left, def.left, 1],
            [right, def.right, -1],
          ] as const) {
            const bone = this.bones.get(boneName);
            const restInv = this.restInverse.get(boneName);
            if (!bone || !restInv) continue;
            const local = restInv.clone();
            if (side < 0) local.multiply(_m.makeScale(-1, 1, 1));
            obj.matrixAutoUpdate = false;
            this.root.add(obj); // follows the bone's position and rotation only (see update)
            this.pairs.push({ obj, bone, local, side, kind });
          }
        }),
      );
    }
    await Promise.allSettled(jobs).then((results) => {
      for (const r of results) if (r.status === "rejected") console.warn("[bloxity] avatar asset failed to load", r.reason);
    });
  }

  /** An item mesh + texture from the CDN (hats/hair/masks share the "hats" folders). */
  private async item(folder: string, id: string): Promise<THREE.Object3D> {
    const [obj, tex] = await Promise.all([loadObj(`${CDN}/items/${folder}/${id}.obj`), loadTexture(`${CDN}/textures/${folder}/${id}.png`)]);
    const copy = obj.clone();
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
      mesh.castShadow = true;
    });
    return copy;
  }

  private attach(obj: THREE.Object3D, boneName: string, x: number, y: number, z: number) {
    obj.position.set(x, y, z);
    const bone = this.bones.get(boneName);
    if (bone) bone.add(obj);
    else this.root.add(obj);
  }

  /** Swaps a default body part for an equipped one, remapping its skin weights onto this skeleton. */
  private async swapPart(slot: string, url: string) {
    const target = this.parts.get(slot);
    if (!target) return;
    const gltf = await loadGltf(url);
    let skinned: THREE.SkinnedMesh | null = null;
    let plain: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned ??= o as THREE.SkinnedMesh;
      else if ((o as THREE.Mesh).isMesh) plain ??= o as THREE.Mesh;
    });
    const sm = skinned as THREE.SkinnedMesh | null;
    if (!sm) {
      if (plain) target.geometry = (plain as THREE.Mesh).geometry;
      return;
    }
    const geo = sm.geometry.clone();
    if (this.skeleton && sm.skeleton) {
      const byName = new Map(this.skeleton.bones.map((b, i) => [b.name, i]));
      const remap = new Map<number, number>();
      sm.skeleton.bones.forEach((b, i) => {
        const j = byName.get(b.name);
        if (j !== undefined) remap.set(i, j);
      });
      const si = geo.getAttribute("skinIndex");
      if (si) {
        const arr = si.array as ArrayLike<number> & { [i: number]: number };
        for (let i = 0; i < arr.length; i++) {
          const m = remap.get(arr[i]);
          if (m !== undefined) arr[i] = m;
        }
        si.needsUpdate = true;
      }
    }
    target.geometry = geo;
  }

  /** Height, arm length, head size and neck height move bones (items follow); the rest is in the skinning patch. */
  setProportions(props: Proportions) {
    this.props = { ...props };
    const { height: h, armLength: al, headScale: hs, neckHeight: nh, torsoScaleX: tsx } = props;
    this.character.scale.set(1, h, 1);
    for (const [name, bone] of this.bones) {
      const r = this.rest.get(name)!;
      bone.position.copy(r.op);
      bone.scale.copy(r.os);
      if (name.startsWith("Arm")) bone.scale.y = r.os.y * al;
      if (name === "Neck_Offset") bone.position.y += (h - hs) * r.op.y + this.neckOffsetBindY * (nh - 1) * 0.8;
      if (name === "Neck1") bone.scale.set(r.os.x * hs, r.os.y * (hs / h), r.os.z * hs);
    }
    if (this.back) this.back.scale.x = h;
    // Neck/chest/waist items stretch with the torso width: restInverse × scale(tsx, 1, 1) × translate(origin).
    for (const a of this.boneAccessories) {
      a.obj.matrix
        .copy(a.restInv)
        .multiply(_m.makeScale(tsx, 1, 1))
        .multiply(_m2.makeTranslation(a.origin[0], a.origin[1], a.origin[2]));
      a.obj.matrixWorldNeedsUpdate = true;
    }
  }

  /** Every frame, after the rig has posed the bones: hands and shoes follow their limb tips. */
  update() {
    if (!this.pairs.length) return;
    const { shoulderWidth: sw, torsoScaleX: tsx, legOffsetX: lox } = this.props;
    this.root.updateWorldMatrix(true, false);
    const rootInv = _m2.copy(this.root.matrixWorld).invert();
    for (const pair of this.pairs) {
      pair.bone.updateWorldMatrix(true, false);
      // Bone position and rotation in character space, with scale 1.
      _m.multiplyMatrices(rootInv, pair.bone.matrixWorld).decompose(_p, _q, _s);
      // The skinning patch moved the hands/feet sideways but not their bones: shift the copies to match.
      _p.x += pair.kind === "hand" ? pair.side * CS * (2 * (sw - 1) + 2 * (tsx - 1)) : pair.side * CS * 0.6 * (lox - 1);
      pair.obj.matrix.compose(_p, _q, ONE).multiply(pair.local);
      pair.obj.matrixWorldNeedsUpdate = true;
    }
  }

  dispose() {
    this.root.removeFromParent();
    this.material.dispose();
  }
}
