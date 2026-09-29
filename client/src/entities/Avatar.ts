import * as THREE from "three";
import { Anim, EGG_BY_ID, PET_BY_ID, eggModelId, groundHeightAt, petModelId } from "@egg/shared";
import type { ModelLibrary } from "../assets/ModelLibrary.ts";
import { TextLabel } from "../ui/labels.ts";

/** Shirt colors per base index so players are easy to tell apart. */
export const PLAYER_TINTS = ["#1f7a68", "#2d5bd6", "#c0392b", "#8e44ad", "#d68910", "#17a589", "#d35400", "#2e4053"];

/** Bone / group names tried (in order) for each limb. Covers our rig, Mixamo and common exports. */
const LIMB_NAMES: Record<string, string[]> = {
  legL: ["LegL1", "mixamorigLeftUpLeg", "LeftUpLeg", "thigh_l", "Leg_L", "leftLeg"],
  legR: ["LegR1", "mixamorigRightUpLeg", "RightUpLeg", "thigh_r", "Leg_R", "rightLeg"],
  armL: ["ArmL1", "mixamorigLeftArm", "LeftArm", "upperarm_l", "Arm_L", "leftArm"],
  armR: ["ArmR1", "mixamorigRightArm", "RightArm", "upperarm_r", "Arm_R", "rightArm"],
  head: ["Neck1", "mixamorigHead", "Head", "head", "neck_01"],
};

/** +1 for left-side limbs, -1 for right-side, 0 for the head: sideways splay direction. */
const SIDE: Record<string, number> = { legL: 1, legR: -1, armL: 1, armR: -1, head: 0 };

/** Ragdoll resting pose once landed: [swing, splay] per limb (radians). */
const SPRAWL: Record<string, [number, number]> = {
  armL: [-0.4, 1.35],
  armR: [0.3, 1.2],
  legL: [0.25, 0.45],
  legR: [-0.15, 0.35],
  head: [0.35, 0.25],
};

interface Limb {
  key: string;
  obj: THREE.Object3D;
  rest: THREE.Quaternion;
  /** The character's local X axis (swing forward/back) in the limb parent's space. */
  axisX: THREE.Vector3;
  /** The character's local Z axis (splay sideways) in the limb parent's space. */
  axisZ: THREE.Vector3;
  /** Floppy spring state for the ragdoll: angle, velocity and a wandering target, per axis. */
  flop: { a: [number, number]; v: [number, number]; t: [number, number]; next: number };
}

/** Right-arm swing (rad) while holding an item: negative = forward, ~ chest height. */
const HOLD_ARM = -1.25;
/** Arm swing (rad) with both hands reaching up to the egg carried on the head. */
const CARRY_ARMS = -2.85;
/** Bat swing: seconds, wind-up arm angle (over the shoulder) and follow-through angle (low and forward). */
const SWING_SEC = 0.4;
const SWING_WIND = -2.6;
const SWING_END = -0.25;

const _q = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _wq = new THREE.Quaternion();
const _swingQ = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const UPRIGHT = new THREE.Quaternion();
/** Lying on the back (chest up) / on the face, relative to the character's facing. */
const FACE_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const FACE_DOWN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

export interface RagdollInput {
  /** 0..1 blend from normal animation to floppy limbs. */
  weight: number;
  /** True once the body has hit the ground (limbs settle into a sprawl). */
  landed: boolean;
}

/**
 * Walk/run/jump animation without authored clips: swings limb bones (or placeholder
 * limb groups) around the character's sideways axis. Replaced automatically when the
 * model ships real "Idle"/"Run" clips. Also drives the ragdoll's floppy limbs.
 */
export class ProceduralRig {
  readonly found: string[] = [];
  private limbs: Limb[] = [];
  private phase = 0;
  /** Optional stride rate (rad/s) that replaces the default while running (guardians tie it to their real speed). */
  cadence: number | null = null;
  /** Multiplier on the run stride rate (players run their limbs faster than the default). */
  runRate = 1;
  private amp = 0;
  private air = 0;
  /** Swing angle to hold the right arm at while carrying something (null = arm swings freely), and its 0..1 blend. */
  private holdAngle: number | null = null;
  private hold = 0;

  /** The bone/group of a limb ("armR", …) or null; lets the avatar parent held items to the hand. */
  limbObject(key: string): THREE.Object3D | null {
    return this.limbs.find((l) => l.key === key)?.obj ?? null;
  }

