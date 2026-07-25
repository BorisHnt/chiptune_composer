const ui = {
  playBtn: document.getElementById("playBtn"),
  playAllBtn: document.getElementById("playAllBtn"),
  stopBtn: document.getElementById("stopBtn"),
  loopBtn: document.getElementById("loopBtn"),
  undoBtn: document.getElementById("undoBtn"),
  redoBtn: document.getElementById("redoBtn"),
  zoomOutBtn: document.getElementById("zoomOutBtn"),
  zoomSlider: document.getElementById("zoomSlider"),
  zoomInBtn: document.getElementById("zoomInBtn"),
  fitBtn: document.getElementById("fitBtn"),
  importBtn: document.getElementById("importBtn"),
  emptyImportBtn: document.getElementById("emptyImportBtn"),
  audioInput: document.getElementById("audioInput"),
  fileName: document.getElementById("fileName"),
  fileMeta: document.getElementById("fileMeta"),
  cursorTime: document.getElementById("cursorTime"),
  selectionDuration: document.getElementById("selectionDuration"),
  overviewCanvas: document.getElementById("overviewCanvas"),
  overviewWrap: document.getElementById("overviewWrap"),
  waveViewport: document.getElementById("waveViewport"),
  waveStage: document.getElementById("waveStage"),
  waveCanvas: document.getElementById("waveCanvas"),
  wavePlayhead: document.getElementById("wavePlayhead"),
  emptyState: document.getElementById("emptyState"),
  selectionStartInput: document.getElementById("selectionStartInput"),
  selectionEndInput: document.getElementById("selectionEndInput"),
  selectAllBtn: document.getElementById("selectAllBtn"),
  clearSelectionBtn: document.getElementById("clearSelectionBtn"),
  selectionStatus: document.getElementById("selectionStatus"),
  trimBtn: document.getElementById("trimBtn"),
  deleteBtn: document.getElementById("deleteBtn"),
  silenceBtn: document.getElementById("silenceBtn"),
  reverseBtn: document.getElementById("reverseBtn"),
  fadeInBtn: document.getElementById("fadeInBtn"),
  fadeOutBtn: document.getElementById("fadeOutBtn"),
  normalizeBtn: document.getElementById("normalizeBtn"),
  addSliceBtn: document.getElementById("addSliceBtn"),
  sliceList: document.getElementById("sliceList"),
  exportNameInput: document.getElementById("exportNameInput"),
  exportSelectionBtn: document.getElementById("exportSelectionBtn"),
  exportAllBtn: document.getElementById("exportAllBtn"),
  statusMessage: document.getElementById("statusMessage"),
  audioStats: document.getElementById("audioStats"),
};

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const EDIT_BUTTONS = [
  ui.trimBtn,
  ui.deleteBtn,
  ui.silenceBtn,
  ui.reverseBtn,
  ui.fadeInBtn,
  ui.fadeOutBtn,
  ui.normalizeBtn,
];
const MAX_HISTORY_BYTES = 192 * 1024 * 1024;
const MAX_CANVAS_WIDTH = 16000;
const BASE_PIXELS_PER_SECOND = 140;

