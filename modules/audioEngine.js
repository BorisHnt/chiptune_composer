import { DEFAULT_DRUM_ROWS, ensureDrumPattern, getProjectEndBeat } from "./dataModel.js";

const PULSE_WAVES = new Map();
const NOISE_BUFFERS = new Map();
const WAVETABLE_BUFFERS = new Map();
const AudioContextClass = window.AudioContext || window.webkitAudioContext;

const DEFAULT_ADSR = {
  attack: 0.01,
  decay: 0.05,
  sustain: 0.7,
  release: 0.08,
};

const midiToFrequency = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function getPulseWave(context, duty) {
  const key = `${context.sampleRate}-${duty}`;
  if (PULSE_WAVES.has(key)) {
    return PULSE_WAVES.get(key);
  }

  const harmonics = 32;
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n += 1) {
    const coeff = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    imag[n] = coeff;
    real[n] = 0;
  }

  const wave = context.createPeriodicWave(real, imag, { disableNormalization: false });
  PULSE_WAVES.set(key, wave);
  return wave;
}

function getNoiseBuffer(context) {
  if (NOISE_BUFFERS.has(context.sampleRate)) {
    return NOISE_BUFFERS.get(context.sampleRate);
  }

  const length = context.sampleRate;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  NOISE_BUFFERS.set(context.sampleRate, buffer);
  return buffer;
}

function getWavetableBuffer(context, name, table) {
  const key = `${context.sampleRate}-${name}`;
  if (WAVETABLE_BUFFERS.has(key)) {
    return WAVETABLE_BUFFERS.get(key);
  }
  const length = table.length;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = table[i];
  }
  WAVETABLE_BUFFERS.set(key, buffer);
  return buffer;
}

function createWavetableSource(context, name, table, frequency) {
  const source = context.createBufferSource();
  source.buffer = getWavetableBuffer(context, name, table);
  source.loop = true;
  const base = source.buffer.length / context.sampleRate;
  source.playbackRate.value = frequency * base;
  return source;
}

function createBitcrushNode(context, bits = 6) {
  const shaper = context.createWaveShaper();
  const levels = Math.max(2, Math.pow(2, bits));
  const curve = new Float32Array(65536);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.round(x * levels) / levels;
  }
  shaper.curve = curve;
  shaper.oversample = "2x";
  return shaper;
}

function createDriveNode(context, amount = 1.5) {
  const shaper = context.createWaveShaper();
  const curve = new Float32Array(65536);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount);
  }
  shaper.curve = curve;
  shaper.oversample = "2x";
  return shaper;
}

function createFoldNode(context, amount = 2.2) {
  const shaper = context.createWaveShaper();
  const curve = new Float32Array(65536);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    const folded = Math.abs(((x * amount + 1) % 4) - 2) - 1;
    curve[i] = Math.max(-1, Math.min(1, folded));
  }
  shaper.curve = curve;
  shaper.oversample = "2x";
  return shaper;
}

function createChorusNode(context, baseDelay = 0.015, depth = 0.006, rate = 0.25) {
  const delay = context.createDelay();
  const lfo = context.createOscillator();
  const lfoGain = context.createGain();
  delay.delayTime.value = baseDelay;
  lfo.frequency.value = rate;
  lfoGain.gain.value = depth;
  lfo.connect(lfoGain);
  lfoGain.connect(delay.delayTime);
  return { input: delay, output: delay, extra: [lfo] };
}

function createPhaserNode(context) {
  const stage1 = context.createBiquadFilter();
  const stage2 = context.createBiquadFilter();
  stage1.type = "allpass";
  stage2.type = "allpass";
  stage1.frequency.value = 700;
  stage2.frequency.value = 1600;
  const lfo = context.createOscillator();
  const lfoGain = context.createGain();
  lfo.frequency.value = 0.3;
  lfoGain.gain.value = 600;
  lfo.connect(lfoGain);
  lfoGain.connect(stage1.frequency);
  lfoGain.connect(stage2.frequency);
  stage1.connect(stage2);
  return { input: stage1, output: stage2, extra: [lfo] };
}

