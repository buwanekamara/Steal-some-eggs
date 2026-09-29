import * as THREE from "three";
import { Callbacks, type Room } from "@colyseus/sdk";
import { MSG, PEN, RARITY_COLOR, formatShort, penBounds, type HatchedMsg, type InventoryMsg } from "@egg/shared";
import type { ModelLibrary } from "../assets/ModelLibrary.ts";
import { sfx } from "../audio/Sfx.ts";
import { PenEggEntity } from "../entities/PenEggEntity.ts";
import { PetEntity } from "../entities/PetEntity.ts";
import type { HatchReveal } from "../ui/HatchReveal.ts";
import type { GrowingEggView, InventoryPanel } from "../ui/InventoryPanel.ts";
import { TextLabel } from "../ui/labels.ts";
import type { Prompts } from "../ui/Prompts.ts";
import type { LocalPlayer } from "./LocalPlayer.ts";

/** Synced pen data on a player (mirrors server PlayerState). */
interface PenPlayerView {
  baseIndex: number;
  money: number;
  penSlots: number;
  pets: Map<string, { species: string; weight: number; mutation: string; income: number }>;
  penEggs: Map<string, { defId: string; size: number; x: number; z: number; growSec: number; readyIn: number }>;
}

interface Pen {
  base: number;
  pets: Map<string, PetEntity>;
  eggs: Map<string, PenEggEntity>;
  /** Where an egg just disappeared (hatched): the new pet pops out right there. */
  lastEggGone?: { pos: THREE.Vector3; at: number };
}

export interface PenContext {
  lib: ModelLibrary;
  scene: THREE.Scene;
  camera: THREE.Camera;
  me: LocalPlayer;
  prompts: Prompts;
  panel: InventoryPanel;
  reveal: HatchReveal;
}

interface Popup {
  label: TextLabel;
  t: number;
}

interface Particle {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  t: number;
}

const POPUP_RANGE = 55;
const _v = new THREE.Vector3();

/**
 * Client side of pens: renders everyone's pets and growing eggs from server state, pets wander,
 * "+$N" pops over pets as they earn, and for your own pen the Plant / Hatch prompts, the inventory
 * panel data and the hatch reveal.
 */
export class PenController {
  private pens = new Map<string, Pen>();
  private room!: Room;
  private mine: PenPlayerView | null = null;
  inv: InventoryMsg | null = null;
  private invAt = 0;
  private popups: Popup[] = [];
  private particles: Particle[] = [];
  private incomeTimer = 0;
  private panelTimer = 0;

  constructor(private ctx: PenContext) {}

  bind(room: Room) {
    this.room = room;
    const cb = Callbacks.get(room);

    cb.onAdd("players", (value, key) => {
      const p = value as PenPlayerView;
      const sessionId = key as string;
      const pen: Pen = { base: p.baseIndex, pets: new Map(), eggs: new Map() };
      this.pens.set(sessionId, pen);
      if (sessionId === room.sessionId) this.mine = p;
      const bounds = penBounds(p.baseIndex, PEN.inset);

      cb.onAdd(p, "pets", (pv, uid) => {
        const pet = new PetEntity(this.ctx.lib, pv.species, pv.weight, pv.mutation, pv.income, bounds);
        const just = pen.lastEggGone;
        if (just && performance.now() - just.at < 2000) {
          pet.root.position.copy(just.pos);
          this.burst(just.pos, RARITY_COLOR[pet.def.rarity]);
        }
        this.ctx.scene.add(pet.root);
        pen.pets.get(uid as string)?.dispose();
        pen.pets.set(uid as string, pet);
      });
      cb.onRemove(p, "pets", (_pv, uid) => {
        pen.pets.get(uid as string)?.dispose();
        pen.pets.delete(uid as string);
      });

      cb.onAdd(p, "penEggs", (ev, uid) => {
        const egg = new PenEggEntity(this.ctx.lib, ev.defId, ev.size, ev.growSec);
        egg.root.position.set(ev.x, 0, ev.z);
        egg.setReadyIn(ev.readyIn);
        this.ctx.scene.add(egg.root);
        pen.eggs.set(uid as string, egg);
        cb.listen(ev, "readyIn", (v: number) => egg.setReadyIn(v));
        if (sessionId === room.sessionId) sfx.drop(); // confirmed planted (server-authoritative, not an optimistic client sound)
      });
      cb.onRemove(p, "penEggs", (_ev, uid) => {
        const egg = pen.eggs.get(uid as string);
        if (egg) pen.lastEggGone = { pos: egg.root.position.clone(), at: performance.now() };
        egg?.dispose();
        pen.eggs.delete(uid as string);
      });
    });

    cb.onRemove("players", (_value, key) => {
      const pen = this.pens.get(key as string);
      pen?.pets.forEach((x) => x.dispose());
      pen?.eggs.forEach((x) => x.dispose());
      this.pens.delete(key as string);
    });

    room.onMessage(MSG.Inventory, (m: InventoryMsg) => {
      this.inv = m;
      this.invAt = performance.now();
      this.refreshPanel();
    });
    room.onMessage(MSG.Hatched, (m: HatchedMsg) => {
      sfx.hatch();
      this.ctx.reveal.show(m);
    });
    // Ask once our handlers exist, so the first inventory isn't missed.
    room.send(MSG.Inventory);
  }

  // ------------------------------------------------------------------ actions (sent to the server)

