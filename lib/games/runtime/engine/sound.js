// Every sound is synthesized with Web Audio. Browsers keep audio silent until a click
// or key press, so play() does nothing before that and nothing needs to wait for it.
import { createRng, rand } from "./math.js";
import * as storage from "./storage.js";

const noteHz = (midi) => 440 * 2 ** ((midi - 69) / 12);

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

// Patterns are 16 steps of one bar: x hits, anything else rests
const STYLES = {
  arcade: { bpm: 132, root: 57, scale: "minor", lead: "square", bass: "triangle", kick: "x...x...x...x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", chords: [0, 5, 3, 4], density: 0.55 },
  adventure: { bpm: 108, root: 60, scale: "major", lead: "triangle", bass: "sine", kick: "x.....x...x.....", snare: "....x.......x...", hat: "..x...x...x...x.", chords: [0, 3, 4, 0], density: 0.45 },
  calm: { bpm: 76, root: 62, scale: "pentatonic", lead: "sine", bass: "sine", kick: "x...............", snare: "................", hat: "................", chords: [0, 2, 3, 1], density: 0.22 },
  tense: { bpm: 96, root: 45, scale: "minor", lead: "sawtooth", bass: "sawtooth", kick: "x..x..x..x..x...", snare: "............x...", hat: "x...x...x...x...", chords: [0, 0, 5, 4], density: 0.2 },
  action: { bpm: 156, root: 52, scale: "dorian", lead: "sawtooth", bass: "square", kick: "x..x..x.x..x..x.", snare: "....x.......x..x", hat: "xxxxxxxxxxxxxxxx", chords: [0, 2, 3, 4], density: 0.6 },
  space: { bpm: 90, root: 50, scale: "dorian", lead: "sine", bass: "triangle", kick: "x.......x.......", snare: "................", hat: "..x...x...x...x.", chords: [0, 3, 1, 4], density: 0.3 },
};

const RECIPES = {
  click: (s, p) => s.tone({ wave: "square", from: 660 * p, to: 880 * p, duration: 0.05, volume: 0.15 }),
  select: (s, p) => {
    s.tone({ wave: "triangle", from: 520 * p, duration: 0.08, volume: 0.25 });
    s.tone({ wave: "triangle", from: 780 * p, duration: 0.1, volume: 0.25, delay: 0.07 });
  },
  jump: (s, p) => s.tone({ wave: "square", from: 240 * p, to: 620 * p, duration: 0.16, volume: 0.2 }),
  land: (s, p) => s.noise({ duration: 0.08, from: 500 * p, to: 120, volume: 0.25 }),
  step: (s, p) => s.noise({ duration: 0.05, from: 900 * p, to: 300, volume: 0.1 }),
  coin: (s, p) => {
    s.tone({ wave: "square", from: 988 * p, duration: 0.07, volume: 0.18 });
    s.tone({ wave: "square", from: 1319 * p, duration: 0.24, volume: 0.18, delay: 0.07 });
  },
  pickup: (s, p) => s.tone({ wave: "triangle", from: 500 * p, to: 1400 * p, duration: 0.2, volume: 0.3 }),
  powerup: (s, p) => {
    [523, 659, 784, 1047, 1319].forEach((hz, i) =>
      s.tone({ wave: "square", from: hz * p, duration: 0.1, volume: 0.15, delay: i * 0.07 }),
    );
  },
  shoot: (s, p) => {
    s.tone({ wave: "square", from: 900 * p, to: 180 * p, duration: 0.13, volume: 0.16 });
    s.noise({ duration: 0.05, from: 4000, to: 1200, volume: 0.1 });
  },
  laser: (s, p) => s.tone({ wave: "sawtooth", from: 1800 * p, to: 240 * p, duration: 0.2, volume: 0.16 }),
  hit: (s, p) => {
    s.noise({ duration: 0.09, from: 2400 * p, to: 500, volume: 0.3 });
    s.tone({ wave: "square", from: 220 * p, to: 90 * p, duration: 0.1, volume: 0.2 });
  },
  hurt: (s, p) => s.tone({ wave: "sawtooth", from: 420 * p, to: 110 * p, duration: 0.28, volume: 0.25, vibrato: 30 }),
  explosion: (s, p) => {
    s.noise({ duration: 0.8, from: 3000 * p, to: 80, volume: 0.6 });
    s.tone({ wave: "sine", from: 140 * p, to: 32, duration: 0.6, volume: 0.6 });
  },
  dash: (s, p) => s.noise({ duration: 0.2, from: 500 * p, to: 3500 * p, volume: 0.22, filter: "bandpass" }),
  bounce: (s, p) => s.tone({ wave: "sine", from: 180 * p, to: 520 * p, duration: 0.14, volume: 0.4 }),
  win: (s, p) => {
    [523, 659, 784, 1047, 784, 1047].forEach((hz, i) =>
      s.tone({ wave: "square", from: hz * p, duration: 0.14, volume: 0.17, delay: i * 0.11 }),
    );
  },
  lose: (s, p) => {
    [392, 370, 349, 262].forEach((hz, i) =>
      s.tone({ wave: "triangle", from: hz * p, to: i === 3 ? 130 * p : undefined, duration: i === 3 ? 0.6 : 0.2, volume: 0.32, delay: i * 0.2 }),
    );
  },
};