const WAVETABLES = {
  gb_wave: [
    1, 0.8, 0.4, 0, -0.4, -0.8, -1, -0.8,
    -0.4, 0, 0.4, 0.8, 1, 0.8, 0.4, 0,
    -0.4, -0.8, -1, -0.8, -0.4, 0, 0.4, 0.8,
    1, 0.8, 0.4, 0, -0.4, -0.8, -1, -0.8,
  ],
  tg16_wave1: [
    0, 0.2, 0.5, 0.8, 1, 0.6, 0.2, -0.2,
    -0.6, -1, -0.7, -0.3, 0.1, 0.5, 0.9, 0.6,
    0.2, -0.2, -0.6, -1, -0.8, -0.4, 0, 0.4,
    0.7, 1, 0.6, 0.2, -0.2, -0.5, -0.8, -0.6,
  ],
  tg16_wave2: [
    0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1,
    0.7, 0.4, 0.1, -0.2, -0.5, -0.8, -1, -0.8,
    -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8,
    1, 0.7, 0.4, 0.1, -0.2, -0.5, -0.8, -1,
  ],
  tg16_wave3: [
    0, 0.4, 0.7, 0.9, 1, 0.9, 0.7, 0.4,
    0, -0.4, -0.7, -0.9, -1, -0.9, -0.7, -0.4,
    0, 0.4, 0.7, 0.9, 1, 0.9, 0.7, 0.4,
    0, -0.4, -0.7, -0.9, -1, -0.9, -0.7, -0.4,
  ],
  snes_wave1: [
    0, 0.1, 0.3, 0.55, 0.8, 1, 0.8, 0.5,
    0.2, -0.1, -0.35, -0.6, -0.85, -1, -0.7, -0.3,
    0, 0.2, 0.45, 0.7, 0.9, 1, 0.7, 0.4,
    0.1, -0.2, -0.5, -0.75, -0.95, -1, -0.6, -0.2,
  ],
  snes_wave2: [
    0, 0.2, 0.45, 0.7, 0.9, 1, 0.6, 0.2,
    -0.2, -0.6, -1, -0.7, -0.3, 0.1, 0.5, 0.8,
    0.4, 0, -0.4, -0.8, -1, -0.6, -0.2, 0.2,
    0.6, 1, 0.7, 0.3, -0.1, -0.5, -0.8, -0.4,
  ],
};

function applyEnvelope(gainNode, startTime, duration, velocity = 0.9, adsr = DEFAULT_ADSR) {
  const { attack, decay, sustain, release } = adsr;
  const attackEnd = startTime + attack;
  const decayEnd = attackEnd + decay;
  const releaseStart = startTime + Math.max(duration, attack + decay + 0.01);

  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.linearRampToValueAtTime(velocity, attackEnd);
  gainNode.gain.linearRampToValueAtTime(velocity * sustain, decayEnd);
  gainNode.gain.setValueAtTime(velocity * sustain, releaseStart);
  gainNode.gain.linearRampToValueAtTime(0.0001, releaseStart + release);
}

