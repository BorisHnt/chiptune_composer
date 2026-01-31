import {
  createDefaultProject,
  createBlock,
  ensureDrumPattern,
  getProjectEndBeat,
  quantizeProject,
  HistoryManager,
  normalizeProject,
  getDrumRowsForConsole,
  createTrack,
  MAX_TRACKS,
} from "./modules/dataModel.js";
import { AudioEngine } from "./modules/audioEngine.js";
import { Timeline } from "./modules/timeline.js";
import { PianoRoll } from "./modules/pianoRoll.js";
import { DrumEditor } from "./modules/drumEditor.js";
import { exportProjectToWav } from "./modules/exportWav.js";

const ui = {
  playBtn: document.getElementById("playBtn"),
  stopBtn: document.getElementById("stopBtn"),
  projectNameInput: document.getElementById("projectNameInput"),
  bpmInput: document.getElementById("bpmInput"),
  loopBtn: document.getElementById("loopBtn"),
  exportBtn: document.getElementById("exportBtn"),
  snapSelect: document.getElementById("snapSelect"),
  zoomSlider: document.getElementById("zoomSlider"),
  quantizeBtn: document.getElementById("quantizeBtn"),
  undoBtn: document.getElementById("undoBtn"),
  redoBtn: document.getElementById("redoBtn"),
  saveBtn: document.getElementById("saveBtn"),
  loadBtn: document.getElementById("loadBtn"),
  clearCacheBtn: document.getElementById("clearCacheBtn"),
  loadInput: document.getElementById("loadInput"),
  timeline: document.getElementById("timeline"),
  timeInfo: document.getElementById("timeInfo"),
  addTrackBtn: document.getElementById("addTrackBtn"),
  trackTypeSelect: document.getElementById("trackTypeSelect"),
  editorOverlay: document.getElementById("editorOverlay"),
  editorTitle: document.getElementById("editorTitle"),
  previewBtn: document.getElementById("previewBtn"),
  closeEditorBtn: document.getElementById("closeEditorBtn"),
  pianoRoll: document.getElementById("pianoRoll"),
  drumEditor: document.getElementById("drumEditor"),
  confirmOverlay: document.getElementById("confirmOverlay"),
  confirmTitle: document.getElementById("confirmTitle"),
  confirmMessage: document.getElementById("confirmMessage"),
  confirmCancelBtn: document.getElementById("confirmCancelBtn"),
  confirmOkBtn: document.getElementById("confirmOkBtn"),
};

const STORAGE_KEY = "chiptune_composer_autosave_v1";
let cacheSaveTimer = null;

function loadProjectFromCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeProject(parsed);
  } catch (error) {
    console.warn("Failed to load cached project", error);
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveProjectToCache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch (error) {
    console.warn("Failed to save project cache", error);
  }
}

function scheduleCacheSave() {
  if (cacheSaveTimer) {
    clearTimeout(cacheSaveTimer);
  }
  cacheSaveTimer = window.setTimeout(() => {
    saveProjectToCache();
    cacheSaveTimer = null;
  }, 250);
}

const cachedProject = loadProjectFromCache();
let project = cachedProject || normalizeProject(createDefaultProject());
let snap = parseFloat(ui.snapSelect.value);
let zoom = 72;
let loopEnabled = false;
let isPlaying = false;
let cursorBeat = 0;
let activeTrackId = null;
let activeBlockId = null;
let previewEnabled = false;
let animationFrame = null;
let playbackStopTimer = null;
let previewAnimationFrame = null;
let pendingConfirm = null;

const history = new HistoryManager(project);
if (cachedProject) {
  history.reset(project);
}
const audioEngine = new AudioEngine();
const safeClone = (value) => JSON.parse(JSON.stringify(value));


