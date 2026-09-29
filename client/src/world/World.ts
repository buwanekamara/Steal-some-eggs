import * as THREE from "three";
import {
  BASE,
  BIOMES,
  CORRIDOR_END_Z,
  CORRIDOR_HALF_WIDTH,
  HUB,
  HUB_BUILDINGS,
  NESTS,
  PEN_LEVELS,
  TREADMILL,
  penLevel,
  useSpot,
  SAFE_ZONE_Z,
  WALL_HEIGHT,
  basePlot,
  biomeLength,
  biomeStartZ,
  formatShort,
  treadmillLevel,
} from "@egg/shared";
import type { ModelLibrary } from "../assets/ModelLibrary.ts";
import { floorTexture, propTexture, wallTexture } from "../assets/textures.ts";
import { TextLabel, textPlane } from "../ui/labels.ts";

const HUB_FLOOR = "#63d434";
const HUB_WALL = "#c07a3c";
const HUB_WALL_TOP = "#3ad13a";
interface BaseVisual {
  x: number;
  z: number;
  floorName: THREE.Mesh | null;
  floatingName: TextLabel;
  treadmill: THREE.Object3D | null;
  treadmillLevel: number;
  stepLabel: TextLabel;
  railMat: THREE.MeshStandardMaterial;
  postMat: THREE.MeshStandardMaterial;
  penLevel: number;
  /** "Upgrade / Level 1 > Level 2 / $1K" boards (text only shown to the owner's own base). */
  treadmillSign: TextLabel;
  penSign: TextLabel;
}

/** Builds the static level: sky, lights, hub with 8 pens, safe zone and the biome corridor. */
export class World {
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  private bases: BaseVisual[] = [];
  /** Emissive belt textures to scroll (from placeholder treadmills; real models may have none). */
  private beltMaps = new Set<THREE.Texture>();
  private arrow: THREE.Group;
  private pads: THREE.Mesh[] = [];
  private time = 0;

  constructor(private lib: ModelLibrary) {
    this.scene.fog = new THREE.Fog("#bfe3ff", 180, 1100);
    this.sun = this.buildLights();
    this.buildSky();
    this.buildHub();
    this.buildCorridor();
    for (let i = 0; i < BASE.count; i++) this.buildBase(i);
    this.buildHubBuildings();
    this.buildSafeZone();
    this.buildNests();
    this.buildForestDecor();
    this.arrow = this.buildArrow();
  }

