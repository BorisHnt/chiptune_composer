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

  voice.osc.start(startTime);
  if (voice.extra) {
    voice.extra.forEach((osc) => osc.start(startTime));
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
      this.masterGain.gain.value = 0.9;
      this.masterGain.connect(this.context.destination);
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