const timeline = new Timeline({
  container: ui.timeline,
  project,
  snap,
  zoom,
  onBlockEdit: (trackId, blockId) => openEditor(trackId, blockId),
  onBlockDelete: (trackId, blockId) => {
    const track = project.tracks.find((item) => item.id === trackId);
    if (!track) return;
    track.blocks = track.blocks.filter((block) => block.id !== blockId);
    commitChange();
  },
  onBlockDuplicate: (trackId, blockId) => {
    const track = project.tracks.find((item) => item.id === trackId);
    if (!track) return;
    const source = track.blocks.find((block) => block.id === blockId);
    if (!source) return;
    const clone = safeClone(source);
    clone.id = Math.random().toString(36).slice(2, 10);
    clone.startBeat = source.startBeat + source.length;
    track.blocks.push(clone);
    commitChange();
  },
  onBlockChange: (trackId, blockId, changes) => {
    const track = project.tracks.find((item) => item.id === trackId);
    if (!track) return;
    const block = track.blocks.find((item) => item.id === blockId);
    if (!block) return;
    Object.assign(block, changes);
    if (typeof changes.length === "number" && track.type === "synth") {
      trimNotesToBlock(block);
    }
    commitChange();
  },
  onAddBlock: (trackId) => {
    const track = project.tracks.find((item) => item.id === trackId);
    if (!track) return;
    const newBlock = createBlock({ startBeat: cursorBeat, length: 4, type: track.type });
    if (track.type === "drums") {
      ensureDrumPattern(newBlock, 16, getDrumRowsForConsole(track.console));
    }
    track.blocks.push(newBlock);
    commitChange();
  },
  onTrackChange: (trackId, changes) => {
    const track = project.tracks.find((item) => item.id === trackId);
    if (!track) return;
    const previousConsole = track.console;
    Object.assign(track, changes);
    if (track.type === "drums" && changes.console && changes.console !== previousConsole) {
      const rows = getDrumRowsForConsole(track.console);
      track.blocks.forEach((block) => {
        const steps = Number.isFinite(block.pattern?.steps) ? block.pattern.steps : 16;
        ensureDrumPattern(block, steps, rows);
      });
    }
    commitChange({ reRenderEditors: track.id === activeTrackId });
  },
  onTrackMove: (trackId, direction) => {
    const index = project.tracks.findIndex((track) => track.id === trackId);
    if (index === -1) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= project.tracks.length) return;
    const [track] = project.tracks.splice(index, 1);
    project.tracks.splice(nextIndex, 0, track);
    commitChange();
  },
  onTrackDelete: (trackId) => {
    if (project.tracks.length <= 1) return;
    const track = project.tracks.find((item) => item.id === trackId);
    openConfirm({
      title: "Delete Track",
      message: track ? `Delete ${track.type} track?` : "Delete this track?",
      onConfirm: () => {
        project.tracks = project.tracks.filter((item) => item.id !== trackId);
        if (activeTrackId === trackId) {
          closeEditor();
        }
        commitChange();
      },
    });
  },
  onCursorChange: (beat) => {
    cursorBeat = beat;
    if (!isPlaying) {
      timeline.updatePlayhead(cursorBeat);
    }
  },
});

const pianoRoll = new PianoRoll({
  container: ui.pianoRoll,
  snap,
  zoom,
  onNoteChange: (_notes, meta = {}) => {
    const shouldCommit = meta.commit !== false;
    commitChange({
      reRenderTimeline: false,
      reRenderEditors: shouldCommit,
      record: shouldCommit,
    });
    if (previewEnabled && shouldCommit) {
      restartPreview();
    }
  },
  onPreviewNote: (pitch, trackOverride) => {
    const track = trackOverride || getActiveTrack() || pianoRoll.track;
    if (!track) return;
    const ready = audioEngine.unlock();
    if (!ready) return;
    audioEngine.previewNote(track, pitch);
  },
});

const drumEditor = new DrumEditor({
  container: ui.drumEditor,
  zoom: zoom,
  snap,
  onPatternChange: (_pattern, meta = {}) => {
    const shouldCommit = meta.commit !== false;
    commitChange({
      reRenderTimeline: false,
      reRenderEditors: shouldCommit,
      record: shouldCommit,
    });
    if (previewEnabled && shouldCommit) {
      restartPreview();
    }
  },
  onPreview: (drum, level) => {
    const track = getActiveTrack();
    if (!track) return;
    const ready = audioEngine.unlock();
    if (!ready) return;
    audioEngine.previewDrum(track, drum, level);
  },
});

