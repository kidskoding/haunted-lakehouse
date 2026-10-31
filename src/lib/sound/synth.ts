/*
 * Every sound in the game is synthesized here as plain sample arrays, so the audio needs no
 * licensed files and the same seed always renders the same night. Nothing in this module
 * touches Web Audio; the sound manager wraps the samples in buffers.
 */

/** The signature stings. */
export type Sting = "candle-out" | "hour-cleared" | "death";

export const STINGS: readonly Sting[] = ["candle-out", "hour-cleared", "death"];

/** Length of the ambient loop in seconds. */
export const AMBIENT_LOOP_SECONDS = 24;

/** The night that ships. Any other seed is a different, equally valid night. */
export const AMBIENT_SEED = 0x1031;

/** Peak level each render is normalized to, so the gain stages alone set loudness. */
export const PEAK = { ambient: 0.5, sting: 0.9 } as const;

/** mulberry32: a tiny seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A cricket's chirp group or an owl's call, placed in the ambient loop. */
export type AmbientEvent =
  | {
      readonly kind: "cricket";
      readonly at: number;
      readonly pitch: number;
      readonly chirps: number;
    }
  | { readonly kind: "owl"; readonly at: number; readonly pitch: number };

/** The crossfade that joins the loop's tail to its head, in seconds. */
const SEAM_SECONDS = 1;

/**
 * Where the crickets and the owl fall in the loop. Events stay clear of the seam, so the
 * crossfade only ever blends wind with wind.
 */
export function ambientEvents(seed: number): AmbientEvent[] {
  const rand = mulberry32(seed);
  const start = SEAM_SECONDS + 0.5;
  const span = AMBIENT_LOOP_SECONDS - SEAM_SECONDS - 3 - start;
  const events: AmbientEvent[] = [];
  const crickets = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < crickets; i += 1) {
    events.push({
      kind: "cricket",
      at: start + rand() * span,
      pitch: 4100 + rand() * 500,
      chirps: 2 + Math.floor(rand() * 3),
    });
  }
  // One owl, sometimes two: rare enough to be noticed.
  const owls = rand() < 0.5 ? 1 : 2;
  for (let i = 0; i < owls; i += 1) {
    events.push({ kind: "owl", at: start + rand() * span, pitch: 360 + rand() * 50 });
  }
  return events.sort((a, b) => a.at - b.at);
}

function normalize(samples: Float32Array<ArrayBuffer>, peak: number): Float32Array<ArrayBuffer> {
  let max = 0;
  for (const sample of samples) max = Math.max(max, Math.abs(sample));
  if (max === 0) return samples;
  const scale = peak / max;
  for (let i = 0; i < samples.length; i += 1) samples[i] = (samples[i] ?? 0) * scale;
  return samples;
}

/** Adds a sine `frequency` at `offset` samples, shaped by `envelope(t)` over `seconds`. */
function addTone(
  out: Float32Array,
  sampleRate: number,
  offset: number,
  seconds: number,
  frequency: (t: number) => number,
  envelope: (t: number) => number,
) {
  const length = Math.min(Math.floor(seconds * sampleRate), out.length - offset);
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    phase += (2 * Math.PI * frequency(t)) / sampleRate;
    const index = offset + i;
    out[index] = (out[index] ?? 0) + Math.sin(phase) * envelope(t);
  }
}

/** A soft attack then an exponential tail: the shape of anything struck or plucked. */
function strike(attack: number, decay: number): (t: number) => number {
  return (t) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));
}

/**
 * The ambient night: low wind that swells and brightens in slow gusts, a few cricket chirp
 * groups, and an owl. Renders `seam` extra seconds and crossfades them over the head, so the
 * last sample runs straight into the first and the loop has no click.
 */
export function renderAmbient(sampleRate: number, seed = AMBIENT_SEED): Float32Array<ArrayBuffer> {
  const rand = mulberry32(seed ^ 0x5eed);
  const loop = Math.floor(AMBIENT_LOOP_SECONDS * sampleRate);
  const seam = Math.floor(SEAM_SECONDS * sampleRate);
  const raw = new Float32Array(loop + seam);

  // Gusts are whole cycles of the loop, so the swell lines up with itself at the seam.
  const phaseA = rand() * 2 * Math.PI;
  const phaseB = rand() * 2 * Math.PI;
  const swell = (t: number) => {
    const x = (2 * Math.PI * t) / AMBIENT_LOOP_SECONDS;
    return 0.55 + 0.3 * Math.sin(2 * x + phaseA) + 0.15 * Math.sin(5 * x + phaseB);
  };
  let brown = 0;
  let low = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const t = i / sampleRate;
    const gust = swell(t);
    brown = (brown + 0.02 * (rand() * 2 - 1)) / 1.02;
    // The lowpass opens as the gust rises: wind brightens when it blows harder.
    const coefficient = 0.02 + 0.06 * gust;
    low += coefficient * (brown - low);
    raw[i] = low * gust * 6;
  }

  for (const event of ambientEvents(seed)) {
    const offset = Math.floor(event.at * sampleRate);
    if (event.kind === "cricket") {
      // A chirp is three quick pulses; a group is a few chirps a third of a second apart.
      for (let c = 0; c < event.chirps; c += 1) {
        for (let p = 0; p < 3; p += 1) {
          const start = offset + Math.floor((c * 0.33 + p * 0.028) * sampleRate);
          addTone(
            raw,
            sampleRate,
            start,
            0.018,
            () => event.pitch,
            (t) => 0.035 * Math.sin((Math.PI * t) / 0.018),
          );
        }
      }
    } else {
      // "Hoo ... hoo-hoo": each note glides down slightly, with a quiet octave for breath.
      const notes = [
        [0, 0.42],
        [0.62, 0.22],
        [0.9, 0.5],
      ] as const;
      for (const [delay, length] of notes) {
        const start = offset + Math.floor(delay * sampleRate);
        const envelope = (t: number) =>
          0.07 * Math.min(1, t / 0.06) * Math.max(0, Math.min(1, (length - t) / 0.12));
        const glide = (t: number) => event.pitch * (1 - 0.04 * (t / length));
        addTone(raw, sampleRate, start, length, glide, envelope);
        addTone(
          raw,
          sampleRate,
          start,
          length,
          (t) => 2 * glide(t),
          (t) => 0.15 * envelope(t),
        );
      }
    }
  }

  const out = raw.slice(0, loop);
  for (let i = 0; i < seam; i += 1) {
    const x = (i / seam) * (Math.PI / 2);
    out[i] = (raw[i] ?? 0) * Math.sin(x) + (raw[loop + i] ?? 0) * Math.cos(x);
  }
  return normalize(out, PEAK.ambient);
}

