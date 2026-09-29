import * as THREE from "three";
import { Callbacks, Client, type Room } from "@colyseus/sdk";
import {
  CLOSE,
  MSG,
  NETWORK,
  ROOM_NAME,
  basePlot,
  trailMult,
  walkSpeedFromStat,
  type HatchedMsg,
  type CorrectMsg,
  type JoinOptions,
  type MoveMsg,
} from "@egg/shared";
import type { ModelLibrary } from "../assets/ModelLibrary.ts";
import { Avatar } from "../entities/Avatar.ts";
import { RemotePlayer } from "../entities/RemotePlayer.ts";
import { TrailRibbon } from "../entities/TrailRibbon.ts";
import { FloatingNumbers } from "../ui/FloatingNumbers.ts";
import { HatchReveal } from "../ui/HatchReveal.ts";
import { HeistHud } from "../ui/HeistHud.ts";
import { Hud } from "../ui/Hud.ts";
import { InventoryPanel } from "../ui/InventoryPanel.ts";
import { Menus } from "../ui/Menus.ts";
import { closeOpenModal } from "../ui/Modal.ts";
import { Prompts } from "../ui/Prompts.ts";
import { World } from "../world/World.ts";
import { CameraRig } from "./CameraRig.ts";
import { HeistController } from "./HeistController.ts";
import { HubController } from "./HubController.ts";
import { PenController } from "./PenController.ts";
import { getProfileId } from "./identity.ts";
import { Input } from "./Input.ts";
import { LocalPlayer } from "./LocalPlayer.ts";

/** Shape of the synced player state (mirrors server/src/schema/GameState.ts). */
interface PlayerView {
  name: string;
  baseIndex: number;
  x: number;
  y: number;
  z: number;
  ry: number;
  anim: number;
  speedStat: number;
  money: number;
  treadmillLevel: number;
  training: boolean;
  slowMode: boolean;
  carrying: string;
  eggCount: number;
  income: number;
  penLevel: number;
  trail: string;
  offlineEarnings: number;
  equipped: string;
  trapsAvailable: number;
  equippedEggUid: string;
  equippedEggDefId: string;
}

interface StateView {
  nightIn: number;
  potionIn: number;
  isNight: boolean;
  potionAvailable: boolean;
}

const AUTOTRAIN = import.meta.env.DEV && new URLSearchParams(location.search).has("autotrain");