  /** Raise the right arm forward and keep it still while running (angle in radians, negative = forward); null releases it. */
  setHold(angle: number | null) {
    if (angle !== null) this.holdAngle = angle;
    this.holdTarget = angle === null ? 0 : 1;
  }
  private holdTarget = 0;
  /** Both arms up steadying an egg on the head (0..1 blend). Overrides the single-arm hold. */
  private swingT = -1;
  /** How far the arm is from its hold pose right now (rad); the bat is rotated by this so it follows the arm. */
  swingExtra = 0;

  /** Start the bat swing: wind up over the shoulder, slash forward and down, then return to the hold pose. */
  swing() {
    if (this.holdAngle !== null) this.swingT = 0;
  }
  private carry = 0;
  private carryTarget = 0;

  setCarryUp(on: boolean) {
    this.carryTarget = on ? 1 : 0;
  }

  constructor(character: THREE.Object3D) {
    character.updateMatrixWorld(true);
    const charQ = character.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const [key, names] of Object.entries(LIMB_NAMES)) {
      const obj = names.map((n) => character.getObjectByName(n)).find(Boolean);
      if (!obj || !obj.parent) continue;
      const parentQ = obj.parent.getWorldQuaternion(new THREE.Quaternion());
      const toParent = charQ.clone().multiply(parentQ).invert(); // character space → parent space
      this.limbs.push({
        key,
        obj,
        rest: obj.quaternion.clone(),
        axisX: new THREE.Vector3(1, 0, 0).applyQuaternion(toParent).normalize(),
        axisZ: new THREE.Vector3(0, 0, 1).applyQuaternion(toParent).normalize(),
        flop: { a: [0, 0], v: [0, 0], t: [0, 0], next: 0 },
      });
      this.found.push(`${key} → ${obj.name}`);
    }
  }

  get ok() {
    return this.found.length > 0;
  }

  /** Throws every limb in a random direction (call when the ragdoll starts). */
  kick(strength = 1) {
    for (const l of this.limbs) {
      l.flop.v = [(Math.random() - 0.5) * 30 * strength, (Math.random() - 0.3) * 24 * strength * (SIDE[l.key] || 1)];
      l.flop.next = 0;
    }
  }

  update(dt: number, anim: Anim, speed: number, ragdoll?: RagdollInput) {
    const running = anim === Anim.Run;
    const targetAmp = running ? 0.95 : 0.06;
    this.amp += (targetAmp - this.amp) * Math.min(1, dt * 10);
    this.air += ((anim === Anim.Air ? 1 : 0) - this.air) * Math.min(1, dt * 12);
    this.phase += dt * (running ? (this.cadence ?? 4 + speed * 0.28) * this.runRate : 1.6);

    this.hold += (this.holdTarget - this.hold) * Math.min(1, dt * 12);
    this.carry += (this.carryTarget - this.carry) * Math.min(1, dt * 12);
    let swingAngle: number | null = null;
    this.swingExtra = 0;
    if (this.swingT >= 0 && this.holdAngle !== null) {
      this.swingT += dt / SWING_SEC;
      if (this.swingT >= 1) this.swingT = -1;
      else {
        const t = this.swingT;
        const ease = (x: number) => x * x * (3 - 2 * x);
        const H = this.holdAngle;
        swingAngle = t < 0.3 ? H + (SWING_WIND - H) * ease(t / 0.3) : t < 0.55 ? SWING_WIND + (SWING_END - SWING_WIND) * ease((t - 0.3) / 0.25) : SWING_END + (H - SWING_END) * ease((t - 0.55) / 0.45);
        this.swingExtra = swingAngle - H;
      }
    }
    const s = Math.sin(this.phase) * this.amp;
    const walk: Record<string, [number, number]> = {
      legL: [s * (1 - this.air) + 0.5 * this.air, 0],
      legR: [-s * (1 - this.air) - 0.3 * this.air, 0],
      armL: [-s * 0.9 * (1 - this.air) - 2.4 * this.air, 0],
      armR: [s * 0.9 * (1 - this.air) - 2.4 * this.air, 0],
      head: [0, 0],
    };
    const w = ragdoll?.weight ?? 0;
    for (const l of this.limbs) {
      let [sw, sp] = walk[l.key];
      if (l.key === "armR" && this.holdAngle !== null && this.hold > 0.001) {
        // The carrying arm stays raised and still (also in the air); only the other limbs animate.
        sw += (this.holdAngle - sw) * this.hold;
        sp -= sp * this.hold;
      }
      if (l.key === "armR" && swingAngle !== null) {
        sw = swingAngle;
        sp = 0;
      }
      if ((l.key === "armL" || l.key === "armR") && this.carry > 0.001) {
        // Both hands up on the egg, held still while the legs keep running.
        sw += (CARRY_ARMS - sw) * this.carry;
        sp -= sp * this.carry;
      }
      if (w > 0.001) {
        this.flop(l, dt, ragdoll!.landed);
        this.pose(l, sw + (l.flop.a[0] - sw) * w, sp + (l.flop.a[1] - sp) * w);
      } else {
        l.flop.a = [sw, sp];
        l.flop.v = [0, 0];
        this.pose(l, sw, sp);
      }
    }
  }

  /** Damped springs chasing a target that jumps around in the air and settles into a sprawl on the ground. */
  private flop(l: Limb, dt: number, landed: boolean) {
    const f = l.flop;
    const side = SIDE[l.key] || 1;
    f.next -= dt;
    if (landed) {
      const [sw, sp] = SPRAWL[l.key];
      f.t = [sw, sp * side];
    } else if (f.next <= 0) {
      const big = l.key.startsWith("arm") ? 2.6 : l.key === "head" ? 0.7 : 1.4;
      f.t = [(Math.random() - 0.5) * 2 * big, (0.2 + Math.random() * 0.9) * big * side];
      f.next = 0.08 + Math.random() * 0.14;
    }
    // Soft springs (low stiffness, light damping) so limbs overshoot and wobble like rubber.
    const k = landed ? 90 : 55;
    const c = landed ? 9 : 5;
    for (let i = 0; i < 2; i++) {
      f.v[i] += (-k * (f.a[i] - f.t[i]) - c * f.v[i]) * dt;
      f.a[i] += f.v[i] * dt;
    }
  }

  private pose(l: Limb, swing: number, splay: number) {
    _qa.setFromAxisAngle(l.axisX, swing);
    _qb.setFromAxisAngle(l.axisZ, splay);
    _q.copy(_qa).multiply(_qb).multiply(l.rest);
    l.obj.quaternion.copy(_q);
  }
}

