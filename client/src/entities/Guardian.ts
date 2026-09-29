import * as THREE from "three";
import { sfx } from "../audio/Sfx.ts";
import { Anim, GUARDIANS, GuardianMode, NETWORK, guardianModelId } from "@egg/shared";
import type { ModelLibrary } from "../assets/ModelLibrary.ts";
import { lerpAngle } from "../game/LocalPlayer.ts";
import { TextLabel } from "../ui/labels.ts";
import { ProceduralRig } from "./Avatar.ts";

interface Snap {
  t: number;
  x: number;
  z: number;
  ry: number;
}

/** Limb swing rate (rad/s) gained per unit/s of movement speed. */
const STRIDES_PER_UNIT_SPEED = 0.6;

/** A biome guardian: interpolated server position, walk animation, "ZZ" / "!" over its head. */
export class Guardian {
  readonly root = new THREE.Group();
  /** Where a fetched egg sits (in the beak). */
  readonly carrySlot = new THREE.Group();
  /** -1 until the first update, so the initial mode's label ("Z z") gets drawn. */
  mode: GuardianMode | -1 = -1;
  private body: THREE.Group;
  private rig: ProceduralRig;
  private label: TextLabel;
  private buf: Snap[] = [];
  private last = new THREE.Vector3();
  private time = 0;
  private height = 5.5;
  private hasLegs = true;
  private snoreClock = 2 + Math.random() * 2;
  private stompClock = 0;

  constructor(lib: ModelLibrary, defId: string) {
    const def = GUARDIANS.find((g) => g.id === defId)!;
    this.body = lib.instance(guardianModelId(def));
    this.root.add(this.body);
    this.hasLegs = !!this.body.getObjectByName("LegL1");
    this.rig = new ProceduralRig(this.body.getObjectByName("model")!.children[0]);
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.body, true);
    if (Number.isFinite(box.max.y)) this.height = box.max.y;
    this.carrySlot.position.set(0, this.height * 0.8, this.height * 0.4);
    this.root.add(this.carrySlot);
    this.label = new TextLabel("", { lineHeight: 1.6 });
    this.label.position.y = this.height + 0.6;
    this.root.add(this.label);
  }

  private stunned = false;
  private lastRoarMode: GuardianMode | -1 = -1;

  push(x: number, z: number, ry: number, mode: GuardianMode, stunned = false) {
    this.buf.push({ t: performance.now(), x, z, ry });
    if (this.buf.length > 30) this.buf.shift();
    if (mode !== this.mode || stunned !== this.stunned) {
      this.mode = mode;
      this.stunned = stunned;
      // Waking up / starting the chase: a roar, deeper for bigger guardians.
      if (!stunned && (mode === GuardianMode.Alert || mode === GuardianMode.Chase) && this.lastRoarMode !== GuardianMode.Alert && this.lastRoarMode !== GuardianMode.Chase) {
        sfx.roar(sfx.near(this.root.position.x, this.root.position.z, 110), Math.min(1.6, Math.max(0.55, 6 / this.height)));
      }
      this.lastRoarMode = mode;
      if (stunned) this.label.setLines([{ text: "💫", size: 1.2 }]);
      else if (mode === GuardianMode.Sleep) this.label.setLines([{ text: "Z z", color: "#39c6ff" }]);
      else if (mode === GuardianMode.Alert) this.label.setLines([{ text: "!", color: "#ff3030", size: 1.6 }]);
      else this.label.setLines("");
    }
  }

  update(dt: number) {
    this.time += dt;
    if (this.buf.length) {
      const renderT = performance.now() - NETWORK.interpolationDelayMs;
      let a = this.buf[0];
      let b = this.buf[this.buf.length - 1];
      for (let i = this.buf.length - 1; i > 0; i--) {
        if (this.buf[i - 1].t <= renderT) {
          a = this.buf[i - 1];
          b = this.buf[i];
          break;
        }
      }
      const k = b.t > a.t ? Math.min(1, Math.max(0, (renderT - a.t) / (b.t - a.t))) : 1;
      this.root.position.set(a.x + (b.x - a.x) * k, 0, a.z + (b.z - a.z) * k);
      this.root.rotation.y = lerpAngle(a.ry, b.ry, k);
    }
    const speed = this.root.position.distanceTo(this.last) / Math.max(dt, 1e-3);
    this.last.copy(this.root.position);

    const asleep = this.mode === GuardianMode.Sleep;
    const near = (max: number) => sfx.near(this.root.position.x, this.root.position.z, max);
    if (asleep && !this.stunned) {
      if ((this.snoreClock -= dt) <= 0) {
        this.snoreClock = 3.4 + Math.random();
        sfx.snore(near(70));
      }
    } else if (this.mode === GuardianMode.Chase && speed > 3) {
      // Heavy footfalls, faster the faster it runs.
      if ((this.stompClock -= dt) <= 0) {
        this.stompClock = Math.min(0.6, Math.max(0.22, 9 / speed));
        sfx.stomp(near(80), Math.min(1.5, Math.max(0.6, 6 / this.height)));
      }
    }
    // Stride rate follows the real speed, so a fast late-biome guardian visibly pumps its limbs faster than an early one.
    this.rig.cadence = Math.min(32, 3 + speed * STRIDES_PER_UNIT_SPEED); // capped so very fast strides stay readable at 60 fps
    this.rig.update(dt, speed > 0.5 ? Anim.Run : Anim.Idle, speed);
    // Sleeping: hunkered down and breathing; attacking: a quick peck forward.
    const peck = this.mode === GuardianMode.Attack ? Math.max(0, Math.sin(this.time * 14)) * 0.5 : 0;
    // Legless guardians (the shark) swim along: a quick bob and body wobble while they move.
    const swim = !this.hasLegs && speed > 0.5 && !asleep ? Math.abs(Math.sin(this.time * 9)) * 0.3 : 0;
    this.body.position.y = asleep ? -0.5 + Math.sin(this.time * 1.5) * 0.06 : swim;
    this.body.rotation.z = !this.hasLegs && speed > 0.5 && !asleep ? Math.sin(this.time * 9) * 0.07 : 0;
    this.body.rotation.x = asleep ? 0.12 : peck;
    this.label.position.y = this.height + 0.6 + (asleep ? Math.sin(this.time * 2) * 0.3 : 0);
    this.label.visible = this.stunned || asleep || this.mode === GuardianMode.Alert;
  }

  dispose() {
    this.label.dispose();
    this.root.removeFromParent();
  }
}
