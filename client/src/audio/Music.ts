/**
 * Generative background music (Web Audio, no files): an easy-going, upbeat tune by day in the safe zone, a laid-back
 * beat at night, and a bouncier, quieter one inside the biomes. Each mood has its own gain bus so switching crossfades.
 * Like the sound effects, it only starts after the first key press / tap (browser autoplay rules).
 */

export type Mood = "day" | "night" | "biome";

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

interface MoodDef {
  /** Loudness of this mood's bus (biomes sit lower, under the game sounds). */
  volume: number;
  /** Beats per minute, and how many steps make one beat (2 = eighth notes). */
  bpm: number;
  stepsPerBeat: number;
}

const MOODS: Record<Mood, MoodDef> = {
  day: { volume: 0.4, bpm: 104, stepsPerBeat: 2 },
  night: { volume: 0.36, bpm: 80, stepsPerBeat: 2 },
  biome: { volume: 0.22, bpm: 126, stepsPerBeat: 2 },
};

/** Chord tones as semitone offsets from the key's root: I - V - vi - IV, and the minor i - VI - III - VII. */
const MAJOR_PROG = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];
const MINOR_PROG = [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]];

class MusicPlayer {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private buses = new Map<Mood, GainNode>();
  private mood: Mood = "day";
  /** Semitone offset per biome so each one plays in its own key. */
  private key = 0;
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private started = false;

  constructor() {
    const unlock = () => {
      this.start();
      removeEventListener("keydown", unlock);
      removeEventListener("pointerdown", unlock);
    };
    addEventListener("keydown", unlock);
    addEventListener("pointerdown", unlock);
  }