let audioContext = null;
let audioBuffer = null;
let importedFileName = "";
let selection = { start: 0, end: 0, active: false };
let cursorTime = 0;
let zoom = 1;
let displayWidth = 1;
let dragAnchor = null;
let audioSource = null;
let playStartedAt = 0;
let playOffset = 0;
let playEnd = 0;
let playLoop = false;
let playheadFrame = null;
let history = [];
let historyIndex = -1;
let historyBytes = 0;
let slices = [];
let sliceCounter = 1;
let resizeTimer = null;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function ensureAudioContext() {
  if (!audioContext) {
    if (!AudioContextClass) throw new Error("Web Audio API is not supported");
    audioContext = new AudioContextClass();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function formatTime(seconds) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(3).padStart(6, "0")}`;
}

function formatRate(sampleRate) {
  return sampleRate >= 1000
    ? `${(sampleRate / 1000).toFixed(sampleRate % 1000 ? 1 : 0)} kHz`
    : `${sampleRate} Hz`;
}

function hasSelection() {
  return Boolean(
    audioBuffer &&
      selection.active &&
      selection.end - selection.start >= 1 / audioBuffer.sampleRate,
  );
}

function getSelectionRange({ fallbackToAll = false } = {}) {
  if (hasSelection()) {
    const start = clamp(selection.start, 0, audioBuffer.duration);
    const end = clamp(selection.end, start, audioBuffer.duration);
    return { start, end };
  }
  if (fallbackToAll && audioBuffer) {
    return { start: 0, end: audioBuffer.duration };
  }
  return null;
}

function setStatus(message) {
  ui.statusMessage.textContent = message;
}

function setSelection(start, end, active = true, { render = true } = {}) {
  if (!audioBuffer) return;
  const nextStart = clamp(Math.min(start, end), 0, audioBuffer.duration);
  const nextEnd = clamp(Math.max(start, end), 0, audioBuffer.duration);
  selection = { start: nextStart, end: nextEnd, active };
  cursorTime = end;
  if (render) {
    renderWaveform();
    renderOverview();
    updateInterface();
  }
}

function clearSelection() {
  if (!audioBuffer) return;
  selection.active = false;
  selection.start = cursorTime;
  selection.end = cursorTime;
  renderWaveform();
  renderOverview();
  updateInterface();
}

function updateInterface() {
  const loaded = Boolean(audioBuffer);
  const selected = hasSelection();
  const playing = Boolean(audioSource);

  [
    ui.playAllBtn,
    ui.loopBtn,
    ui.zoomOutBtn,
    ui.zoomSlider,
    ui.zoomInBtn,
    ui.fitBtn,
    ui.selectAllBtn,
    ui.clearSelectionBtn,
    ui.exportAllBtn,
  ].forEach((control) => {
    control.disabled = !loaded;
  });
  ui.playBtn.disabled = !selected;
  ui.stopBtn.disabled = !playing;
  ui.addSliceBtn.disabled = !selected;
  ui.exportSelectionBtn.disabled = !selected;
  EDIT_BUTTONS.forEach((button) => {
    button.disabled = !selected;
  });
  ui.undoBtn.disabled = historyIndex <= 0;
  ui.redoBtn.disabled = historyIndex < 0 || historyIndex >= history.length - 1;

  ui.emptyState.classList.toggle("hidden", loaded);
  ui.selectionStartInput.disabled = !loaded;
  ui.selectionEndInput.disabled = !loaded;
  ui.selectionStartInput.max = loaded ? audioBuffer.duration : 0;
  ui.selectionEndInput.max = loaded ? audioBuffer.duration : 0;
  ui.selectionStartInput.value = loaded ? selection.start.toFixed(3) : "0";
  ui.selectionEndInput.value = loaded ? selection.end.toFixed(3) : "0";
  ui.selectionDuration.textContent = formatTime(selected ? selection.end - selection.start : 0);
  ui.cursorTime.textContent = formatTime(cursorTime);
  ui.selectionStatus.textContent = selected
    ? `${Math.round((selection.end - selection.start) * audioBuffer.sampleRate).toLocaleString()} samples selected`
    : "Selection inactive";

  if (loaded) {
    ui.fileName.textContent = importedFileName;
    ui.fileMeta.textContent = `${audioBuffer.numberOfChannels === 1 ? "Mono" : `${audioBuffer.numberOfChannels} channels`} · ${formatRate(audioBuffer.sampleRate)} · ${formatTime(audioBuffer.duration)}`;
    ui.audioStats.textContent = `${audioBuffer.length.toLocaleString()} samples · ${audioBuffer.numberOfChannels} ch`;
  } else {
    ui.fileName.textContent = "No audio loaded";
    ui.fileMeta.textContent = "—";
    ui.audioStats.textContent = "0 samples";
  }
}

function setupCanvas(canvas, cssWidth, cssHeight) {
  const scale = Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_CANVAS_WIDTH / cssWidth));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.max(1, Math.floor(cssWidth * scale));
  canvas.height = Math.max(1, Math.floor(cssHeight * scale));
  const context = canvas.getContext("2d");
  context.setTransform(scale, 0, 0, scale, 0, 0);
  return context;
}

function drawChannelWaveform(context, channelData, width, top, height, color) {
  const center = top + height / 2;
  const amplitude = height * 0.44;
  const samplesPerPixel = channelData.length / width;
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.beginPath();

  for (let x = 0; x < width; x += 1) {
    const from = Math.floor(x * samplesPerPixel);
    const to = Math.max(from + 1, Math.floor((x + 1) * samplesPerPixel));
    let min = 1;
    let max = -1;
    for (let index = from; index < to && index < channelData.length; index += 1) {
      const value = channelData[index];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    context.moveTo(x + 0.5, center - max * amplitude);
    context.lineTo(x + 0.5, center - min * amplitude);
  }
  context.stroke();
}

function drawRuler(context, width, height) {
  if (!audioBuffer) return;
  const pixelsPerSecond = width / audioBuffer.duration;
  const candidates = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300];
  const interval = candidates.find((value) => value * pixelsPerSecond >= 70) || 600;
  context.fillStyle = "#202a31";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#64717b";
  context.fillStyle = "#b8c2c9";
  context.font = "10px SFMono-Regular, Consolas, monospace";
  context.textBaseline = "top";

  for (let time = 0; time <= audioBuffer.duration + interval / 2; time += interval) {
    const x = (time / audioBuffer.duration) * width;
    context.beginPath();
    context.moveTo(x + 0.5, height - 8);
    context.lineTo(x + 0.5, height);
    context.stroke();
    context.fillText(formatTime(time), x + 3, 4);
  }
}

function renderWaveform() {
  const viewportWidth = Math.max(1, ui.waveViewport.clientWidth);
  const viewportHeight = Math.max(180, ui.waveViewport.clientHeight);

  if (!audioBuffer) {
    displayWidth = viewportWidth;
    ui.waveStage.style.width = `${displayWidth}px`;
    setupCanvas(ui.waveCanvas, displayWidth, viewportHeight).clearRect(
      0,
      0,
      displayWidth,
      viewportHeight,
    );
    return;
  }

  const baseWidth = Math.max(
    viewportWidth,
    audioBuffer.duration * BASE_PIXELS_PER_SECOND,
  );
  const requestedWidth = baseWidth * zoom;
  displayWidth = Math.min(
    MAX_CANVAS_WIDTH,
    Math.max(viewportWidth, Math.round(requestedWidth)),
  );
  ui.waveStage.style.width = `${displayWidth}px`;
  const context = setupCanvas(ui.waveCanvas, displayWidth, viewportHeight);
  context.fillStyle = "#172027";
  context.fillRect(0, 0, displayWidth, viewportHeight);

  const rulerHeight = 28;
  drawRuler(context, displayWidth, rulerHeight);
  const channelHeight = (viewportHeight - rulerHeight) / audioBuffer.numberOfChannels;

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const top = rulerHeight + channel * channelHeight;
    context.fillStyle = channel % 2 ? "#1a242b" : "#172027";
    context.fillRect(0, top, displayWidth, channelHeight);
    context.strokeStyle = "#33424c";
    context.beginPath();
    context.moveTo(0, top + channelHeight / 2 + 0.5);
    context.lineTo(displayWidth, top + channelHeight / 2 + 0.5);
    context.stroke();
    drawChannelWaveform(
      context,
      audioBuffer.getChannelData(channel),
      displayWidth,
      top,
      channelHeight,
      channel === 0 ? "#58c7c2" : "#b6e4df",
    );
  }

  slices.forEach((slice, index) => {
    const x = (slice.start / audioBuffer.duration) * displayWidth;
    context.strokeStyle = index % 2 ? "#e96868" : "#f4b849";
    context.beginPath();
    context.moveTo(x + 0.5, rulerHeight);
    context.lineTo(x + 0.5, viewportHeight);
    context.stroke();
  });

  if (hasSelection()) {
    const startX = (selection.start / audioBuffer.duration) * displayWidth;
    const endX = (selection.end / audioBuffer.duration) * displayWidth;
    context.fillStyle = "rgba(244, 184, 73, 0.28)";
    context.fillRect(startX, rulerHeight, endX - startX, viewportHeight - rulerHeight);
    context.strokeStyle = "#f4b849";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(startX, rulerHeight);
    context.lineTo(startX, viewportHeight);
    context.moveTo(endX, rulerHeight);
    context.lineTo(endX, viewportHeight);
    context.stroke();
  } else {
    const x = (cursorTime / audioBuffer.duration) * displayWidth;
    context.strokeStyle = "#f4b849";
    context.beginPath();
    context.moveTo(x + 0.5, rulerHeight);
    context.lineTo(x + 0.5, viewportHeight);
    context.stroke();
  }
}

function renderOverview() {
  const width = Math.max(1, ui.overviewWrap.clientWidth - 28);
  const height = 56;
  const context = setupCanvas(ui.overviewCanvas, width, height);
  context.fillStyle = "#172027";
  context.fillRect(0, 0, width, height);
  if (!audioBuffer) return;

  drawChannelWaveform(context, audioBuffer.getChannelData(0), width, 0, height, "#58c7c2");

  if (hasSelection()) {
    const startX = (selection.start / audioBuffer.duration) * width;
    const endX = (selection.end / audioBuffer.duration) * width;
    context.fillStyle = "rgba(244, 184, 73, 0.28)";
    context.fillRect(startX, 0, endX - startX, height);
    context.strokeStyle = "#f4b849";
    context.strokeRect(startX, 0.5, endX - startX, height - 1);
  }

  if (displayWidth > ui.waveViewport.clientWidth) {
    const viewportStart = ui.waveViewport.scrollLeft / displayWidth;
    const viewportSize = ui.waveViewport.clientWidth / displayWidth;
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1;
    context.strokeRect(viewportStart * width, 1, viewportSize * width, height - 2);
  }
}

function xToTime(clientX) {
  if (!audioBuffer) return 0;
  const rect = ui.waveCanvas.getBoundingClientRect();
  const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
  return ratio * audioBuffer.duration;
}

function createSnapshot() {
  if (!audioBuffer) return null;
  const channels = Array.from(
    { length: audioBuffer.numberOfChannels },
    (_, channel) => audioBuffer.getChannelData(channel).slice(),
  );
  const bytes = channels.reduce((total, data) => total + data.byteLength, 0);
  return {
    sampleRate: audioBuffer.sampleRate,
    channels,
    selection: { ...selection },
    slices: slices.map((slice) => ({ ...slice })),
    bytes,
  };
}

function createBufferFromChannels(channels, sampleRate) {
  const context = ensureAudioContext();
  const length = channels[0]?.length || 1;
  const buffer = context.createBuffer(channels.length, length, sampleRate);
  channels.forEach((data, channel) => {
    buffer.copyToChannel(data, channel);
  });
  return buffer;
}

function pushHistory({ reset = false } = {}) {
  const snapshot = createSnapshot();
  if (!snapshot) return;
  if (reset) {
    history = [];
    historyIndex = -1;
    historyBytes = 0;
  } else if (historyIndex < history.length - 1) {
    const removed = history.splice(historyIndex + 1);
    historyBytes -= removed.reduce((total, item) => total + item.bytes, 0);
  }

  history.push(snapshot);
  historyIndex = history.length - 1;
  historyBytes += snapshot.bytes;

  while (history.length > 1 && historyBytes > MAX_HISTORY_BYTES) {
    const removed = history.shift();
    historyBytes -= removed.bytes;
    historyIndex -= 1;
  }
  updateInterface();
}

function syncSlicesToCurrentHistory() {
  if (historyIndex < 0 || !history[historyIndex]) return;
  history[historyIndex].slices = slices.map((slice) => ({ ...slice }));
}

function restoreSnapshot(snapshot) {
  stopPlayback();
  audioBuffer = createBufferFromChannels(snapshot.channels, snapshot.sampleRate);
  selection = { ...snapshot.selection };
  slices = snapshot.slices.map((slice) => ({ ...slice }));
  cursorTime = selection.end;
  renderAll();
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  restoreSnapshot(history[historyIndex]);
  setStatus("Undo");
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex += 1;
  restoreSnapshot(history[historyIndex]);
  setStatus("Redo");
}

function getSampleIndexes(range) {
  const start = clamp(Math.floor(range.start * audioBuffer.sampleRate), 0, audioBuffer.length);
  const end = clamp(Math.ceil(range.end * audioBuffer.sampleRate), start, audioBuffer.length);
  return { start, end };
}

function replaceAudio(channels, nextSelection, { clearSlices = false, status } = {}) {
  stopPlayback();
  audioBuffer = createBufferFromChannels(channels, audioBuffer.sampleRate);
  selection = {
    start: clamp(nextSelection.start, 0, audioBuffer.duration),
    end: clamp(nextSelection.end, 0, audioBuffer.duration),
    active: nextSelection.active,
  };
  cursorTime = selection.end;
  if (clearSlices) slices = [];
  pushHistory();
  renderAll();
  setStatus(status);
}

function cloneChannels() {
  return Array.from(
    { length: audioBuffer.numberOfChannels },
    (_, channel) => audioBuffer.getChannelData(channel).slice(),
  );
}

function trimSelection() {
  const range = getSelectionRange();
  if (!range) return;
  const { start, end } = getSampleIndexes(range);
  const channels = cloneChannels().map((channel) => channel.slice(start, end));
  replaceAudio(
    channels,
    { start: 0, end: channels[0].length / audioBuffer.sampleRate, active: true },
    { clearSlices: true, status: "Trimmed to selection" },
  );
}

function deleteSelection() {
  const range = getSelectionRange();
  if (!range) return;
  const { start, end } = getSampleIndexes(range);
  if (end - start >= audioBuffer.length) {
    setStatus("Cannot delete the entire audio");
    return;
  }
  const channels = cloneChannels().map((channel) => {
    const result = new Float32Array(channel.length - (end - start));
    result.set(channel.subarray(0, start));
    result.set(channel.subarray(end), start);
    return result;
  });
  const cursor = start / audioBuffer.sampleRate;
  replaceAudio(
    channels,
    { start: cursor, end: cursor, active: false },
    { clearSlices: true, status: "Selection deleted" },
  );
}

function processSelection(processor, status) {
  const range = getSelectionRange();
  if (!range) return;
  const { start, end } = getSampleIndexes(range);
  const channels = cloneChannels();
  channels.forEach((channel) => processor(channel, start, end));
  replaceAudio(channels, { ...selection }, { status });
}

function silenceSelection() {
  processSelection((channel, start, end) => channel.fill(0, start, end), "Selection silenced");
}

function reverseSelection() {
  processSelection((channel, start, end) => {
    let left = start;
    let right = end - 1;
    while (left < right) {
      const value = channel[left];
      channel[left] = channel[right];
      channel[right] = value;
      left += 1;
      right -= 1;
    }
  }, "Selection reversed");
}

function fadeSelection(direction) {
  processSelection((channel, start, end) => {
    const length = Math.max(1, end - start - 1);
    for (let index = start; index < end; index += 1) {
      const amount = (index - start) / length;
      channel[index] *= direction === "in" ? amount : 1 - amount;
    }
  }, direction === "in" ? "Fade in applied" : "Fade out applied");
}

function normalizeSelection() {
  const range = getSelectionRange();
  if (!range) return;
  const { start, end } = getSampleIndexes(range);
  let peak = 0;
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = start; index < end; index += 1) {
      peak = Math.max(peak, Math.abs(data[index]));
    }
  }
  if (peak <= 0.000001) {
    setStatus("Selection is silent");
    return;
  }
  const gain = Math.min(32, 0.98 / peak);
  processSelection((channel, from, to) => {
    for (let index = from; index < to; index += 1) channel[index] *= gain;
  }, `Normalized to -0.18 dB`);
}

function stopPlayback() {
  if (audioSource) {
    const source = audioSource;
    audioSource = null;
    source.onended = null;
    try {
      source.stop();
    } catch (error) {
      // The source may already be stopped.
    }
    source.disconnect();
  }
  if (playheadFrame) {
    window.cancelAnimationFrame(playheadFrame);
    playheadFrame = null;
  }
  ui.wavePlayhead.style.display = "none";
  updateInterface();
}

function updatePlayhead() {
  if (!audioSource || !audioBuffer) return;
  const context = ensureAudioContext();
  let current = playOffset + (context.currentTime - playStartedAt);
  if (playLoop && playEnd > playOffset) {
    current = playOffset + ((current - playOffset) % (playEnd - playOffset));
  }
  current = clamp(current, playOffset, playEnd);
  ui.wavePlayhead.style.display = "block";
  ui.wavePlayhead.style.left = `${(current / audioBuffer.duration) * displayWidth}px`;
  ui.cursorTime.textContent = formatTime(current);

  const left = (current / audioBuffer.duration) * displayWidth;
  if (left < ui.waveViewport.scrollLeft || left > ui.waveViewport.scrollLeft + ui.waveViewport.clientWidth) {
    ui.waveViewport.scrollLeft = Math.max(0, left - ui.waveViewport.clientWidth * 0.2);
  }
  playheadFrame = window.requestAnimationFrame(updatePlayhead);
}

function playRange(range, loop = false) {
  if (!audioBuffer || !range || range.end <= range.start) return;
  stopPlayback();
  const context = ensureAudioContext();
  const source = context.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = loop;
  source.loopStart = range.start;
  source.loopEnd = range.end;
  source.connect(context.destination);
  source.onended = () => {
    if (audioSource !== source) return;
    audioSource = null;
    if (playheadFrame) window.cancelAnimationFrame(playheadFrame);
    playheadFrame = null;
    ui.wavePlayhead.style.display = "none";
    updateInterface();
  };
  const now = context.currentTime + 0.02;
  audioSource = source;
  playStartedAt = now;
  playOffset = range.start;
  playEnd = range.end;
  playLoop = loop;
  if (loop) {
    source.start(now, range.start);
  } else {
    source.start(now, range.start, range.end - range.start);
  }
  updateInterface();
  updatePlayhead();
}

function createWavBlob(range) {
  const { start, end } = getSampleIndexes(range);
  const channelCount = Math.min(2, audioBuffer.numberOfChannels);
  const length = end - start;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = length * blockAlign;
  const output = new ArrayBuffer(44 + dataSize);
  const view = new DataView(output);
  let offset = 0;

  const writeText = (text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
    offset += text.length;
  };
  writeText("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeText("WAVE");
  writeText("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, channelCount, true);
  offset += 2;
  view.setUint32(offset, audioBuffer.sampleRate, true);
  offset += 4;
  view.setUint32(offset, audioBuffer.sampleRate * blockAlign, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeText("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  const channels = Array.from(
    { length: channelCount },
    (_, channel) => audioBuffer.getChannelData(channel),
  );
  for (let sample = start; sample < end; sample += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const value = clamp(channels[channel][sample], -1, 1);
      view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([output], { type: "audio/wav" });
}

function safeExportName(name) {
  return String(name || "sample")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "sample";
}

function downloadRange(range, name) {
  const blob = createWavBlob(range);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeExportName(name)}.wav`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  setStatus(`Exported ${anchor.download}`);
}