/** Clip-based animation for models that include clips (e.g. a GLB with "Idle" and "Run"). */
class ClipRig {
  private mixer: THREE.AnimationMixer;
  private actions: Partial<Record<Anim, THREE.AnimationAction>> = {};
  private current?: THREE.AnimationAction;

  static tryCreate(character: THREE.Object3D): ClipRig | null {
    const clips = character.animations ?? [];
    const find = (re: RegExp) => clips.find((c) => re.test(c.name));
    const idle = find(/idle/i);
    const run = find(/run|walk/i);
    return idle && run ? new ClipRig(character, idle, run, find(/jump|fall|air/i)) : null;
  }

  private constructor(character: THREE.Object3D, idle: THREE.AnimationClip, run: THREE.AnimationClip, air?: THREE.AnimationClip) {
    this.mixer = new THREE.AnimationMixer(character);
    this.actions[Anim.Idle] = this.mixer.clipAction(idle);
    this.actions[Anim.Run] = this.mixer.clipAction(run);
    if (air) this.actions[Anim.Air] = this.mixer.clipAction(air);
  }

  update(dt: number, anim: Anim, speed: number) {
    const next = this.actions[anim] ?? this.actions[Anim.Idle]!;
    if (next !== this.current) {
      next.reset().fadeIn(0.15).play();
      this.current?.fadeOut(0.15);
      this.current = next;
    }
    if (anim === Anim.Run) next.timeScale = Math.max(1.3, speed / 6);
    this.mixer.update(dt);
  }
}

/** A player character: model + animation + floating name tag. */
export class Avatar {
  readonly root = new THREE.Group();
  /** Carried egg attaches here (above and slightly behind the head). */
  readonly carrySlot = new THREE.Group();
  /** Equipped bat/trap attaches here (down by the right hand). */
  readonly handSlot = new THREE.Group();
  private held: THREE.Object3D | null = null;
  /** True when items are parented to the right arm (procedural rig); false = fixed fallback slot. */
  private armHold = false;
  private armBone: THREE.Object3D | null = null;
  /** Orientation the held item should have in character space (bats lean forward a little); applied every frame. */
  private handQ = new THREE.Quaternion();
  private heldTool = "";
  private label: TextLabel;
  private rig: { update(dt: number, anim: Anim, speed: number, ragdoll?: RagdollInput): void; kick?(strength: number): void } | null;
  /** Pivot at the hips, so the knockback tumble spins around the body's middle. */
  private tumble = new THREE.Group();
  private rag = {
    active: false,
    landed: false,
    air: 0,
    /** Seconds since hitting the ground (-1 = not bouncing). */
    bounceT: -1,
    /** 0..1 blend of floppy limbs over the normal animation. */
    weight: 0,
    /** Body orientation and tumble angular velocity (character space, rad/s). */
    q: new THREE.Quaternion(),
    spin: new THREE.Vector3(),
  };

