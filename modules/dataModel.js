export const CHIP_DRUM_CONSOLE = "Chip Drum Machine";

export const CHIP_DRUM_ENGINES = [
  "kick",
  "snare",
  "clap",
  "hat",
  "openhat",
  "tom",
  "fm-tom",
  "cowbell",
  "perc",
  "noise",
];

export const CHIP_DRUM_WAVEFORMS = ["sine", "triangle", "square", "sawtooth"];
export const CHIP_DRUM_PARAMETER_KEYS = ["pitch", "sweep", "tone", "decay", "noise", "drive"];

const CHIP_DRUM_PAD_TEMPLATES = [
  { id: "pad01", name: "Deep Kick", engine: "kick", waveform: "sine", bits: 8, pitch: 0.2, sweep: 0.82, tone: 0.24, decay: 0.72, noise: 0.02, drive: 0.18 },
  { id: "pad02", name: "Punch Kick", engine: "kick", waveform: "square", bits: 5, pitch: 0.4, sweep: 0.65, tone: 0.52, decay: 0.38, noise: 0.08, drive: 0.38 },
  { id: "pad03", name: "Click Kick", engine: "kick", waveform: "triangle", bits: 4, pitch: 0.58, sweep: 0.92, tone: 0.76, decay: 0.2, noise: 0.24, drive: 0.3 },
  { id: "pad04", name: "Noise Snare", engine: "snare", waveform: "triangle", bits: 5, pitch: 0.5, sweep: 0.18, tone: 0.68, decay: 0.35, noise: 0.9, drive: 0.2 },
  { id: "pad05", name: "Tone Snare", engine: "snare", waveform: "square", bits: 6, pitch: 0.6, sweep: 0.35, tone: 0.44, decay: 0.42, noise: 0.54, drive: 0.28 },
  { id: "pad06", name: "Arcade Clap", engine: "clap", waveform: "square", bits: 5, pitch: 0.55, sweep: 0.2, tone: 0.62, decay: 0.44, noise: 0.94, drive: 0.16 },
  { id: "pad07", name: "Closed Hat", engine: "hat", waveform: "square", bits: 4, pitch: 0.78, sweep: 0.08, tone: 0.9, decay: 0.12, noise: 1, drive: 0.12 },
  { id: "pad08", name: "Open Hat", engine: "openhat", waveform: "square", bits: 5, pitch: 0.74, sweep: 0.08, tone: 0.86, decay: 0.66, noise: 1, drive: 0.1 },
  { id: "pad09", name: "Low Tom", engine: "tom", waveform: "triangle", bits: 7, pitch: 0.24, sweep: 0.48, tone: 0.38, decay: 0.58, noise: 0.04, drive: 0.16 },
  { id: "pad10", name: "High Tom", engine: "tom", waveform: "square", bits: 6, pitch: 0.64, sweep: 0.52, tone: 0.56, decay: 0.4, noise: 0.04, drive: 0.2 },
  { id: "pad11", name: "Rim Chip", engine: "perc", waveform: "square", bits: 3, pitch: 0.72, sweep: 0.18, tone: 0.72, decay: 0.12, noise: 0.08, drive: 0.42 },
  { id: "pad12", name: "Cowbell", engine: "cowbell", waveform: "square", bits: 5, pitch: 0.62, sweep: 0.12, tone: 0.68, decay: 0.4, noise: 0.02, drive: 0.24 },
  { id: "pad13", name: "FM Perc", engine: "fm-tom", waveform: "sine", bits: 7, pitch: 0.58, sweep: 0.38, tone: 0.82, decay: 0.32, noise: 0.04, drive: 0.3 },
  { id: "pad14", name: "Noise Burst", engine: "noise", waveform: "square", bits: 3, pitch: 0.5, sweep: 0.1, tone: 0.42, decay: 0.3, noise: 1, drive: 0.46 },
  { id: "pad15", name: "Bleep", engine: "perc", waveform: "square", bits: 4, pitch: 0.86, sweep: 0.22, tone: 0.64, decay: 0.24, noise: 0, drive: 0.2 },
  { id: "pad16", name: "Zap", engine: "perc", waveform: "sawtooth", bits: 5, pitch: 0.76, sweep: 0.95, tone: 0.78, decay: 0.48, noise: 0.12, drive: 0.34 },
];