function addSlice() {
  const range = getSelectionRange();
  if (!range) return;
  slices.push({
    id: `${Date.now()}-${sliceCounter}`,
    name: `slice-${String(sliceCounter).padStart(2, "0")}`,
    start: range.start,
    end: range.end,
  });
  sliceCounter += 1;
  syncSlicesToCurrentHistory();
  renderSlices();
  renderWaveform();
  setStatus("Slice added");
}

function renderSlices() {
  ui.sliceList.innerHTML = "";
  if (!slices.length) {
    const empty = document.createElement("div");
    empty.className = "slice-empty";
    empty.textContent = "No slices";
    ui.sliceList.appendChild(empty);
    return;
  }

  slices.forEach((slice) => {
    const row = document.createElement("div");
    row.className = "slice-item";

    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 80;
    name.value = slice.name;
    name.setAttribute("aria-label", "Slice name");
    name.addEventListener("change", () => {
      slice.name = name.value.trim() || "slice";
      name.value = slice.name;
      syncSlicesToCurrentHistory();
    });

    const time = document.createElement("span");
    time.className = "slice-time";
    time.textContent = `${(slice.end - slice.start).toFixed(3)} s`;

    const actions = document.createElement("div");
    actions.className = "slice-actions";

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.textContent = "◎";
    selectButton.title = "Select slice";
    selectButton.setAttribute("aria-label", "Select slice");
    selectButton.addEventListener("click", () => setSelection(slice.start, slice.end));

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.textContent = "▶";
    playButton.title = "Play slice";
    playButton.setAttribute("aria-label", "Play slice");
    playButton.addEventListener("click", () =>
      playRange({ start: slice.start, end: slice.end }, false),
    );

    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.textContent = "↓";
    exportButton.title = "Export slice";
    exportButton.setAttribute("aria-label", "Export slice");
    exportButton.addEventListener("click", () =>
      downloadRange({ start: slice.start, end: slice.end }, slice.name),
    );

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "×";
    deleteButton.title = "Delete slice";
    deleteButton.setAttribute("aria-label", "Delete slice");
    deleteButton.addEventListener("click", () => {
      slices = slices.filter((item) => item.id !== slice.id);
      syncSlicesToCurrentHistory();
      renderSlices();
      renderWaveform();
    });

    actions.append(selectButton, playButton, exportButton, deleteButton);
    row.append(name, time, actions);
    ui.sliceList.appendChild(row);
  });
}