  private start() {
    if (this.started) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.started = true;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    // One second of white noise, reused for every hat and snare.
    this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nextTime = this.ctx.currentTime + 0.2;
    this.applyMood(true);
    this.timer = window.setInterval(() => this.tick(), 100);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx && this.master) {
      if (!muted && this.ctx.state === "suspended") void this.ctx.resume();
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.3);
    }
  }

  /** Switch mood (and, for biomes, the key: pass the biome's index). */
  setMood(mood: Mood, biomeIndex = 0) {
    const key = mood === "biome" ? [0, 2, 5, 7, 3, 9, 4, 10, 1, 6, 8, 11][biomeIndex % 12] : 0;
    if (mood === this.mood && key === this.key) return;
    this.mood = mood;
    this.key = key;
    this.applyMood(false);
  }

  private bus(mood: Mood): GainNode {
    let b = this.buses.get(mood);
    if (!b) {
      b = this.ctx!.createGain();
      b.gain.value = 0;
      b.connect(this.master!);
      this.buses.set(mood, b);
    }
    return b;
  }

  private applyMood(instant: boolean) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const m of Object.keys(MOODS) as Mood[]) {
      const g = this.bus(m).gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(m === this.mood ? MOODS[m].volume : 0, now, instant ? 0.05 : 0.8); // crossfade
    }
    this.step = 0;
    this.nextTime = Math.max(this.nextTime, now + 0.1);
  }

  private tick() {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== "running") {
      if (ctx) this.nextTime = Math.max(this.nextTime, ctx.currentTime + 0.1); // don't queue a burst of notes after a pause
      return;
    }
    const def = MOODS[this.mood];
    const stepDur = 60 / def.bpm / def.stepsPerBeat;
    while (this.nextTime < ctx.currentTime + 0.35) {
      this.play(this.mood, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  // ------------------------------------------------------------------ instruments

  private note(bus: GainNode, freq: number, t: number, dur: number, type: OscillatorType, gain: number, attack = 0.008) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(bus: GainNode, t: number, gain: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.25);
  }

  /** Filtered noise burst: a high one is a hi-hat, a mid one with a longer tail is a snare/clap. */
  private hit(bus: GainNode, t: number, gain: number, cutoff: number, dur: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------------ the tunes

  private play(mood: Mood, step: number, t: number, dur: number) {
    const bus = this.bus(mood);
    if (mood === "day") return this.playDay(bus, step, t, dur);
    if (mood === "night") return this.playNight(bus, step, t, dur);
    this.playBiome(bus, step, t, dur);
  }

  /** Day: a relaxed but upbeat groove in C major: bouncy bass, chord arpeggio, a singable hook and a light beat. */
  private playDay(bus: GainNode, step: number, t: number, dur: number) {
    const root = 60;
    const bar = Math.floor(step / 8);
    const chord = MAJOR_PROG[bar % 4];
    const s = step % 8;
    // Bass on beats 1 and 3, with a little pickup.
    if (s === 0 || s === 4) this.note(bus, midi(root - 24 + chord[0]), t, dur * 3, "sine", 0.24);
    if (s === 6) this.note(bus, midi(root - 24 + chord[2]), t, dur * 1.5, "sine", 0.16);
    // Chord arpeggio on every step.
    this.note(bus, midi(root - 12 + chord[[0, 1, 2, 1, 0, 1, 2, 1][s]]), t, dur * 1.4, "triangle", 0.1);
    // Hook: a 4-bar, 32-step call-and-response over the chords (major scale degrees; null = rest).
    const hook: (number | null)[] = [
      4, null, 7, null, 9, 7, null, 4, // C
      2, null, 4, null, 7, null, 4, 2, // G
      0, null, 4, null, 7, 9, null, 7, // Am
      5, null, 9, null, 7, null, 4, null, // F
    ];
    const n = hook[step % 32];
    if (n !== null) this.note(bus, midi(root + 12 + n), t, dur * 1.6, "triangle", 0.16);
    // Light drums.
    if (s === 0 || s === 4) this.kick(bus, t, 0.35);
    if (s % 2 === 1) this.hit(bus, t, 0.05, 7000, 0.05);
    if (s === 2 || s === 6) this.hit(bus, t, 0.08, 1800, 0.12); // soft snare
  }

  /** Night: a laid-back minor groove (A minor) with a warm bass and a mellow arpeggio; still has a steady beat. */
  private playNight(bus: GainNode, step: number, t: number, dur: number) {
    const root = 57;
    const bar = Math.floor(step / 8);
    const chord = MINOR_PROG[bar % 4];
    const s = step % 8;
    if (s === 0 || s === 3 || s === 6) this.note(bus, midi(root - 24 + chord[0]), t, dur * 2.5, "sine", 0.26);
    this.note(bus, midi(root - 12 + chord[[0, 2, 1, 2, 0, 2, 1, 2][s]]), t, dur * 1.8, "triangle", 0.09);
    const lead = [0, null, null, 7, null, 5, null, 3] as const; // pentatonic answers, one per bar
    const n = lead[s];
    if (n !== null) this.note(bus, midi(root + 12 + n + (bar % 2 ? 3 : 0)), t, dur * 2.2, "sine", 0.13);
    if (s === 0 || s === 5) this.kick(bus, t, 0.3);
    if (s === 4) this.hit(bus, t, 0.07, 1500, 0.14);
    if (s % 2 === 1) this.hit(bus, t, 0.03, 8000, 0.04);
  }

  /** Biomes: a bouncy, quiet, playful tune in a per-biome key with a four-on-the-floor beat. */
  private playBiome(bus: GainNode, step: number, t: number, dur: number) {
    const root = 60 + this.key;
    const major = [0, 2, 4, 5, 7, 9, 11, 12, 14];
    const s = step % 16;
    const hook = [0, 2, 4, 2, 7, 4, 2, 0, 4, 5, 7, 5, 9, 7, 5, 4]; // scale degrees, two bars
    if (s % 8 !== 7 && Math.random() < 0.9) {
      const n = root + major[hook[s] % 9];
      this.note(bus, midi(n), t, dur * 0.8, "triangle", 0.15);
      if (s % 4 === 0) this.note(bus, midi(n + 12), t, dur * 0.4, "square", 0.03);
    }
    if (s % 2 === 0) this.note(bus, midi(root - 24 + [0, 0, 5, 5, 7, 7, 5, 5][s >> 1]), t, dur * 1.4, "sine", 0.2); // walking bass
    if (s % 2 === 0) this.kick(bus, t, 0.3);
    if (s % 4 === 2) this.hit(bus, t, 0.05, 7500, 0.05);
    if (s === 4 || s === 12) this.hit(bus, t, 0.09, 1600, 0.12);
  }
}

export const music = new MusicPlayer();
