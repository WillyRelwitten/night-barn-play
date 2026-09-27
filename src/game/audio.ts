let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let amb: GainNode | null = null;
let noise: AudioBuffer | null = null;
let lastSkitter = 0;
let rainGain: GainNode | null = null;
let storm = 0;
let flashV = 0;
let timers: number[] = [];

function now() {
  return ctx?.currentTime ?? 0;
}

function later(fn: () => void, ms: number) {
  const id = window.setTimeout(fn, ms);
  timers.push(id);
  return id;
}

function makeNoise(duration: number) {
  if (!ctx) return null;
  const n = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

function envGain(
  peak: number,
  attack: number,
  decay: number,
  bus: GainNode | null = sfx,
  when = now(),
) {
  if (!ctx || !bus) return null;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  g.connect(bus);
  return g;
}

function playNoise(
  duration: number,
  peak: number,
  freq: number,
  q: number,
  type: BiquadFilterType = "bandpass",
  rate = 1,
  when = now(),
  bus: GainNode | null = sfx,
) {
  if (!ctx || !noise || !bus) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = rate;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = envGain(peak, 0.004, duration, bus, when);
  if (!g) return;
  src.connect(f);
  f.connect(g);
  src.start(when);
  src.stop(when + duration + 0.05);
  src.onended = () => {
    src.disconnect();
    f.disconnect();
    g.disconnect();
  };
}

function playTone(
  freq: number,
  peak: number,
  dur: number,
  type: OscillatorType = "sine",
  slide = 0,
  when = now(),
  bus: GainNode | null = sfx,
) {
  if (!ctx || !bus) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, when);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), when + dur);
  const g = envGain(peak, 0.004, dur, bus, when);
  if (!g) return;
  o.connect(g);
  o.start(when);
  o.stop(when + dur + 0.04);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
}

function startAmbient() {
  if (!ctx || !amb || !noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 280;
  const g = ctx.createGain();
  g.gain.value = 0.07;
  src.connect(f);
  f.connect(g);
  g.connect(amb);
  src.start();

  const lfo = ctx.createOscillator();
  const lfoG = ctx.createGain();
  lfo.frequency.value = 0.05;
  lfoG.gain.value = 90;
  lfo.connect(lfoG);
  lfoG.connect(f.frequency);
  lfo.start();

  const rustle = ctx.createBufferSource();
  rustle.buffer = noise;
  rustle.loop = true;
  rustle.playbackRate.value = 0.35;
  const rf = ctx.createBiquadFilter();
  rf.type = "bandpass";
  rf.frequency.value = 1400;
  rf.Q.value = 0.7;
  const rg = ctx.createGain();
  rg.gain.value = 0.018;
  rustle.connect(rf);
  rf.connect(rg);
  rg.connect(amb);
  rustle.start();

  rainGain = ctx.createGain();
  rainGain.gain.value = 0.0001;
  const rain = ctx.createBufferSource();
  rain.buffer = noise;
  rain.loop = true;
  rain.playbackRate.value = 0.92;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1800;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3200;
  bp.Q.value = 0.55;
  rain.connect(hp);
  hp.connect(bp);
  bp.connect(rainGain);
  rainGain.connect(amb);
  rain.start();

  scheduleCricket();
  scheduleCreak();
  scheduleSkitter();
  scheduleOwl();
  scheduleStorm(true);
}

function scheduleCricket() {
  if (!ctx) return;
  later(
    () => {
      if (ctx && ctx.state === "running") {
        playTone(3900 + Math.random() * 700, 0.016, 0.04, "sine");
        later(
          () => playTone(4200 + Math.random() * 200, 0.01, 0.035, "sine"),
          55 + Math.random() * 40,
        );
        if (Math.random() < 0.4) later(() => playTone(4500, 0.008, 0.03, "sine"), 140);
      }
      scheduleCricket();
    },
    1600 + Math.random() * 3800,
  );
}

function scheduleCreak() {
  if (!ctx) return;
  later(
    () => {
      if (ctx && ctx.state === "running") {
        playNoise(0.45, 0.035, 160, 2.4, "bandpass", 0.55, now(), amb);
      }
      scheduleCreak();
    },
    7000 + Math.random() * 12000,
  );
}

function scheduleSkitter() {
  if (!ctx) return;
  later(
    () => {
      if (ctx && ctx.state === "running" && Math.random() < 0.55) playSkitter();
      scheduleSkitter();
    },
    2800 + Math.random() * 7000,
  );
}

function scheduleOwl() {
  if (!ctx) return;
  later(
    () => {
      if (ctx && ctx.state === "running") playOwl();
      scheduleOwl();
    },
    16000 + Math.random() * 28000,
  );
}

function playOwl() {
  if (!ctx || !amb) return;
  const t = now();
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  pan.connect(amb);
  const hoot = (when: number, freq: number, peak: number) => {
    const o = ctx!.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, when);
    o.frequency.exponentialRampToValueAtTime(freq * 0.86, when + 0.28);
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.32);
    o.connect(g);
    g.connect(pan);
    o.start(when);
    o.stop(when + 0.36);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  };
  hoot(t, 355, 0.028);
  hoot(t + 0.38, 310, 0.022);
  later(() => pan.disconnect(), 1200);
}