function createOscillatorForTrack(context, track, frequency) {
  const waveform = track.waveform || "square";

  if (track.console === "NES") {
    const osc = context.createOscillator();
    const dutyMap = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 };
    const duty = dutyMap[waveform] ?? 0.25;
    try {
      osc.setPeriodicWave(getPulseWave(context, duty));
    } catch (error) {
      osc.type = "square";
    }
    osc.frequency.value = frequency;
    return { osc, stop: (when) => osc.stop(when) };
  }

  if (track.console === "Famicom") {
    if (waveform === "noise") {
      const source = context.createBufferSource();
      source.buffer = getNoiseBuffer(context);
      source.loop = true;
      return { osc: source, stop: (when) => source.stop(when) };
    }
    if (waveform === "triangle") {
      const osc = context.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = frequency;
      return { osc, stop: (when) => osc.stop(when) };
    }
    const osc = context.createOscillator();
    const dutyMap = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 };
    const duty = dutyMap[waveform] ?? 0.25;
    try {
      osc.setPeriodicWave(getPulseWave(context, duty));
    } catch (error) {
      osc.type = "square";
    }
    osc.frequency.value = frequency;
    return { osc, stop: (when) => osc.stop(when) };
  }

  if (track.console === "GameBoy") {
    if (waveform === "noise") {
      const source = context.createBufferSource();
      source.buffer = getNoiseBuffer(context);
      source.loop = true;
      return { osc: source, stop: (when) => source.stop(when) };
    }
    if (waveform === "wave") {
      const source = createWavetableSource(context, "gb_wave", WAVETABLES.gb_wave, frequency);
      return { osc: source, stop: (when) => source.stop(when) };
    }
    const osc = context.createOscillator();
    const dutyMap = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 };
    const duty = dutyMap[waveform] ?? 0.25;
    try {
      osc.setPeriodicWave(getPulseWave(context, duty));
    } catch (error) {
      osc.type = "square";
    }
    osc.frequency.value = frequency;
    return { osc, stop: (when) => osc.stop(when) };
  }

  if (track.console === "Basics") {
    if (waveform === "noise" || waveform === "noise-pink" || waveform === "noise-brown") {
      const source = context.createBufferSource();
      source.buffer = getNoiseBuffer(context);
      source.loop = true;
      if (waveform === "noise-pink" || waveform === "noise-brown") {
        const filter = context.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = waveform === "noise-brown" ? 800 : 2200;
        source.connect(filter);
        return {
          osc: filter,
          extra: [source],
          stop: (when) => source.stop(when),
        };
      }
      return { osc: source, stop: (when) => source.stop(when) };
    }

    if (waveform === "supersaw") {
      const mix = context.createGain();
      mix.gain.value = 0.7;
      const detunes = [-12, -6, 0, 6, 12];
      const oscs = detunes.map((detune) => {
        const osc = context.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = frequency;
        osc.detune.value = detune;
        osc.connect(mix);
        return osc;
      });
      return {
        osc: mix,
        extra: oscs,
        stop: (when) => {
          oscs.forEach((osc) => osc.stop(when));
        },
      };
    }

    if (waveform === "pwm") {
      const mix = context.createGain();
      mix.gain.value = 0.9;
      const oscA = context.createOscillator();
      const oscB = context.createOscillator();
      oscA.frequency.value = frequency;
      oscB.frequency.value = frequency;
      oscA.type = "square";
      oscB.type = "square";
      const gainA = context.createGain();
      const gainB = context.createGain();
      gainA.gain.value = 0.6;
      gainB.gain.value = 0.4;
      oscA.connect(gainA);
      oscB.connect(gainB);
      gainA.connect(mix);
      gainB.connect(mix);

      const lfo = context.createOscillator();
      const lfoGain = context.createGain();
      lfo.frequency.value = 2.5;
      lfoGain.gain.value = 0.2;
      lfo.connect(lfoGain);
      lfoGain.connect(gainA.gain);
      lfoGain.connect(gainB.gain);

      return {
        osc: mix,
        extra: [oscA, oscB, lfo],
        stop: (when) => {
          oscA.stop(when);
          oscB.stop(when);
          lfo.stop(when);
        },
      };
    }
  }

  if (track.console === "Complex") {
    if (waveform === "sub-sine") {
      const osc = context.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency / 2;
      return { osc, stop: (when) => osc.stop(when) };
    }

    if (waveform === "bitcrush") {
      const osc = context.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = frequency;
      const crusher = createBitcrushNode(context, 6);
      osc.connect(crusher);
      return { osc: crusher, extra: [osc], stop: (when) => osc.stop(when) };
    }

    if (waveform === "ring-mod") {
      const carrier = context.createOscillator();
      const modulator = context.createOscillator();
      const modGain = context.createGain();
      const carrierGain = context.createGain();

      carrier.type = "sine";
      modulator.type = "sine";
      carrier.frequency.value = frequency;
      modulator.frequency.value = frequency * 1.5;
      modGain.gain.value = 0.6;

      modulator.connect(modGain);
      modGain.connect(carrierGain.gain);
      carrier.connect(carrierGain);

      return {
        osc: carrierGain,
        extra: [carrier, modulator],
        stop: (when) => {
          carrier.stop(when);
          modulator.stop(when);
        },
      };
    }

    if (waveform === "am") {
      const carrier = context.createOscillator();
      const modulator = context.createOscillator();
      const modGain = context.createGain();
      const carrierGain = context.createGain();

      carrier.type = "sine";
      modulator.type = "sine";
      carrier.frequency.value = frequency;
      modulator.frequency.value = frequency * 2.5;
      modGain.gain.value = 0.4;

      modulator.connect(modGain);
      modGain.connect(carrierGain.gain);
      carrier.connect(carrierGain);

      return {
        osc: carrierGain,
        extra: [carrier, modulator],
        stop: (when) => {
          carrier.stop(when);
          modulator.stop(when);
        },
      };
    }

    if (waveform === "fold") {
      const osc = context.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = frequency;
      const fold = createFoldNode(context, 2.2);
      osc.connect(fold);
      return { osc: fold, extra: [osc], stop: (when) => osc.stop(when) };
    }

    if (waveform === "drive") {
      const osc = context.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = frequency;
      const drive = createDriveNode(context, 1.8);
      osc.connect(drive);
      return { osc: drive, extra: [osc], stop: (when) => osc.stop(when) };
    }

    if (waveform === "hard-sync") {
      const master = context.createOscillator();
      const slave = context.createOscillator();
      master.type = "sawtooth";
      slave.type = "sawtooth";
      master.frequency.value = frequency;
      slave.frequency.value = frequency * 1.5;
      master.connect(slave.frequency);
      return { osc: slave, extra: [master, slave], stop: (when) => {
        master.stop(when);
        slave.stop(when);
      } };
    }

    if (waveform === "phaser") {
      const osc = context.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = frequency;
      const phaser = createPhaserNode(context);
      osc.connect(phaser.input);
      return {
        osc: phaser.output,
        extra: [osc, ...phaser.extra],
        stop: (when) => osc.stop(when),
      };
    }

    if (waveform === "chorus") {
      const osc = context.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = frequency;
      const chorus = createChorusNode(context);
      osc.connect(chorus.input);
      return {
        osc: chorus.output,
        extra: [osc, ...chorus.extra],
        stop: (when) => osc.stop(when),
      };
    }
  }

  if (track.console === "TurboGrafx16") {
    const tableName =
      waveform === "wave2" ? "tg16_wave2" : waveform === "wave3" ? "tg16_wave3" : "tg16_wave1";
    const source = createWavetableSource(context, tableName, WAVETABLES[tableName], frequency);
    return { osc: source, stop: (when) => source.stop(when) };
  }

  if (track.console === "SNES") {
    if (waveform === "noise") {
      const source = context.createBufferSource();
      source.buffer = getNoiseBuffer(context);
      source.loop = true;
      return { osc: source, stop: (when) => source.stop(when) };
    }
    const tableName = waveform === "wave2" ? "snes_wave2" : "snes_wave1";
    const source = createWavetableSource(context, tableName, WAVETABLES[tableName], frequency);
    return { osc: source, stop: (when) => source.stop(when) };
  }

  if (track.console === "Atari" && waveform === "noise") {
    const source = context.createBufferSource();
    source.buffer = getNoiseBuffer(context);
    source.loop = true;
    return { osc: source, stop: (when) => source.stop(when) };
  }

  if (track.console === "Sega" || waveform === "fm") {
    const carrier = context.createOscillator();
    const modulator = context.createOscillator();
    const modGain = context.createGain();

    carrier.type = "sine";
    modulator.type = "sine";

    carrier.frequency.value = frequency;
    modulator.frequency.value = frequency * 2;
    modGain.gain.value = frequency * 0.35;

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    return {
      osc: carrier,
      extra: [modulator],
      stop: (when) => {
        carrier.stop(when);
        modulator.stop(when);
      },
    };
  }

  const osc = context.createOscillator();
  if (waveform === "pulse") {
    osc.type = "square";
  } else if (waveform === "saw") {
    osc.type = "sawtooth";
  } else {
    osc.type = waveform;
  }
  osc.frequency.value = frequency;
  return { osc, stop: (when) => osc.stop(when) };
}

