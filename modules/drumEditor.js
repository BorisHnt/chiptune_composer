import { DEFAULT_DRUM_ROWS, ensureDrumPattern, getDrumRowsForConsole } from "./dataModel.js";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const SUPPORTS_POINTER = "PointerEvent" in window;

const getPoint = (event) => {
  if (event.touches && event.touches[0]) {
    return { clientX: event.touches[0].clientX, clientY: event.touches[0].clientY };
  }
  return { clientX: event.clientX, clientY: event.clientY };
};

const addStartListener = (element, handler) => {
  if (SUPPORTS_POINTER) {
    element.addEventListener("pointerdown", handler);
    element.addEventListener("contextmenu", (event) => event.preventDefault());
  } else {
    element.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      handler(event);
    });
    element.addEventListener("touchstart", handler, { passive: false });
  }
};

const addMoveUpListeners = (onMove, onUp) => {
  if (SUPPORTS_POINTER) {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  } else {
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);
  }
};

const removeMoveUpListeners = (onMove, onUp) => {
  if (SUPPORTS_POINTER) {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  } else {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
    window.removeEventListener("touchcancel", onUp);
  }
};

export class DrumEditor {
  constructor({ container, zoom = 48, snap = 0.25, onPatternChange, onPreview }) {
    this.container = container;
    this.zoom = zoom;
    this.snap = snap;
    this.onPatternChange = onPatternChange;
    this.onPreview = onPreview;
    this.track = null;
    this.block = null;
    this.rowHeight = 28;
    this.scrollLeft = 0;
    this.scrollTop = 0;
  }

  setZoom(zoom) {
    this.zoom = zoom;
    this.render();
  }

  setSnap(snap) {
    this.snap = snap;
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

    const previousWrap = this.container.querySelector(".drum-grid-wrap");
    if (previousWrap) {
      this.scrollLeft = previousWrap.scrollLeft;
      this.scrollTop = previousWrap.scrollTop;
    }

    this.container.innerHTML = "";
    this.container.classList.add("drum-editor");

    const toolbar = document.createElement("div");
    toolbar.className = "drum-toolbar";

    const hint = document.createElement("div");
    hint.className = "drum-hint";
    hint.textContent = "Drums follow piano-roll divisions";
    toolbar.appendChild(hint);

    const body = document.createElement("div");
    body.className = "drum-body";

    const labels = document.createElement("div");
    labels.className = "drum-labels";

    const rows = getDrumRowsForConsole(this.track?.console) || DEFAULT_DRUM_ROWS;
    const pattern = ensureDrumPattern(this.block, rows);

    rows.forEach((row) => {
      const label = document.createElement("div");
      label.className = "drum-label";

      const name = document.createElement("button");
      name.type = "button";
      name.className = "drum-label-name";
      name.textContent = row.toUpperCase();
      name.addEventListener("click", () => {
        const level = Number.isFinite(pattern.volumes?.[row]) ? pattern.volumes[row] : 0.9;
        this.onPreview?.(row, level);
      });

      const volume = document.createElement("input");
      volume.type = "range";
      volume.min = 0;
      volume.max = 1;
      volume.step = 0.01;
      volume.className = "drum-volume";
      volume.value = Number.isFinite(pattern.volumes?.[row]) ? pattern.volumes[row] : 0.9;
      volume.addEventListener("input", () => {
        pattern.volumes = pattern.volumes || {};
        pattern.volumes[row] = parseFloat(volume.value);
        this.onPatternChange?.(pattern, { commit: true });
      });

      label.appendChild(name);
      label.appendChild(volume);
      labels.appendChild(label);
    });

    const gridWrap = document.createElement("div");
    gridWrap.className = "drum-grid-wrap";

    const grid = document.createElement("div");
    grid.className = "drum-grid";
    grid.style.setProperty("--grid-major", `${this.zoom * 4}px`);
    grid.style.setProperty("--grid-minor", `${this.zoom * this.snap}px`);
    const totalBeats = Math.max(this.block.length, this.snap);
    grid.style.width = `${this.beatToPx(totalBeats)}px`;
    grid.style.height = `${rows.length * this.rowHeight}px`;

    const hitsLayer = document.createElement("div");
    hitsLayer.className = "drum-hits";
    grid.appendChild(hitsLayer);

    pattern.events.forEach((event) => {
      const hit = this.createHitElement(event, rows, pattern);
      hitsLayer.appendChild(hit);
    });

    gridWrap.appendChild(grid);

    body.appendChild(labels);
    body.appendChild(gridWrap);

    this.container.appendChild(toolbar);
    this.container.appendChild(body);

    gridWrap.addEventListener("scroll", () => {
      labels.scrollTop = gridWrap.scrollTop;
      this.scrollLeft = gridWrap.scrollLeft;
      this.scrollTop = gridWrap.scrollTop;
    });

    gridWrap.scrollLeft = this.scrollLeft;
    gridWrap.scrollTop = this.scrollTop;
    labels.scrollTop = this.scrollTop;

    const handlePointer = (event) => {
      event.preventDefault?.();
      if (event.target.closest(".drum-hit")) return;
      const { clientX, clientY } = getPoint(event);
      const rect = gridWrap.getBoundingClientRect();
      const x = clientX - rect.left + gridWrap.scrollLeft;
      const y = clientY - rect.top + gridWrap.scrollTop;
      const maxStart = Math.max(0, this.block.length - this.snap);
      const beat = clamp(this.quantize(this.pxToBeat(x)), 0, maxStart);
      const rowIndex = clamp(Math.floor(y / this.rowHeight), 0, rows.length - 1);
      const drum = rows[rowIndex];

      const existing = this.findHitAt(pattern.events, drum, beat);
      if (existing) {
        pattern.events = pattern.events.filter((hit) => hit !== existing);
        this.onPatternChange?.(pattern, { commit: true });
        this.render();
        return;
      }

      pattern.events.push({
        id: Math.random().toString(36).slice(2, 10),
        drum,
        start: beat,
        duration: this.snap,
        velocity: 0.9,
      });
      const level = Number.isFinite(pattern.volumes?.[drum]) ? pattern.volumes[drum] : 0.9;
      this.onPreview?.(drum, level);
      this.onPatternChange?.(pattern, { commit: true });
      this.render();
    };

    addStartListener(gridWrap, handlePointer);
  }