function renderAll() {
  renderWaveform();
  renderOverview();
  renderSlices();
  updateInterface();
}

async function importAudio(file) {
  if (!file) return;
  stopPlayback();
  setStatus(`Loading ${file.name}…`);
  try {
    const context = ensureAudioContext();
    const data = await file.arrayBuffer();
    const decoded = await context.decodeAudioData(data.slice(0));
    audioBuffer = decoded;
    importedFileName = file.name || "audio";
    const baseName = importedFileName.replace(/\.[^.]+$/, "");
    ui.exportNameInput.value = safeExportName(baseName);
    selection = { start: 0, end: decoded.duration, active: true };
    cursorTime = 0;
    slices = [];
    sliceCounter = 1;
    zoom = 1;
    ui.zoomSlider.value = zoom;
    ui.waveViewport.scrollLeft = 0;
    pushHistory({ reset: true });
    renderAll();
    setStatus(`Loaded ${file.name}`);
  } catch (error) {
    console.error("Audio import failed", error);
    setStatus(`Import failed: ${error.message}`);
  }
}

function openFilePicker() {
  ui.audioInput.click();
}

ui.importBtn.addEventListener("click", openFilePicker);
ui.emptyImportBtn.addEventListener("click", openFilePicker);
ui.audioInput.addEventListener("change", async () => {
  const file = ui.audioInput.files[0];
  ui.audioInput.value = "";
  await importAudio(file);
});