export const DRUM_KITS = {
  NES: ["kick", "snare", "hat", "perc"],
  Famicom: ["kick", "snare", "hat", "openhat", "tom"],
  GameBoy: ["kick", "snare", "hat", "noise"],
  TurboGrafx16: ["kick", "snare", "hat", "clap", "tom", "perc"],
  SNES: ["kick", "snare", "hat", "openhat", "clap", "tom"],
  Atari: ["kick", "snare", "hat", "noise"],
  C64: ["kick", "snare", "hat", "clap", "tom"],
  Sega: ["kick", "snare", "hat", "fm-tom", "cowbell"],
  [CHIP_DRUM_CONSOLE]: CHIP_DRUM_PAD_TEMPLATES.map((pad) => pad.id),
};

export const DEFAULT_DRUM_ROWS = DRUM_KITS.NES;

export const DRUM_CONSOLE_CHARACTER = {
  NES: { wave: "square", bits: 5, pitch: 0.08, tone: 0.14, decay: 0.68, noise: 0, drive: 0.1 },
  Famicom: { wave: "triangle", bits: 6, pitch: 0.03, tone: 0.08, decay: 0.86, noise: 0, drive: 0.06 },
  GameBoy: { wave: "square", bits: 4, pitch: -0.05, tone: -0.08, decay: 0.72, noise: 0.08, drive: 0.16 },
  TurboGrafx16: { wave: "triangle", bits: 6, pitch: 0.06, tone: 0.02, decay: 1, noise: -0.04, drive: 0.04 },
  SNES: { wave: "sine", bits: 12, pitch: -0.04, tone: -0.12, decay: 1.28, noise: -0.05, drive: 0 },
  Atari: { wave: "square", bits: 3, pitch: 0.14, tone: 0.18, decay: 0.55, noise: 0.1, drive: 0.25 },
  C64: { wave: "sawtooth", bits: 4, pitch: -0.02, tone: 0.06, decay: 1.05, noise: 0.03, drive: 0.18 },
  Sega: { wave: "sine", bits: 7, pitch: 0.1, tone: 0.12, decay: 0.9, noise: -0.04, drive: 0.2 },
  [CHIP_DRUM_CONSOLE]: { wave: "square", bits: 8, pitch: 0, tone: 0, decay: 1, noise: 0, drive: 0 },
};

const DRUM_VOICE_PRESETS = {
  kick: { pitch: 0.34, tone: 0.32, decay: 0.48, noise: 0.06, drive: 0.12 },
  snare: { pitch: 0.55, tone: 0.58, decay: 0.35, noise: 0.76, drive: 0.1 },
  hat: { pitch: 0.75, tone: 0.82, decay: 0.16, noise: 0.96, drive: 0.05 },
  openhat: { pitch: 0.72, tone: 0.86, decay: 0.62, noise: 1, drive: 0.04 },
  clap: { pitch: 0.6, tone: 0.62, decay: 0.4, noise: 0.92, drive: 0.08 },
  tom: { pitch: 0.44, tone: 0.48, decay: 0.55, noise: 0.05, drive: 0.1 },
  "fm-tom": { pitch: 0.52, tone: 0.64, decay: 0.52, noise: 0.08, drive: 0.24 },
  cowbell: { pitch: 0.68, tone: 0.72, decay: 0.4, noise: 0.02, drive: 0.2 },
  perc: { pitch: 0.64, tone: 0.55, decay: 0.24, noise: 0.14, drive: 0.12 },
  noise: { pitch: 0.55, tone: 0.42, decay: 0.38, noise: 1, drive: 0.16 },
};

export const DRUM_PARAMETER_KEYS = ["pitch", "tone", "decay", "noise", "drive"];

export const CONSOLE_WAVES = {
  Basics: [
    "sine",
    "triangle",
    "square",
    "saw",
    "pulse",
    "pwm",
    "supersaw",
    "noise",
    "noise-pink",
    "noise-brown",
  ],
  Complex: [
    "sub-sine",
    "bitcrush",
    "ring-mod",
    "am",
    "fold",
    "drive",
    "hard-sync",
    "phaser",
    "chorus",
  ],
  NES: ["pulse12", "pulse25", "pulse50"],
  Famicom: ["pulse12", "pulse25", "pulse50", "triangle", "noise"],
  GameBoy: ["pulse12", "pulse25", "pulse50", "wave", "noise"],
  TurboGrafx16: ["wave1", "wave2", "wave3"],
  SNES: ["wave1", "wave2", "noise"],
  Atari: ["square", "noise"],
  C64: ["triangle", "saw", "pulse"],
  Sega: ["fm1", "fm2", "fm3", "fm4"],
};

