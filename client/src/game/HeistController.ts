import * as THREE from "three";
import { Callbacks, type Room } from "@colyseus/sdk";
import {
  EGG_BY_ID,
  EGG_RULES,
  EggStatus,
  GUARDIANS,
  GuardianMode,
  MSG,
  RARITY_COLOR,
  SAFE_ZONE_Z,
  biomeAt,
  type KnockMsg,
  type NotifyMsg,
  type SecuredMsg,
} from "@egg/shared";
import type { ModelLibrary } from "../assets/ModelLibrary.ts";
import { sfx } from "../audio/Sfx.ts";
import type { Avatar } from "../entities/Avatar.ts";
import { EggEntity } from "../entities/EggEntity.ts";
import { Guardian } from "../entities/Guardian.ts";
import type { HeistHud } from "../ui/HeistHud.ts";
import type { Hud } from "../ui/Hud.ts";
import type { Prompts } from "../ui/Prompts.ts";
import type { Input } from "./Input.ts";
import type { LocalPlayer } from "./LocalPlayer.ts";

/** Synced egg (mirrors server EggState). */
interface EggView {
  defId: string;
  size: number;
  state: EggStatus;
  carrier: string;
  x: number;
  y: number;
  z: number;
}

/** Synced guardian (mirrors server GuardianState). */
interface GuardianView {
  defId: string;
  x: number;
  z: number;
  ry: number;
  mode: GuardianMode;
  target: string;
}

export interface HeistContext {
  lib: ModelLibrary;
  scene: THREE.Scene;
  camera: THREE.Camera;
  me: LocalPlayer;
  input: Input;
  hud: Hud;
  heistHud: HeistHud;
  prompts: Prompts;
  /** Avatar for a session id (yours or a remote player's). */
  avatarOf(sessionId: string): Avatar | undefined;
  /** Camera jolt when you get hit. */
  shake(strength: number): void;
}

const _v = new THREE.Vector3();

/**
 * Client side of the egg heist: renders eggs/guardians from server state, runs the
 * hold-E steal prompt, carrying mode (RUN!!), knockback, and the related sounds and toasts.
 */
export class HeistController {
  private eggs = new Map<string, { entity: EggEntity; view: EggView }>();
  private guardians = new Map<string, { entity: Guardian; view: GuardianView }>();
  private traps = new Map<string, THREE.Object3D>();
  private room!: Room;
  private lastBiome: string | null | undefined = undefined;
  /** My carried egg id (from my PlayerState.carrying). */
  carrying = "";

  constructor(private ctx: HeistContext) {
    ctx.heistHud.onDrop = () => {
      if (!this.carrying) return;
      this.room.send(MSG.Drop);
      sfx.drop();
    };
  }

  bind(room: Room) {
    this.room = room;
    const cb = Callbacks.get(room);

    cb.onAdd("eggs", (value, key) => {
      const view = value as EggView;
      const entity = new EggEntity(this.ctx.lib, view.defId, view.size);
      entity.status = view.state;
      entity.target.set(view.x, view.y, view.z);
      entity.root.position.copy(entity.target);
      this.ctx.scene.add(entity.root);
      this.eggs.set(key as string, { entity, view });
      cb.onChange(view, () => {
        entity.status = view.state;
        entity.target.set(view.x, view.y, view.z);
      });
    });
    cb.onRemove("eggs", (_value, key) => {
      this.eggs.get(key as string)?.entity.dispose();
      this.eggs.delete(key as string);
    });

    cb.onAdd("guardians", (value, key) => {
      const view = value as GuardianView;
      const entity = new Guardian(this.ctx.lib, view.defId);
      entity.push(view.x, view.z, view.ry, view.mode);
      entity.root.position.set(view.x, 0, view.z);
      this.ctx.scene.add(entity.root);
      this.guardians.set(key as string, { entity, view });
      let lastMode = view.mode;
      cb.onChange(view, () => {
        entity.push(view.x, view.z, view.ry, view.mode);
        if (view.mode === GuardianMode.Alert && lastMode !== GuardianMode.Alert && view.target === room.sessionId) sfx.alarm();
        lastMode = view.mode;
      });
    });

    cb.onAdd("traps", (value, key) => {
      const view = value as { x: number; z: number };
      const obj = this.ctx.lib.instance("trap");
      obj.position.set(view.x, 0, view.z);
      this.ctx.scene.add(obj);
      this.traps.set(key as string, obj);
    });
    cb.onRemove("traps", (_value, key) => {
      this.traps.get(key as string)?.removeFromParent();
      this.traps.delete(key as string);
    });

    room.onMessage(MSG.Knock, (m: KnockMsg) => {
      this.ctx.me.knock(m.vx, m.vy, m.vz, m.stunMs);
      this.ctx.shake(1.2);
      sfx.hit();
      const eggPart = m.droppedEgg ? " You dropped your egg." : "";
      const text =
        m.kind === "trap"
          ? (m.by ? `Caught in ${m.by}'s trap!` : "Caught in a trap!") + eggPart
          : m.by
            ? `${m.by} bapped you with a bat!${eggPart}`
            : "You got caught and dropped the egg!";
      this.ctx.heistHud.toast(text, "bad");
    });
    room.onMessage(MSG.Secured, (m: SecuredMsg) => {
      const def = EGG_BY_ID.get(m.defId);
      sfx.secured();
      this.ctx.heistHud.toast(`${def?.name ?? "Egg"} secured! You have ${m.total} egg${m.total === 1 ? "" : "s"}.`, "good", 3500);
    });
    room.onMessage(MSG.Notify, (m: NotifyMsg) => {
      if (m.kind === "bad") sfx.deny();
      this.ctx.heistHud.toast(m.text, m.kind);
    });
  }

