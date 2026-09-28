import * as THREE from "three";
import type { Input } from "./Input.ts";

/**
 * Third-person orbit camera.
 * Desktop: drag with any mouse button to rotate, wheel to zoom.
 * Touch: drag on the right side of the screen to rotate.
 */
export class CameraRig {
  yaw = Math.PI; // looking toward +Z (from the bases toward the corridor)
  pitch = 0.32;
  distance = 14;
  private target = new THREE.Vector3();
  private dragging = false;
  private touchId = -1;
  private last = { x: 0, y: 0 };
  /** Screen-shake strength (units), decays quickly. */
  private shakeAmt = 0;

  /** Jolt the camera (e.g. when a guardian hits you). */
  shake(strength: number) {
    this.shakeAmt = Math.max(this.shakeAmt, strength);
  }

  constructor(readonly camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, input: Input) {
    canvas.addEventListener("mousedown", (e) => {
      this.dragging = true;
      this.last = { x: e.clientX, y: e.clientY };
    });
    addEventListener("mouseup", () => (this.dragging = false));
    addEventListener("mousemove", (e) => {
      if (!this.dragging) return;
      this.rotate(e.clientX - this.last.x, e.clientY - this.last.y);
      this.last = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener(
      "wheel",
      (e) => {
        this.distance = THREE.MathUtils.clamp(this.distance * (1 + Math.sign(e.deltaY) * 0.1), 5, 45);
      },
      { passive: true },
    );

    canvas.addEventListener(
      "touchstart",
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (this.touchId !== -1 || input.isStickArea(t.clientX)) continue;
          this.touchId = t.identifier;
          this.last = { x: t.clientX, y: t.clientY };
        }
      },
      { passive: true },
    );
    canvas.addEventListener(
      "touchmove",
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier !== this.touchId) continue;
          this.rotate((t.clientX - this.last.x) * 1.4, (t.clientY - this.last.y) * 1.4);
          this.last = { x: t.clientX, y: t.clientY };
        }
      },
      { passive: true },
    );
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.touchId) this.touchId = -1;
    };
    canvas.addEventListener("touchend", end);
    canvas.addEventListener("touchcancel", end);
  }

  private rotate(dx: number, dy: number) {
    this.yaw -= dx * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, -0.2, 1.3);
  }

  /** Direction the camera faces on the ground plane (used to make WASD camera-relative). */
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(focus: THREE.Vector3, dt: number) {
    const goal = focus.clone().add(new THREE.Vector3(0, 2.6, 0));
    // Snap on spawn/teleport, otherwise follow smoothly.
    this.target.lerp(goal, this.target.distanceTo(goal) > 20 ? 1 : Math.min(1, dt * 14));
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(this.distance);
    this.camera.position.copy(this.target).add(off);
    if (this.camera.position.y < 0.5) this.camera.position.y = 0.5;
    this.camera.lookAt(this.target);
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.rotation.z += (Math.random() - 0.5) * s * 0.08;
      this.shakeAmt *= Math.exp(-dt * 7);
    }
  }
}
