import * as THREE from "three";

export const FONT = `"Fredoka", "Arial Rounded MT Bold", "Segoe UI", sans-serif`;

export interface LabelLine {
  text: string;
  color?: string;
  /** Relative font size (1 = default). */
  size?: number;
}

export interface LabelOptions {
  /** World height of one default-size text line, in units. */
  lineHeight?: number;
  outline?: string;
  /** Keep the same pixel size regardless of distance. */
  fixedSize?: boolean;
  /** Draw on top of scene geometry. */
  alwaysOnTop?: boolean;
  /** Called after every redraw (text changed or web font arrived). */
  onRedraw?: () => void;
}

/**
 * Billboard text sprite in the game's chunky outlined style
 * (used for nameplates, pet tags, building labels).
 */
export class TextLabel extends THREE.Sprite {
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private tex = new THREE.CanvasTexture(this.canvas);
  private lines: LabelLine[] = [];

  constructor(lines: LabelLine[] | string, private opts: LabelOptions = {}) {
    super();
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.SpriteMaterial({
      map: this.tex,
      transparent: true,
      depthWrite: false,
      depthTest: !opts.alwaysOnTop,
      sizeAttenuation: !opts.fixedSize,
    });
    this.renderOrder = opts.alwaysOnTop ? 10 : 0;
    this.center.set(0.5, 0);
    this.setLines(typeof lines === "string" ? [{ text: lines }] : lines);
    // Re-render once web fonts arrive so labels are not stuck with the fallback font.
    document.fonts?.ready.then(() => this.redraw());
  }

  setLines(lines: LabelLine[] | string) {
    const next = typeof lines === "string" ? [{ text: lines }] : lines;
    if (JSON.stringify(next) === JSON.stringify(this.lines)) return;
    this.lines = next;
    this.redraw();
  }

  private redraw() {
    const px = 64;
    const pad = 12;
    const g = this.ctx;
    const sizes = this.lines.map((l) => (l.size ?? 1) * px);
    g.font = `700 ${px}px ${FONT}`;
    let width = 0;
    for (let i = 0; i < this.lines.length; i++) {
      g.font = `700 ${sizes[i]}px ${FONT}`;
      width = Math.max(width, g.measureText(this.lines[i].text).width);
    }
    const height = sizes.reduce((a, b) => a + b * 1.1, 0);
    this.canvas.width = Math.ceil(width + pad * 2);
    this.canvas.height = Math.ceil(height + pad * 2);

    g.textAlign = "center";
    g.textBaseline = "top";
    g.lineJoin = "round";
    let y = pad;
    for (let i = 0; i < this.lines.length; i++) {
      const l = this.lines[i];
      g.font = `700 ${sizes[i]}px ${FONT}`;
      g.lineWidth = sizes[i] * 0.06;
      g.strokeStyle = this.opts.outline ?? "#1b1b1b";
      g.strokeText(l.text, this.canvas.width / 2, y);
      g.fillStyle = l.color ?? "#ffffff";
      g.fillText(l.text, this.canvas.width / 2, y);
      y += sizes[i] * 1.1;
    }
    this.tex.dispose();
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    (this.material as THREE.SpriteMaterial).map = this.tex;
    (this.material as THREE.SpriteMaterial).needsUpdate = true;

    // Fixed-size sprites are measured in screen-height fractions (≈1.4 = full height at fov 70).
    const unit = this.opts.fixedSize ? 0.0007 : (this.opts.lineHeight ?? 0.6) / px;
    this.scale.set(this.canvas.width * unit, this.canvas.height * unit, 1);
    this.opts.onRedraw?.();
  }

  dispose() {
    this.tex.dispose();
    (this.material as THREE.SpriteMaterial).dispose();
  }
}

/**
 * Same outlined text as TextLabel, but printed flat on a sign board instead of billboarding:
 * a front plane (+z) and a back plane (-z, `backOffset` behind it) so the text reads from both sides.
 */
export class PlaneLabel extends THREE.Group {
  private src: TextLabel | null = null;
  private front = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
  private back: THREE.Mesh;

  constructor(opts: LabelOptions = {}, backOffset = 0.26) {
    super();
    this.back = new THREE.Mesh(this.front.geometry, this.front.material);
    this.back.rotation.y = Math.PI;
    this.back.position.z = -backOffset;
    this.add(this.front, this.back);
    this.src = new TextLabel("", { ...opts, onRedraw: () => this.sync() });
    this.sync();
  }

  setLines(lines: LabelLine[] | string) {
    this.src?.setLines(lines);
  }

  private sync() {
    if (!this.src) return;
    const mat = this.front.material as THREE.MeshBasicMaterial;
    mat.map = (this.src.material as THREE.SpriteMaterial).map;
    mat.needsUpdate = true;
    for (const m of [this.front, this.back]) m.scale.set(this.src.scale.x, this.src.scale.y, 1);
  }
}

/** Flat text drawn on a plane (floor decals, signs). */
export function textPlane(text: string, widthUnits: number, color = "#ffffff", outline = "#111111"): THREE.Mesh {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const px = 160;
  g.font = `700 ${px}px ${FONT}`;
  c.width = Math.ceil(g.measureText(text).width + 60);
  c.height = Math.ceil(px * 1.4);
  const draw = () => {
    g.clearRect(0, 0, c.width, c.height);
    g.font = `700 ${px}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = px * 0.05;
    g.strokeStyle = outline;
    g.strokeText(text, c.width / 2, c.height / 2);
    g.fillStyle = color;
    g.fillText(text, c.width / 2, c.height / 2);
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  draw();
  document.fonts?.ready.then(draw);
  const h = (widthUnits * c.height) / c.width;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(widthUnits, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
}
