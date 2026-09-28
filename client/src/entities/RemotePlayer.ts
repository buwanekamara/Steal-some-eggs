import { Anim, NETWORK } from "@egg/shared";
import type { ModelLibrary } from "../assets/ModelLibrary.ts";
import { lerpAngle } from "../game/LocalPlayer.ts";
import { Avatar } from "./Avatar.ts";

interface Snapshot {
  t: number;
  x: number;
  y: number;
  z: number;
  ry: number;
  anim: Anim;
}

/** Another player: renders ~100 ms in the past, interpolating between server updates. */
export class RemotePlayer {
  readonly avatar: Avatar;
  private buf: Snapshot[] = [];
  private lastX = 0;
  private lastZ = 0;

  constructor(lib: ModelLibrary, name: string, baseIndex: number) {
    this.avatar = new Avatar(lib, name, baseIndex);
  }

  push(s: Omit<Snapshot, "t">) {
    this.buf.push({ ...s, t: performance.now() });
    if (this.buf.length > 30) this.buf.shift();
  }

  update(dt: number) {
    if (!this.buf.length) return;
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
    const span = b.t - a.t;
    const k = span > 0 ? Math.min(1, Math.max(0, (renderT - a.t) / span)) : 1;
    const root = this.avatar.root;
    root.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    root.rotation.y = lerpAngle(a.ry, b.ry, k);

    const moved = Math.hypot(root.position.x - this.lastX, root.position.z - this.lastZ);
    this.lastX = root.position.x;
    this.lastZ = root.position.z;
    this.avatar.update(dt, k < 1 ? a.anim : b.anim, dt > 0 ? moved / dt : 0);
  }

  dispose() {
    this.avatar.dispose();
  }
}