function scheduleSynthNote(context, track, trackChain, note, startTime, duration) {
  const midi = Number(note.pitch) + Number(track.octave || 0) * 12;
  const frequency = midiToFrequency(midi);
  if (!Number.isFinite(frequency)) {
    return;
  }
  if (!Number.isFinite(startTime) || !Number.isFinite(duration) || duration <= 0) {
    return;
  }
  const velocity = Number.isFinite(note.velocity) ? note.velocity : 0.9;
  if (velocity <= 0) {
    return;
  }
  const noteGain = context.createGain();
  noteGain.connect(trackChain);

  let voice;
  try {
    voice = createOscillatorForTrack(context, track, frequency);
  } catch (error) {
    const osc = context.createOscillator();
    osc.type = "square";
    osc.frequency.value = frequency;
    voice = { osc, stop: () => osc.stop() };
  }
  voice.osc.connect(noteGain);

  applyEnvelope(noteGain, startTime, duration, velocity);

  if (typeof voice.start === "function") {
    voice.start(startTime);
  } else if (voice.osc.start) {
    voice.osc.start(startTime);
  }
  if (voice.extra) {
    voice.extra.forEach((osc) => {
      if (osc.start) osc.start(startTime);
    });
  }

  voice.stop(startTime + duration + DEFAULT_ADSR.release + 0.1);
}

