/**
 * Tiny procedural chiptune engine (Web Audio, no asset files). Rising notes as
 * LOFI climbs, descending blips when he slips, a coin chime on cash-out, a
 * cheer on a cleared floor, a downward sweep on a fall, and a heartbeat thud in
 * the final seconds. Swap for sampled audio (Howler) once art/audio drops in.
 */

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  /** Lazily create + resume the context (must follow a user gesture). */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType = "square", when = 0, gain = 1) {
    if (this.muted || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private sweep(from: number, to: number, dur: number, type: OscillatorType = "sawtooth") {
    if (this.muted || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.6, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Rising note, pitched up by floor index — momentum feels good. */
  floorUp(n: number) {
    this.tone(440 + Math.min(n, 12) * 70, 0.12, "square");
  }

  slip() {
    this.tone(330, 0.08, "triangle");
    this.tone(247, 0.1, "triangle", 0.07);
  }

  coin() {
    this.tone(988, 0.06, "square");
    this.tone(1319, 0.16, "square", 0.06);
  }

  cheer() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, "square", i * 0.07));
  }

  fall() {
    this.sweep(600, 70, 0.55);
  }

  heartbeat() {
    this.tone(70, 0.12, "sine", 0, 0.9);
    this.tone(60, 0.14, "sine", 0.18, 0.8);
  }
}

export const sfx = new Sfx();

/** Haptics helper (mobile). Silently no-ops where unsupported. */
export function buzz(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}