  /** All nests share one instanced model (they never move): a handful of draw calls instead of hundreds. */
  private buildNests() {
    const placements = NESTS.map((n) =>
      new THREE.Matrix4().compose(new THREE.Vector3(n.x, 0, n.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), n.index * 1.7), new THREE.Vector3(1, 1, 1)),
    );
    this.scene.add(this.lib.instanceMany("nest", placements));
  }

  /** Blocky trees along the Forest walls and a few bushes (instanced: cheap to draw). */
  private buildForestDecor() {
    const i = BIOMES.findIndex((b) => b.id === "forest");
    if (i < 0) return;
    const z0 = biomeStartZ(i);
    const rnd = mulberry32(42);
    const trunks: THREE.Matrix4[] = [];
    const leaves: THREE.Matrix4[] = [];
    const bushes: THREE.Matrix4[] = [];
    const m = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
    for (let z = z0 + 12; z < z0 + biomeLength(i) - 8; z += 13 + rnd() * 9) {
      for (const side of [-1, 1]) {
        const x = side * (CORRIDOR_HALF_WIDTH - 3 - rnd() * 3);
        const h = 5 + rnd() * 3;
        const ry = rnd() * Math.PI;
        trunks.push(m(x, h / 2, z, 1.1, h, 1.1, ry));
        leaves.push(m(x, h + 1.4, z, 5 + rnd() * 1.5, 3, 5 + rnd() * 1.5, ry));
        leaves.push(m(x, h + 3.2, z, 3.2, 1.8, 3.2, ry + 0.4));
        if (rnd() < 0.7) bushes.push(m(side * (CORRIDOR_HALF_WIDTH - 9 - rnd() * 5), 0.7, z + 5, 2.4, 1.4, 1.8, rnd() * 3));
      }
    }
    const cube = new THREE.BoxGeometry(1, 1, 1);
    const add = (list: THREE.Matrix4[], color: string) => {
      const mesh = new THREE.InstancedMesh(cube, new THREE.MeshStandardMaterial({ color, map: propTexture(), roughness: 0.9 }), list.length);
      list.forEach((mat, k) => mesh.setMatrixAt(k, mat));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    add(trunks, "#7a4a24");
    add(leaves, "#2f9e2f");
    add(bushes, "#3cb53c");
  }

  /** Per-frame animation: scrolling treadmill belts and the bobbing guide arrow. */
  update(dt: number) {
    this.time += dt;
    for (const t of this.beltMaps) t.offset.y -= dt * 1.6;
    for (const [i, pad] of this.pads.entries()) pad.scale.setScalar(1 + Math.sin(this.time * 3 + i) * 0.06);
    if (this.arrow.visible) {
      this.arrow.position.y = this.arrow.userData.baseY + Math.sin(this.time * 4) * 0.35;
      this.arrow.rotation.y += dt * 2;
    }
  }

  /** Shows the level-appropriate treadmill model and its "+N/step" label for a base. */
  setTreadmillLevel(index: number, level: number) {
    const b = this.bases[index];
    if (!b || (b.treadmill && b.treadmillLevel === level)) return;
    const plot = basePlot(index);
    if (b.treadmill) this.scene.remove(b.treadmill);
    const tm = this.lib.instance(`treadmillTier${treadmillLevel(level).tier}`);
    tm.position.set(plot.treadmill.x, 0, plot.treadmill.z);
    tm.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.emissiveMap) this.beltMaps.add(m.emissiveMap);
    });
    this.scene.add(tm);
    b.treadmill = tm;
    b.treadmillLevel = level;
    b.stepLabel.setLines([{ text: `+${formatShort(treadmillLevel(level).gainPerStep)}/step`, color: "#3fb5ff" }]);
  }

  /** Bouncing arrow over a base's treadmill (tutorial). Pass -1 to hide. */
  pointAtTreadmill(index: number) {
    this.arrow.visible = index >= 0;
    if (index < 0) return;
    const t = basePlot(index).treadmill;
    this.arrow.position.set(t.x, 0, t.z);
    this.arrow.userData.baseY = 5.2;
  }

  private buildArrow(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: "#ffd21f", emissive: "#ffb000", emissiveIntensity: 0.5 });
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.2, 4), mat);
    head.rotation.x = Math.PI; // point down
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), mat);
    shaft.position.y = 1.1;
    g.add(head, shaft);
    g.visible = false;
    g.userData.baseY = 5.2;
    this.scene.add(g);
    return g;
  }

  /** Keeps the shadow camera centered on the local player. */
  followShadows(target: THREE.Vector3) {
    this.sun.position.set(target.x - 40, target.y + 90, target.z + 30);
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
  }

  /** Shows who owns a base: name painted in front of the gate and a big floating name above the pen. */
  setBaseOwner(index: number, name: string | null) {
    const b = this.bases[index];
    if (!b) return;
    if (b.floorName) {
      this.scene.remove(b.floorName);
      (b.floorName.material as THREE.MeshBasicMaterial).map?.dispose();
    }
    b.floorName = textPlane(name ? `${name}'s Base` : "Empty Base", 9, name ? "#ffffff" : "#d9f5c8", name ? "#111111" : "#3b7a28");
    b.floorName.rotation.x = -Math.PI / 2;
    b.floorName.position.set(b.x, 0.05, b.z);
    this.scene.add(b.floorName);
    b.floatingName.setLines(name ?? "");
    b.floatingName.visible = !!name;
  }

  // ------------------------------------------------------------------ environment

  private buildLights(): THREE.DirectionalLight {
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#5d8a3c", 1.4));
    const sun = new THREE.DirectionalLight("#fff4e0", 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 55;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 260 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    return sun;
  }

  private buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(3000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color("#2f86e8") }, bottom: { value: new THREE.Color("#cdeeff") } },
        vertexShader: `varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.45, h)), 1.0); }`,
      }),
    );
    sky.renderOrder = -1;
    this.scene.add(sky);

    // Puffy blocky clouds.
    const cloudMat = new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: "#dfefff", emissiveIntensity: 0.4 });
    const rnd = mulberry32(7);
    for (let i = 0; i < 40; i++) {
      const cloud = new THREE.Group();
      const n = 3 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(18 + rnd() * 20, 6 + rnd() * 6, 12 + rnd() * 10), cloudMat);
        b.position.set(k * 12 - n * 6, rnd() * 4, rnd() * 8 - 4);
        cloud.add(b);
      }
      cloud.position.set((rnd() - 0.5) * 900, 150 + rnd() * 90, -300 + rnd() * (CORRIDOR_END_Z + 600));
      this.scene.add(cloud);
    }
  }

  // ------------------------------------------------------------------ hub

  private floor(width: number, depth: number, color: string, x: number, z: number) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color, map: floorTexture(width, depth), roughness: 0.9 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0, z);
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  /** Wall slab along X (alongZ = false) or along Z (alongZ = true), with a colored top edge. */
  private wall(length: number, x: number, z: number, alongZ: boolean, color: string, top: string) {
    const t = 2;
    const geo = alongZ ? new THREE.BoxGeometry(t, WALL_HEIGHT, length) : new THREE.BoxGeometry(length, WALL_HEIGHT, t);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, map: wallTexture(length, WALL_HEIGHT), roughness: 0.95 }));
    m.position.set(x, WALL_HEIGHT / 2, z);
    m.receiveShadow = true;
    this.scene.add(m);
    const edgeGeo = alongZ ? new THREE.BoxGeometry(t + 0.6, 1.4, length) : new THREE.BoxGeometry(length, 1.4, t + 0.6);
    const edge = new THREE.Mesh(edgeGeo, new THREE.MeshStandardMaterial({ color: top, map: propTexture() }));
    edge.position.set(x, WALL_HEIGHT + 0.7, z);
    this.scene.add(edge);
  }

  private buildHub() {
    const w = HUB.xMax - HUB.xMin;
    const d = HUB.zMax - HUB.zMin;
    this.floor(w, d, HUB_FLOOR, 0, (HUB.zMin + HUB.zMax) / 2);
    this.wall(w + 4, 0, HUB.zMin - 1, false, HUB_WALL, HUB_WALL_TOP);
    this.wall(d, HUB.xMin - 1, (HUB.zMin + HUB.zMax) / 2, true, HUB_WALL, HUB_WALL_TOP);
    this.wall(d, HUB.xMax + 1, (HUB.zMin + HUB.zMax) / 2, true, HUB_WALL, HUB_WALL_TOP);
    // Front walls on both sides of the corridor mouth.
    const side = HUB.xMax - CORRIDOR_HALF_WIDTH;
    this.wall(side + 2, -(CORRIDOR_HALF_WIDTH + side / 2) - 1, HUB.zMax + 1, false, HUB_WALL, HUB_WALL_TOP);
    this.wall(side + 2, CORRIDOR_HALF_WIDTH + side / 2 + 1, HUB.zMax + 1, false, HUB_WALL, HUB_WALL_TOP);
  }

  private buildBase(index: number) {
    const plot = basePlot(index);
    const { cx, cz } = plot;
    const W = BASE.penWidth;
    const D = BASE.penDepth;

    // Pen floor, a shade darker so the pen reads as an area.
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ color: "#58c52c", map: floorTexture(W, D), roughness: 0.9 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(cx, 0.02, cz);
    pad.receiveShadow = true;
    this.scene.add(pad);

    const { railMat, postMat } = this.buildFence(cx, cz, W, D);

    // Spawn pad.
    const spawn = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.12, 24), new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#7fd7ff", emissiveIntensity: 0.4 }));
    spawn.position.set(plot.spawn.x, 0.06, plot.spawn.z);
    this.scene.add(spawn);

    // "+N/step" label above the treadmill (the model itself is placed by setTreadmillLevel).
    const stepLabel = new TextLabel("", { lineHeight: 1 });
    stepLabel.position.set(plot.treadmill.x, 3.4, plot.treadmill.z + 1.5);
    this.scene.add(stepLabel);

    const floatingName = new TextLabel("", { lineHeight: 2.2 });
    floatingName.position.set(cx, 14, cz);
    floatingName.visible = false;
    this.scene.add(floatingName);

    const treadmillSign = this.signBoard(plot.treadmillSign.x, plot.treadmillSign.z, 0);
    const penSign = this.signBoard(plot.penSign.x, plot.penSign.z, Math.PI);
    this.bases[index] = {
      x: plot.sign.x,
      z: plot.sign.z,
      floorName: null,
      floatingName,
      treadmill: null,
      treadmillLevel: 0,
      stepLabel,
      railMat,
      postMat,
      penLevel: 0,
      treadmillSign,
      penSign,
    };
    this.setBaseOwner(index, null);
    this.setTreadmillLevel(index, 1);
    this.setPenLevel(index, 1);
    this.setSigns(index, 1, 1, false);
  }

  /** Dark "Upgrade" board on a post (reference style); the returned label shows the next level and price. */
  private signBoard(x: number, z: number, facing: number): TextLabel {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: "#1f2433", map: propTexture(), roughness: 0.6 });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 0.3), dark);
    post.position.y = 0.8;
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.5, 0.25), dark);
    board.position.y = 2.2;
    for (const m of [post, board]) {
      m.castShadow = true;
      g.add(m);
    }
    g.position.set(x, 0, z);
    g.rotation.y = facing;
    this.scene.add(g);
    // Floats just above the board so it's readable from any side.
    const label = new TextLabel("", { lineHeight: 0.42 });
    label.position.set(x, 3.0, z);
    this.scene.add(label);
    return label;
  }

  /** Fence colors for a pen level (white → wood → stone → gold → diamond). */
  setPenLevel(index: number, level: number) {
    const b = this.bases[index];
    if (!b || b.penLevel === level) return;
    const lv = penLevel(level);
    b.railMat.color.set(lv.rail);
    b.postMat.color.set(lv.post);
    const shiny = level >= 4;
    b.railMat.metalness = shiny ? 0.6 : 0;
    b.railMat.roughness = shiny ? 0.3 : 1;
    b.railMat.emissive.set(level >= 5 ? lv.rail : "#000000");
    b.railMat.emissiveIntensity = level >= 5 ? 0.25 : 0;
    b.penLevel = level;
  }

  /** Refreshes both Upgrade boards of a base. `owned` hides prices on other players' bases. */
  setSigns(index: number, treadmillLv: number, penLv: number, owned: boolean) {
    const b = this.bases[index];
    if (!b) return;
    const next = treadmillLv < TREADMILL.levels.length ? treadmillLevel(treadmillLv + 1) : null;
    b.treadmillSign.setLines([
      { text: "Upgrade", color: "#ffffff", size: 0.9 },
      { text: next ? `Level ${treadmillLv} > Level ${next.level}` : `Level ${treadmillLv} (MAX)`, color: "#5dff3a", size: 0.8 },
      ...(owned && next ? [{ text: `$${formatShort(next.cost)}`, color: "#ffe066" }] : []),
    ]);
    const nextPen = penLv < PEN_LEVELS.length ? PEN_LEVELS[penLv] : null;
    b.penSign.setLines([
      { text: "Upgrade Pen", color: "#ffffff", size: 0.9 },
      { text: nextPen ? `Level ${penLv} > Level ${nextPen.level}` : `Level ${penLv} (MAX)`, color: "#5dff3a", size: 0.8 },
      ...(owned && nextPen ? [{ text: `$${formatShort(nextPen.cost)}`, color: "#ffe066" }] : []),
    ]);
  }

  /** Wooden X-braced fence around a pen, with a gate gap in the front (+Z) side. Colors come from the pen level. */
  private buildFence(cx: number, cz: number, W: number, D: number) {
    const posts: THREE.Matrix4[] = [];
    const rails: THREE.Matrix4[] = [];
    const postGeo = new THREE.BoxGeometry(0.6, 2.6, 0.6);
    const railGeo = new THREE.BoxGeometry(1, 0.28, 0.28); // unit length along X
    const X = new THREE.Vector3(1, 0, 0);

    const rail = (a: THREE.Vector3, b: THREE.Vector3) => {
      const dir = b.clone().sub(a);
      const len = dir.length();
      const m = new THREE.Matrix4().compose(
        a.clone().add(b).multiplyScalar(0.5),
        new THREE.Quaternion().setFromUnitVectors(X, dir.normalize()),
        new THREE.Vector3(len, 1, 1),
      );
      rails.push(m);
    };

    const side = (x0: number, z0: number, x1: number, z1: number, gate = 0) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 4));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        posts.push(new THREE.Matrix4().makeTranslation(x, 1.3, z));
        if (i === n) break;
        const t2 = (i + 1) / n;
        const nx = x0 + (x1 - x0) * t2;
        const nz = z0 + (z1 - z0) * t2;
        const mid = (t + t2) / 2 - 0.5;
        if (gate && Math.abs(mid * len) < gate / 2) continue; // leave the gate open
        const lo = 0.55;
        const hi = 2.05;
        rail(new THREE.Vector3(x, hi, z), new THREE.Vector3(nx, hi, nz));
        rail(new THREE.Vector3(x, lo, z), new THREE.Vector3(nx, lo, nz));
        rail(new THREE.Vector3(x, lo, z), new THREE.Vector3(nx, hi, nz));
        rail(new THREE.Vector3(x, hi, z), new THREE.Vector3(nx, lo, nz));
      }
    };
    const x0 = cx - W / 2;
    const x1 = cx + W / 2;
    const z0 = cz - D / 2;
    const z1 = cz + D / 2;
    side(x0, z0, x1, z0);
    side(x1, z0, x1, z1);
    side(x1, z1, x0, z1, 6);
    side(x0, z1, x0, z0);

    const postMat = new THREE.MeshStandardMaterial({ color: PEN_LEVELS[0].post, map: propTexture() });
    const railMat = new THREE.MeshStandardMaterial({ color: PEN_LEVELS[0].rail, map: propTexture() });
    const postMesh = new THREE.InstancedMesh(postGeo, postMat, posts.length);
    posts.forEach((m, i) => postMesh.setMatrixAt(i, m));
    const railMesh = new THREE.InstancedMesh(railGeo, railMat, rails.length);
    rails.forEach((m, i) => railMesh.setMatrixAt(i, m));
    for (const m of [postMesh, railMesh]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }
    return { railMat, postMat };
  }

  private buildHubBuildings() {
    const place = (id: string, x: number, z: number, label: string, color: string) => {
      const obj = this.lib.instance(id);
      obj.position.set(x, 0, z);
      obj.rotation.y = Math.PI; // face the bases
      this.scene.add(obj);
      const tag = new TextLabel([{ text: label, color }], { lineHeight: 2 });
      tag.position.set(x, 9, z);
      this.scene.add(tag);
    };
    place("sellStall", HUB_BUILDINGS.sell.x, HUB_BUILDINGS.sell.z, "SELL", "#ff3b30");
    place("fuseMachine", HUB_BUILDINGS.fuse.x, HUB_BUILDINGS.fuse.z, "Fuse Machine", "#2fb5ff");
    place("trailsShop", HUB_BUILDINGS.trails.x, HUB_BUILDINGS.trails.z, "TRAILS SHOP", "#ffd21f");
    place("leaderboard", HUB_BUILDINGS.leaderboard.x, HUB_BUILDINGS.leaderboard.z, "MOST MONEY/s", "#7dff4a");
    place("chest", HUB_BUILDINGS.chest.x, HUB_BUILDINGS.chest.z, "FREE CHEST", "#ffb020");
    this.leaderboardLabel = new TextLabel([{ text: "…", color: "#ffffff" }], { lineHeight: 1.4 });
    this.leaderboardLabel.position.set(HUB_BUILDINGS.leaderboard.x, 5.5, HUB_BUILDINGS.leaderboard.z + 0.1);
    this.scene.add(this.leaderboardLabel);
    // Glowing pads in front of the stalls: stand here to use them (reference: SELL = green circle, TRAILS = yellow).
    for (const [b, color] of [
      [HUB_BUILDINGS.sell, "#4ce11f"],
      [HUB_BUILDINGS.trails, "#ffd21f"],
      [HUB_BUILDINGS.fuse, "#39c6ff"],
      [HUB_BUILDINGS.potion, "#c04dff"],
      [HUB_BUILDINGS.chest, "#ffb020"],
    ] as const) {
      const s = useSpot(b);
      const pad = new THREE.Mesh(
        new THREE.RingGeometry(1.6, 2.4, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(s.x, 0.05, s.z);
      this.scene.add(pad);
      this.pads.push(pad);
    }

    this.potionPickup = this.lib.instance("potionPickup");
    this.potionPickup.position.set(HUB_BUILDINGS.potion.x, 0, HUB_BUILDINGS.potion.z);
    this.potionPickup.visible = false;
    this.scene.add(this.potionPickup);
    const potionTag = new TextLabel([{ text: HUB_BUILDINGS.potion.label, color: "#c04dff" }], { lineHeight: 2 });
    potionTag.position.set(HUB_BUILDINGS.potion.x, 9, HUB_BUILDINGS.potion.z);
    this.scene.add(potionTag);
  }

  private potionPickup!: THREE.Object3D;
  private leaderboardLabel!: TextLabel;

  /** Toggles the potion pickup: visible once spawned, hidden after someone claims it. */
  setPotionAvailable(available: boolean) {
    this.potionPickup.visible = available;
  }

  /** Refreshes the "MOST MONEY/s" board with the current top earners (called a few times a second). */
  setLeaderboard(rows: { name: string; income: number }[]) {
    const lines = rows.length
      ? rows.map((r, i) => ({ text: `${i + 1}. ${r.name} — $${formatShort(r.income)}/s`, color: i === 0 ? "#ffd21f" : "#eaffea", size: i === 0 ? 0.85 : 0.72 }))
      : [{ text: "Nobody yet…", color: "#cccccc", size: 0.72 }];
    this.leaderboardLabel.setLines(lines);
  }

  private buildSafeZone() {
    const line = new THREE.Mesh(new THREE.BoxGeometry(HUB.xMax - HUB.xMin, 0.08, 0.7), new THREE.MeshStandardMaterial({ color: "#e0344a" }));
    line.position.set(0, 0.05, SAFE_ZONE_Z - 1);
    this.scene.add(line);
    const text = textPlane("SAFE ZONE", 22, "#ffffff", "#111111");
    text.rotation.x = -Math.PI / 2;
    text.position.set(0, 0.06, SAFE_ZONE_Z - 5);
    this.scene.add(text);
  }

  private nightBarrier: THREE.Mesh | null = null;
  private nightBarrierTag: TextLabel | null = null;

  /** Night: a wall seals the corridor mouth so no biome is reachable until it passes. */
  setNightBarrier(on: boolean) {
    if (!this.nightBarrier) {
      const height = 12;
      this.nightBarrier = new THREE.Mesh(
        new THREE.BoxGeometry(CORRIDOR_HALF_WIDTH * 2 + 4, height, 1.5),
        new THREE.MeshStandardMaterial({ color: "#141a33", roughness: 0.7, transparent: true, opacity: 0.96 }),
      );
      this.nightBarrier.position.set(0, height / 2, SAFE_ZONE_Z + 1.2);
      this.scene.add(this.nightBarrier);
      this.nightBarrierTag = new TextLabel(
        [
          { text: "🌙 NIGHT", color: "#cfe0ff" },
          { text: "biomes sealed off", color: "#8fa8ff", size: 0.6 },
        ],
        { lineHeight: 0.9 },
      );
      this.nightBarrierTag.position.set(0, height * 0.65, SAFE_ZONE_Z + 1.1);
      this.scene.add(this.nightBarrierTag);
    }
    this.nightBarrier.visible = on;
    this.nightBarrierTag!.visible = on;
  }

  // ------------------------------------------------------------------ corridor

  private buildCorridor() {
    const width = CORRIDOR_HALF_WIDTH * 2;
    BIOMES.forEach((b, i) => {
      const z0 = biomeStartZ(i);
      const len = biomeLength(i);
      const zc = z0 + len / 2;
      this.floor(width, len, b.floor, 0, zc);
      this.wall(len, -CORRIDOR_HALF_WIDTH - 1, zc, true, b.wall, b.wallTop);
      this.wall(len, CORRIDOR_HALF_WIDTH + 1, zc, true, b.wall, b.wallTop);

      // Soft-gate sign at the start of every biome after the first.
      if (i > 0) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 0.5), new THREE.MeshStandardMaterial({ color: "#c96b1c", map: propTexture() }));
        post.position.set(-CORRIDOR_HALF_WIDTH + 6, 1.5, z0 + 3);
        const board = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 0.4), new THREE.MeshStandardMaterial({ color: "#e8872c", map: propTexture() }));
        board.position.y = 1.8;
        post.add(board);
        this.scene.add(post);
        const tag = new TextLabel(
          [
            { text: `${b.emoji} ${b.name}`, color: "#ffffff" },
            { text: `👟 ${formatShort(b.recommendedSpeed)} recommended`, color: "#ff4d4d", size: 0.7 },
          ],
          { lineHeight: 0.9 },
        );
        tag.position.set(-CORRIDOR_HALF_WIDTH + 6, 4.4, z0 + 3);
        this.scene.add(tag);
      }
    });
    this.wall(width + 4, 0, CORRIDOR_END_Z + 1, false, "#d8c68e", "#ffd966");

    // Far landmark: light beam and a rainbow ring at the end of the corridor.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 1600, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, fog: false }),
    );
    beam.position.set(0, 800, CORRIDOR_END_Z - 30);
    this.scene.add(beam);
    const colors = ["#ff4d6d", "#ffb703", "#8ac926", "#1982c4", "#6a4c93"];
    colors.forEach((c, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(26 - i * 2, 0.9, 8, 48), new THREE.MeshBasicMaterial({ color: c, fog: false }));
      ring.position.set(0, 26, CORRIDOR_END_Z - 20);
      this.scene.add(ring);
    });
  }
}

/** Small deterministic RNG so decoration layout is the same for everyone. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