function scheduleNoiseBurst(context, trackChain, startTime, duration, filterType = "highpass", level = 0.9) {
  const noise = context.createBufferSource();
  noise.buffer = getNoiseBuffer(context);

  const filter = context.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterType === "highpass" ? 8000 : 1200;

  const gain = context.createGain();
  gain.gain.value = 0.0001;

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(trackChain);

  applyEnvelope(gain, startTime, duration, level, {
    attack: 0.001,
    decay: 0.03,
    sustain: 0.2,
    release: 0.04,
  });

  noise.start(startTime);
  noise.stop(startTime + duration + 0.2);
}

function scheduleDrumHit(context, trackChain, drum, startTime, level = 0.9, duration = 0.2) {
  if (drum === "kick") {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, startTime);
    osc.frequency.exponentialRampToValueAtTime(50, startTime + Math.min(0.12, duration));
    gain.gain.setValueAtTime(level, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + Math.max(0.12, duration));
    osc.connect(gain);
    gain.connect(trackChain);
    osc.start(startTime);
    osc.stop(startTime + duration);
    return;
  }

  if (drum === "snare") {
    scheduleNoiseBurst(context, trackChain, startTime, duration, "bandpass", level);
    return;
  }

  if (drum === "hat") {
    scheduleNoiseBurst(context, trackChain, startTime, duration, "highpass", level * 0.8);
    return;
  }

  if (drum === "openhat") {
    scheduleNoiseBurst(context, trackChain, startTime, duration, "highpass", level * 0.7);
    return;
  }

  if (drum === "clap") {
    scheduleNoiseBurst(context, trackChain, startTime, duration * 0.6, "bandpass", level * 0.6);
    scheduleNoiseBurst(context, trackChain, startTime + duration * 0.25, duration * 0.6, "bandpass", level * 0.5);
    scheduleNoiseBurst(context, trackChain, startTime + duration * 0.5, duration * 0.6, "bandpass", level * 0.4);
    return;
  }

  if (drum === "tom") {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, startTime);
    osc.frequency.exponentialRampToValueAtTime(90, startTime + Math.max(0.12, duration));
    gain.gain.setValueAtTime(level * 0.7, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + Math.max(0.12, duration));
    osc.connect(gain);
    gain.connect(trackChain);
    osc.start(startTime);
    osc.stop(startTime + duration);
    return;
  }

  if (drum === "noise") {
    scheduleNoiseBurst(context, trackChain, startTime, duration, "highpass", level * 0.7);
    return;
  }

  if (drum === "fm-tom") {
    const carrier = context.createOscillator();
    const modulator = context.createOscillator();
    const modGain = context.createGain();
    const gain = context.createGain();
    carrier.type = "sine";
    modulator.type = "sine";
    carrier.frequency.setValueAtTime(150, startTime);
    modulator.frequency.setValueAtTime(300, startTime);
    modGain.gain.setValueAtTime(90, startTime);
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    gain.gain.setValueAtTime(level * 0.6, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + Math.max(0.12, duration));
    carrier.connect(gain);
    gain.connect(trackChain);
    carrier.start(startTime);
    modulator.start(startTime);
    carrier.stop(startTime + duration);
    modulator.stop(startTime + duration);
    return;
  }

  if (drum === "cowbell") {
    const osc1 = context.createOscillator();
    const osc2 = context.createOscillator();
    const gain = context.createGain();
    osc1.type = "square";
    osc2.type = "square";
    osc1.frequency.setValueAtTime(540, startTime);
    osc2.frequency.setValueAtTime(810, startTime);
    gain.gain.setValueAtTime(level * 0.5, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + Math.max(0.12, duration));
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(trackChain);
    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + duration);
    osc2.stop(startTime + duration);
    return;
  }

  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "triangle";
  osc.frequency.value = 320;
  gain.gain.setValueAtTime(level * 0.5, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + Math.max(0.08, duration));
  osc.connect(gain);
  gain.connect(trackChain);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function scheduleDrumPattern(context, trackChain, block, secondsPerBeat, startOffset) {
  const rows = Array.isArray(block.pattern?.rows) ? block.pattern.rows : DEFAULT_DRUM_ROWS;
  const pattern = ensureDrumPattern(block, rows);

  pattern.events.forEach((event) => {
    const time = startOffset + (block.startBeat + event.start) * secondsPerBeat;
    const volume = Number.isFinite(pattern.volumes?.[event.drum]) ? pattern.volumes[event.drum] : 0.9;
    const duration = Math.max(0.05, event.duration || 0.25) * secondsPerBeat;
    scheduleDrumHit(context, trackChain, event.drum, time, volume, duration);
  });
}

