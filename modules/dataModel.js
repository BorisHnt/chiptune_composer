export const DEFAULT_DRUM_ROWS = ["kick", "snare", "hat", "perc"];

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

export function ensureDrumPattern(block, steps = 16, rows = DEFAULT_DRUM_ROWS) {
  if (!block.pattern || !block.pattern.grid) {
    block.pattern = {
      steps,
      rows: [...rows],
      grid: rows.map(() => Array.from({ length: steps }, () => false)),
    };
  }

  if (block.pattern.steps !== steps) {
    block.pattern.steps = steps;
    block.pattern.grid = block.pattern.rows.map((_, rowIndex) => {
      const existing = block.pattern.grid[rowIndex] || [];
      return Array.from({ length: steps }, (_, step) => Boolean(existing[step]));
    });
  }

  return block.pattern;
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
    this.stack = [structuredClone(initialState)];
    this.index = 0;
    this.limit = limit;
  }

  push(state) {
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(structuredClone(state));
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
    return structuredClone(this.stack[this.index]);
  }

  redo() {
    if (this.index >= this.stack.length - 1) {
      return null;
    }
    this.index += 1;
    return structuredClone(this.stack[this.index]);
  }

  reset(state) {
    this.stack = [structuredClone(state)];
    this.index = 0;
  }
}