ui.waveCanvas.addEventListener("pointerdown", (event) => {
  if (!audioBuffer || event.button !== 0) return;
  stopPlayback();
  dragAnchor = xToTime(event.clientX);
  ui.waveCanvas.setPointerCapture(event.pointerId);
  setSelection(dragAnchor, dragAnchor, true);
});
ui.waveCanvas.addEventListener("pointermove", (event) => {
  if (!audioBuffer) return;
  const time = xToTime(event.clientX);
  cursorTime = time;
  ui.cursorTime.textContent = formatTime(time);
  if (dragAnchor === null) return;
  setSelection(dragAnchor, time);
});
ui.waveCanvas.addEventListener("pointerup", (event) => {
  if (dragAnchor === null) return;
  const end = xToTime(event.clientX);
  const pixelDuration = audioBuffer.duration / displayWidth;
  if (Math.abs(end - dragAnchor) < pixelDuration * 3) {
    cursorTime = end;
    selection = { start: end, end, active: false };
    renderAll();
  } else {
    setSelection(dragAnchor, end);
  }
  dragAnchor = null;
});
ui.waveCanvas.addEventListener("pointercancel", () => {
  dragAnchor = null;
});

ui.overviewCanvas.addEventListener("pointerdown", (event) => {
  if (!audioBuffer || displayWidth <= ui.waveViewport.clientWidth) return;
  const rect = ui.overviewCanvas.getBoundingClientRect();
  const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const target = ratio * displayWidth - ui.waveViewport.clientWidth / 2;
  ui.waveViewport.scrollLeft = clamp(target, 0, displayWidth - ui.waveViewport.clientWidth);
  renderOverview();
});
ui.waveViewport.addEventListener("scroll", renderOverview, { passive: true });

