/**
 * Tiny synthesized sound effects (Web Audio, no files). Swap for recorded sounds later.
 * Browsers only allow audio after a user gesture, so the context starts on the first key/tap.
 */
class SfxPlayer {
  private ctx: AudioContext | null = null;
  muted = false;

  constructor() {
    const unlock = () => {
      this.ensure();
      removeEventListener("keydown", unlock);
      removeEventListener("pointerdown", unlock);
    };
    addEventListener("keydown", unlock);
    addEventListener("pointerdown", unlock);
  }

  /** Where the listener is (the player), set every frame, so world sounds can fade with distance. */
  listener = { x: 0, z: 0 };
  /** World sounds stay quiet until this time (ms): stops a burst of sounds for everything that already exists on join. */
  hushUntil = 0;
  private lastStep = 0;

  /** 0..1 loudness for a sound at (x, z): 1 at the listener, fading to 0 at `maxDist`. */
  near(x: number, z: number, maxDist: number): number {
    if (performance.now() < this.hushUntil) return 0;
    const d = Math.hypot(x - this.listener.x, z - this.listener.z);
    return d >= maxDist ? 0 : (1 - d / maxDist) ** 2;
  }

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      return null;
    }
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, cutoff: number, delay = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(ctx.currentTime + delay);
  }

  steal() {
    this.tone(520, 0.12, "square", 0.08, 0, 880);
    this.tone(880, 0.14, "triangle", 0.08, 0.1);
  }

  alarm() {
    for (let i = 0; i < 3; i++) {
      this.tone(760, 0.12, "sawtooth", 0.05, i * 0.24);
      this.tone(540, 0.12, "sawtooth", 0.05, i * 0.24 + 0.12);
    }
  }

  hit() {
    this.noise(0.35, 0.6, 900);
    this.tone(140, 0.3, "sine", 0.4, 0, 50);
  }

  secured() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, "triangle", 0.09, i * 0.08));
  }

  /** Egg hatches: shell taps and cracks, a pop, then a happy rising arpeggio with a sparkle on top. */
  hatch() {
    [0, 0.13, 0.24].forEach((d, i) => {
      this.noise(0.05, 0.3, 3200, d);
      this.tone(900 + i * 250, 0.04, "square", 0.05, d);
    });
    this.noise(0.22, 0.5, 2200, 0.34);
    this.tone(200, 0.16, "sine", 0.25, 0.34, 600);
    [659, 784, 988, 1319, 1568].forEach((f, i) => this.tone(f, 0.24, "triangle", 0.09, 0.5 + i * 0.07));
    this.tone(2637, 0.4, "sine", 0.03, 0.85);
  }

  /** Any menu / button click: a short soft two-note "pop". */
  menu() {
    this.tone(640, 0.06, "triangle", 0.16);
    this.tone(960, 0.09, "triangle", 0.13, 0.035);
  }

  /** Egg placed in the pen: a cartoon "boing" that follows the stretch-and-squash animation. */
  plop() {
    this.tone(160, 0.18, "sine", 0.2, 0, 520); // stretches up
    this.tone(520, 0.14, "sine", 0.14, 0.15, 150); // squashes down
    this.tone(260, 0.12, "sine", 0.1, 0.3, 330); // small settle
    this.noise(0.05, 0.2, 700, 0.3);
  }

  /** A pet's soft footstep (very quiet, and throttled so a crowded pen doesn't rattle). */
  petStep(v: number) {
    const now = performance.now();
    if (v < 0.03 || now - this.lastStep < 70) return;
    this.lastStep = now;
    this.tone(120 + Math.random() * 60, 0.05, "sine", 0.05 * v, 0, 80);
    this.noise(0.03, 0.03 * v, 800);
  }

  /** A sleeping guardian's slow breath / snore: a low rumble that swells and fades. */
  snore(v: number) {
    const ctx = this.ensure();
    if (!ctx || v < 0.02) return;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.8), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.7); // inhale
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7); // exhale
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
    this.tone(62, 1.6, "sawtooth", 0.05 * v, 0.1, 48);
  }

  /** A guardian wakes / starts the chase: a growl-roar (lower `pitch` = bigger animal). */
  roar(v: number, pitch = 1) {
    if (v < 0.02) return;
    this.tone(150 * pitch, 0.75, "sawtooth", 0.16 * v, 0, 70 * pitch);
    this.tone(155 * pitch, 0.75, "square", 0.08 * v, 0.02, 75 * pitch);
    this.noise(0.6, 0.35 * v, 1400);
    this.tone(90 * pitch, 0.5, "sawtooth", 0.1 * v, 0.35, 55 * pitch);
  }

  /** A guardian's heavy footfall while it chases. */
  stomp(v: number, pitch = 1) {
    if (v < 0.02) return;
    this.tone(75 * pitch, 0.2, "sine", 0.4 * v, 0, 35 * pitch);
    this.noise(0.12, 0.2 * v, 450);
  }

  drop() {
    this.tone(300, 0.15, "triangle", 0.1, 0, 150);
  }

  deny() {
    this.tone(200, 0.12, "square", 0.05);
  }

  /** Bat swing: a quick airy whoosh. */
  swing() {
    this.noise(0.18, 0.35, 1800);
    this.tone(420, 0.12, "sine", 0.05, 0, 180);
  }

  /** Bear trap set down: a metallic clunk. */
  trapSet(v = 1) {
    if (v < 0.03) return;
    this.tone(180, 0.1, "square", 0.08 * v, 0, 90);
    this.tone(1400, 0.06, "triangle", 0.04 * v, 0.02);
    this.noise(0.06, 0.15 * v, 2500, 0.05); // the jaws snapping open
  }

  /** Good news (sold, chest, fusion, a trap caught someone…): a soft two-note chime. */
  good() {
    this.tone(880, 0.1, "triangle", 0.05);
    this.tone(1320, 0.14, "triangle", 0.05, 0.08);
  }

  /** Hotbar selection tick. */
  click() {
    this.tone(1200, 0.04, "square", 0.025);
  }
}

export const sfx = new SfxPlayer();