  findHitAt(events, drum, start) {
    return events.find((event) => event.drum === drum && Math.abs(event.start - start) < 0.001);
  }

  createHitElement(event, rows, pattern) {
    const hit = document.createElement("div");
    hit.className = "drum-hit";
    hit.dataset.eventId = event.id;
    const rowIndex = rows.indexOf(event.drum);
    hit.style.left = `${this.beatToPx(event.start)}px`;
    hit.style.width = `${this.beatToPx(event.duration)}px`;
    hit.style.top = `${rowIndex * this.rowHeight + 3}px`;

    const handle = document.createElement("div");
    handle.className = "resize-handle";
    hit.appendChild(handle);

    addStartListener(hit, (eventStart) => {
      eventStart.stopPropagation?.();
      eventStart.preventDefault?.();
      if (eventStart.button === 2) {
        pattern.events = pattern.events.filter((hitEvent) => hitEvent !== event);
        this.onPatternChange?.(pattern, { commit: true });
        this.render();
        return;
      }
      const level = Number.isFinite(pattern.volumes?.[event.drum]) ? pattern.volumes[event.drum] : 0.9;
      this.onPreview?.(event.drum, level);
      if (eventStart.target === handle) {
        this.attachResize(event, hit, pattern);
      } else {
        this.attachDrag(event, hit, rows, pattern);
      }
    });

    hit.addEventListener("dblclick", (eventStart) => {
      eventStart.stopPropagation();
      pattern.events = pattern.events.filter((hitEvent) => hitEvent !== event);
      this.onPatternChange?.(pattern, { commit: true });
      this.render();
    });

    hit.addEventListener("contextmenu", (eventStart) => {
      eventStart.preventDefault();
      eventStart.stopPropagation();
      pattern.events = pattern.events.filter((hitEvent) => hitEvent !== event);
      this.onPatternChange?.(pattern, { commit: true });
      this.render();
    });

    return hit;
  }

  attachDrag(event, hitEl, rows, pattern) {
    const startPoint = getPoint(event);
    const startX = startPoint.clientX;
    const startY = startPoint.clientY;
    const initialStart = event.start;
    const initialRow = rows.indexOf(event.drum);

    const onMove = (moveEvent) => {
      const point = getPoint(moveEvent);
      const deltaX = point.clientX - startX;
      const deltaY = point.clientY - startY;
      const maxStart = Math.max(0, this.block.length - event.duration);
      const nextStart = clamp(this.quantize(initialStart + this.pxToBeat(deltaX)), 0, maxStart);
      const rowDelta = Math.round(deltaY / this.rowHeight);
      const nextRow = clamp(initialRow + rowDelta, 0, rows.length - 1);

      event.start = nextStart;
      event.drum = rows[nextRow];

      hitEl.style.left = `${this.beatToPx(event.start)}px`;
      hitEl.style.top = `${nextRow * this.rowHeight + 3}px`;

      this.onPatternChange?.(pattern, { commit: false });
    };

    const onUp = () => {
      removeMoveUpListeners(onMove, onUp);
      this.onPatternChange?.(pattern, { commit: true });
    };

    addMoveUpListeners(onMove, onUp);
  }

  attachResize(event, hitEl, pattern) {
    const startPoint = getPoint(event);
    const startX = startPoint.clientX;
    const initialDuration = event.duration;

    const onMove = (moveEvent) => {
      const point = getPoint(moveEvent);
      const deltaX = point.clientX - startX;
      const maxDuration = Math.max(this.snap, this.block.length - event.start);
      const nextDuration = clamp(
        this.quantize(initialDuration + this.pxToBeat(deltaX)),
        this.snap,
        maxDuration
      );
      event.duration = nextDuration;
      hitEl.style.width = `${this.beatToPx(event.duration)}px`;
      this.onPatternChange?.(pattern, { commit: false });
    };

    const onUp = () => {
      removeMoveUpListeners(onMove, onUp);
      this.onPatternChange?.(pattern, { commit: true });
    };

    addMoveUpListeners(onMove, onUp);
  }
}