ui.selectionStartInput.addEventListener("change", () => {
  const start = parseFloat(ui.selectionStartInput.value);
  setSelection(Number.isFinite(start) ? start : selection.start, selection.end);
});
ui.selectionEndInput.addEventListener("change", () => {
  const end = parseFloat(ui.selectionEndInput.value);
  setSelection(selection.start, Number.isFinite(end) ? end : selection.end);
});
ui.selectAllBtn.addEventListener("click", () => setSelection(0, audioBuffer.duration));
ui.clearSelectionBtn.addEventListener("click", clearSelection);

ui.playBtn.addEventListener("click", () =>
  playRange(getSelectionRange(), ui.loopBtn.getAttribute("aria-pressed") === "true"),
);
ui.playAllBtn.addEventListener("click", () =>
  playRange({ start: 0, end: audioBuffer.duration }, false),
);
ui.stopBtn.addEventListener("click", stopPlayback);
ui.loopBtn.addEventListener("click", () => {
  const active = ui.loopBtn.getAttribute("aria-pressed") !== "true";
  ui.loopBtn.setAttribute("aria-pressed", active ? "true" : "false");
  if (audioSource && hasSelection()) playRange(getSelectionRange(), active);
});

ui.undoBtn.addEventListener("click", undo);
ui.redoBtn.addEventListener("click", redo);
ui.zoomSlider.addEventListener("input", () => {
  zoom = parseFloat(ui.zoomSlider.value);
  renderWaveform();
  renderOverview();
});
ui.zoomInBtn.addEventListener("click", () => {
  zoom = clamp(zoom + 0.5, 0.25, 8);
  ui.zoomSlider.value = zoom;
  renderWaveform();
  renderOverview();
});
ui.zoomOutBtn.addEventListener("click", () => {
  zoom = clamp(zoom - 0.5, 0.25, 8);
  ui.zoomSlider.value = zoom;
  renderWaveform();
  renderOverview();
});
ui.fitBtn.addEventListener("click", () => {
  if (!audioBuffer) return;
  const naturalWidth = audioBuffer.duration * BASE_PIXELS_PER_SECOND;
  zoom =
    naturalWidth > ui.waveViewport.clientWidth
      ? clamp(ui.waveViewport.clientWidth / naturalWidth, 0.25, 1)
      : 1;
  ui.zoomSlider.value = zoom;
  ui.waveViewport.scrollLeft = 0;
  renderWaveform();
  renderOverview();
});

