import * as THREE from "three";

/**
 * Procedural grayscale "brick stud" textures. Materials tint them with `color`,
 * so one texture serves every biome floor and wall.
 */

interface StudOptions {
  /** Studs per texture edge. */
  studs: number;
  /** Checker cells per texture edge (0 = none). */
  checker: number;
  /** Brightness of the darker checker cells (0..1). */
  checkerDark: number;
  /** Multiplier for the dark stud outlines' opacity (default 1). */
  outline?: number;
}

const cache = new Map<string, THREE.CanvasTexture>();

function drawStuds(opts: StudOptions): HTMLCanvasElement {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;

  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, size, size);

  if (opts.checker > 0) {
    const cell = size / opts.checker;
    const v = Math.round(255 * opts.checkerDark);
    g.fillStyle = `rgb(${v},${v},${v})`;
    for (let y = 0; y < opts.checker; y++)
      for (let x = 0; x < opts.checker; x++) if ((x + y) % 2) g.fillRect(x * cell, y * cell, cell, cell);
  }

  const step = size / opts.studs;
  const s = step * 0.56;
  const r = step * 0.12;
  const k = opts.outline ?? 1;
  const roundRect = (x: number, y: number, w: number, h: number) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };
  for (let y = 0; y < opts.studs; y++) {
    for (let x = 0; x < opts.studs; x++) {
      const cx = x * step + (step - s) / 2;
      const cy = y * step + (step - s) / 2;
      // Shadow (bottom-right), highlight (top-left), then the outline — reads as a raised stud.
      g.lineWidth = step * 0.07;
      g.strokeStyle = `rgba(0,0,0,${0.22 * k})`;
      roundRect(cx + step * 0.04, cy + step * 0.05, s, s);
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.55)";
      roundRect(cx - step * 0.02, cy - step * 0.02, s, s);
      g.stroke();
      g.strokeStyle = `rgba(0,0,0,${0.12 * k})`;
      roundRect(cx, cy, s, s);
      g.stroke();
    }
  }
  // Faint tile seams.
  g.strokeStyle = "rgba(0,0,0,0.08)";
  g.lineWidth = 2;
  g.strokeRect(0, 0, size, size);
  return c;
}

function baseTexture(key: string, opts: StudOptions): THREE.CanvasTexture {
  let t = cache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(drawStuds(opts));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    cache.set(key, t);
  }
  return t;
}

/** Floor texture: one tile covers 4×4 units with 8×8 studs and a soft 2×2 checker. */
export function floorTexture(widthUnits: number, depthUnits: number): THREE.Texture {
  const t = baseTexture("floor", { studs: 8, checker: 2, checkerDark: 0.97, outline: 0.35 }).clone();
  t.repeat.set(widthUnits / 4, depthUnits / 4);
  t.needsUpdate = true;
  return t;
}

/** Wall texture: one tile covers 8×8 units, strong 2×2 checker like the reference walls. */
export function wallTexture(lengthUnits: number, heightUnits: number): THREE.Texture {
  const t = baseTexture("wall", { studs: 12, checker: 2, checkerDark: 0.86 }).clone();
  t.repeat.set(lengthUnits / 8, heightUnits / 8);
  t.needsUpdate = true;
  return t;
}

/** Small stud texture for props (fences, stalls). One tile = 2×2 units. */
export function propTexture(): THREE.Texture {
  return baseTexture("prop", { studs: 4, checker: 0, checkerDark: 1, outline: 0.4 });
}

/** Very faint version of the prop studs, for creatures: keeps a hint of texture without dark squares over their colours. */
export function softPropTexture(): THREE.Texture {
  return baseTexture("propSoft", { studs: 4, checker: 0, checkerDark: 1, outline: 0.1 });
}

/** Glowing chevron tread pattern for treadmill belts, used as an emissive map (white = glow). */
export function beltTexture(): THREE.Texture {
  const key = "belt";
  let base = cache.get(key);
  if (!base) {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size * 2;
    const g = c.getContext("2d")!;
    g.fillStyle = "#000000";
    g.fillRect(0, 0, c.width, c.height);
    g.lineCap = "round";
    g.lineJoin = "round";
    const step = size * 0.55;
    // Chevrons point toward -z (canvas top): the runner's running direction, matching the belt scroll.
    // Two passes: a wide blurred halo, then a bright core, so the arrows read as glowing.
    const passes = [
      { width: size * 0.2, color: "#9a9a9a", blur: size * 0.14 },
      { width: size * 0.1, color: "#ffffff", blur: size * 0.05 },
    ];
    for (const p of passes) {
      g.strokeStyle = p.color;
      g.shadowColor = "#ffffff";
      g.shadowBlur = p.blur;
      g.lineWidth = p.width;
      for (let y = -step; y < c.height + step; y += step) {
        g.beginPath();
        g.moveTo(size * 0.14, y + step * 0.55);
        g.lineTo(size * 0.5, y);
        g.lineTo(size * 0.86, y + step * 0.55);
        g.stroke();
      }
    }
    g.shadowBlur = 0;
    base = new THREE.CanvasTexture(c);
    base.colorSpace = THREE.SRGBColorSpace;
    base.wrapS = base.wrapT = THREE.RepeatWrapping;
    cache.set(key, base);
  }
  const t = base.clone();
  t.repeat.set(1, 3);
  t.needsUpdate = true;
  return t;
}