function playThunder() {
  if (!ctx) return;
  const t = now();
  playNoise(1.15, 0.16, 70, 0.7, "lowpass", 0.28, t, amb);
  playTone(48, 0.1, 0.9, "sine", -12, t, amb);
  playNoise(0.55, 0.08, 180, 0.9, "lowpass", 0.4, t + 0.18, amb);
}

function scheduleStorm(first = false) {
  if (!ctx || !rainGain) return;
  later(
    () => {
      if (!ctx || !rainGain) {
        scheduleStorm();
        return;
      }
      const dur = 18000 + Math.random() * 22000;
      storm = 1;
      rainGain.gain.setTargetAtTime(0.085 + Math.random() * 0.04, ctx.currentTime, 1.8);
      // Lightning: flash first, thunder follows after a "distance" delay.
      const scheduleBolt = (thunderDelay: number) => {
        const flashDelay = Math.max(60, thunderDelay - (400 + Math.random() * 1500));
        later(() => {
          flashV = 0.75 + Math.random() * 0.25;
        }, flashDelay);
        later(() => {
          flashV = Math.max(flashV, 0.45);
        }, flashDelay + 110);
        later(() => playThunder(), thunderDelay);
      };
      scheduleBolt(1200 + Math.random() * 4000);
      if (Math.random() < 0.7) scheduleBolt(7000 + Math.random() * 8000);
      later(() => {
        storm = 0;
        if (rainGain && ctx) rainGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 2.4);
      }, dur);
      scheduleStorm();
    },
    (first ? 12000 : 38000) + Math.random() * (first ? 9000 : 50000),
  );
}

export function getStorm() {
  return storm;
}

/** Current lightning flash intensity, 0..1. Decays via tickFlash. */
export function getFlash() {
  return flashV;
}

export function tickFlash(dt: number) {
  flashV = Math.max(0, flashV - dt * 2.4);
}

export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    sfx = ctx.createGain();
    amb = ctx.createGain();
    sfx.gain.value = 0.9;
    amb.gain.value = 1;
    sfx.connect(master);
    amb.connect(master);
    master.connect(ctx.destination);
    noise = makeNoise(1.4);
    startAmbient();
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function setMasterMuted(muted: boolean) {
  if (!master || !ctx) return;
  master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.03);
}

export function resumeAudio() {
  if (ctx?.state === "suspended") void ctx.resume();
}

export function playShot() {
  const t = now();
  playNoise(0.035, 0.42, 3200, 0.55, "highpass", 1.35, t);
  playNoise(0.07, 0.22, 1100, 0.9, "bandpass", 1.1, t);
  playTone(190, 0.16, 0.05, "sine", -80, t);
  playTone(2550, 0.07, 0.025, "square", 0, t);
}

export function playBoltCycle() {
  const t = now();
  playNoise(0.048, 0.22, 2400, 0.9, "highpass", 1.45, t + 0.16);
  playTone(1480, 0.06, 0.03, "square", 0, t + 0.16);
  playTone(2100, 0.038, 0.085, "sine", -420, t + 0.4);
  playNoise(0.055, 0.05, 4300, 0.55, "highpass", 1.85, t + 0.4);
  playNoise(0.042, 0.2, 1750, 1.05, "highpass", 1.18, t + 0.7);
  playTone(210, 0.09, 0.045, "sine", -55, t + 0.7);
  playNoise(0.028, 0.075, 2750, 1.15, "highpass", 1.55, t + 1.0);
}

export function playBolt() {
  playBoltCycle();
}

export function playDry() {
  playNoise(0.03, 0.08, 1800, 0.8, "highpass", 1.8);
}

export function playHit() {
  playTone(1880, 0.1, 0.055, "sine", -900);
  playTone(160, 0.12, 0.07, "sine", -50);
  playNoise(0.05, 0.1, 700, 1.1, "bandpass", 0.95);
}

export function playImpact() {
  playNoise(0.09, 0.16, 380, 0.95, "bandpass", 0.65);
  playTone(64, 0.08, 0.07, "sine");
}

export function playStep() {
  playNoise(
    0.055,
    0.06 + Math.random() * 0.025,
    210 + Math.random() * 50,
    1.2,
    "bandpass",
    0.65 + Math.random() * 0.25,
  );
}

export function playFloorboard() {
  playNoise(
    0.22,
    0.055,
    140 + Math.random() * 40,
    2.1,
    "bandpass",
    0.42 + Math.random() * 0.12,
    now(),
    amb,
  );
  playTone(90 + Math.random() * 25, 0.03, 0.16, "sine", -20, now(), amb);
}

export function playSkitter() {
  const t = performance.now();
  if (t - lastSkitter < 180) return;
  lastSkitter = t;
  playNoise(0.045, 0.045, 3400 + Math.random() * 800, 1.3, "highpass", 1.4 + Math.random() * 0.4);
  playTone(2400 + Math.random() * 900, 0.018, 0.03, "sine", -400);
}

/** Soft cue when a mouse claims a high perch: faint claws on wood, distant squeak. */
export function playPerch() {
  if (!ctx || !amb) return;
  const t = now();
  playNoise(0.03, 0.035, 900, 1.4, "bandpass", 0.9, t, amb);
  playNoise(0.03, 0.028, 1100, 1.4, "bandpass", 1.1, t + 0.14, amb);
  playTone(2600, 0.014, 0.05, "sine", 500, t + 0.3, amb);
}