function createTrackOutput(context, master, volume = 0.8) {
  const trackGain = context.createGain();
  trackGain.gain.value = volume;
  trackGain.connect(master);
  return { input: trackGain, output: trackGain };
}

function createBus(context, master, level = 1) {
  const bus = context.createGain();
  bus.gain.value = level;
  bus.connect(master);
  return bus;
}

function fadeOutAndDisconnect(node, context) {
  if (!node || !context) return;
  const now = context.currentTime;
  try {
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(0.0001, now + 0.02);
  } catch (error) {
    // Ignore nodes without gain or schedule errors.
  }
  window.setTimeout(() => {
    try {
      node.disconnect();
    } catch (error) {
      // Ignore if already disconnected.
    }
  }, 40);
}

export function scheduleProject(context, project, options = {}) {
  const {
    startTime = 0,
    master = context.destination,
    ignoreMuteSolo = false,
    trackGains = null,
  } = options;
  const secondsPerBeat = 60 / project.bpm;
  const soloActive = project.tracks.some((track) => track.solo);

  project.tracks.forEach((track) => {
    if (!ignoreMuteSolo) {
      if (track.mute) return;
      if (soloActive && !track.solo) return;
    }

    let trackOutput = null;
    if (trackGains && trackGains.has(track.id)) {
      trackOutput = trackGains.get(track.id);
    }
    if (!trackOutput) {
      trackOutput = createTrackOutput(context, master, track.volume ?? 0.8);
      if (trackGains) {
        trackGains.set(track.id, trackOutput);
      }
    }

    track.blocks.forEach((block) => {
      if (track.type === "synth") {
        block.notes.forEach((note) => {
          const noteStart = startTime + (block.startBeat + note.start) * secondsPerBeat;
          const duration = note.duration * secondsPerBeat;
          scheduleSynthNote(context, track, trackOutput.input, note, noteStart, duration);
        });
      } else {
        scheduleDrumPattern(context, trackOutput.input, block, secondsPerBeat, startTime);
      }
    });
  });
}

