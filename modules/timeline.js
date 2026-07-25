import { getProjectEndBeat } from "./dataModel.js";

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
    onTrackMove,
    onTrackDelete,
    onTrackSelect,
    onBlockSelect,
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
    this.onTrackMove = onTrackMove;
    this.onTrackDelete = onTrackDelete;
    this.onTrackSelect = onTrackSelect;
    this.onBlockSelect = onBlockSelect;
    this.blockElements = new Map();
    this.playheadEl = null;
    this.cursorEl = null;
    this.cursorBeat = 0;
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.trackList = null;
    this.laneScroller = null;
    this.selectedTrackId = project.tracks[0]?.id || null;

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

  setSelectedTrackId(trackId) {
    this.selectedTrackId = trackId;
    this.container.querySelectorAll("[data-track-id]").forEach((element) => {
      element.classList.toggle("is-selected", element.dataset.trackId === trackId);
    });
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
    if (this.laneScroller) {
      this.scrollTop = this.laneScroller.scrollTop;
      this.scrollLeft = this.laneScroller.scrollLeft;
    }
    this.container.innerHTML = "";
    this.blockElements.clear();

    const trackList = document.createElement("div");
    trackList.className = "track-list";

    const laneWrap = document.createElement("div");
    laneWrap.className = "lane-wrap";

    const laneScroller = document.createElement("div");
    laneScroller.className = "lane-scroller";
    this.trackList = trackList;
    this.laneScroller = laneScroller;

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

    let syncingScroll = false;
    laneScroller.addEventListener("scroll", () => {
      this.scrollTop = laneScroller.scrollTop;
      this.scrollLeft = laneScroller.scrollLeft;
      if (syncingScroll || trackList.scrollTop === laneScroller.scrollTop) return;
      syncingScroll = true;
      trackList.scrollTop = laneScroller.scrollTop;
      syncingScroll = false;
    });
    trackList.addEventListener("scroll", () => {
      this.scrollTop = trackList.scrollTop;
      if (syncingScroll || laneScroller.scrollTop === trackList.scrollTop) return;
      syncingScroll = true;
      laneScroller.scrollTop = trackList.scrollTop;
      syncingScroll = false;
    });

    this.updateGridVariables();

    const totalBeats = Math.max(16, getProjectEndBeat(this.project) + 4);
    const laneWidth = this.beatToPx(totalBeats);

    this.project.tracks.forEach((track, index) => {
      const header = this.createTrackHeader(track, index);
      trackList.appendChild(header);

      const lane = document.createElement("div");
      lane.className = "track-lane";
      lane.classList.toggle("is-selected", track.id === this.selectedTrackId);
      lane.dataset.trackId = track.id;
      lane.style.width = `${laneWidth}px`;
      lane.addEventListener("pointerdown", (event) => {
        this.onTrackSelect?.(track.id);
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

    const horizontalScrollbarHeight = Math.max(
      0,
      laneScroller.offsetHeight - laneScroller.clientHeight,
    );
    if (horizontalScrollbarHeight > 0) {
      const scrollbarSpacer = document.createElement("div");
      scrollbarSpacer.className = "timeline-scrollbar-spacer";
      scrollbarSpacer.style.height = `${horizontalScrollbarHeight}px`;
      scrollbarSpacer.setAttribute("aria-hidden", "true");
      trackList.appendChild(scrollbarSpacer);
    }

    this.setCursor(this.cursorBeat);
    laneScroller.scrollTop = this.scrollTop;
    laneScroller.scrollLeft = this.scrollLeft;
    trackList.scrollTop = this.scrollTop;
  }

  createTrackHeader(track, index) {
    const header = document.createElement("div");
    header.className = "track-header";
    header.classList.toggle("is-selected", track.id === this.selectedTrackId);
    header.dataset.trackId = track.id;
    header.addEventListener("pointerdown", () => {
      this.onTrackSelect?.(track.id);
    });

    const title = document.createElement("div");
    title.className = "track-title";
    title.innerHTML = `<span>Track ${index + 1} · ${track.type}</span>`;

    const addBtn = document.createElement("button");
    addBtn.className = "btn tiny";
    addBtn.textContent = "+ Block";
    addBtn.addEventListener("click", () => this.onAddBlock?.(track.id));
    title.appendChild(addBtn);

    const moveUpBtn = document.createElement("button");
    moveUpBtn.className = "btn tiny";
    moveUpBtn.textContent = "Up";
    moveUpBtn.disabled = index === 0;
    moveUpBtn.addEventListener("click", () => this.onTrackMove?.(track.id, -1));

    const moveDownBtn = document.createElement("button");
    moveDownBtn.className = "btn tiny";
    moveDownBtn.textContent = "Down";
    moveDownBtn.disabled = index === this.project.tracks.length - 1;
    moveDownBtn.addEventListener("click", () => this.onTrackMove?.(track.id, 1));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn tiny danger";
    deleteBtn.textContent = "Del";
    deleteBtn.addEventListener("click", () => this.onTrackDelete?.(track.id));

    const controls = document.createElement("div");
    controls.className = "track-controls";

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

    const muteSoloActions = document.createElement("div");
    muteSoloActions.className = "mute-solo-actions";
    muteSoloActions.appendChild(muteBtn);
    muteSoloActions.appendChild(soloBtn);

    controls.appendChild(this.wrapControl("Vol", volumeInput));
    controls.appendChild(this.wrapControl("Pan", panInput));
    if (track.type !== "sample") {
      controls.appendChild(this.wrapControl("Oct", octaveInput));
    }
    controls.appendChild(muteSoloActions);

    header.appendChild(title);
    const actions = document.createElement("div");
    actions.className = "track-actions";
    actions.appendChild(moveUpBtn);
    actions.appendChild(moveDownBtn);
    actions.appendChild(deleteBtn);
    header.appendChild(actions);
    header.appendChild(controls);

    return header;
  }

  wrapControl(labelText, input) {
    const label = document.createElement("label");
    label.innerHTML = `<span>${labelText}</span>`;
    label.appendChild(input);
    return label;
  }

  getSamplePeak(asset, block, progress) {
    const peaks = asset?.peaks || [];
    const duration = Math.max(0.001, asset?.duration || 0.001);
    if (!peaks.length) return 0;

    const sourceStart = clamp(block.sourceStart || 0, 0, duration);
    const sourceEnd = clamp(
      Number.isFinite(block.sourceEnd) ? block.sourceEnd : duration,
      sourceStart + 0.001,
      duration,
    );
    const isLoop = block.mode === "loop";
    const activeStart = isLoop
      ? clamp(block.loopStart ?? sourceStart, sourceStart, sourceEnd - 0.001)
      : sourceStart;
    const activeEnd = isLoop
      ? clamp(block.loopEnd ?? sourceEnd, activeStart + 0.001, sourceEnd)
      : sourceEnd;
    const activeDuration = Math.max(0.001, activeEnd - activeStart);
    const rawOffset = Number.isFinite(block.offset) ? Math.max(0, block.offset) : 0;
    const offset = isLoop
      ? rawOffset % activeDuration
      : clamp(rawOffset, 0, activeDuration - 0.001);
    const projectBpm = Math.max(1, this.project.bpm || 120);
    const warpRate = block.warp?.enabled
      ? projectBpm / clamp(block.warp.sourceBpm || projectBpm, 20, 400)
      : 1;
    const pitchRate = 2 ** ((block.pitch || 0) / 12);
    const sourceRate =
      block.warp?.enabled && block.warp.mode === "beats"
        ? warpRate
        : warpRate * pitchRate;
    const outputDuration = Math.max(0.001, block.length * (60 / projectBpm));
    let sourceElapsed = offset + progress * outputDuration * sourceRate;

    if (!isLoop && sourceElapsed >= activeDuration) return 0;
    if (isLoop) sourceElapsed %= activeDuration;

    const sourceTime = block.reverse
      ? activeEnd - sourceElapsed
      : activeStart + sourceElapsed;
    const sourceIndex = Math.round(
      clamp(sourceTime / duration, 0, 1) * Math.max(0, peaks.length - 1),
    );
    return peaks[sourceIndex] || 0;
  }

  createBlockElement(track, block) {
    const blockEl = document.createElement("div");
    blockEl.className = `block ${track.type}`;
    blockEl.dataset.blockId = block.id;
    blockEl.style.left = `${this.beatToPx(block.startBeat)}px`;
    blockEl.style.width = `${this.beatToPx(block.length)}px`;
    blockEl.addEventListener("pointerdown", () => {
      this.onTrackSelect?.(track.id);
      this.onBlockSelect?.(track.id, block.id);
    });

    const header = document.createElement("div");
    header.className = "block-header";
    const asset = this.project.assets?.find((item) => item.id === block.assetId);
    const blockLabel =
      track.type === "drums"
        ? "Drum"
        : track.type === "sample"
          ? asset?.name || "Audio"
          : "MIDI";
    const label = document.createElement("span");
    label.textContent = blockLabel;
    label.title = blockLabel;
    header.appendChild(label);

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

    const rightResizeHandle = document.createElement("div");
    rightResizeHandle.className = "block-resize block-resize-right";
    rightResizeHandle.title = "Resize clip end";

    blockEl.appendChild(header);
    if (track.type === "sample") {
      const waveform = document.createElement("div");
      waveform.className = "block-waveform";
      waveform.setAttribute("aria-hidden", "true");
      const peaks = asset?.peaks || [];
      const count = peaks.length
        ? Math.min(192, Math.max(12, Math.ceil(this.beatToPx(block.length) / 4)))
        : 0;
      for (let index = 0; index < count; index += 1) {
        const bar = document.createElement("i");
        const progress = index / Math.max(1, count - 1);
        bar.style.height = `${Math.max(4, this.getSamplePeak(asset, block, progress) * 100)}%`;
        waveform.appendChild(bar);
      }
      const mode = document.createElement("span");
      mode.className = "block-sample-mode";
      mode.textContent = block.warp?.enabled
        ? `WARP ${block.warp.mode === "beats" ? "BEATS" : "REPITCH"}`
        : block.mode === "loop"
          ? "LOOP"
          : "ONE SHOT";
      waveform.appendChild(mode);
      blockEl.appendChild(waveform);

      const leftResizeHandle = document.createElement("div");
      leftResizeHandle.className = "block-resize block-resize-left";
      leftResizeHandle.title = "Trim clip start";
      blockEl.appendChild(leftResizeHandle);
      this.attachDragHandlers(blockEl, leftResizeHandle, rightResizeHandle, track, block);
    } else {
      this.attachDragHandlers(blockEl, null, rightResizeHandle, track, block);
    }
    blockEl.appendChild(rightResizeHandle);

    blockEl.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      this.onBlockEdit?.(track.id, block.id);
    });

    return blockEl;
  }

  attachDragHandlers(blockEl, leftResizeHandle, rightResizeHandle, track, block) {
    let dragMode = null;
    let startX = 0;
    let startBeat = 0;
    let startLength = 0;
    let endBeat = 0;

    const onPointerMove = (event) => {
      if (!dragMode) return;
      const delta = this.pxToBeat(event.clientX - startX);

      if (dragMode === "move") {
        const next = Math.max(0, this.quantize(startBeat + delta));
        blockEl.style.left = `${this.beatToPx(next)}px`;
        blockEl.dataset.pendingStart = `${next}`;
      }

      if (dragMode === "resize-right") {
        const next = Math.max(this.snap, this.quantize(startLength + delta));
        blockEl.style.width = `${this.beatToPx(next)}px`;
        blockEl.dataset.pendingLength = `${next}`;
      }

      if (dragMode === "resize-left") {
        const nextStart = clamp(
          this.quantize(startBeat + delta),
          0,
          endBeat - this.snap,
        );
        const nextLength = endBeat - nextStart;
        blockEl.style.left = `${this.beatToPx(nextStart)}px`;
        blockEl.style.width = `${this.beatToPx(nextLength)}px`;
        blockEl.dataset.pendingStart = `${nextStart}`;
        blockEl.dataset.pendingLength = `${nextLength}`;
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

      if (dragMode === "resize-right" && pendingLength) {
        this.onBlockChange?.(track.id, block.id, {
          length: parseFloat(pendingLength),
        }, { edge: "right" });
      }

      if (dragMode === "resize-left" && pendingStart && pendingLength) {
        const nextStart = parseFloat(pendingStart);
        this.onBlockChange?.(track.id, block.id, {
          startBeat: nextStart,
          length: parseFloat(pendingLength),
        }, {
          edge: "left",
          deltaBeats: nextStart - startBeat,
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
      if (event.target.closest(".block-resize")) return;

      dragMode = "move";
      startX = event.clientX;
      startBeat = block.startBeat;
      blockEl.setPointerCapture(event.pointerId);

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    });

    rightResizeHandle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      dragMode = "resize-right";
      startX = event.clientX;
      startLength = block.length;
      blockEl.setPointerCapture(event.pointerId);

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    });

    leftResizeHandle?.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      dragMode = "resize-left";
      startX = event.clientX;
      startBeat = block.startBeat;
      startLength = block.length;
      endBeat = startBeat + startLength;
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