  hatch(uid: string) {
    this.room.send(MSG.Hatch, uid);
  }
  equip(uid: string, on: boolean) {
    this.room.send(on ? MSG.Equip : MSG.Unequip, uid);
  }
  equipBest() {
    this.room.send(MSG.EquipBest);
  }
  buySlot() {
    this.room.send(MSG.BuySlot);
  }
  devGrow() {
    this.room.send(MSG.DevGrow);
  }

  /** Eggs waiting in the backpack + eggs ready to hatch (for the Egg button badge). */
  get attention() {
    const own = this.pens.get(this.room?.sessionId);
    const ready = own ? [...own.eggs.values()].filter((e) => e.ready).length : 0;
    return (this.inv?.eggs.length ?? 0) + ready;
  }

  get readyEggs() {
    const own = this.pens.get(this.room?.sessionId);
    return own ? [...own.eggs.values()].filter((e) => e.ready).length : 0;
  }

  /** Seconds left on the x2 Speed boost, counted down locally since the last inventory. */
  get boostLeft() {
    if (!this.inv?.boostLeft) return 0;
    return Math.max(0, Math.ceil(this.inv.boostLeft - (performance.now() - this.invAt) / 1000));
  }

  /** Seconds until the free chest is claimable again, counted down locally since the last inventory. */
  get chestReadyIn() {
    if (!this.inv?.chestReadyIn) return 0;
    return Math.max(0, Math.ceil(this.inv.chestReadyIn - (performance.now() - this.invAt) / 1000));
  }

  get usedSlots() {
    return this.mine ? this.mine.pets.size + this.mine.penEggs.size : 0;
  }

  // ------------------------------------------------------------------ per frame

  update(dt: number) {
    for (const pen of this.pens.values()) {
      pen.pets.forEach((p) => p.update(dt));
      pen.eggs.forEach((e) => e.update(dt));
    }
    this.updatePopups(dt);
    this.updateParticles(dt);
    this.offerPrompts();

    this.panelTimer += dt;
    if (this.panelTimer > 0.5) this.refreshPanel();
  }

  refreshPanel() {
    this.panelTimer = 0;
    const m = this.mine;
    if (!m) return;
    const growing: GrowingEggView[] = [...m.penEggs.entries()].map(([uid, e]) => {
      const entity = this.pens.get(this.room.sessionId)?.eggs.get(uid);
      return { uid, defId: e.defId, readyIn: entity && entity.ready ? 0 : e.readyIn, growSec: e.growSec };
    });
    this.ctx.panel.update({ inv: this.inv, growing, slots: m.penSlots, money: m.money });
  }

  /** Hatch prompt (hold E) for ready eggs standing nearby. Placing an egg is: hold it from the hotbar, then Use (F) in your pen. */
  private offerPrompts() {
    const { me, prompts } = this.ctx;
    const m = this.mine;
    const own = this.pens.get(this.room?.sessionId);
    if (!m || !own || me.stun > 0) return;

    for (const [uid, egg] of own.eggs) {
      if (!egg.ready) continue;
      const dist = Math.hypot(egg.root.position.x - me.pos.x, egg.root.position.z - me.pos.z);
      if (dist > 3 + egg.height * 0.6) continue;
      prompts.offer({
        key: `hatch:${uid}`,
        title: `${egg.def.name}`,
        titleColor: RARITY_COLOR[egg.def.rarity],
        action: "Hatch!",
        at: egg.root.position.clone().setY(egg.height + 0.6),
        dist,
        holdSec: 0.35,
        onComplete: () => this.hatch(uid),
      });
    }
  }

  // ------------------------------------------------------------------ effects

  /** "+$N" over every earning pet near the camera, once a second (matches the server's payout tick). */
  private updatePopups(dt: number) {
    this.incomeTimer += dt;
    if (this.incomeTimer >= 1) {
      this.incomeTimer -= 1;
      const cam = this.ctx.camera.position;
      let budget = 24;
      for (const pen of this.pens.values()) {
        for (const pet of pen.pets.values()) {
          if (budget <= 0) break;
          if (pet.root.position.distanceTo(cam) > POPUP_RANGE) continue;
          budget--;
          const label = new TextLabel([{ text: `+$${formatShort(pet.income)}`, color: "#5dff3a" }], { lineHeight: 0.55 });
          // Start just above the pet's 3-line tag so they don't overlap.
          label.position.copy(pet.root.position).add(_v.set((Math.random() - 0.5) * 0.8, pet.height + 3.1, 0));
          this.ctx.scene.add(label);
          this.popups.push({ label, t: 0 });
        }
      }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      p.label.position.y += dt * 1.2;
      (p.label.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - Math.max(0, p.t - 0.6) / 0.5);
      if (p.t > 1.1) {
        p.label.dispose();
        p.label.removeFromParent();
        this.popups.splice(i, 1);
      }
    }
  }

  /** Confetti burst when a pet pops out of its egg. */
  private burst(at: THREE.Vector3, color: string) {
    const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    const colors = [color, "#ffffff", "#ffe066"];
    for (let i = 0; i < 28; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % 3], transparent: true }));
      mesh.position.copy(at).setY(1);
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 5;
      this.particles.push({ mesh, v: new THREE.Vector3(Math.cos(a) * s, 6 + Math.random() * 6, Math.sin(a) * s), t: 0 });
      this.ctx.scene.add(mesh);
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      p.v.y -= 20 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 6;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - p.t / 1.2);
      if (p.t > 1.2) {
        p.mesh.removeFromParent();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }
  }
}
