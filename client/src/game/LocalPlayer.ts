import * as THREE from "three";
import {
  Anim,
  MOVEMENT,
  basePlot,
  clampToWorld,
  SAFE_ZONE_Z,
  groundHeightAt,
  treadmillDeckAt,
  walkSpeedFromStat,
  biomeSpeedMult,
} from "@egg/shared";
import type { CameraRig } from "./CameraRig.ts";
import type { Input } from "./Input.ts";

const _fwd = new THREE.Vector3();
/** Getting off the treadmill: a short hop that clears the deck (~3.5 units). */
const HOP_SPEED = 9;
const HOP_TIME = 0.4;

/** The player you control. Moves instantly on this client; the server validates. */
export class LocalPlayer {
  readonly pos = new THREE.Vector3();
  ry = 0;
  anim: Anim = Anim.Idle;
  /** Current horizontal speed (for animation playback rate). */
  speed = 0;
  /** True while the night wall is up: nothing past the safe-zone line is reachable. */
  nightLock = false;
  speedStat = 0;
  slowMode = false;
  /** Movement multiplier from the equipped trail. */
  trailMult = 1;
  /** Your own base; only your own treadmill auto-runs. */
  homeBase = -1;
  /** True while locked onto your treadmill, running automatically. */
  onTreadmill = false;
  private velY = 0;
  private grounded = true;
  /** Exit is armed once the keys used to walk onto the belt have been released. */
  private exitArmed = false;
  /** After getting off, the belt won't grab you again until you've left it. */
  private mustLeaveBelt = false;
  /** Horizontal push while hopping off the treadmill (units/s) and how long it lasts. */
  private hop = { x: 0, z: 0, t: 0 };
  /** Guardian hit: flying velocity and remaining stun (no control) in seconds. */
  private knockV = { x: 0, z: 0 };
  stun = 0;

  /** Server says a guardian hit us: fly off and lose control for a moment. */
  knock(vx: number, vy: number, vz: number, stunMs: number) {
    this.onTreadmill = false;
    this.hop.t = 0;
    this.knockV = { x: vx, z: vz };
    this.velY = vy;
    this.grounded = false;
    this.stun = stunMs / 1000;
  }

  update(dt: number, input: Input, cam: CameraRig) {
    const stunned = this.stun > 0;
    if (stunned) this.stun -= dt;
    const f = cam.forward(_fwd);
    const rx = -f.z;
    const rz = f.x;
    const mx = stunned ? 0 : input.move.x;
    const my = stunned ? 0 : input.move.y;
    const jump = !stunned && input.jump;
    let dx = f.x * my + rx * mx;
    let dz = f.z * my + rz * mx;
    const len = Math.hypot(dx, dz);
    const walk = walkSpeedFromStat(this.speedStat, this.slowMode, this.trailMult) * biomeSpeedMult(this.pos.z);
    const pressing = len > 0.3 || jump;

    // Knockback flight: fast in the air, skids to a stop on the ground.
    if (this.knockV.x || this.knockV.z) {
      this.pos.x += this.knockV.x * dt;
      this.pos.z += this.knockV.z * dt;
      const drag = Math.exp(-dt * (this.grounded ? 7 : 0.8));
      this.knockV.x *= drag;
      this.knockV.z *= drag;
      if (Math.hypot(this.knockV.x, this.knockV.z) < 0.3) this.knockV = { x: 0, z: 0 };
    }

    if (this.onTreadmill) {
      if (!pressing) this.exitArmed = true;
      if (!this.exitArmed || !pressing) {
        this.runOnTreadmill(dt);
        return;
      }
      // Movement key → hop off that way; Space → jump off the back.
      this.onTreadmill = false;
      this.mustLeaveBelt = true;
      const [hx, hz] = len > 0.3 ? [dx / len, dz / len] : [0, -1];
      this.hop = { x: hx * HOP_SPEED, z: hz * HOP_SPEED, t: HOP_TIME };
      this.velY = MOVEMENT.jumpVelocity * 0.6;
      this.grounded = false;
      this.ry = Math.atan2(hx, hz);
    }

    if (this.hop.t > 0) {
      this.hop.t -= dt;
      this.pos.x += this.hop.x * dt;
      this.pos.z += this.hop.z * dt;
    }

    if (len > 0.01) {
      dx /= Math.max(1, len);
      dz /= Math.max(1, len);
      this.pos.x += dx * walk * dt;
      this.pos.z += dz * walk * dt;
      this.ry = lerpAngle(this.ry, Math.atan2(dx, dz), Math.min(1, dt * 14));
    }
    this.speed = len > 0.01 ? walk * Math.min(1, len) : 0;

    if (jump && this.grounded && this.hop.t <= 0) {
      this.velY = MOVEMENT.jumpVelocity;
      this.grounded = false;
    }
    this.velY -= MOVEMENT.gravity * dt;
    this.pos.y += this.velY * dt;

    const c = clampToWorld(this.pos.x, this.pos.z);
    this.pos.x = c.x;
    this.pos.z = c.z;
    // Night wall: the server refuses any position past the safe-zone line, so stop here instead of walking into it and
    // being dragged back over and over.
    if (this.nightLock && this.pos.z > SAFE_ZONE_Z - 0.1) this.pos.z = SAFE_ZONE_Z - 0.1;

    // Land on the ground or a raised treadmill deck (small ledges are stepped up automatically).
    const ground = groundHeightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.velY = 0;
      this.grounded = true;
    } else if (this.grounded && this.pos.y - ground < 0.7 && this.velY <= 0) {
      // Stepped off a low ledge (the treadmill deck): step down instead of "falling".
      this.pos.y = ground;
      this.velY = 0;
    } else {
      this.grounded = false;
    }

    this.anim = stunned ? Anim.Knocked : !this.grounded ? Anim.Air : this.speed > 0 ? Anim.Run : Anim.Idle;

    // Stepping anywhere onto your own treadmill locks you on and starts auto-running.
    const onOwnDeck = this.homeBase >= 0 && treadmillDeckAt(this.pos.x, this.pos.z) === this.homeBase && this.pos.y > 0.3;
    if (!onOwnDeck) this.mustLeaveBelt = false;
    else if (this.grounded && !this.mustLeaveBelt) {
      this.onTreadmill = true;
      this.exitArmed = false;
    }
  }

  /** Auto-run: glide to the middle of the belt, face forward, run in place. */
  private runOnTreadmill(dt: number) {
    const t = basePlot(this.homeBase).treadmill;
    const k = Math.min(1, dt * 6);
    this.pos.x += (t.x - this.pos.x) * k;
    this.pos.z += (t.z - this.pos.z) * k;
    this.pos.y = groundHeightAt(this.pos.x, this.pos.z);
    this.velY = 0;
    this.grounded = true;
    this.ry = lerpAngle(this.ry, basePlot(this.homeBase).rotY, Math.min(1, dt * 10)); // face along the belt
    this.speed = walkSpeedFromStat(this.speedStat, this.slowMode, this.trailMult);
    this.anim = Anim.Run;
  }

  /** Server rejected our position: snap to where it says we are. */
  snapTo(x: number, y: number, z: number) {
    this.pos.set(x, y, z);
    this.velY = 0;
    this.onTreadmill = false;
    this.hop.t = 0;
    this.knockV = { x: 0, z: 0 };
  }
}

export function lerpAngle(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
