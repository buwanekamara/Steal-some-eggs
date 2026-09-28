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

  private noise(dur: number, gain: number, cutoff: number) {
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
    src.start();
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

  /** Egg cracks open: a crunch, then a sparkly rising arpeggio. */
  hatch() {
    this.noise(0.12, 0.35, 2500);
    [659, 784, 988, 1319, 1568].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.08, 0.1 + i * 0.07));
  }

  drop() {
    this.tone(300, 0.15, "triangle", 0.1, 0, 150);
  }

  deny() {
    this.tone(200, 0.12, "square", 0.05);
  }
}

export const sfx = new SfxPlayer();