ui.addTrackBtn.disabled = project.tracks.length >= MAX_TRACKS;

function trimNotesToBlock(block) {
  if (!block || !Array.isArray(block.notes)) return;
  block.notes = block.notes
    .filter((note) => note.start < block.length)
    .map((note) => {
      const maxDuration = block.length - note.start;
      if (note.duration > maxDuration) {
        note.duration = Math.max(0.01, maxDuration);
      }
      return note;
    })
    .filter((note) => note.duration > 0);
}

function commitChange(options = {}) {
  const {
    reRenderTimeline = true,
    reRenderEditors = true,
    record = true,
    shouldRestartPlayback = record,
  } = options;
  if (record) {
    history.push(project);
    scheduleCacheSave();
  }
  if (reRenderTimeline) {
    timeline.setProject(project);
  }
  ui.addTrackBtn.disabled = project.tracks.length >= MAX_TRACKS;
  if (reRenderEditors && activeBlockId) {
    refreshEditor();
  }
  if (isPlaying && shouldRestartPlayback && typeof restartPlayback === "function") {
    restartPlayback();
  }
}

function applyState(nextState) {
  project = nextState;
  ui.projectNameInput.value = project.name || "Untitled Project";
  scheduleCacheSave();
  ui.bpmInput.value = project.bpm;
  timeline.setProject(project);
  ui.addTrackBtn.disabled = project.tracks.length >= MAX_TRACKS;
  if (activeBlockId) {
    const track = getActiveTrack();
    const block = getActiveBlock();
    if (track && block) {
      refreshEditor();
    } else {
      closeEditor();
    }
  }
  if (isPlaying) {
    restartPlayback();
  }
}

function restartPlayback() {
  audioEngine.stop();
  audioEngine.playProject(project, { loop: loopEnabled });
  scheduleStopTimer();
}

function openEditor(trackId, blockId) {
  activeTrackId = trackId;
  activeBlockId = blockId;
  previewEnabled = false;
  ui.previewBtn.setAttribute("aria-pressed", "false");
  ui.editorOverlay.classList.remove("hidden");
  audioEngine.unlock();
  refreshEditor();
}

function closeEditor() {
  activeTrackId = null;
  activeBlockId = null;
  previewEnabled = false;
  audioEngine.stopPreview();
  stopPreviewAnimation();
  ui.previewBtn.setAttribute("aria-pressed", "false");
  ui.editorOverlay.classList.add("hidden");
}

function openConfirm({ title, message, onConfirm }) {
  pendingConfirm = typeof onConfirm === "function" ? onConfirm : null;
  ui.confirmTitle.textContent = title || "Confirm";
  ui.confirmMessage.textContent = message || "Are you sure?";
  ui.confirmOverlay.classList.remove("hidden");
}

function closeConfirm() {
  pendingConfirm = null;
  ui.confirmOverlay.classList.add("hidden");
}

function refreshEditor() {
  const track = getActiveTrack();
  const block = getActiveBlock();
  if (!track || !block) {
    closeEditor();
    return;
  }

  if (track.type === "synth") {
    ui.editorTitle.textContent = "Piano Roll";
    ui.pianoRoll.classList.remove("hidden");
    ui.drumEditor.classList.add("hidden");
    pianoRoll.setSnap(snap);
    pianoRoll.setZoom(zoom);
    pianoRoll.setData(track, block);
  } else {
    ui.editorTitle.textContent = "Drum Grid";
    ui.drumEditor.classList.remove("hidden");
    ui.pianoRoll.classList.add("hidden");
    drumEditor.setZoom(zoom);
    drumEditor.setData(track, block);
  }

  if (previewEnabled) {
    restartPreview();
  } else {
    stopPreviewAnimation();
  }
}