export function createSound() {
  let context = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let noiseBuffer = null;
  let scheduler = null;
  let muted = storage.get("muted", false);
  let masterVolume = 0.8;
  let musicVolume = 0.45;
  let pendingMusic = null;
  let moduleApi = null;

  function unlock() {
    if (!context) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : masterVolume;
      const limiter = context.createDynamicsCompressor();
      master.connect(limiter).connect(context.destination);
      sfxBus = context.createGain();
      musicBus = context.createGain();
      musicBus.gain.value = musicVolume;
      sfxBus.connect(master);
      musicBus.connect(master);
      noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      noiseBuffer.getChannelData(0).forEach((_, i, data) => (data[i] = Math.random() * 2 - 1));
    }
    // A new context reports running only after this resolves
    context.resume().then(() => {
      if (!pendingMusic) return;
      const [style, options] = pendingMusic;
      pendingMusic = null;
      moduleApi.music(style, options);
    });
  }

  addEventListener("pointerdown", unlock, { capture: true });
  addEventListener("keydown", unlock, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (!context) return;
    if (document.hidden) context.suspend();
    else context.resume();
  });

  const ready = () => context?.state === "running";

  function envelope(volume, start, attack, duration, bus) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    gain.connect(bus);
    return gain;
  }

  function tone({ wave = "square", from = 440, to, duration = 0.2, volume = 0.3, attack = 0.005, delay = 0, vibrato = 0, bus = sfxBus, at }) {
    if (!context) return;
    const start = at ?? context.currentTime + delay;
    const oscillator = context.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(from, start);
    if (to) oscillator.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + duration);
    oscillator.connect(envelope(volume, start, attack, duration, bus));
    if (vibrato) {
      const lfo = context.createOscillator();
      const depth = context.createGain();
      lfo.frequency.value = 18;
      depth.gain.value = vibrato;
      lfo.connect(depth).connect(oscillator.frequency);
      lfo.start(start);
      lfo.stop(start + duration);
    }
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function noise({ duration = 0.2, from = 2000, to, volume = 0.3, filter = "lowpass", delay = 0, bus = sfxBus, at }) {
    if (!context) return;
    const start = at ?? context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const shaping = context.createBiquadFilter();
    shaping.type = filter;
    shaping.frequency.setValueAtTime(from, start);
    if (to) shaping.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + duration);
    source.connect(shaping).connect(envelope(volume, start, 0.004, duration, bus));
    source.start(start, Math.random() * 0.9);
    source.stop(start + duration + 0.02);
  }

  const synth = { tone, noise };

  function composeLead(style, rng) {
    const scale = SCALES[style.scale];
    const pattern = [];
    for (let bar = 0; bar < style.chords.length; bar++) {
      for (let step = 0; step < 16; step++) {
        const strong = step % 4 === 0;
        if (rng.next() > style.density * (strong ? 1.5 : 1)) {
          pattern.push(null);
          continue;
        }
        // Chord tones on the beat, any scale degree between
        const degree = style.chords[bar] + (strong ? rng.pick([0, 2, 4]) : rng.int(0, scale.length));
        pattern.push(degree);
      }
    }
    return pattern;
  }

  const degreeNote = (style, degree) => {
    const scale = SCALES[style.scale];
    const octave = Math.floor(degree / scale.length);
    return style.root + octave * 12 + scale[degree % scale.length];
  };

  function scheduleStep(style, lead, step, time, stepLength) {
    const beat = step % 16;
    const bar = Math.floor(step / 16) % style.chords.length;
    const chord = style.chords[bar];
    const bus = musicBus;

    if (style.kick[beat] === "x") tone({ wave: "sine", from: 150, to: 42, duration: 0.13, volume: 0.7, at: time, bus });
    if (style.snare[beat] === "x") noise({ duration: 0.12, from: 2600, volume: 0.28, filter: "highpass", at: time, bus });
    if (style.hat[beat] === "x") noise({ duration: 0.03, from: 8000, volume: 0.08, filter: "highpass", at: time, bus });
    if (beat % 2 === 0) {
      tone({ wave: style.bass, from: noteHz(degreeNote(style, chord) - 12), duration: stepLength * 1.8, volume: 0.28, at: time, bus });
    }
    const degree = lead[step % lead.length];
    if (degree !== null) {
      tone({ wave: style.lead, from: noteHz(degreeNote(style, degree) + 12), duration: stepLength * 1.7, volume: 0.1, attack: 0.01, at: time, bus });
    }
  }

  moduleApi = {
    tone,
    noise,

    // Named effect: see RECIPES above. pitch scales it, and each play varies a little.
    play(name, { pitch = 1, vary = 0.04 } = {}) {
      if (!ready()) return;
      const recipe = RECIPES[name];
      if (!recipe) throw new Error(`Unknown sound "${name}": ${Object.keys(RECIPES)}`);
      recipe(synth, pitch * (1 + rand(-vary, vary)));
    },

    // Generated loop in a named style: arcade, adventure, calm, tense, action, space.
    // A seed picks the melody. Options override the style, e.g. { bpm: 140 }.
    music(styleName = "arcade", { seed = 1, ...overrides } = {}) {
      moduleApi.stopMusic();
      if (!ready()) {
        pendingMusic = [styleName, { seed, ...overrides }];
        return;
      }
      const base = STYLES[styleName];
      if (!base) throw new Error(`Unknown music style "${styleName}": ${Object.keys(STYLES)}`);
      const style = { ...base, ...overrides };
      const lead = composeLead(style, createRng(seed));
      const stepLength = 60 / style.bpm / 4;
      let step = 0;
      let nextTime = context.currentTime + 0.1;
      scheduler = setInterval(() => {
        if (context.state !== "running") return;
        nextTime = Math.max(nextTime, context.currentTime);
        while (nextTime < context.currentTime + 0.3) {
          scheduleStep(style, lead, step++, nextTime, stepLength);
          nextTime += stepLength;
        }
      }, 80);
    },

    stopMusic() {
      pendingMusic = null;
      clearInterval(scheduler);
      scheduler = null;
    },

    // Held sound such as an engine: set(pitchHz, volume) every frame, stop() when done
    drone({ wave = "sawtooth", frequency = 80, volume = 0.1 } = {}) {
      if (!ready()) return { set() {}, stop() {} };
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      gain.gain.value = volume;
      oscillator.connect(gain).connect(sfxBus);
      oscillator.start();
      return {
        set(hz, level = volume) {
          oscillator.frequency.setTargetAtTime(hz, context.currentTime, 0.05);
          gain.gain.setTargetAtTime(level, context.currentTime, 0.05);
        },
        stop() {
          gain.gain.setTargetAtTime(0, context.currentTime, 0.04);
          oscillator.stop(context.currentTime + 0.3);
        },
      };
    },

    setVolume(value) {
      masterVolume = value;
      if (master && !muted) master.gain.value = value;
    },
    setMusicVolume(value) {
      musicVolume = value;
      if (musicBus) musicBus.gain.value = value;
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = storage.set("muted", !muted);
      if (master) master.gain.value = muted ? 0 : masterVolume;
      return muted;
    },
  };

  return moduleApi;
}

export const soundNames = Object.keys(RECIPES);
export const musicStyles = Object.keys(STYLES);