  constructor(
    private lib: ModelLibrary,
    name: string,
    tintIndex: number,
  ) {
    const model = lib.instance("player", { tint: PLAYER_TINTS[tintIndex % PLAYER_TINTS.length] });
    this.tumble.position.y = 1;
    model.position.y = -1;
    this.tumble.add(model);
    this.root.add(this.tumble);
    this.carrySlot.position.set(0, 1.15, 0.2); // 2.15 above the feet (tumble pivot is at y = 1)
    this.tumble.add(this.carrySlot);
    const character = model.getObjectByName("model")!.children[0];
    this.rig = ClipRig.tryCreate(character) ?? new ProceduralRig(character);
    if (this.rig instanceof ProceduralRig) this.rig.runRate = 1.8;
    // Held items ride on the right hand (arm bone), so they follow the raised arm. Models whose arm we can't find
    // fall back to a fixed slot beside the body.
    const arm = this.rig instanceof ProceduralRig ? this.rig.limbObject("armR") : null;
    if (arm) {
      this.armHold = true;
      this.armBone = arm;
      model.updateMatrixWorld(true);
      // Put the slot at the hand: the lowest point of the arm's subtree (bones or meshes) in the rest pose.
      const lowest = new THREE.Vector3(0, Infinity, 0);
      const v = new THREE.Vector3();
      arm.traverse((o) => {
        if (o === arm) return;
        const pts: THREE.Vector3[] = [o.getWorldPosition(v.clone())];
        if ((o as THREE.Mesh).isMesh) {
          const box = new THREE.Box3().setFromObject(o);
          pts.push(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2));
        }
        for (const p of pts) if (p.y < lowest.y) lowest.copy(p);
      });
      if (!isFinite(lowest.y)) arm.getWorldPosition(lowest).y -= 0.6;
      this.handSlot.position.copy(arm.worldToLocal(lowest));
      const sc = arm.getWorldScale(new THREE.Vector3()).divide(this.tumble.getWorldScale(new THREE.Vector3()));
      this.handSlot.scale.set(1 / sc.x, 1 / sc.y, 1 / sc.z); // keep the item's size independent of the model's scale
      arm.add(this.handSlot);
    } else {
      this.handSlot.position.set(-0.65, 0.2, 0.2);
      this.handSlot.rotation.set(2.5, 0, -0.3);
      this.tumble.add(this.handSlot);
    }