function restartPreview() {
  const track = getActiveTrack() || pianoRoll.track;
  const block = getActiveBlock() || pianoRoll.block;
  if (!track || !block) return;
  audioEngine.previewBlock(track, block, project.bpm, { loop: previewEnabled });
  pianoRoll.setPlayhead(0);
  startPreviewAnimation();
}

function startPreviewAnimation() {
  if (previewAnimationFrame) {
    window.cancelAnimationFrame(previewAnimationFrame);
  }
  const tickPreview = () => {
    if (!previewEnabled) return;
    const beat = audioEngine.getPreviewBeat(project.bpm);
    pianoRoll.setPlayhead(beat);
    previewAnimationFrame = window.requestAnimationFrame(tickPreview);
  };
  previewAnimationFrame = window.requestAnimationFrame(tickPreview);
}

function stopPreviewAnimation() {
  if (previewAnimationFrame) {
    window.cancelAnimationFrame(previewAnimationFrame);
    previewAnimationFrame = null;
  }
  pianoRoll.setPlayhead(0);
}

function getActiveTrack() {
  return project.tracks.find((track) => track.id === activeTrackId);
}

function getActiveBlock() {
  const track = getActiveTrack();
  if (!track) return null;
  return track.blocks.find((block) => block.id === activeBlockId);
}