ui.trimBtn.addEventListener("click", trimSelection);
ui.deleteBtn.addEventListener("click", deleteSelection);
ui.silenceBtn.addEventListener("click", silenceSelection);
ui.reverseBtn.addEventListener("click", reverseSelection);
ui.fadeInBtn.addEventListener("click", () => fadeSelection("in"));
ui.fadeOutBtn.addEventListener("click", () => fadeSelection("out"));
ui.normalizeBtn.addEventListener("click", normalizeSelection);
ui.addSliceBtn.addEventListener("click", addSlice);

ui.exportSelectionBtn.addEventListener("click", () => {
  const range = getSelectionRange();
  if (range) downloadRange(range, ui.exportNameInput.value);
});
ui.exportAllBtn.addEventListener("click", () => {
  const range = getSelectionRange({ fallbackToAll: true });
  if (range) downloadRange({ start: 0, end: audioBuffer.duration }, ui.exportNameInput.value);
});

["dragenter", "dragover"].forEach((eventName) => {
  window.addEventListener(eventName, (event) => {
    event.preventDefault();
    ui.waveViewport.classList.add("is-dragging");
  });
});
["dragleave", "drop"].forEach((eventName) => {
  window.addEventListener(eventName, (event) => {
    event.preventDefault();
    ui.waveViewport.classList.remove("is-dragging");
  });
});
window.addEventListener("drop", async (event) => {
  const file = [...(event.dataTransfer?.files || [])].find((item) =>
    item.type.startsWith("audio/") || /\.(wav|mp3|ogg|flac|m4a)$/i.test(item.name),
  );
  if (file) await importAudio(file);
});

window.addEventListener("keydown", (event) => {
  const isInteractive = Boolean(event.target.closest("button, input, a"));
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
    return;
  }
  if (isInteractive) return;
  if (event.code === "Space" && audioBuffer) {
    event.preventDefault();
    if (audioSource) {
      stopPlayback();
    } else {
      playRange(getSelectionRange({ fallbackToAll: true }), false);
    }
  }
  if ((event.key === "Delete" || event.key === "Backspace") && hasSelection()) {
    event.preventDefault();
    deleteSelection();
  }
});

window.addEventListener("resize", () => {
  if (resizeTimer) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    renderWaveform();
    renderOverview();
  }, 120);
});
window.addEventListener("beforeunload", stopPlayback);

renderAll();