/** Speckled egg shell (base color + spots), wrapped around a lathe egg. Cached per color pair. */
export function eggShellTexture(base: string, spots: string): THREE.Texture {
  const key = `egg:${base}:${spots}`;
  let t = cache.get(key);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = base;
    g.fillRect(0, 0, c.width, c.height);
    // Deterministic speckles so every copy of an egg type looks the same.
    let seed = [...key].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7);
    const rnd = () => ((seed = (seed * 1103515245 + 12345) | 0) >>> 0) / 4294967296;
    g.fillStyle = spots;
    for (let i = 0; i < 70; i++) {
      const r = 2 + rnd() * 7;
      g.globalAlpha = 0.55 + rnd() * 0.45;
      g.beginPath();
      g.ellipse(rnd() * c.width, 10 + rnd() * (c.height - 20), r, r * 0.8, 0, 0, Math.PI * 2);
      g.fill();
    }
    // A band around the middle, like the striped eggs in the reference.
    g.globalAlpha = 0.35;
    g.fillRect(0, c.height * 0.46, c.width, c.height * 0.1);
    g.globalAlpha = 1;
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    cache.set(key, t);
  }
  return t;
}

/** A big "?" on a dark screen, for the fuse machine's mystery-egg display. */
export function questionTexture(): THREE.Texture {
  const key = "question";
  let t = cache.get(key);
  if (!t) {
    // Matches the Fuse Machine's 3.9 × 3.7 screen, so the "?" isn't squashed.
    const w = 256;
    const h = 243;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w * 0.7);
    grad.addColorStop(0, "#d9f5ff");
    grad.addColorStop(1, "#a9e2fa");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // Dark blue "?" centred on the glyph's real bounds (not the text baseline), so it sits in the middle of the screen.
    g.fillStyle = "#123a86";
    g.font = `900 ${h * 0.72}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    const m = g.measureText("?");
    const top = m.actualBoundingBoxAscent;
    const bottom = m.actualBoundingBoxDescent;
    g.fillText("?", w / 2, h / 2 + (top - bottom) / 2);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, t);
  }
  return t;
}

/**
 * Rescales a box's UVs by its real face sizes so one texture tile always covers `tile` world units
 * (no stretching on big or thin faces). Use this instead of scaling a unit cube after texturing.
 */
export function tileBoxUVs<T extends THREE.BoxGeometry>(geo: T, w: number, h: number, d: number, tile = 2): T {
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 vertices each).
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  faces.forEach(([fu, fv], f) => {
    for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, (uv.getX(i) * fu) / tile, (uv.getY(i) * fv) / tile);
  });
  uv.needsUpdate = true;
  return geo;
}

/**
 * Same idea for InstancedMesh boxes that are non-uniformly scaled per instance: the shader multiplies the UVs
 * by each instance's real face size. `base` is the source geometry's size.
 */
export function tileInstancedUVs<M extends THREE.Material>(material: M, base: [number, number, number], tile = 2): M {
  const size = `vec3(${base.map((n) => n.toFixed(4)).join(",")})`;
  material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
      #if defined( USE_INSTANCING ) && defined( USE_MAP )
        vec3 tSc = vec3( length( instanceMatrix[0].xyz ), length( instanceMatrix[1].xyz ), length( instanceMatrix[2].xyz ) ) * ${size};
        vec3 tN = abs( normal );
        vec2 tDim = tN.x > 0.5 ? tSc.zy : ( tN.y > 0.5 ? tSc.xz : tSc.xy );
        vMapUv = ( mapTransform * vec3( uv * tDim / ${tile.toFixed(2)}, 1.0 ) ).xy;
      #endif`,
    );
  };
  material.customProgramCacheKey = () => `tileInst_${size}_${tile}`;
  return material;
}