export class AudioEngine {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.masterLimiter = null;
    this.analyser = null;
    this.masterVolumeValue = 0.9;
    this.isPlaying = false;
    this.loop = false;
    this.playStartTime = 0;
    this.playDuration = 0;
    this.loopTimer = null;
    this.previewTimer = null;
    this.previewStartTime = 0;
    this.previewDuration = 0;
    this.previewLoop = false;
    this.playBus = null;
    this.previewBus = null;
    this.trackGains = new Map();
  }

  ensureContext() {
    if (!this.context) {
      if (!AudioContextClass) {
        console.warn("Web Audio API not supported");
        return false;
      }
      this.context = new AudioContextClass();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.masterVolumeValue;
      this.masterLimiter = this.context.createDynamicsCompressor();
      this.masterLimiter.threshold.value = -8;
      this.masterLimiter.knee.value = 8;
      this.masterLimiter.ratio.value = 12;
      this.masterLimiter.attack.value = 0.003;
      this.masterLimiter.release.value = 0.12;
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.masterGain.connect(this.masterLimiter);
      this.masterLimiter.connect(this.analyser);
      this.analyser.connect(this.context.destination);
    }
    return true;
  }

  runWithContext(callback) {
    if (!this.ensureContext()) {
      return false;
    }
    if (this.context.state === "suspended") {
      this.context.resume().catch(() => {});
    }
    callback();
    return true;
  }

  unlock() {
    return this.runWithContext(() => {});
  }

  setMasterVolume(value) {
    const volume = Math.max(0, Math.min(1, value));
    this.masterVolumeValue = volume;
    if (!this.context || !this.masterGain) return;
    const now = this.context.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(volume, now + 0.02);
  }

  getAnalyser() {
    return this.analyser;
  }

  playProject(project, { loop = false } = {}) {
    this.stop();

    const schedule = () => {
      const secondsPerBeat = 60 / project.bpm;
      const totalBeats = getProjectEndBeat(project);
      const duration = totalBeats * secondsPerBeat;
      const startTime = this.context.currentTime + 0.08;

      this.playBus = createBus(this.context, this.masterGain, 1);
      this.trackGains = new Map();

      this.isPlaying = true;
      this.loop = loop;
      this.playStartTime = startTime;
      this.playDuration = duration;
      this.updateTrackMix(project);

      const leadTime = Math.min(0.2, duration / 3);
      const scheduleLoop = (loopStart) => {
        scheduleProject(this.context, project, {
          startTime: loopStart,
          master: this.playBus,
          ignoreMuteSolo: true,
          trackGains: this.trackGains,
        });
        if (!this.loop) return;
        const nextStart = loopStart + duration;
        const delay = Math.max(0, (nextStart - this.context.currentTime - leadTime) * 1000);
        this.loopTimer = window.setTimeout(() => {
          if (!this.isPlaying || !this.loop) return;
          scheduleLoop(nextStart);
        }, delay);
      };

      scheduleLoop(startTime);
    };

    this.runWithContext(schedule);
  }

  stop() {
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.previewTimer) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    if (this.playBus) {
      fadeOutAndDisconnect(this.playBus, this.context);
      this.playBus = null;
    }
    this.trackGains.clear();
    this.isPlaying = false;
  }

  updateTrackMix(project) {
    if (!this.trackGains || !this.context) return;
    const soloActive = project.tracks.some((track) => track.solo);
    const now = this.context.currentTime;
    project.tracks.forEach((track) => {
      const output = this.trackGains.get(track.id);
      if (!output) return;
      const base = Number.isFinite(track.volume) ? track.volume : 0.8;
      const shouldMute = track.mute || (soloActive && !track.solo);
      const target = shouldMute ? 0 : base;
      try {
        output.input.gain.cancelScheduledValues(now);
        output.input.gain.setValueAtTime(output.input.gain.value, now);
        output.input.gain.linearRampToValueAtTime(target, now + 0.02);
      } catch (error) {
        output.input.gain.value = target;
      }
    });
  }

  getCurrentBeat(bpm) {
    if (!this.isPlaying || !this.context) {
      return 0;
    }
    const secondsPerBeat = 60 / bpm;
    const elapsed = this.context.currentTime - this.playStartTime;
    if (elapsed < 0) return 0;

    let beat = elapsed / secondsPerBeat;
    if (this.loop && this.playDuration > 0) {
      beat = beat % (this.playDuration / secondsPerBeat);
    }
    return beat;
  }

  previewNote(track, pitch, duration = 0.4) {
    this.runWithContext(() => {
      const now = this.context.currentTime + 0.01;
      const tempNote = { pitch, velocity: 0.9 };
      const master = this.previewBus || this.masterGain;
      const trackOutput = createTrackOutput(this.context, master, track.volume ?? 0.8);
      scheduleSynthNote(this.context, track, trackOutput.input, tempNote, now, duration);
    });
  }

  previewDrum(track, drum, level = 0.9) {
    this.runWithContext(() => {
      const now = this.context.currentTime + 0.01;
      const master = this.previewBus || this.masterGain;
      const trackOutput = createTrackOutput(this.context, master, track.volume ?? 0.8);
      scheduleDrumHit(this.context, trackOutput.input, drum, now, level);
    });
  }

  previewBlock(track, block, bpm, { loop = true } = {}) {
    this.stopPreview();
    const schedule = () => {
      const secondsPerBeat = 60 / bpm;
      const loopDuration = block.length * secondsPerBeat;
      const startTime = this.context.currentTime + 0.08;

      this.previewStartTime = startTime;
      this.previewDuration = loopDuration;
      this.previewLoop = loop;
      this.previewBus = createBus(this.context, this.masterGain, 1);

      const scheduleOnce = (loopStart) => {
        const trackOutput = createTrackOutput(this.context, this.previewBus, track.volume ?? 0.8);
        if (track.type === "synth") {
          block.notes.forEach((note) => {
            const noteStart = loopStart + note.start * secondsPerBeat;
            const duration = note.duration * secondsPerBeat;
            scheduleSynthNote(this.context, track, trackOutput.input, note, noteStart, duration);
          });
        } else {
          const previewBlock = { ...block, startBeat: 0 };
          scheduleDrumPattern(this.context, trackOutput.input, previewBlock, secondsPerBeat, loopStart);
        }
      };

      if (loop) {
        const leadTime = Math.min(0.2, loopDuration / 3);
        const scheduleLoop = (loopStart) => {
          scheduleOnce(loopStart);
          const nextStart = loopStart + loopDuration;
          const delay = Math.max(0, (nextStart - this.context.currentTime - leadTime) * 1000);
          this.previewTimer = window.setTimeout(() => {
            if (!this.previewLoop) return;
            scheduleLoop(nextStart);
          }, delay);
        };
        scheduleLoop(startTime);
      } else {
        scheduleOnce(startTime);
      }
    };

    this.runWithContext(schedule);
  }

  stopPreview() {
    if (this.previewTimer) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    if (this.previewBus) {
      fadeOutAndDisconnect(this.previewBus, this.context);
      this.previewBus = null;
    }
    this.previewStartTime = 0;
    this.previewDuration = 0;
    this.previewLoop = false;
  }

  getPreviewBeat(bpm) {
    if (!this.context || !this.previewStartTime) {
      return 0;
    }
    const secondsPerBeat = 60 / bpm;
    const elapsed = this.context.currentTime - this.previewStartTime;
    if (elapsed < 0) return 0;
    let beat = elapsed / secondsPerBeat;
    if (this.previewLoop && this.previewDuration > 0) {
      beat = beat % (this.previewDuration / secondsPerBeat);
    }
    return beat;
  }
}