    this.label = new TextLabel(name, { lineHeight: 0.45 });
    this.label.position.y = 2.35;
    this.root.add(this.label);
  }

  /** Plays the bat swing on the right arm (no-op unless a tool is held in hand on a rig we can pose). */
  swing() {
    if (this.armHold && this.heldTool.startsWith("bat")) (this.rig as ProceduralRig).swing();
  }

  setName(name: string) {
    this.label.setLines(name);
  }

  /** Swaps the item held in hand (HeldKind); `model` is the egg def id / pet species for those kinds. */
  setHeld(kind: string, model = "") {
    const key = `${kind}:${model}`;
    if (key === this.heldTool) return;
    this.heldTool = key;
    if (this.held) {
      this.held.removeFromParent();
      this.held = null;
    }
    if (kind === "bat" || kind === "trap") {
      this.held = this.lib.instance(kind);
    } else if (kind === "egg") {
      const def = EGG_BY_ID.get(model);
      if (!def) return;
      this.held = this.lib.instance(eggModelId(def));
      this.held.scale.setScalar(0.75);
    } else if (kind === "pet") {
      const def = PET_BY_ID.get(model);
      if (!def) return;
      this.held = this.lib.instance(petModelId(def));
      this.held.scale.setScalar(Math.min(1, 1.1 / def.height)); // carried pets are shrunk to armful size
    }
    if (!this.held) {
      if (this.armHold) (this.rig as ProceduralRig).setHold(null);
      return;
    }
    if (this.armHold) {
      // The slot is re-aligned to the character every frame (see update), so items keep their upright authoring pose.
      this.handQ.setFromAxisAngle(_axisX, kind === "bat" ? 0.15 : 0);
      if (kind === "bat") this.held.position.set(0, 0, 0.35);
      if (kind === "egg" || kind === "pet") this.held.position.set(0, -0.1, 0.45);
      if (kind === "trap") this.held.position.set(0, 0, 0.6);
      (this.rig as ProceduralRig).setHold(HOLD_ARM);
    } else if (kind === "egg" || kind === "pet") {
      // Fallback slot: eggs and pets are carried upright; tools use the hand slot's downward swing.
      this.held.rotation.set(-2.5, 0, 0.3);
    }
    this.handSlot.add(this.held);
  }

  update(dt: number, anim: Anim, speed: number) {
    this.updateRagdoll(dt, anim === Anim.Knocked);
    this.rig?.update(dt, anim, speed, { weight: this.rag.weight, landed: this.rag.landed });
    // A stolen egg rides on the head: both hands go up to it (and the single-hand item is put away meanwhile).
    const carrying = this.carrySlot.children.length > 0;
    if (this.armHold) {
      (this.rig as ProceduralRig).setCarryUp(carrying);
      this.handSlot.visible = !carrying;
    }
    if (this.armBone && this.held) {
      // Keep the held item's world orientation fixed relative to the character, whatever the arm bone's own axes are.
      this.armBone.updateWorldMatrix(true, false);
      this.armBone.getWorldQuaternion(_wq).invert();
      _swingQ.setFromAxisAngle(_axisX, (this.rig as ProceduralRig).swingExtra);
      this.handSlot.quaternion.copy(_wq).multiply(this.tumble.getWorldQuaternion(_q)).multiply(_swingQ).multiply(this.handQ);
    }
    // Lift the name tag above a carried egg; drop it low while lying on the ground.
    this.label.position.y = this.rag.landed ? 1.3 : this.carrySlot.children.length ? 3.6 : 2.35;
  }

  /**
   * Ragdoll (no physics engine): while knocked the body tumbles on a random axis and the rig's
   * limbs flop on springs; on landing it bounces and slumps flat (face up or down, whichever is
   * closer) with limbs sprawled; when the stun ends it gets back up.
   */
  private updateRagdoll(dt: number, knocked: boolean) {
    const r = this.rag;
    const feet = this.root.position;
    if (knocked && !r.active) {
      r.active = true;
      r.landed = false;
      r.air = 0;
      r.bounceT = -1;
      r.spin.set(-(8 + Math.random() * 5), (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 9);
      this.rig?.kick?.(1);
    }
    if (!r.active) return;

    if (knocked) {
      r.air += dt;
      r.weight += (1 - r.weight) * Math.min(1, dt * 14);
      if (!r.landed && r.air > 0.2 && feet.y <= groundHeightAt(feet.x, feet.z) + 0.05) {
        r.landed = true;
        r.bounceT = 0;
        this.rig?.kick?.(0.5); // limbs slap the ground
      }
      if (!r.landed) {
        // Tumble through the air.
        const w = r.spin.length();
        _q.setFromAxisAngle(_axis.copy(r.spin).divideScalar(w || 1), w * dt);
        r.q.multiply(_q);
        r.spin.multiplyScalar(Math.exp(-dt * 0.6));
      } else {
        // Slump flat: lie on the back if the chest points up already, else on the face.
        const up = _axis.set(0, 1, 0).applyQuaternion(r.q);
        r.q.slerp(up.z < 0 ? FACE_UP : FACE_DOWN, Math.min(1, dt * 9));
      }
    } else {
      // Stun over: get back up.
      r.landed = false;
      r.q.slerp(UPRIGHT, Math.min(1, dt * 8));
      r.weight += (0 - r.weight) * Math.min(1, dt * 6);
      if (r.q.angleTo(UPRIGHT) < 0.02 && r.weight < 0.02) {
        r.active = false;
        r.weight = 0;
        r.q.identity();
      }
    }

    // Hip pivot height: 1 when upright/flying, 0.3 when lying, plus a couple of damped bounces on impact.
    const lying = r.landed ? 1 : 0;
    const bounce = r.bounceT >= 0 ? Math.abs(Math.sin(r.bounceT * 11)) * 0.55 * Math.exp(-r.bounceT * 6) : 0;
    if (r.bounceT >= 0) r.bounceT += dt;
    const targetY = 1 - 0.7 * lying + bounce;
    this.tumble.position.y += (targetY - this.tumble.position.y) * Math.min(1, dt * (r.landed ? 18 : 8));
    this.tumble.quaternion.copy(r.q);
  }

  dispose() {
    this.label.dispose();
    this.root.removeFromParent();
  }
}
