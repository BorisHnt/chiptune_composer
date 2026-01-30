import { DEFAULT_DRUM_ROWS, ensureDrumPattern } from "./dataModel.js";

export class DrumEditor {
  constructor({ container, zoom = 48, onPatternChange, onPreview }) {
    this.container = container;
    this.zoom = zoom;
    this.onPatternChange = onPatternChange;
    this.onPreview = onPreview;
    this.track = null;
    this.block = null;
    this.steps = 16;
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

  render() {
    if (!this.block) {
      this.container.innerHTML = "";
      return;
    }

    if (this.block.pattern?.steps) {
      this.steps = this.block.pattern.steps;
    }

    this.container.innerHTML = "";
    this.container.classList.add("drum-editor");

    const toolbar = document.createElement("div");
    toolbar.className = "drum-toolbar";

    const stepSelect = document.createElement("select");
    [16, 32].forEach((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${value} steps`;
      if (value === this.steps) option.selected = true;
      stepSelect.appendChild(option);
    });

    stepSelect.addEventListener("change", () => {
      this.steps = parseInt(stepSelect.value, 10);
      const rows = (this.block.pattern?.rows || DEFAULT_DRUM_ROWS).slice();
      const pattern = ensureDrumPattern(this.block, this.steps, rows);
      this.onPatternChange?.(pattern, { commit: true });
      this.render();
    });

    toolbar.appendChild(stepSelect);

    const body = document.createElement("div");
    body.className = "drum-body";

    const labels = document.createElement("div");
    labels.className = "drum-labels";

    const rows = (this.block.pattern?.rows || DEFAULT_DRUM_ROWS).slice();
    const pattern = ensureDrumPattern(this.block, this.steps, rows);

    rows.forEach((row) => {
      const label = document.createElement("div");
      label.className = "drum-label";
      label.textContent = row.toUpperCase();
      labels.appendChild(label);
    });

    const gridWrap = document.createElement("div");
    gridWrap.className = "drum-grid-wrap";

    const grid = document.createElement("div");
    grid.className = "drum-grid";
    grid.style.gridTemplateColumns = `repeat(${pattern.steps}, var(--step-width))`;
    grid.style.setProperty("--grid-major", `${this.zoom * 4}px`);
    grid.style.setProperty("--grid-minor", `${this.zoom}px`);
    grid.style.setProperty("--step-width", `${this.zoom}px`);
    grid.style.width = `${pattern.steps * this.zoom}px`;

    pattern.grid.forEach((row, rowIndex) => {
      row.forEach((active, stepIndex) => {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "drum-cell";
        if (active) cell.classList.add("active");

        cell.addEventListener("click", () => {
          row[stepIndex] = !row[stepIndex];
          cell.classList.toggle("active", row[stepIndex]);
          this.onPreview?.(rows[rowIndex]);
          this.onPatternChange?.(pattern, { commit: true });
        });

        grid.appendChild(cell);
      });
    });

    gridWrap.appendChild(grid);

    body.appendChild(labels);
    body.appendChild(gridWrap);

    this.container.appendChild(toolbar);
    this.container.appendChild(body);
  }
}