export const MAX_TRACKS = 16;

export const DEFAULT_ADSR = {
  attack: 0.01,
  decay: 0.05,
  sustain: 0.7,
  release: 0.08,
};

const DEFAULT_TRACKS = [
  { type: "synth", console: "NES", waveform: "pulse25" },
  { type: "synth", console: "C64", waveform: "triangle" },
  { type: "synth", console: "Atari", waveform: "square" },
  { type: "synth", console: "Sega", waveform: "fm1" },
  { type: "drums", console: "NES", waveform: "noise" },
];

const createId = () => Math.random().toString(36).slice(2, 10);

export function createNote({ pitch, start, duration, velocity = 0.9 }) {
  return {
    pitch,
    start,
    duration,
    velocity,
  };
}

export function createBlock({ startBeat = 0, length = 4, type = "synth" } = {}) {
  return {
    id: createId(),
    startBeat,
    length,
    notes: type === "synth" ? [] : [],
    pattern: type === "drums" ? {} : [],
  };
}

export function createTrack(index, options = {}) {
  const template = DEFAULT_TRACKS[index] || DEFAULT_TRACKS[0];
  const requestedType = options.type === "drums" ? "drums" : options.type === "synth" ? "synth" : null;
  const baseTemplate = requestedType
    ? requestedType === "drums"
      ? DEFAULT_TRACKS[4]
      : DEFAULT_TRACKS[0]
    : template;
  return {
    id: createId(),
    type: baseTemplate.type,
    console: baseTemplate.console,
    waveform: baseTemplate.waveform,
    volume: 0.8,
    pan: 0,
    octave: 0,
    adsr: { ...DEFAULT_ADSR },
    drumVoices: {},
    chipDrumPads: null,
    mute: false,
    solo: false,
    blocks: [],
  };
}