/** A struck bell: inharmonic partials, each decaying at its own rate. */
function bell(
  out: Float32Array,
  sampleRate: number,
  at: number,
  fundamental: number,
  partials: readonly (readonly [ratio: number, amplitude: number, decay: number])[],
) {
  const offset = Math.floor(at * sampleRate);
  const seconds = out.length / sampleRate - at;
  for (const [ratio, amplitude, decay] of partials) {
    // Each partial is a slightly detuned pair; their beating is what makes a bell shimmer.
    for (const detune of [1, 1.0015]) {
      const envelope = strike(0.004, decay);
      addTone(
        out,
        sampleRate,
        offset,
        seconds,
        () => fundamental * ratio * detune,
        (t) => 0.5 * amplitude * envelope(t),
      );
    }
  }
}

/**
 * Candle out: a breath of filtered noise that flutters as the flame fights, then a small
 * low puff as it gives up.
 */
function candleOut(sampleRate: number): Float32Array<ArrayBuffer> {
  const rand = mulberry32(0xca4d1e);
  const out = new Float32Array(Math.floor(1.4 * sampleRate));
  let low = 0;
  let lower = 0;
  for (let i = 0; i < out.length; i += 1) {
    const t = i / sampleRate;
    const white = rand() * 2 - 1;
    low += 0.25 * (white - low);
    lower += 0.04 * (white - lower);
    // Bandpass around the hiss of breath: a fast lowpass minus a slow one.
    const breath = low - lower;
    // The flutter slows as it fades, like a flame guttering out.
    const flutter = 0.65 + 0.35 * Math.sin(2 * Math.PI * (9 * t - 2.2 * t * t));
    const envelope = Math.min(1, t / 0.03) * Math.exp(-t / 0.32);
    out[i] = breath * flutter * envelope;
  }
  addTone(
    out,
    sampleRate,
    Math.floor(0.05 * sampleRate),
    0.5,
    (t) => 90 - 30 * t,
    strike(0.01, 0.09),
  );
  return out;
}

/** Hour cleared: a warm bell on E4, answered softly a fifth above. */
function hourCleared(sampleRate: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.floor(3.6 * sampleRate));
  const partials = [
    [0.5, 0.35, 2.6],
    [1, 1, 2.0],
    [2, 0.45, 1.3],
    [2.4, 0.22, 1.0],
    [3, 0.16, 0.75],
    [4.2, 0.08, 0.45],
  ] as const;
  bell(out, sampleRate, 0, 329.63, partials);
  bell(
    out,
    sampleRate,
    0.16,
    493.88,
    partials.map(([ratio, amplitude, decay]) => [ratio, amplitude * 0.45, decay * 0.8] as const),
  );
  return out;
}

/**
 * Death: one low toll on a church-bell spectrum (hum, prime, minor-third tierce, quint,
 * nominal) with a long hum that outlasts everything else.
 */
function death(sampleRate: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.floor(6.5 * sampleRate));
  bell(out, sampleRate, 0, 196, [
    [0.25, 0.7, 4.2],
    [0.5, 0.8, 3.0],
    [0.6, 0.45, 2.2],
    [0.75, 0.25, 1.6],
    [1, 0.55, 1.4],
    [1.5, 0.18, 0.8],
    [2, 0.1, 0.5],
  ]);
  return out;
}

/**
 * Softens the last `seconds` of a buffer to zero so a long bell hum ends cleanly instead of
 * cutting mid-decay when the AudioBufferSourceNode stops.
 */
function fadeTail(samples: Float32Array<ArrayBuffer>, sampleRate: number, seconds: number) {
  const fade = Math.min(samples.length, Math.floor(seconds * sampleRate));
  const start = samples.length - fade;
  for (let i = 0; i < fade; i += 1) {
    const index = start + i;
    samples[index] = (samples[index] ?? 0) * (1 - i / fade);
  }
}

/** Renders one sting at `sampleRate`. Stings use fixed seeds: a sting is a signature. */
export function renderSting(sting: Sting, sampleRate: number): Float32Array<ArrayBuffer> {
  let samples: Float32Array<ArrayBuffer>;
  switch (sting) {
    case "candle-out":
      samples = candleOut(sampleRate);
      break;
    case "hour-cleared":
      samples = hourCleared(sampleRate);
      break;
    case "death":
      samples = death(sampleRate);
      break;
  }
  normalize(samples, PEAK.sting);
  // Long partials outlast their buffers; a short fade keeps the stop from clicking.
  fadeTail(samples, sampleRate, 0.35);
  return samples;
}
