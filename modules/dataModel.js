export const DRUM_KITS = {
  NES: ["kick", "snare", "hat", "perc"],
  Atari: ["kick", "snare", "hat", "noise"],
  C64: ["kick", "snare", "hat", "clap", "tom"],
  Sega: ["kick", "snare", "hat", "fm-tom", "cowbell"],
};

export const DEFAULT_DRUM_ROWS = DRUM_KITS.NES;

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
  Sega: ["fm"],
};

export const MAX_TRACKS = 16;

const DEFAULT_TRACKS = [
  { type: "synth", console: "NES", waveform: "pulse25" },
  { type: "synth", console: "C64", waveform: "triangle" },
  { type: "synth", console: "Atari", waveform: "square" },
  { type: "synth", console: "Sega", waveform: "fm" },
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
    pattern: [],
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
  const consoleName = CONSOLE_WAVES[safe.console] ? safe.console : base.console;
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
  const trackCount = Math.max(incomingTracks.length, 5);
  const tracks = Array.from({ length: trackCount }, (_, index) => {
    const incoming = incomingTracks[index];
    return normalizeTrack(incoming, index);
  });

  return { name, bpm, tracks };
}

export function ensureDrumPattern(block, rows = DEFAULT_DRUM_ROWS) {
  const pattern = block.pattern && typeof block.pattern === "object" ? block.pattern : {};

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