export function createDefaultProject() {
  const tracks = Array.from({ length: 5 }, (_, index) => createTrack(index));
  return {
    name: "Untitled Project",
    bpm: 120,
    masterVolume: 0.9,
    tracks,
  };
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const isObject = (value) => value && typeof value === "object";

function normalizeNote(note) {
  const safe = isObject(note) ? note : {};
  return {
    pitch: Number.isFinite(safe.pitch) ? safe.pitch : 60,
    start: Number.isFinite(safe.start) ? Math.max(0, safe.start) : 0,
    duration: Number.isFinite(safe.duration) ? Math.max(0.125, safe.duration) : 0.25,
    velocity: Number.isFinite(safe.velocity) ? clamp(safe.velocity, 0, 1) : 0.9,
  };
}

function normalizeAdsr(adsr) {
  const safe = isObject(adsr) ? adsr : {};
  return {
    attack: Number.isFinite(safe.attack) ? clamp(safe.attack, 0, 2) : DEFAULT_ADSR.attack,
    decay: Number.isFinite(safe.decay) ? clamp(safe.decay, 0, 2) : DEFAULT_ADSR.decay,
    sustain: Number.isFinite(safe.sustain) ? clamp(safe.sustain, 0, 1) : DEFAULT_ADSR.sustain,
    release: Number.isFinite(safe.release) ? clamp(safe.release, 0, 3) : DEFAULT_ADSR.release,
  };
}

function normalizeDrumVoices(drumVoices) {
  const safeVoices = isObject(drumVoices) ? drumVoices : {};
  const normalized = {};

  Object.entries(DRUM_KITS).forEach(([consoleName, rows]) => {
    const safeConsole = isObject(safeVoices[consoleName]) ? safeVoices[consoleName] : {};
    rows.forEach((drum) => {
      if (!isObject(safeConsole[drum])) return;
      const values = {};
      DRUM_PARAMETER_KEYS.forEach((key) => {
        if (Number.isFinite(safeConsole[drum][key])) {
          values[key] = clamp(safeConsole[drum][key], 0, 1);
        }
      });
      if (Object.keys(values).length) {
        normalized[consoleName] = normalized[consoleName] || {};
        normalized[consoleName][drum] = values;
      }
    });
  });

  return normalized;
}

function normalizeChipDrumPads(chipDrumPads) {
  if (!Array.isArray(chipDrumPads)) return null;
  const byId = new Map(chipDrumPads.map((pad) => [pad?.id, pad]));

  return CHIP_DRUM_PAD_TEMPLATES.map((template) => {
    const safe = isObject(byId.get(template.id)) ? byId.get(template.id) : {};
    const normalized = {
      ...template,
      name:
        typeof safe.name === "string" && safe.name.trim()
          ? safe.name.trim().slice(0, 24)
          : template.name,
      engine: CHIP_DRUM_ENGINES.includes(safe.engine) ? safe.engine : template.engine,
      waveform: CHIP_DRUM_WAVEFORMS.includes(safe.waveform) ? safe.waveform : template.waveform,
      bits: Number.isFinite(safe.bits) ? Math.round(clamp(safe.bits, 2, 12)) : template.bits,
    };
    CHIP_DRUM_PARAMETER_KEYS.forEach((key) => {
      normalized[key] = Number.isFinite(safe[key]) ? clamp(safe[key], 0, 1) : template[key];
    });
    return normalized;
  });
}

function normalizeBlocks(blocks, type, drumRows) {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((block) => {
    const safe = isObject(block) ? block : {};
    const startBeat = Number.isFinite(safe.startBeat) ? Math.max(0, safe.startBeat) : 0;
    const length = Number.isFinite(safe.length) ? Math.max(0.25, safe.length) : 4;
    const normalized = createBlock({ startBeat, length, type });
    normalized.id = typeof safe.id === "string" ? safe.id : normalized.id;

    if (type === "synth") {
      normalized.notes = Array.isArray(safe.notes) ? safe.notes.map(normalizeNote) : [];
      normalized.pattern = Array.isArray(safe.pattern) ? safe.pattern : [];
    } else {
      const steps = Number.isFinite(safe.pattern?.steps) ? safe.pattern.steps : 16;
      const rows = Array.isArray(drumRows) ? drumRows : DEFAULT_DRUM_ROWS;
      normalized.pattern = safe.pattern || [];
      ensureDrumPattern(normalized, rows);
    }

    return normalized;
  });
}

function normalizeTrack(track, index) {
  const base = createTrack(index);
  const safe = isObject(track) ? track : {};
  const type = safe.type === "drums" ? "drums" : safe.type === "synth" ? "synth" : base.type;
  const availableConsoles = type === "drums" ? DRUM_KITS : CONSOLE_WAVES;
  const consoleName = availableConsoles[safe.console] ? safe.console : base.console;
  const waves = CONSOLE_WAVES[consoleName] || [];
  const waveform = waves.includes(safe.waveform) ? safe.waveform : waves[0] || base.waveform;

  return {
    ...base,
    id: typeof safe.id === "string" ? safe.id : base.id,
    type,
    console: consoleName,
    waveform,
    volume: Number.isFinite(safe.volume) ? clamp(safe.volume, 0, 1) : base.volume,
    pan: Number.isFinite(safe.pan) ? clamp(safe.pan, -1, 1) : base.pan,
    octave: Number.isFinite(safe.octave) ? clamp(safe.octave, -3, 3) : base.octave,
    adsr: normalizeAdsr(safe.adsr),
    drumVoices: normalizeDrumVoices(safe.drumVoices),
    chipDrumPads: normalizeChipDrumPads(safe.chipDrumPads),
    mute: Boolean(safe.mute),
    solo: Boolean(safe.solo),
    blocks: normalizeBlocks(safe.blocks, type, getDrumRowsForConsole(consoleName)),
  };
}

export function normalizeProject(rawProject) {
  const safe = isObject(rawProject) ? rawProject : {};
  const bpm = Number.isFinite(safe.bpm) ? clamp(safe.bpm, 40, 240) : 120;
  const incomingTracks = Array.isArray(safe.tracks) ? safe.tracks.slice(0, MAX_TRACKS) : [];
  const name = typeof safe.name === "string" && safe.name.trim() ? safe.name.trim() : "Untitled Project";
  const masterVolume = Number.isFinite(safe.masterVolume) ? clamp(safe.masterVolume, 0, 1) : 0.9;
  const trackCount = Math.max(incomingTracks.length, 5);
  const tracks = Array.from({ length: trackCount }, (_, index) => {
    const incoming = incomingTracks[index];
    return normalizeTrack(incoming, index);
  });

  return { name, bpm, masterVolume, tracks };
}

export function ensureDrumPattern(block, rows = DEFAULT_DRUM_ROWS) {
  const sourcePattern = block.pattern;
  const pattern =
    sourcePattern && typeof sourcePattern === "object" && !Array.isArray(sourcePattern)
      ? sourcePattern
      : {
          events: Array.isArray(sourcePattern?.events) ? sourcePattern.events : [],
          rows: Array.isArray(sourcePattern?.rows) ? sourcePattern.rows : undefined,
          volumes:
            sourcePattern?.volumes && typeof sourcePattern.volumes === "object"
              ? sourcePattern.volumes
              : {},
          steps: Number.isFinite(sourcePattern?.steps) ? sourcePattern.steps : 16,
        };

  if (!pattern.events && Array.isArray(pattern.grid)) {
    const steps = Number.isFinite(pattern.steps) ? pattern.steps : 16;
    const stepBeats = block.length / steps;
    const legacyRows = Array.isArray(pattern.rows) ? pattern.rows : rows;
    pattern.events = [];
    pattern.grid.forEach((row, rowIndex) => {
      const drum = legacyRows[rowIndex] || rows[rowIndex];
      if (!drum) return;
      row.forEach((active, stepIndex) => {
        if (!active) return;
        pattern.events.push({
          id: createId(),
          drum,
          start: stepIndex * stepBeats,
          duration: stepBeats,
          velocity: 0.9,
        });
      });
    });
  }

  if (!pattern.events) {
    pattern.events = [];
  }

  pattern.rows = Array.isArray(rows) && rows.length ? [...rows] : [...DEFAULT_DRUM_ROWS];

  pattern.events = pattern.events
    .filter((event) => event && pattern.rows.includes(event.drum))
    .map((event) => ({
      id: event.id || createId(),
      drum: event.drum,
      start: Number.isFinite(event.start) ? Math.max(0, event.start) : 0,
      duration: Number.isFinite(event.duration) ? Math.max(0.05, event.duration) : 0.25,
      velocity: Number.isFinite(event.velocity) ? clamp(event.velocity, 0, 1) : 0.9,
    }));

  if (!pattern.volumes || typeof pattern.volumes !== "object") {
    pattern.volumes = {};
  }

  pattern.rows.forEach((rowName) => {
    if (!Number.isFinite(pattern.volumes[rowName])) {
      pattern.volumes[rowName] = 0.9;
    }
  });

  block.pattern = pattern;
  return pattern;
}

export function getDrumRowsForConsole(consoleName) {
  return DRUM_KITS[consoleName] ? [...DRUM_KITS[consoleName]] : [...DEFAULT_DRUM_ROWS];
}

export function createChipDrumPads() {
  return CHIP_DRUM_PAD_TEMPLATES.map((pad) => ({ ...pad }));
}

export function ensureChipDrumPads(track) {
  const pads = track?.chipDrumPads;
  const isComplete =
    Array.isArray(pads) &&
    pads.length === CHIP_DRUM_PAD_TEMPLATES.length &&
    CHIP_DRUM_PAD_TEMPLATES.every((template) =>
      pads.some((pad) => pad?.id === template.id),
    );
  if (isComplete) return pads;

  const normalized = normalizeChipDrumPads(pads);
  track.chipDrumPads = normalized || createChipDrumPads();
  return track.chipDrumPads;
}

export function resetChipDrumPad(track, padId) {
  const pads = ensureChipDrumPads(track);
  const index = CHIP_DRUM_PAD_TEMPLATES.findIndex((pad) => pad.id === padId);
  if (index === -1) return null;
  pads[index] = { ...CHIP_DRUM_PAD_TEMPLATES[index] };
  return pads[index];
}

export function getDrumVoiceLabel(track, drum) {
  if (track?.console !== CHIP_DRUM_CONSOLE) return drum;
  const pad = track?.chipDrumPads?.find((item) => item.id === drum);
  return pad?.name || CHIP_DRUM_PAD_TEMPLATES.find((item) => item.id === drum)?.name || drum;
}

export function getDrumVoicePreset(consoleName, drum) {
  const base = DRUM_VOICE_PRESETS[drum] || DRUM_VOICE_PRESETS.perc;
  const character = DRUM_CONSOLE_CHARACTER[consoleName] || DRUM_CONSOLE_CHARACTER.NES;
  return {
    pitch: clamp(base.pitch + character.pitch, 0, 1),
    tone: clamp(base.tone + character.tone, 0, 1),
    decay: clamp(base.decay * character.decay, 0, 1),
    noise: clamp(base.noise + character.noise, 0, 1),
    drive: clamp(base.drive + character.drive, 0, 1),
  };
}

export function getDrumVoiceSettings(track, drum) {
  if (track?.console === CHIP_DRUM_CONSOLE) {
    const pad =
      track?.chipDrumPads?.find((item) => item.id === drum) ||
      CHIP_DRUM_PAD_TEMPLATES.find((item) => item.id === drum);
    if (pad) {
      return Object.fromEntries(CHIP_DRUM_PARAMETER_KEYS.map((key) => [key, pad[key]]));
    }
  }
  const preset = getDrumVoicePreset(track?.console, drum);
  const custom = track?.drumVoices?.[track.console]?.[drum];
  if (!isObject(custom)) return preset;
  const settings = { ...preset };
  DRUM_PARAMETER_KEYS.forEach((key) => {
    if (Number.isFinite(custom[key])) {
      settings[key] = clamp(custom[key], 0, 1);
    }
  });
  return settings;
}

export function getDrumVoiceDefinition(track, drum) {
  if (track?.console === CHIP_DRUM_CONSOLE) {
    const pad =
      track?.chipDrumPads?.find((item) => item.id === drum) ||
      CHIP_DRUM_PAD_TEMPLATES.find((item) => item.id === drum) ||
      CHIP_DRUM_PAD_TEMPLATES[0];
    return {
      engine: pad.engine,
      waveform: pad.waveform,
      bits: pad.bits,
      settings: Object.fromEntries(CHIP_DRUM_PARAMETER_KEYS.map((key) => [key, pad[key]])),
    };
  }

  const character = DRUM_CONSOLE_CHARACTER[track?.console] || DRUM_CONSOLE_CHARACTER.NES;
  return {
    engine: drum,
    waveform: character.wave,
    bits: character.bits,
    settings: getDrumVoiceSettings(track, drum),
  };
}

export function getProjectEndBeat(project) {
  let maxBeat = 0;
  project.tracks.forEach((track) => {
    track.blocks.forEach((block) => {
      maxBeat = Math.max(maxBeat, block.startBeat + block.length);
    });
  });
  return Math.max(maxBeat, 4);
}

export function quantizeProject(project, snap) {
  const quantizeValue = (value) => Math.round(value / snap) * snap;

  project.tracks.forEach((track) => {
    track.blocks.forEach((block) => {
      block.startBeat = Math.max(0, quantizeValue(block.startBeat));
      block.length = Math.max(snap, quantizeValue(block.length));

      if (track.type === "synth") {
        block.notes.forEach((note) => {
          note.start = Math.max(0, quantizeValue(note.start));
          note.duration = Math.max(snap, quantizeValue(note.duration));
        });
      }
    });
  });
}

export class HistoryManager {
  constructor(initialState, limit = 100) {
    this.clone = (value) => JSON.parse(JSON.stringify(value));
    this.stack = [this.clone(initialState)];
    this.index = 0;
    this.limit = limit;
  }

  push(state) {
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(this.clone(state));
    if (this.stack.length > this.limit) {
      this.stack.shift();
      this.index = this.stack.length - 1;
    } else {
      this.index += 1;
    }
  }

  undo() {
    if (this.index <= 0) {
      return null;
    }
    this.index -= 1;
    return this.clone(this.stack[this.index]);
  }

  redo() {
    if (this.index >= this.stack.length - 1) {
      return null;
    }
    this.index += 1;
    return this.clone(this.stack[this.index]);
  }

  reset(state) {
    this.stack = [this.clone(state)];
    this.index = 0;
  }
}
