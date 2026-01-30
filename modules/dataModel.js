export const DRUM_KITS = {
  NES: ["kick", "snare", "hat", "perc"],
  Atari: ["kick", "snare", "hat", "noise"],
  C64: ["kick", "snare", "hat", "clap", "tom"],
  Sega: ["kick", "snare", "hat", "fm-tom", "cowbell"],
};

export const DEFAULT_DRUM_ROWS = DRUM_KITS.NES;

export const CONSOLE_WAVES = {
  NES: ["pulse12", "pulse25", "pulse50"],
  Atari: ["square", "noise"],
  C64: ["triangle", "saw", "pulse"],
  Sega: ["fm"],
};

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

export function createTrack(index) {
  const template = DEFAULT_TRACKS[index] || DEFAULT_TRACKS[0];
  return {
    id: createId(),
    type: template.type,
    console: template.console,
    waveform: template.waveform,
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
      ensureDrumPattern(normalized, steps, rows);
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
  const incomingTracks = Array.isArray(safe.tracks) ? safe.tracks.slice(0, 5) : [];

  const tracks = Array.from({ length: 5 }, (_, index) => {
    const incoming = incomingTracks[index];
    return normalizeTrack(incoming, index);
  });

  return { bpm, tracks };
}

export function ensureDrumPattern(block, steps = 16, rows = DEFAULT_DRUM_ROWS) {
  if (!block.pattern || !block.pattern.grid) {
    block.pattern = {
      steps,
      rows: [...rows],
      grid: rows.map(() => Array.from({ length: steps }, () => false)),
      volumes: rows.reduce((acc, row) => {
        acc[row] = 0.9;
        return acc;
      }, {}),
    };
  }

  if (block.pattern.steps !== steps) {
    block.pattern.steps = steps;
    block.pattern.grid = block.pattern.rows.map((_, rowIndex) => {
      const existing = block.pattern.grid[rowIndex] || [];
      return Array.from({ length: steps }, (_, step) => Boolean(existing[step]));
    });
  }

  if (!block.pattern.volumes) {
    block.pattern.volumes = {};
  }

  if (rows && rows.length) {
    const previousRows = block.pattern.rows || [];
    const previousGrid = block.pattern.grid || [];
    const rowMap = new Map();
    previousRows.forEach((rowName, index) => {
      rowMap.set(rowName, previousGrid[index] || []);
    });

    block.pattern.rows = [...rows];
    block.pattern.grid = rows.map((rowName) => rowMap.get(rowName) || Array.from({ length: steps }, () => false));
  }

  rows.forEach((rowName) => {
    if (!Number.isFinite(block.pattern.volumes[rowName])) {
      block.pattern.volumes[rowName] = 0.9;
    }
  });

  return block.pattern;
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
