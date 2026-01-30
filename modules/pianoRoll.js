const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const getNoteName = (midi) => {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
};

const ensureNoteId = (note) => {
  if (!note.id) {
    note.id = Math.random().toString(36).slice(2, 10);
  }
  return note.id;
};

export class PianoRoll {
  constructor({ container, snap = 0.25, zoom = 64, onNoteChange, onPreviewNote }) {
    this.container = container;
    this.snap = snap;
    this.zoom = zoom;
    this.onNoteChange = onNoteChange;
    this.onPreviewNote = onPreviewNote;
    this.track = null;
    this.block = null;
    this.minPitch = 12;
    this.maxPitch = 108;
    this.rowHeight = 24;
    this.noteElements = new Map();
  }

  setSnap(snap) {
    this.snap = snap;
    this.render();
  }

  setZoom(zoom) {
    this.zoom = zoom;
    this.render();
  }

  setData(track, block) {
    this.track = track;
    this.block = block;
    this.render();
  }

  quantize(value) {
    return Math.round(value / this.snap) * this.snap;
  }

  beatToPx(beat) {
    return beat * this.zoom;
  }

  pxToBeat(px) {
    return px / this.zoom;
  }

  render() {
    if (!this.block) {
      this.container.innerHTML = "";
      return;
    }

    this.container.innerHTML = "";
    this.container.classList.add("piano-roll");

    const keys = document.createElement("div");
    keys.className = "piano-keys";

    for (let pitch = this.maxPitch; pitch >= this.minPitch; pitch -= 1) {
      const key = document.createElement("div");
      key.className = "piano-key";
      key.textContent = getNoteName(pitch);
      key.addEventListener("pointerdown", () => {
        this.onPreviewNote?.(pitch, this.track);
      });
      keys.appendChild(key);
    }

    const gridWrap = document.createElement("div");
    gridWrap.className = "piano-grid-wrap";

    const grid = document.createElement("div");
    grid.className = "piano-grid";
    const totalBeats = Math.max(this.block.length, this.snap);
    grid.style.width = `${this.beatToPx(totalBeats)}px`;
    grid.style.height = `${(this.maxPitch - this.minPitch + 1) * this.rowHeight}px`;
    grid.style.setProperty("--grid-major", `${this.zoom * 4}px`);
    grid.style.setProperty("--grid-minor", `${this.zoom * this.snap}px`);

    const notesLayer = document.createElement("div");
    notesLayer.className = "piano-notes";

    grid.appendChild(notesLayer);
    gridWrap.appendChild(grid);

    this.container.appendChild(keys);
    this.container.appendChild(gridWrap);

    gridWrap.addEventListener("scroll", () => {
      keys.scrollTop = gridWrap.scrollTop;
    });

    this.noteElements.clear();

    this.block.notes.forEach((note) => {
      ensureNoteId(note);
      const noteEl = this.createNoteElement(note);
      notesLayer.appendChild(noteEl);
      this.noteElements.set(note.id, noteEl);
    });

    const handlePointer = (event) => {
      if (event.target.closest(".note")) return;
      const rect = gridWrap.getBoundingClientRect();
      const x = event.clientX - rect.left + gridWrap.scrollLeft;
      const y = event.clientY - rect.top + gridWrap.scrollTop;
      const maxStart = Math.max(0, this.block.length - this.snap);
      const beat = clamp(this.quantize(this.pxToBeat(x)), 0, maxStart);
      const pitchIndex = Math.floor(y / this.rowHeight);
      const pitch = clamp(this.maxPitch - pitchIndex, this.minPitch, this.maxPitch);

      const existing = this.findNoteAt(pitch, beat);
      if (existing) {
        this.block.notes = this.block.notes.filter((note) => note !== existing);
        this.onNoteChange?.(this.block.notes, { commit: true });
        this.render();
        return;
      }

      this.block.notes.push({
        pitch,
        start: beat,
        duration: this.snap,
        velocity: 0.9,
      });
      this.onPreviewNote?.(pitch, this.track);
      this.onNoteChange?.(this.block.notes, { commit: true });
      this.render();
    };

    grid.addEventListener("pointerdown", handlePointer);
    gridWrap.addEventListener("pointerdown", handlePointer);
  }

  findNoteAt(pitch, start) {
    return this.block.notes.find((note) => note.pitch === pitch && Math.abs(note.start - start) < 0.001);
  }

  createNoteElement(note) {
    const noteEl = document.createElement("div");
    noteEl.className = "note";
    noteEl.dataset.noteId = note.id;
    noteEl.style.left = `${this.beatToPx(note.start)}px`;
    noteEl.style.width = `${this.beatToPx(note.duration)}px`;
    const rowIndex = this.maxPitch - note.pitch;
    noteEl.style.top = `${rowIndex * this.rowHeight + 1}px`;

    const handle = document.createElement("div");
    handle.className = "resize-handle";
    noteEl.appendChild(handle);

    noteEl.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      this.onPreviewNote?.(note.pitch, this.track);
      if (event.target === handle) {
        this.attachResize(note, noteEl, event);
      } else {
        this.attachDrag(note, noteEl, event);
      }
    });

    noteEl.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      this.block.notes = this.block.notes.filter((item) => item !== note);
      this.onNoteChange?.(this.block.notes, { commit: true });
      this.render();
    });

    return noteEl;
  }

  attachDrag(note, noteEl, event) {
    const startX = event.clientX;
    const startY = event.clientY;
    const initialStart = note.start;
    const initialPitch = note.pitch;

    const onMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const maxStart = Math.max(0, this.block.length - note.duration);
      const nextStart = clamp(this.quantize(initialStart + this.pxToBeat(deltaX)), 0, maxStart);
      const pitchDelta = Math.round(deltaY / this.rowHeight);
      const nextPitch = clamp(initialPitch - pitchDelta, this.minPitch, this.maxPitch);

      note.start = nextStart;
      note.pitch = nextPitch;

      noteEl.style.left = `${this.beatToPx(note.start)}px`;
      const rowIndex = this.maxPitch - note.pitch;
      noteEl.style.top = `${rowIndex * this.rowHeight + 1}px`;

      this.onNoteChange?.(this.block.notes, { commit: false });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      this.onNoteChange?.(this.block.notes, { commit: true });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  attachResize(note, noteEl, event) {
    const startX = event.clientX;
    const initialDuration = note.duration;

    const onMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const maxDuration = Math.max(this.snap, this.block.length - note.start);
      const nextDuration = clamp(
        this.quantize(initialDuration + this.pxToBeat(deltaX)),
        this.snap,
        maxDuration
      );
      note.duration = nextDuration;
      noteEl.style.width = `${this.beatToPx(note.duration)}px`;
      this.onNoteChange?.(this.block.notes, { commit: false });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      this.onNoteChange?.(this.block.notes, { commit: true });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
}
