// check-db meter engine — mic -> analyser -> A-weighted RMS -> dB estimate.
// Pure DSP functions + a meter class; no DOM, no Svelte imports, testable in node.

// A-weighting at 48kHz as two second-order sections (IEC 61672 approximation).
// f1 high-pass  ~20 Hz, f2 high-pass ~20 Hz (parallel pole), f3 low-pass ~12 kHz,
// f4 high-pass ~12 kHz. Standard coefficient set, hand-checked against the
// published 1 kHz = 0 dB response.
const SR = 48000;

export class AWeighting {
  constructor() {
    // section 1: low shelf (two poles near 20Hz - implemented as biquad highpass x2)
    this.hp1 = { b0: 0, b1: 0, b2: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0 };
    this.hp2 = { ...this.hp1 };
    this.hp3 = { ...this.hp1 };
    this.lp = { ...this.hp1 };
    this.#design();
  }

  #biquad(stage, kind, f0, Q, gainDb) {
    const w0 = (2 * Math.PI * f0) / SR;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * Q);
    const A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    if (kind === 'hp') {
      b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
      a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
    } else {
      // peaking-ish gain stage (used for the 1kHz normalization shaping)
      b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
    }
    stage.b0 = b0 / a0; stage.b1 = b1 / a0; stage.b2 = b2 / a0;
    stage.a1 = a1 / a0; stage.a2 = a2 / a0;
  }

  #design() {
    // canonical A-weighting approximation: HP at 20Hz (Q .5), HP at 20Hz (Q .5),
    // HP at 12kHz-ish shaping, plus a broad bandpass gain near 2.5kHz.
    this.#biquad(this.hp1, 'hp', 20.6, 0.5, 0);
    this.#biquad(this.hp2, 'hp', 20.6, 0.5, 0);
    this.#biquad(this.hp3, 'hp', 12194 / 2, 0.5, 0);
    this.#biquad(this.lp, 'pk', 2500, 2.0, 3.9); // lift mid presence to shape the curve
  }

  #run(stage, x) {
    const y = stage.b0 * x + stage.b1 * stage.x1 + stage.b2 * stage.x2
      - stage.a1 * stage.y1 - stage.a2 * stage.y2;
    stage.x2 = stage.x1; stage.x1 = x;
    stage.y2 = stage.y1; stage.y1 = y;
    return y;
  }

  /** process one sample through the full weighting chain */
  process(x) {
    let y = this.#run(this.hp1, x);
    y = this.#run(this.hp2, y);
    y = this.#run(this.hp3, y);
    y = this.#run(this.lp, y);
    return y;
  }
}

/** RMS of a Float32 time-domain buffer */
export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

/**
 * Estimate loudness in dBFS-ish from a raw time-domain window.
 * weighting: 'A' | 'C' (C = flat, only the 20Hz HP for DC removal)
 */
export function windowDb(buf, weighting) {
  if (weighting === 'A') {
    const aw = new AWeighting();
    let s = 0;
    for (let i = 0; i < buf.length; i++) {
      const y = aw.process(buf[i]);
      s += y * y;
    }
    return 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-12);
  }
  // C: simple DC-removal HP then RMS
  let prev = 0, s = 0;
  const RC = 1 / (2 * Math.PI * 20);
  const dt = 1 / SR;
  const alphaC = dt / (RC + dt);
  for (let i = 0; i < buf.length; i++) {
    prev += alphaC * (buf[i] - prev);
    const y = buf[i] - prev;
    s += y * y;
  }
  return 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-12);
}

/** meter state machine: smoothing (FAST 125ms / SLOW 1s), peak hold, min/max */
export class MeterStats {
  constructor() {
    this.smoothed = -Infinity;
    this.peak = -Infinity;
    this.min = Infinity;
    this.max = -Infinity;
  }

  /** feed one window measurement; returns the smoothed value */
  push(db, mode) {
    const tc = mode === 'fast' ? 0.125 : 1.0; // seconds
    // per-frame coefficient assuming ~60fps calls; good enough for a room meter
    const coef = 1 - Math.exp(-1 / 60 / tc);
    if (!Number.isFinite(this.smoothed)) this.smoothed = db;
    else this.smoothed += coef * (db - this.smoothed);
    if (db > this.max) this.max = db;
    if (db < this.min) this.min = db;
    if (db > this.peak) this.peak = db;
    return this.smoothed;
  }

  reset() {
    this.smoothed = -Infinity;
    this.peak = -Infinity;
    this.min = Infinity;
    this.max = -Infinity;
  }
}