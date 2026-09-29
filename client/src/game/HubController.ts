import * as THREE from "three";
import {
  HUB_BUILDINGS,
  MSG,
  PEN_LEVELS,
  TREADMILL,
  USE_RANGE,
  basePlot,
  formatShort,
  treadmillLevel,
  useSpot,
} from "@egg/shared";
import type { Room } from "@colyseus/sdk";
import type { Menus } from "../ui/Menus.ts";
import type { Prompts } from "../ui/Prompts.ts";
import type { LocalPlayer } from "./LocalPlayer.ts";
import type { PenController } from "./PenController.ts";

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface Me {
  baseIndex: number;
  money: number;
  treadmillLevel: number;
  penLevel: number;
}

/**
 * Hold-E prompts at hub places: your two Upgrade signs (buy directly), and the SELL stall,
 * Fuse Machine and Trails Shop (open their menus).
 */
export class HubController {
  private room!: Room;

  constructor(
    private me: LocalPlayer,
    private prompts: Prompts,
    private menus: Menus,
    private pen: PenController,
  ) {}

  bind(room: Room) {
    this.room = room;
  }

  update(view: Me | null, potionAvailable = false) {
    if (!view || this.me.stun > 0 || this.me.pos.z > 0) return;
    const plot = basePlot(view.baseIndex);
    const here = this.me.pos;
    const d = (x: number, z: number) => Math.hypot(here.x - x, here.z - z);

    if (potionAvailable) {
      const s = useSpot(HUB_BUILDINGS.potion);
      const dist = d(s.x, s.z);
      if (dist < USE_RANGE - 1) {
        this.prompts.offer({
          key: "claim:potion",
          title: "Potion",
          titleColor: "#5dff3a",
          action: "Claim (x2 Speed)",
          at: new THREE.Vector3(s.x, 3, s.z),
          dist,
          holdSec: 0.25,
          onComplete: () => this.room.send(MSG.ClaimPotion),
        });
      }
    }

    // Treadmill upgrade — also offered while running on the treadmill (E doesn't knock you off).
    const tDist = d(plot.treadmillSign.x, plot.treadmillSign.z);
    if (tDist < USE_RANGE - 0.5) {
      const max = view.treadmillLevel >= TREADMILL.levels.length;
      const next = max ? null : treadmillLevel(view.treadmillLevel + 1);
      this.prompts.offer({
        key: "up:treadmill",
        title: max ? "Treadmill maxed!" : `Level ${view.treadmillLevel} > ${next!.level} · $${formatShort(next!.cost)}`,
        titleColor: max || view.money >= next!.cost ? "#5dff3a" : "#ff6b6b",
        action: max ? "MAX" : "Upgrade",
        at: new THREE.Vector3(plot.treadmillSign.x, 3.3, plot.treadmillSign.z),
        dist: tDist,
        holdSec: 0.4,
        onComplete: () => !max && this.room.send(MSG.UpgradeTreadmill),
      });
    }

    if (this.me.onTreadmill) return;

    // Pen upgrade.
    const pDist = d(plot.penSign.x, plot.penSign.z);
    if (pDist < USE_RANGE - 1) {
      const next = PEN_LEVELS[view.penLevel];
      this.prompts.offer({
        key: "up:pen",
        title: next ? `${next.name} · $${formatShort(next.cost)}` : "Pen maxed!",
        titleColor: !next || view.money >= next.cost ? "#5dff3a" : "#ff6b6b",
        action: next ? "Upgrade Pen" : "MAX",
        at: new THREE.Vector3(plot.penSign.x, 3.3, plot.penSign.z),
        dist: pDist,
        holdSec: 0.4,
        onComplete: () => next && this.room.send(MSG.UpgradePen),
      });
    }

    // Free chest: per-player cooldown (shown via the pen's inventory snapshot).
    {
      const s = useSpot(HUB_BUILDINGS.chest);
      const dist = d(s.x, s.z);
      const readyIn = this.pen.chestReadyIn;
      if (dist < USE_RANGE - 1) {
        this.prompts.offer({
          key: "claim:chest",
          title: readyIn <= 0 ? "Free Chest" : `Free Chest · ${formatDuration(readyIn)}`,
          titleColor: readyIn <= 0 ? "#5dff3a" : "#ff6b6b",
          action: readyIn <= 0 ? "Open" : "Not yet",
          at: new THREE.Vector3(s.x, 3, s.z),
          dist,
          holdSec: 0.25,
          onComplete: () => readyIn <= 0 && this.room.send(MSG.ClaimChest),
        });
      }
    }

    // Stalls and machines open their menus.
    for (const [b, title, action, open] of [
      [HUB_BUILDINGS.sell, "SELL", "Sell Pets & Eggs", "sell"],
      [HUB_BUILDINGS.fuse, "Fuse Machine", "Fuse Pets", "fuse"],
      [HUB_BUILDINGS.trails, "Trails Shop", "Browse Trails", "trails"],
    ] as const) {
      const s = useSpot(b);
      const dist = d(s.x, s.z);
      if (dist > USE_RANGE - 1) continue;
      this.prompts.offer({
        key: `open:${open}`,
        title,
        action,
        at: new THREE.Vector3(s.x, 3, s.z),
        dist,
        holdSec: 0.25,
        onComplete: () => this.menus.open(open),
      });
    }
  }
}
