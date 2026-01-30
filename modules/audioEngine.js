import { DEFAULT_DRUM_ROWS, ensureDrumPattern, getProjectEndBeat } from "./dataModel.js";

const PULSE_WAVES = new Map();
const NOISE_BUFFERS = new Map();
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
  const frequency = midiToFrequency(note.pitch + track.octave * 12);
  if (!Number.isFinite(frequency)) {
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

  voice.osc.start(startTime);
  if (voice.extra) {
    voice.extra.forEach((osc) => osc.start(startTime));
  }

  voice.stop(startTime + duration + DEFAULT_ADSR.release + 0.1);
}

function scheduleNoiseBurst(context, trackChain, startTime, duration, filterType = "highpass") {
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

  applyEnvelope(gain, startTime, duration, 0.9, {
    attack: 0.001,
    decay: 0.03,
    sustain: 0.2,
    release: 0.04,
  });

  noise.start(startTime);
  noise.stop(startTime + duration + 0.2);
}

function scheduleDrumHit(context, trackChain, drum, startTime) {
  const duration = 0.2;
  if (drum === "kick") {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, startTime);
    osc.frequency.exponentialRampToValueAtTime(50, startTime + 0.12);
    gain.gain.setValueAtTime(0.9, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
    osc.connect(gain);
    gain.connect(trackChain);
    osc.start(startTime);
    osc.stop(startTime + duration);
    return;
  }

  if (drum === "snare") {
    scheduleNoiseBurst(context, trackChain, startTime, 0.18, "bandpass");
    return;
  }

  if (drum === "hat") {
    scheduleNoiseBurst(context, trackChain, startTime, 0.1, "highpass");
    return;
  }

  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "triangle";
  osc.frequency.value = 320;
  gain.gain.setValueAtTime(0.4, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
  osc.connect(gain);
  gain.connect(trackChain);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function scheduleDrumPattern(context, trackChain, block, secondsPerBeat, startOffset) {
  const steps = Number.isFinite(block.pattern?.steps) ? block.pattern.steps : 16;
  const rows = Array.isArray(block.pattern?.rows) ? block.pattern.rows : DEFAULT_DRUM_ROWS;
  const pattern = ensureDrumPattern(block, steps, rows);
  const stepBeats = block.length / pattern.steps;

  pattern.grid.forEach((row, rowIndex) => {
    row.forEach((active, step) => {
      if (!active) return;
      const time = startOffset + (block.startBeat + step * stepBeats) * secondsPerBeat;
      const drum = pattern.rows[rowIndex];
      scheduleDrumHit(context, trackChain, drum, time);
    });
  });
}

function createTrackOutput(context, master, volume = 0.8) {
  const trackGain = context.createGain();
  trackGain.gain.value = volume;
  trackGain.connect(master);
  return { input: trackGain, output: trackGain };
}

export function scheduleProject(context, project, options = {}) {
  const { startTime = 0, master = context.destination, ignoreMuteSolo = false } = options;
  const secondsPerBeat = 60 / project.bpm;
  const soloActive = project.tracks.some((track) => track.solo);

  project.tracks.forEach((track) => {
    if (!ignoreMuteSolo) {
      if (track.mute) return;
      if (soloActive && !track.solo) return;
    }

    const trackOutput = createTrackOutput(context, master, track.volume ?? 0.8);

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
    this.isPlaying = false;
    this.loop = false;
    this.playStartTime = 0;
    this.playDuration = 0;
    this.loopTimer = null;
    this.previewTimer = null;
  }

  ensureContext() {
    if (!this.context) {
      if (!AudioContextClass) {
        console.warn("Web Audio API not supported");
        return false;
      }
      this.context = new AudioContextClass();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.9;
      this.masterGain.connect(this.context.destination);
    }
    return true;
  }

  runWithContext(callback) {
    if (!this.ensureContext()) {
      return false;
    }
    callback();
    if (this.context.state === "suspended") {
      this.context.resume().catch(() => {});
    }
    return true;
  }

  unlock() {
    return this.runWithContext(() => {});
  }

  playProject(project, { loop = false } = {}) {
    this.stop();

    const schedule = () => {
      const secondsPerBeat = 60 / project.bpm;
      const totalBeats = getProjectEndBeat(project);
      const duration = totalBeats * secondsPerBeat;
      const startTime = this.context.currentTime + 0.05;

      scheduleProject(this.context, project, { startTime, master: this.masterGain });

      this.isPlaying = true;
      this.loop = loop;
      this.playStartTime = startTime;
      this.playDuration = duration;

      if (loop) {
        this.loopTimer = window.setInterval(() => {
          scheduleProject(this.context, project, {
            startTime: this.context.currentTime + 0.05,
            master: this.masterGain,
          });
        }, duration * 1000);
      }
    };

    this.runWithContext(schedule);
  }

  stop() {
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.previewTimer) {
      clearInterval(this.previewTimer);
      this.previewTimer = null;
    }
    this.isPlaying = false;
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
      const trackOutput = createTrackOutput(this.context, this.masterGain, track.volume ?? 0.8);
      scheduleSynthNote(this.context, track, trackOutput.input, tempNote, now, duration);
    });
  }

  previewDrum(track, drum) {
    this.runWithContext(() => {
      const now = this.context.currentTime + 0.01;
      const trackOutput = createTrackOutput(this.context, this.masterGain, track.volume ?? 0.8);
      scheduleDrumHit(this.context, trackOutput.input, drum, now);
    });
  }

  previewBlock(track, block, bpm, { loop = true } = {}) {
    this.stopPreview();
    const schedule = () => {
      const secondsPerBeat = 60 / bpm;
      const loopDuration = block.length * secondsPerBeat;

      const scheduleOnce = () => {
        const startTime = this.context.currentTime + 0.05;
        const trackOutput = createTrackOutput(this.context, this.masterGain, track.volume ?? 0.8);
        if (track.type === "synth") {
          block.notes.forEach((note) => {
            const noteStart = startTime + note.start * secondsPerBeat;
            const duration = note.duration * secondsPerBeat;
            scheduleSynthNote(this.context, track, trackOutput.input, note, noteStart, duration);
          });
        } else {
          const previewBlock = { ...block, startBeat: 0 };
          scheduleDrumPattern(this.context, trackOutput.input, previewBlock, secondsPerBeat, startTime);
        }
      };

      scheduleOnce();

      if (loop) {
        this.previewTimer = window.setInterval(scheduleOnce, loopDuration * 1000);
      }
    };

    this.runWithContext(schedule);
  }

  stopPreview() {
    if (this.previewTimer) {
      clearInterval(this.previewTimer);
      this.previewTimer = null;
    }
  }
}