export function serverUrl() {
  const fromQuery = new URLSearchParams(location.search).get("server");
  if (fromQuery) return fromQuery;
  const proto = location.protocol === "https:" ? "https:" : "http:";
  return `${proto}//${location.hostname}:2567`;
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private camera = new THREE.PerspectiveCamera(70, 1, 0.1, 4000);
  private world: World;
  private input: Input;
  private rig: CameraRig;
  private hud: Hud;
  private floats: FloatingNumbers;
  private heist: HeistController;
  private pen: PenController;
  private prompts: Prompts;
  private panel: InventoryPanel;
  private menus: Menus;
  private hub: HubController;
  private reveal: HatchReveal;
  private trails = new Map<string, TrailRibbon>();
  private menuTimer = 0;
  private me = new LocalPlayer();
  private myView: PlayerView | null = null;
  private pendingGain = { speed: 0, money: 0 };
  private gainTimer = 0;
  private myAvatar: Avatar | null = null;
  private potionAvailable = false;
  private remotes = new Map<string, RemotePlayer>();
  private views = new Map<string, PlayerView>();
  private room!: Room;
  private timer = new THREE.Timer();
  private sendTimer = 0;
  private listTimer = 0;
  private fps = 60;

  constructor(private canvas: HTMLCanvasElement, private ui: HTMLElement, private lib: ModelLibrary) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.world = new World(lib);
    this.input = new Input(ui);
    this.rig = new CameraRig(this.camera, canvas, this.input);
    this.hud = new Hud(ui, this.input.isTouch);
    this.floats = new FloatingNumbers(ui);
    const heistHud = new HeistHud(ui, this.input.isTouch);
    this.prompts = new Prompts(heistHud, this.input, this.camera);
    this.panel = new InventoryPanel(ui, {
      equip: (uid, on) => this.pen.equip(uid, on),
      equipBest: () => this.pen.equipBest(),
      buySlot: () => this.pen.buySlot(),
      equipEgg: (uid) => this.equipEgg(uid),
      unequipEgg: () => this.room?.send(MSG.EquipTool, { tool: "" }),
      hatch: (uid) => this.pen.hatch(uid),
      growAll: import.meta.env.DEV ? () => this.pen.devGrow() : undefined,
    });
    this.pen = new PenController({
      lib,
      scene: this.world.scene,
      camera: this.camera,
      me: this.me,
      prompts: this.prompts,
      panel: this.panel,
      reveal: (this.reveal = new HatchReveal(ui)),
    });
    this.menus = new Menus(ui, {
      shopBuy: (item, count) => this.room.send(MSG.ShopBuy, { item, count }),
      claim: (which) => this.room.send(MSG.ClaimIndex, which),
      sell: (uids) => this.room.send(MSG.Sell, uids),
      fuse: (uids) => this.room.send(MSG.Fuse, uids),
      buyTrail: (id) => this.room.send(MSG.BuyTrail, id),
      equipTrail: (id) => this.room.send(MSG.EquipTrail, id),
    });
    this.hub = new HubController(this.me, this.prompts, this.menus, this.pen);
    this.hud.onShopButton = () => this.menus.open("shop");
    this.hud.onIndexButton = () => this.menus.open("index");
    this.hud.onEggButton = () => this.panel.toggle("eggs");
    this.hud.onPawButton = () => this.panel.toggle("pets");
    this.hud.onOfflineClaim = () => this.room?.send(MSG.ClaimOffline);
    this.heist = new HeistController({
      lib,
      scene: this.world.scene,
      camera: this.camera,
      me: this.me,
      input: this.input,
      hud: this.hud,
      heistHud,
      prompts: this.prompts,
      shake: (s) => this.rig.shake(s),
      avatarOf: (id) => (id === this.room?.sessionId ? (this.myAvatar ?? undefined) : this.remotes.get(id)?.avatar),
    });
    this.hud.onSlowModeChange = (on) => this.setSlowMode(on);
    this.input.onKey((code) => {
      if (code === "KeyC") this.setSlowMode(!this.me.slowMode);
      if (code === "F3") this.hud.toggleDebug();
      if (code === "KeyH") this.hud.toggleHelp();
      if (code === "Equal") this.room?.send(MSG.DevSpeed, "up");
      if (code === "Minus") this.room?.send(MSG.DevSpeed, "reset");
      if (code === "KeyG" && import.meta.env.DEV) this.pen.devGrow();
      if (code === "KeyJ" && import.meta.env.DEV) this.room?.send(MSG.DevEgg);
      if (code === "Tab") this.panel.toggle("pets");
      if (code === "Escape") closeOpenModal() || this.panel.close();
      if (code === "KeyM" && import.meta.env.DEV) this.room?.send(MSG.DevMoney);
      if (code === "KeyK" && import.meta.env.DEV) this.room?.send(MSG.DevGems);
      if (code === "KeyP" && import.meta.env.DEV) for (let i = 0; i < 3; i++) this.room?.send(MSG.DevPet, "forest_chick");
      if (code === "Digit1") this.hotbarSlotClicked("bat");
      if (code === "Digit2") this.hotbarSlotClicked("trap");
      if (code === "Digit3") this.hotbarSlotClicked("egg");
      if (code === "KeyF") this.useEquipped();
    });
    this.hud.onEquip = (tool) => this.hotbarSlotClicked(tool);
    addEventListener("resize", () => this.resize());
    this.resize();
  }

  async connect(name: string) {
    this.hud.setStatus("Connecting…");
    const client = new Client(serverUrl());
    const options: JoinOptions = { name, profileId: getProfileId() };
    this.room = await client.joinOrCreate(ROOM_NAME, options);
    const room = this.room;
    const cb = Callbacks.get(room);

    cb.onAdd("players", (value, key) => {
      const p = value as PlayerView;
      const id = key as string;
      this.views.set(id, p);
      this.world.setBaseOwner(p.baseIndex, p.name);
      const mine = id === room.sessionId;
      const upgrades = () => {
        this.world.setTreadmillLevel(p.baseIndex, p.treadmillLevel);
        this.world.setPenLevel(p.baseIndex, p.penLevel);
        this.world.setSigns(p.baseIndex, p.treadmillLevel, p.penLevel, mine);
      };
      upgrades();
      cb.listen(p, "treadmillLevel", upgrades);
      cb.listen(p, "penLevel", upgrades);
      const ribbon = new TrailRibbon(this.world.scene);
      ribbon.setTrail(p.trail);
      this.trails.set(id, ribbon);
      cb.listen(p, "trail", (t: string) => {
        ribbon.setTrail(t);
        if (mine) this.me.trailMult = trailMult(t);
      });
      this.refreshPlayerList();
      if (id === room.sessionId) {
        this.myView = p;
        this.me.homeBase = p.baseIndex;
        this.me.pos.set(p.x, p.y, p.z);
        this.me.ry = p.ry;
        this.myAvatar = new Avatar(this.lib, p.name, p.baseIndex);
        this.world.scene.add(this.myAvatar.root);
        let lastSpeed = p.speedStat;
        let lastMoney = p.money;
        this.applyMyStats(p);
        this.hud.showOfflineClaim(p.offlineEarnings > 0 ? p.offlineEarnings : null);
        cb.listen(p, "offlineEarnings", (v: number) => this.hud.showOfflineClaim(v > 0 ? v : null));
        this.hud.setEquipped(p.equipped);
        this.hud.setTrapCount(p.trapsAvailable);
        this.myAvatar.setHeld(p.equipped, p.equippedEggDefId);
        cb.listen(p, "equipped", (v: string) => {
          this.hud.setEquipped(v);
          this.myAvatar?.setHeld(v, p.equippedEggDefId);
        });
        cb.listen(p, "equippedEggDefId", (v: string) => this.myAvatar?.setHeld(p.equipped, v));
        cb.listen(p, "trapsAvailable", (v: number) => this.hud.setTrapCount(v));
        cb.onChange(p, () => {
          if (p.speedStat > lastSpeed && p.training) this.floatGain(p.speedStat - lastSpeed, "speed");
          if (p.money > lastMoney) this.hud.pulse(this.hud.moneyStat); // income "+$" pops over the pets themselves
          lastSpeed = p.speedStat;
          lastMoney = p.money;
          this.applyMyStats(p);
        });
      } else {
        const r = new RemotePlayer(this.lib, p.name, p.baseIndex);
        r.push(p as MoveMsg & PlayerView);
        r.avatar.setHeld(p.equipped, p.equippedEggDefId);
        this.remotes.set(id, r);
        this.world.scene.add(r.avatar.root);
        cb.onChange(p, () => r.push({ x: p.x, y: p.y, z: p.z, ry: p.ry, anim: p.anim as MoveMsg["anim"] }));
        cb.listen(p, "equipped", (v: string) => r.avatar.setHeld(v, p.equippedEggDefId));
        cb.listen(p, "equippedEggDefId", (v: string) => r.avatar.setHeld(p.equipped, v));
      }
    });

    cb.onRemove("players", (value, key) => {
      const p = value as PlayerView;
      const id = key as string;
      this.views.delete(id);
      this.world.setBaseOwner(p.baseIndex, null);
      this.world.setTreadmillLevel(p.baseIndex, 1);
      this.world.setPenLevel(p.baseIndex, 1);
      this.world.setSigns(p.baseIndex, 1, 1, false);
      this.trails.get(id)?.dispose();
      this.trails.delete(id);
      this.refreshPlayerList();
      this.remotes.get(id)?.dispose();
      this.remotes.delete(id);
    });

    this.heist.bind(room);
    this.pen.bind(room);
    this.hub.bind(room);
    room.onMessage(MSG.Fused, (m: HatchedMsg) => this.reveal.show(m, "FUSED!"));

    const state = room.state as StateView;
    const timers = () => this.hud.setTimers(state.nightIn, state.potionIn, state.isNight, state.potionAvailable);
    cb.listen("nightIn", timers);
    cb.listen("potionIn", timers);
    cb.listen("isNight", (isNight: boolean) => {
      timers();
      this.world.setNightBarrier(isNight);
      this.hud.showNightBanner(isNight);
    });
    cb.listen("potionAvailable", (available: boolean) => {
      timers();
      this.potionAvailable = available;
      this.world.setPotionAvailable(available);
    });

    room.onMessage(MSG.Correct, (m: CorrectMsg) => this.me.snapTo(m.x, m.y, m.z));
    room.onLeave((code) => {
      if (code === CLOSE.TakenOver) {
        this.hud.showOverlay("Playing somewhere else", "This profile joined from another tab or device, so this one was disconnected. Your progress is saved.");
      } else {
        this.hud.showOverlay("Disconnected", "Lost connection to the game server. Your progress was saved up to the last autosave.");
      }
    });
    this.hud.setStatus("");
    this.loop();
  }

  /** 1/2/3 or clicking a hotbar slot. Bat/trap toggle directly; the egg slot has no single item to
   *  pick, so it unequips if you're already holding one, or opens the Eggs panel to choose one. */
  private hotbarSlotClicked(tool: "bat" | "trap" | "egg") {
    if (tool === "egg") {
      if (this.myView?.equipped === "egg") this.room?.send(MSG.EquipTool, { tool: "" });
      else this.panel.toggle("eggs");
      return;
    }
    const next = this.myView?.equipped === tool ? "" : tool;
    this.room?.send(MSG.EquipTool, { tool: next });
  }

  /** Equip a backpack egg (from the Eggs panel) — it shows in your hand until you place it or swap tools. */
  private equipEgg(uid: string) {
    this.room?.send(MSG.EquipTool, { tool: "egg", eggUid: uid });
  }

  /** F / the touch bat button: whatever's equipped decides what happens (nothing if bare-handed). */
  private useEquipped() {
    if (this.myView?.equipped === "bat") this.room?.send(MSG.BatHit);
    else if (this.myView?.equipped === "trap") this.room?.send(MSG.PlaceTrap);
    else if (this.myView?.equipped === "egg") this.room?.send(MSG.Plant);
  }

  private applyMyStats(p: PlayerView) {
    this.me.speedStat = p.speedStat;
    this.me.slowMode = p.slowMode;
    this.hud.setSlowMode(p.slowMode);
    this.hud.setSpeed(p.speedStat);
    this.hud.setMoney(p.money);
    this.heist.carrying = p.carrying;
    this.me.trailMult = trailMult(p.trail);
  }

  /** Queues a "+N" popup; gains are batched so a fast stream of steps doesn't flood the screen. */
  private floatGain(amount: number, kind: "speed" | "money") {
    this.pendingGain[kind] += amount;
  }

  private flushGains(dt: number) {
    this.gainTimer += dt;
    if (this.gainTimer < 0.3) return;
    this.gainTimer = 0;
    for (const kind of ["speed", "money"] as const) {
      if (this.pendingGain[kind] > 0) this.spawnGain(this.pendingGain[kind], kind);
      this.pendingGain[kind] = 0;
    }
  }

  /** "+N" popup from above your head flying into the matching HUD counter. */
  private spawnGain(amount: number, kind: "speed" | "money") {
    const v = this.me.pos.clone().add(new THREE.Vector3(0, 2.4, 0)).project(this.camera);
    if (v.z > 1) return;
    const x = ((v.x + 1) / 2) * innerWidth;
    const y = ((1 - v.y) / 2) * innerHeight;
    this.floats.gain(amount, x, y, kind === "speed" ? this.hud.speedStat : this.hud.moneyStat, kind);
  }

  /** First-time guidance: point new players at their treadmill until they've trained a bit. */
  private updateTutorial() {
    const p = this.myView;
    if (!p) return;
    // Hints are about the base; out in the biomes the chase UI takes over.
    if (this.me.pos.z > 0) {
      this.world.pointAtTreadmill(-1);
      return this.hud.setHint(null);
    }
    // Egg tasks first: they're the next step whenever they apply.
    if (this.pen.readyEggs > 0) return this.hud.setHint("An egg is ready! Walk up to it and hold E to hatch 🐣");
    if (p.eggCount > 0 && this.pen.usedSlots < (this.pen.inv?.slots ?? 0)) {
      this.world.pointAtTreadmill(-1);
      if (p.equipped === "egg") {
        return this.hud.setHint(this.input.isTouch ? "Walk into your pen and tap 🏏 to place your egg 🥚" : "Walk into your pen and press F to place your egg 🥚");
      }
      return this.hud.setHint("Open your backpack (🥚) and equip an egg to plant it!");
    }
    const newbie = p.speedStat < 50;
    const running = this.me.onTreadmill;
    this.world.pointAtTreadmill(newbie && !running ? p.baseIndex : -1);
    if (running && newbie)
      this.hud.setHint(this.input.isTouch ? "Running automatically! Move or jump to get off" : "Running automatically! Press WASD or Space to get off");
    else if (p.speedStat === 0) this.hud.setHint("Step onto your treadmill to gain Speed 👟");
    else if (newbie) this.hud.setHint("Get back on your treadmill to keep training!");
    else if (p.eggCount === 0 && !p.carrying && this.pen.usedSlots === 0) this.hud.setHint("Now head down the corridor and steal an egg from the Forest 🥚");
    else this.hud.setHint(null);
  }

  /** Dev only (?autotrain): walk onto your treadmill and keep running, for hands-free testing. */
  private autotrain() {
    const t = basePlot(this.myView!.baseIndex).treadmill;
    if (this.me.onTreadmill) {
      this.input.autopilot = { x: 0, y: 0 }; // auto-running: hands off
      return;
    }
    const onDeck = Math.abs(t.x - this.me.pos.x) < 0.6 && this.me.pos.y > 0.3;
    let wx = t.x - this.me.pos.x;
    let wz = t.z + 1 - this.me.pos.z;
    const len = Math.hypot(wx, wz) || 1;
    [wx, wz] = onDeck ? [0, 1] : [wx / len, wz / len]; // on the belt: run toward +Z
    // Convert the world direction into camera space (right = (-f.z, 0, f.x)).
    const f = this.rig.forward();
    this.input.autopilot = { x: wx * -f.z + wz * f.x, y: wx * f.x + wz * f.z };
  }

  /** Keeps the menus, Gems counter, boost timer and Index badge in sync (a few times a second). */
  private updateMenus(dt: number) {
    this.menuTimer += dt;
    if (this.menuTimer < 0.25 || !this.myView) return;
    this.menuTimer = 0;
    const inv = this.pen.inv;
    this.menus.update({ inv, money: this.myView.money, trail: this.myView.trail });
    this.hud.setGems(inv?.gems ?? 0);
    this.hud.setIndexBadge(this.menus.unclaimed);
    this.hud.setBoost(this.pen.boostLeft);
  }

  private refreshPlayerList() {
    this.listTimer = 0;
    const all = [...this.views.entries()].map(([id, p]) => ({ name: p.name, speed: p.speedStat, moneyPerSec: p.income, isYou: id === this.room.sessionId }));
    this.hud.setPlayers(all);
    this.world.setLeaderboard(
      [...all].sort((a, b) => b.moneyPerSec - a.moneyPerSec).slice(0, 3).map((r) => ({ name: r.name, income: r.moneyPerSec })),
    );
  }

  private setSlowMode(on: boolean) {
    this.me.slowMode = on;
    this.hud.setSlowMode(on);
    this.room?.send(MSG.SlowMode, on);
  }

  private resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = (now?: number) => {
    requestAnimationFrame(this.loop);
    this.timer.update(now);
    // Cap long frames at 0.1 s: below ~10 FPS the game slows down rather than teleporting,
    // but slow devices down to 10 FPS still move at full speed (guardians run on the server clock).
    const dt = Math.min(0.1, this.timer.getDelta());
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;

    if (AUTOTRAIN && this.myView) this.autotrain();
    this.input.update();
    this.me.update(dt, this.input, this.rig);
    if (this.myAvatar) {
      this.myAvatar.root.position.copy(this.me.pos);
      this.myAvatar.root.rotation.y = this.me.ry;
      this.myAvatar.update(dt, this.me.anim, this.me.speed);
    }
    for (const r of this.remotes.values()) r.update(dt);
    for (const [id, ribbon] of this.trails) {
      const root = id === this.room.sessionId ? this.myAvatar?.root : this.remotes.get(id)?.avatar.root;
      if (root) ribbon.update(dt, root.position);
    }

    this.sendTimer += dt;
    if (this.sendTimer >= 1 / NETWORK.sendRate) {
      this.sendTimer = 0;
      const msg: MoveMsg = { x: this.me.pos.x, y: this.me.pos.y, z: this.me.pos.z, ry: this.me.ry, anim: this.me.anim };
      this.room.send(MSG.Move, msg);
    }

    this.listTimer += dt;
    if (this.listTimer > 0.5) this.refreshPlayerList();

    this.heist.update(dt);
    this.pen.update(dt);
    this.hub.update(this.myView, this.potionAvailable);
    this.prompts.commit();
    this.hud.setEggCount(this.pen.attention);
    this.updateMenus(dt);
    this.flushGains(dt);
    this.updateTutorial();
    this.world.update(dt);
    this.rig.update(this.me.pos, dt);
    this.world.followShadows(this.me.pos);
    this.hud.setDebug(this.fps, this.me.pos.x, this.me.pos.y, this.me.pos.z, walkSpeedFromStat(this.me.speedStat, this.me.slowMode, this.me.trailMult));
    this.renderer.render(this.world.scene, this.camera);
  };
}
