import * as THREE from "three";
import {
  Anim,
  MUTATION_BY_ID,
  PET_BY_ID,
  RARITY_COLOR,
  formatShort,
  petDisplayName,
  petModelId,
  petScale,
  type PetDef,
} from "@egg/shared";
import type { ModelLibrary } from "../assets/ModelLibrary.ts";
import { lerpAngle } from "../game/LocalPlayer.ts";
import { TextLabel } from "../ui/labels.ts";
import { ProceduralRig } from "./Avatar.ts";

export interface Bounds {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * A pet in a pen: wanders to random spots (client-side only, not synced), with a
 * reference-style tag: rarity / name / $ per second. Mutations tint the model.
 */
export class PetEntity {
  readonly root = new THREE.Group();
  readonly def: PetDef;
  readonly height: number;
  private rig: ProceduralRig;
  private label: TextLabel;
  private target = new THREE.Vector3();
  private wait = Math.random() * 2;
  private speed = 1.2 + Math.random() * 1.2;
  private moving = false;
  private rainbow: THREE.MeshStandardMaterial[] = [];
  private time = Math.random() * 10;

  constructor(
    lib: ModelLibrary,
    species: string,
    weight: number,
    mutation: string,
    readonly income: number,
    private bounds: Bounds,
  ) {
    this.def = PET_BY_ID.get(species)!;
    const scale = petScale(this.def, weight);
    const model = lib.instance(petModelId(this.def));
    model.scale.setScalar(scale);
    this.root.add(model);
    this.applyMutation(model, mutation);
    this.rig = new ProceduralRig(model.getObjectByName("model")!.children[0]);
    this.height = this.def.height * scale;

    this.label = new TextLabel(
      [
        { text: this.def.rarity, color: RARITY_COLOR[this.def.rarity], size: 0.85 },
        { text: petDisplayName(this.def, mutation), color: mutation ? MUTATION_BY_ID.get(mutation)!.color : "#ffffff" },
        { text: `$${formatShort(income)}/s`, color: "#5dff3a", size: 0.9 },
      ],
      { lineHeight: 0.75 },
    );
    this.label.position.y = this.height + 0.4;
    this.root.add(this.label);

    this.root.position.set(
      bounds.x0 + Math.random() * (bounds.x1 - bounds.x0),
      0,
      bounds.z0 + Math.random() * (bounds.z1 - bounds.z0),
    );
    this.root.rotation.y = Math.random() * Math.PI * 2;
    this.target.copy(this.root.position);
  }

  /** Golden = shiny gold; Rainbow = colors cycling over time. */
  private applyMutation(model: THREE.Object3D, mutation: string) {
    const m = mutation ? MUTATION_BY_ID.get(mutation) : undefined;
    if (!m) return;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      const mat = src.clone();
      if (m.metallic) {
        mat.color.lerp(new THREE.Color(m.color), 0.75);
        mat.metalness = 0.85;
        mat.roughness = 0.25;
        mat.emissive = new THREE.Color(m.color).multiplyScalar(0.15);
      } else {
        mat.emissive = new THREE.Color(m.color);
        mat.emissiveIntensity = 0.35;
        this.rainbow.push(mat);
      }
      mesh.material = mat;
    });
  }

  update(dt: number) {
    this.time += dt;
    const p = this.root.position;
    if (this.moving) {
      const dx = this.target.x - p.x;
      const dz = this.target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.2) {
        this.moving = false;
        this.wait = 1 + Math.random() * 4;
      } else {
        const step = Math.min(d, this.speed * dt);
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        this.root.rotation.y = lerpAngle(this.root.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 6));
      }
    } else if ((this.wait -= dt) <= 0) {
      const b = this.bounds;
      this.target.set(b.x0 + Math.random() * (b.x1 - b.x0), 0, b.z0 + Math.random() * (b.z1 - b.z0));
      this.moving = true;
    }
    this.rig.update(dt, this.moving ? Anim.Run : Anim.Idle, this.speed * 2);
    for (const [i, m] of this.rainbow.entries()) m.emissive.setHSL((this.time * 0.25 + i * 0.13) % 1, 0.9, 0.5);
  }

  /** Name tags are only drawn up close (each one is its own draw call). */
  showLabel(on: boolean) {
    this.label.visible = on;
  }

  dispose() {
    this.label.dispose();
    this.root.removeFromParent();
  }
}
