import { CONSOLE_WAVES, getProjectEndBeat } from "./dataModel.js";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export class Timeline {
  constructor({
    container,
    project,
    snap = 0.25,
    zoom = 64,
    onBlockEdit,
    onBlockDelete,
    onBlockDuplicate,
    onBlockChange,
    onAddBlock,
    onTrackChange,
    onCursorChange,
  }) {
    this.container = container;
    this.project = project;
    this.snap = snap;
    this.zoom = zoom;
    this.onBlockEdit = onBlockEdit;
    this.onBlockDelete = onBlockDelete;
    this.onBlockDuplicate = onBlockDuplicate;
    this.onBlockChange = onBlockChange;
    this.onAddBlock = onAddBlock;
    this.onTrackChange = onTrackChange;
    this.onCursorChange = onCursorChange;
    this.blockElements = new Map();
    this.playheadEl = null;
    this.cursorEl = null;
    this.cursorBeat = 0;

    this.render();
  }

  setProject(project) {
    this.project = project;
    this.render();
  }

  setSnap(snap) {
    this.snap = snap;
    this.updateGridVariables();
  }

  setZoom(zoom) {
    this.zoom = zoom;
    this.render();
  }

  setCursor(beat) {
    this.cursorBeat = beat;
    if (this.cursorEl) {
      this.cursorEl.style.left = `${beat * this.zoom}px`;
    }
  }

  beatToPx(beat) {
    return beat * this.zoom;
  }

  pxToBeat(px) {
    return px / this.zoom;
  }

  quantize(beat) {
    return Math.round(beat / this.snap) * this.snap;
  }

  updateGridVariables() {
    const major = this.zoom * 4;
    const minor = this.zoom * this.snap;
    this.container.style.setProperty("--grid-major", `${major}px`);
    this.container.style.setProperty("--grid-minor", `${minor}px`);
  }

  render() {
    this.container.innerHTML = "";
    this.blockElements.clear();

    const trackList = document.createElement("div");
    trackList.className = "track-list";

    const laneWrap = document.createElement("div");
    laneWrap.className = "lane-wrap";

    const laneScroller = document.createElement("div");
    laneScroller.className = "lane-scroller";

    const lanes = document.createElement("div");
    lanes.className = "lanes";

    this.playheadEl = document.createElement("div");
    this.playheadEl.className = "playhead";

    this.cursorEl = document.createElement("div");
    this.cursorEl.className = "cursor";

    laneScroller.appendChild(this.playheadEl);
    laneScroller.appendChild(this.cursorEl);
    laneScroller.appendChild(lanes);
    laneWrap.appendChild(laneScroller);

    this.container.appendChild(trackList);
    this.container.appendChild(laneWrap);

    this.updateGridVariables();

    const totalBeats = Math.max(16, getProjectEndBeat(this.project) + 4);
    const laneWidth = this.beatToPx(totalBeats);

    this.project.tracks.forEach((track, index) => {
      const header = this.createTrackHeader(track, index);
      trackList.appendChild(header);

      const lane = document.createElement("div");
      lane.className = "track-lane";
      lane.dataset.trackId = track.id;
      lane.style.width = `${laneWidth}px`;
      lane.addEventListener("pointerdown", (event) => {
        if (event.target.closest(".block")) return;
        const rect = lane.getBoundingClientRect();
        const beat = this.quantize(this.pxToBeat(event.clientX - rect.left));
        this.setCursor(clamp(beat, 0, totalBeats));
        if (this.onCursorChange) {
          this.onCursorChange(this.cursorBeat);
        }
      });

      track.blocks.forEach((block) => {
        const blockEl = this.createBlockElement(track, block, laneWidth);
        lane.appendChild(blockEl);
        this.blockElements.set(block.id, blockEl);
      });

      lanes.appendChild(lane);
    });

    this.setCursor(this.cursorBeat);
  }

  createTrackHeader(track, index) {
    const header = document.createElement("div");
    header.className = "track-header";
    header.dataset.trackId = track.id;

    const title = document.createElement("div");
    title.className = "track-title";
    title.innerHTML = `<span>Track ${index + 1} · ${track.type}</span>`;

    const addBtn = document.createElement("button");
    addBtn.className = "btn tiny";
    addBtn.textContent = "+ Block";
    addBtn.addEventListener("click", () => this.onAddBlock?.(track.id));
    title.appendChild(addBtn);

    const controls = document.createElement("div");
    controls.className = "track-controls";

    const consoleSelect = document.createElement("select");
    Object.keys(CONSOLE_WAVES).forEach((consoleName) => {
      const option = document.createElement("option");
      option.value = consoleName;
      option.textContent = consoleName;
      if (consoleName === track.console) option.selected = true;
      consoleSelect.appendChild(option);
    });

    const waveformSelect = document.createElement("select");
    const updateWaveforms = () => {
      waveformSelect.innerHTML = "";
      (CONSOLE_WAVES[consoleSelect.value] || []).forEach((wave) => {
        const option = document.createElement("option");
        option.value = wave;
        option.textContent = wave;
        if (wave === track.waveform) option.selected = true;
        waveformSelect.appendChild(option);
      });
    };
    updateWaveforms();

    consoleSelect.addEventListener("change", () => {
      const consoleValue = consoleSelect.value;
      const waveOptions = CONSOLE_WAVES[consoleValue] || [];
      const waveform = waveOptions[0] || "square";
      this.onTrackChange?.(track.id, { console: consoleValue, waveform });
    });

    waveformSelect.addEventListener("change", () => {
      this.onTrackChange?.(track.id, { waveform: waveformSelect.value });
    });

    const volumeInput = document.createElement("input");
    volumeInput.type = "range";
    volumeInput.min = 0;
    volumeInput.max = 1;
    volumeInput.step = 0.01;
    volumeInput.value = track.volume ?? 0.8;
    volumeInput.className = "mini";
    volumeInput.addEventListener("input", () => {
      this.onTrackChange?.(track.id, { volume: parseFloat(volumeInput.value) });
    });

    const panInput = document.createElement("input");
    panInput.type = "range";
    panInput.min = -1;
    panInput.max = 1;
    panInput.step = 0.1;
    panInput.value = track.pan ?? 0;
    panInput.className = "mini";
    panInput.addEventListener("input", () => {
      this.onTrackChange?.(track.id, { pan: parseFloat(panInput.value) });
    });

    const octaveInput = document.createElement("input");
    octaveInput.type = "number";
    octaveInput.min = -3;
    octaveInput.max = 3;
    octaveInput.value = track.octave ?? 0;
    octaveInput.className = "mini";
    octaveInput.addEventListener("change", () => {
      this.onTrackChange?.(track.id, { octave: parseInt(octaveInput.value, 10) });
    });

    const muteBtn = document.createElement("button");
    muteBtn.className = "btn tiny toggle";
    muteBtn.textContent = "Mute";
    muteBtn.setAttribute("aria-pressed", track.mute ? "true" : "false");
    muteBtn.addEventListener("click", () => {
      this.onTrackChange?.(track.id, { mute: !track.mute });
    });

    const soloBtn = document.createElement("button");
    soloBtn.className = "btn tiny toggle";
    soloBtn.textContent = "Solo";
    soloBtn.setAttribute("aria-pressed", track.solo ? "true" : "false");
    soloBtn.addEventListener("click", () => {
      this.onTrackChange?.(track.id, { solo: !track.solo });
    });

    controls.appendChild(this.wrapControl("Console", consoleSelect));
    controls.appendChild(this.wrapControl("Wave", waveformSelect));
    controls.appendChild(this.wrapControl("Vol", volumeInput));
    controls.appendChild(this.wrapControl("Pan", panInput));
    controls.appendChild(this.wrapControl("Oct", octaveInput));
    controls.appendChild(muteBtn);
    controls.appendChild(soloBtn);

    header.appendChild(title);
    header.appendChild(controls);

    return header;
  }

  wrapControl(labelText, input) {
    const label = document.createElement("label");
    label.innerHTML = `<span>${labelText}</span>`;
    label.appendChild(input);
    return label;
  }

  createBlockElement(track, block) {
    const blockEl = document.createElement("div");
    blockEl.className = `block ${track.type}`;
    blockEl.dataset.blockId = block.id;
    blockEl.style.left = `${this.beatToPx(block.startBeat)}px`;
    blockEl.style.width = `${this.beatToPx(block.length)}px`;

    const header = document.createElement("div");
    header.className = "block-header";
    header.innerHTML = `<span>${track.type === "drums" ? "Drum" : "MIDI"}</span>`;

    const actions = document.createElement("div");
    actions.className = "block-actions";

    const dupBtn = document.createElement("button");
    dupBtn.className = "block-action";
    dupBtn.textContent = "Dup";
    dupBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.onBlockDuplicate?.(track.id, block.id);
    });

    const delBtn = document.createElement("button");
    delBtn.className = "block-action";
    delBtn.textContent = "Del";
    delBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.onBlockDelete?.(track.id, block.id);
    });

    actions.appendChild(dupBtn);
    actions.appendChild(delBtn);
    header.appendChild(actions);

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "block-resize";

    blockEl.appendChild(header);
    blockEl.appendChild(resizeHandle);

    blockEl.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      this.onBlockEdit?.(track.id, block.id);
    });

    this.attachDragHandlers(blockEl, resizeHandle, track, block);

    return blockEl;
  }

  attachDragHandlers(blockEl, resizeHandle, track, block) {
    let dragMode = null;
    let startX = 0;
    let startBeat = 0;
    let startLength = 0;

    const onPointerMove = (event) => {
      if (!dragMode) return;
      const delta = this.pxToBeat(event.clientX - startX);

      if (dragMode === "move") {
        const next = Math.max(0, this.quantize(startBeat + delta));
        blockEl.style.left = `${this.beatToPx(next)}px`;
        blockEl.dataset.pendingStart = `${next}`;
      }

      if (dragMode === "resize") {
        const next = Math.max(this.snap, this.quantize(startLength + delta));
        blockEl.style.width = `${this.beatToPx(next)}px`;
        blockEl.dataset.pendingLength = `${next}`;
      }
    };

    const onPointerUp = () => {
      if (!dragMode) return;
      const pendingStart = blockEl.dataset.pendingStart;
      const pendingLength = blockEl.dataset.pendingLength;

      if (dragMode === "move" && pendingStart) {
        this.onBlockChange?.(track.id, block.id, {
          startBeat: parseFloat(pendingStart),
        });
      }

      if (dragMode === "resize" && pendingLength) {
        this.onBlockChange?.(track.id, block.id, {
          length: parseFloat(pendingLength),
        });
      }

      delete blockEl.dataset.pendingStart;
      delete blockEl.dataset.pendingLength;
      dragMode = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    blockEl.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest(".block-action")) return;
      if (event.target === resizeHandle) return;

      dragMode = "move";
      startX = event.clientX;
      startBeat = block.startBeat;
      blockEl.setPointerCapture(event.pointerId);

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    });

    resizeHandle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      dragMode = "resize";
      startX = event.clientX;
      startLength = block.length;
      blockEl.setPointerCapture(event.pointerId);

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    });
  }

  updatePlayhead(beat) {
    if (this.playheadEl) {
      this.playheadEl.style.left = `${this.beatToPx(beat)}px`;
    }

    this.project.tracks.forEach((track) => {
      track.blocks.forEach((block) => {
        const blockEl = this.blockElements.get(block.id);
        if (!blockEl) return;
        const isPlaying = beat >= block.startBeat && beat <= block.startBeat + block.length;
        blockEl.classList.toggle("is-playing", isPlaying);
      });
    });
  }
}