function formatTime(beat) {
  const seconds = (60 / project.bpm) * beat;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function tick() {
  if (!isPlaying) return;
  const beat = audioEngine.getCurrentBeat(project.bpm);
  timeline.updatePlayhead(beat);
  ui.timeInfo.textContent = formatTime(beat);
  animationFrame = window.requestAnimationFrame(tick);
}

function scheduleStopTimer() {
  if (playbackStopTimer) {
    clearTimeout(playbackStopTimer);
    playbackStopTimer = null;
  }
  if (loopEnabled) return;
  const duration = getProjectEndBeat(project) * (60 / project.bpm) * 1000 + 120;
  playbackStopTimer = window.setTimeout(() => {
    isPlaying = false;
    audioEngine.stop();
    window.cancelAnimationFrame(animationFrame);
    timeline.updatePlayhead(cursorBeat);
    ui.timeInfo.textContent = formatTime(cursorBeat);
  }, duration);
}

ui.playBtn.addEventListener("click", () => {
  if (isPlaying) return;
  isPlaying = true;
  if (previewEnabled) {
    previewEnabled = false;
    ui.previewBtn.setAttribute("aria-pressed", "false");
    audioEngine.stopPreview();
    stopPreviewAnimation();
  }
  const ready = audioEngine.unlock();
  if (!ready) {
    isPlaying = false;
    return;
  }
  audioEngine.playProject(project, { loop: loopEnabled });
  scheduleStopTimer();
  animationFrame = window.requestAnimationFrame(tick);
});

ui.stopBtn.addEventListener("click", () => {
  isPlaying = false;
  audioEngine.stop();
  if (playbackStopTimer) {
    clearTimeout(playbackStopTimer);
    playbackStopTimer = null;
  }
  window.cancelAnimationFrame(animationFrame);
  timeline.updatePlayhead(cursorBeat);
  ui.timeInfo.textContent = formatTime(cursorBeat);
});

ui.loopBtn.addEventListener("click", () => {
  loopEnabled = !loopEnabled;
  ui.loopBtn.setAttribute("aria-pressed", loopEnabled ? "true" : "false");
  if (isPlaying) {
    restartPlayback();
  }
});

ui.addTrackBtn.addEventListener("click", () => {
  if (project.tracks.length >= MAX_TRACKS) {
    return;
  }
  const type = ui.trackTypeSelect?.value === "drums" ? "drums" : "synth";
  const newTrack = createTrack(project.tracks.length, { type });
  project.tracks.push(newTrack);
  commitChange();
});

ui.bpmInput.value = project.bpm;
ui.bpmInput.addEventListener("change", () => {
  project.bpm = parseInt(ui.bpmInput.value, 10) || 120;
  ui.bpmInput.value = project.bpm;
  commitChange({ reRenderTimeline: false, reRenderEditors: false });
});

ui.projectNameInput.value = project.name || "Untitled Project";
ui.projectNameInput.addEventListener("change", () => {
  const name = ui.projectNameInput.value.trim();
  project.name = name || "Untitled Project";
  ui.projectNameInput.value = project.name;
  commitChange({ reRenderTimeline: false, reRenderEditors: false });
});

ui.snapSelect.addEventListener("change", () => {
  snap = parseFloat(ui.snapSelect.value);
  timeline.setSnap(snap);
  pianoRoll.setSnap(snap);
  drumEditor.setSnap(snap);
});

ui.zoomSlider.value = zoom;
ui.zoomSlider.addEventListener("input", () => {
  zoom = parseInt(ui.zoomSlider.value, 10);
  timeline.setZoom(zoom);
  pianoRoll.setZoom(zoom);
  drumEditor.setZoom(zoom);
});

ui.quantizeBtn.addEventListener("click", () => {
  quantizeProject(project, snap);
  project.tracks.forEach((track) => {
    if (track.type !== "synth") return;
    track.blocks.forEach((block) => trimNotesToBlock(block));
  });
  commitChange();
});

ui.undoBtn.addEventListener("click", () => {
  const nextState = history.undo();
  if (nextState) applyState(nextState);
});

ui.redoBtn.addEventListener("click", () => {
  const nextState = history.redo();
  if (nextState) applyState(nextState);
});

ui.saveBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const rawName = (project.name || "chiptune-project").trim();
  const safeName = rawName
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  anchor.download = `${safeName || "chiptune-project"}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
});

ui.loadBtn.addEventListener("click", () => {
  ui.loadInput.click();
});

ui.loadInput.addEventListener("change", async () => {
  const file = ui.loadInput.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const parsed = JSON.parse(text);
    project = normalizeProject(parsed);
    history.reset(project);
    applyState(project);
  } catch (error) {
    console.error("Invalid JSON", error);
  }
  ui.loadInput.value = "";
});

ui.clearCacheBtn.addEventListener("click", () => {
  const confirmClear = window.confirm("Clear cached project data?");
  if (!confirmClear) return;
  localStorage.removeItem(STORAGE_KEY);
});

ui.exportBtn.addEventListener("click", async () => {
  await exportProjectToWav(project);
});

ui.previewBtn.addEventListener("click", () => {
  previewEnabled = !previewEnabled;
  ui.previewBtn.setAttribute("aria-pressed", previewEnabled ? "true" : "false");
  if (previewEnabled) {
    const ready = audioEngine.unlock();
    if (!ready) {
      previewEnabled = false;
      ui.previewBtn.setAttribute("aria-pressed", "false");
      return;
    }
    restartPreview();
  } else {
    audioEngine.stopPreview();
    stopPreviewAnimation();
  }
});

ui.closeEditorBtn.addEventListener("click", closeEditor);
ui.confirmCancelBtn.addEventListener("click", closeConfirm);
ui.confirmOkBtn.addEventListener("click", () => {
  if (pendingConfirm) {
    pendingConfirm();
  }
  closeConfirm();
});

ui.confirmOverlay.addEventListener("pointerdown", (event) => {
  if (event.target === ui.confirmOverlay) {
    closeConfirm();
  }
});

ui.editorOverlay.addEventListener("pointerdown", () => {
  audioEngine.unlock();
});

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      const nextState = history.redo();
      if (nextState) applyState(nextState);
    } else {
      const nextState = history.undo();
      if (nextState) applyState(nextState);
    }
  }
});

window.addEventListener("beforeunload", () => {
  saveProjectToCache();
  audioEngine.stop();
});

if (project.tracks[0].blocks.length === 0) {
  const defaultBlock = createBlock({ startBeat: 0, length: 4, type: "synth" });
  defaultBlock.notes.push({ pitch: 60, start: 0, duration: 1, velocity: 0.9 });
  project.tracks[0].blocks.push(defaultBlock);
  history.push(project);
  timeline.setProject(project);
}