  update(dt: number) {
    const { me, heistHud } = this.ctx;

    for (const { entity, view } of this.eggs.values()) {
      let slot: THREE.Object3D | undefined;
      if (view.state === EggStatus.Carried) slot = this.ctx.avatarOf(view.carrier)?.carrySlot;
      else if (view.state === EggStatus.WithGuardian) slot = this.guardianFor(view.defId)?.carrySlot;
      if (slot) entity.attach(slot);
      else if (entity.root.parent !== this.ctx.scene) {
        entity.attach(this.ctx.scene);
        entity.root.position.copy(entity.target);
      }
      entity.update(dt, !!slot);
    }
    for (const { entity } of this.guardians.values()) entity.update(dt);

    this.updateCarrying();
    this.updatePrompt();

    // Biome name banner when crossing into a new biome.
    const biome = biomeAt(me.pos.z);
    const id = biome?.id ?? null;
    if (id !== this.lastBiome) {
      if (biome && this.lastBiome !== undefined) heistHud.showBiome(biome.name, biome.emoji, biome.wallTop);
      this.lastBiome = id;
    }
  }

  private guardianFor(defId: string): Guardian | undefined {
    const biome = EGG_BY_ID.get(defId)?.biome;
    const g = GUARDIANS.find((d) => d.biome === biome);
    return g ? this.guardians.get(g.id)?.entity : undefined;
  }

  /** RUN!! mode while I carry an egg, with the nearest chasing guardian's distance. */
  private updateCarrying() {
    const { me, heistHud } = this.ctx;
    if (!this.carrying) return heistHud.setCarrying(false);
    let nearest = Infinity;
    for (const { view, entity } of this.guardians.values()) {
      if (view.target !== this.room.sessionId) continue;
      nearest = Math.min(nearest, entity.root.position.distanceTo(_v.set(me.pos.x, 0, me.pos.z)));
    }
    const toSafety = Math.max(0, me.pos.z - SAFE_ZONE_Z);
    const sub = Number.isFinite(nearest)
      ? `Guardian ${Math.round(nearest)}m behind · Safe zone ${Math.round(toSafety)}m`
      : `Get back past the SAFE ZONE! (${Math.round(toSafety)}m)`;
    heistHud.setCarrying(true, sub, Number.isFinite(nearest) ? Math.max(0, 1 - nearest / 25) : 0);
  }

  /** Offers "Egg — Steal" on every reachable egg; the shared prompt shows the nearest (hold E). */
  private updatePrompt() {
    const { me, prompts } = this.ctx;
    if (this.carrying || me.stun > 0 || me.onTreadmill) return;
    for (const [id, { entity, view }] of this.eggs) {
      if (view.state !== EggStatus.InNest && view.state !== EggStatus.Loose) continue;
      const dist = Math.hypot(view.x - me.pos.x, view.z - me.pos.z);
      if (dist >= EGG_RULES.stealRange - 0.8) continue;
      const at = entity.root.getWorldPosition(new THREE.Vector3());
      at.y += entity.height * 1.2 + 0.4;
      prompts.offer({
        key: id,
        title: entity.def.name,
        titleColor: RARITY_COLOR[entity.def.rarity],
        action: view.state === EggStatus.Loose ? "Grab" : "Steal",
        at,
        dist,
        holdSec: EGG_RULES.stealHoldSec,
        onComplete: () => {
          this.room.send(MSG.Steal, id);
          sfx.steal();
        },
      });
    }
  }
}
