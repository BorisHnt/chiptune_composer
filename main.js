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
  DEFAULT_ADSR,
  DRUM_KITS,
  DRUM_PARAMETER_KEYS,
  CONSOLE_WAVES,
  getDrumVoicePreset,
  getDrumVoiceSettings,
  getDrumVoiceLabel,
  CHIP_DRUM_CONSOLE,
  CHIP_DRUM_ENGINES,
  CHIP_DRUM_WAVEFORMS,
  CHIP_DRUM_PARAMETER_KEYS,
  ensureChipDrumPads,
  resetChipDrumPad,
  ensureSampleWarp,
  SAMPLE_WARP_BAR_OPTIONS,
} from "./modules/dataModel.js";
import { AudioEngine } from "./modules/audioEngine.js";
import { Timeline } from "./modules/timeline.js";
import { PianoRoll } from "./modules/pianoRoll.js";
import { DrumEditor } from "./modules/drumEditor.js";
import { exportProjectToWav } from "./modules/exportWav.js";
import { importMidiFile } from "./modules/midiImport.js";
import {
  clearAssets,
  createAssetId,
  getAsset,
  putAsset,
} from "./modules/assetStore.js";
import { createChipProjectBlob, readChipProject } from "./modules/chipProject.js";

const ui = {
  playBtn: document.getElementById("playBtn"),
  stopBtn: document.getElementById("stopBtn"),
  projectNameInput: document.getElementById("projectNameInput"),
  masterVolumeInput: document.getElementById("masterVolumeInput"),
  bpmInput: document.getElementById("bpmInput"),
  loopBtn: document.getElementById("loopBtn"),
  exportBtn: document.getElementById("exportBtn"),
  globalConsoleSelect: document.getElementById("globalConsoleSelect"),
  globalWaveformSelect: document.getElementById("globalWaveformSelect"),
  snapSelect: document.getElementById("snapSelect"),
  zoomSlider: document.getElementById("zoomSlider"),
  quantizeBtn: document.getElementById("quantizeBtn"),
  undoBtn: document.getElementById("undoBtn"),
  redoBtn: document.getElementById("redoBtn"),
  saveBtn: document.getElementById("saveBtn"),
  loadBtn: document.getElementById("loadBtn"),
  saveProjectBtn: document.getElementById("saveProjectBtn"),
  openProjectBtn: document.getElementById("openProjectBtn"),
  importMidiBtn: document.getElementById("importMidiBtn"),
  clearCacheBtn: document.getElementById("clearCacheBtn"),
  projectInput: document.getElementById("projectInput"),
  loadInput: document.getElementById("loadInput"),
  midiInput: document.getElementById("midiInput"),
  sampleInput: document.getElementById("sampleInput"),
  timeline: document.getElementById("timeline"),
  timeInfo: document.getElementById("timeInfo"),
  addTrackBtn: document.getElementById("addTrackBtn"),
  trackTypeSelect: document.getElementById("trackTypeSelect"),
  editorOverlay: document.getElementById("editorOverlay"),
  editorTitle: document.getElementById("editorTitle"),
  pianoZoomControls: document.getElementById("pianoZoomControls"),
  pianoSnapSelect: document.getElementById("pianoSnapSelect"),
  pianoZoomOutBtn: document.getElementById("pianoZoomOutBtn"),
  pianoZoomInBtn: document.getElementById("pianoZoomInBtn"),
  pianoZoomValue: document.getElementById("pianoZoomValue"),
  previewBtn: document.getElementById("previewBtn"),
  closeEditorBtn: document.getElementById("closeEditorBtn"),
  pianoRoll: document.getElementById("pianoRoll"),
  drumEditor: document.getElementById("drumEditor"),
  confirmOverlay: document.getElementById("confirmOverlay"),
  confirmTitle: document.getElementById("confirmTitle"),
  confirmMessage: document.getElementById("confirmMessage"),
  confirmCancelBtn: document.getElementById("confirmCancelBtn"),
  confirmOkBtn: document.getElementById("confirmOkBtn"),
  oscilloscopeCanvas: document.getElementById("oscilloscopeCanvas"),
  deviceTrackName: document.getElementById("deviceTrackName"),
  addDeviceBtn: document.getElementById("addDeviceBtn"),
  deviceContent: document.getElementById("deviceContent"),
  consolePickerOverlay: document.getElementById("consolePickerOverlay"),
  consolePickerTitle: document.getElementById("consolePickerTitle"),
  closeConsolePickerBtn: document.getElementById("closeConsolePickerBtn"),
  consolePickerList: document.getElementById("consolePickerList"),
  chipDrumOverlay: document.getElementById("chipDrumOverlay"),
  chipDrumTrackName: document.getElementById("chipDrumTrackName"),
  chipDrumPadGrid: document.getElementById("chipDrumPadGrid"),
  chipDrumPadHeader: document.getElementById("chipDrumPadHeader"),
  chipDrumControls: document.getElementById("chipDrumControls"),
  chipDrumPreviewBtn: document.getElementById("chipDrumPreviewBtn"),
  chipDrumResetPadBtn: document.getElementById("chipDrumResetPadBtn"),
  closeChipDrumBtn: document.getElementById("closeChipDrumBtn"),
  chipDrumOscilloscopeCanvas: document.getElementById("chipDrumOscilloscopeCanvas"),
  sampleMarkerOverlay: document.getElementById("sampleMarkerOverlay"),
  sampleMarkerTitle: document.getElementById("sampleMarkerTitle"),
  sampleMarkerMeta: document.getElementById("sampleMarkerMeta"),
  sampleMarkerPreviewBtn: document.getElementById("sampleMarkerPreviewBtn"),
  sampleMarkerResetBtn: document.getElementById("sampleMarkerResetBtn"),
  closeSampleMarkerBtn: document.getElementById("closeSampleMarkerBtn"),
  sampleMarkerSnapSelect: document.getElementById("sampleMarkerSnapSelect"),
  sampleMarkerZoomOutBtn: document.getElementById("sampleMarkerZoomOutBtn"),
  sampleMarkerZoomInBtn: document.getElementById("sampleMarkerZoomInBtn"),
  sampleMarkerZoomValue: document.getElementById("sampleMarkerZoomValue"),
  sampleMarkerAddBtn: document.getElementById("sampleMarkerAddBtn"),
  sampleMarkerDeleteBtn: document.getElementById("sampleMarkerDeleteBtn"),
  sampleMarkerWarpBtn: document.getElementById("sampleMarkerWarpBtn"),
  sampleMarkerBarsSelect: document.getElementById("sampleMarkerBarsSelect"),
  sampleMarkerSelection: document.getElementById("sampleMarkerSelection"),
  sampleMarkerViewport: document.getElementById("sampleMarkerViewport"),
  sampleMarkerCanvas: document.getElementById("sampleMarkerCanvas"),
  sampleRangeCanvas: document.getElementById("sampleRangeCanvas"),
  sampleRangeStartInput: document.getElementById("sampleRangeStartInput"),
  sampleRangeEndInput: document.getElementById("sampleRangeEndInput"),
  sampleLoopStartField: document.getElementById("sampleLoopStartField"),
  sampleLoopEndField: document.getElementById("sampleLoopEndField"),
  sampleLoopStartInput: document.getElementById("sampleLoopStartInput"),
  sampleLoopEndInput: document.getElementById("sampleLoopEndInput"),
  sampleMarkerStatus: document.getElementById("sampleMarkerStatus"),
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
const PIANO_ZOOM_LEVELS = [48, 72, 96, 120, 160, 224, 320, 448, 640];
const PIANO_ZOOM_BASE = 120;
let pianoZoom = PIANO_ZOOM_BASE;
let loopEnabled = false;
let isPlaying = false;
let cursorBeat = 0;
let activeTrackId = null;
let activeBlockId = null;
let selectedTrackId = project.tracks[0]?.id || null;
const selectedDrumVoiceByTrack = new Map();
const selectedSampleBlockByTrack = new Map();
let pendingSampleTrackId = null;
let pendingSampleBlockId = null;
let activeChipDrumTrackId = null;
let activeChipDrumPadId = null;
let chipDrumOscilloscopeFrame = null;
let activeSampleMarkerTrackId = null;
let activeSampleMarkerBlockId = null;
let selectedWarpMarkerId = null;
let sampleMarkerZoom = 96;
let sampleMarkerPreview = false;
let sampleMarkerAnimationFrame = null;
let previewEnabled = false;
let animationFrame = null;
let playbackStopTimer = null;
let previewAnimationFrame = null;
let pendingConfirm = null;
let oscilloscopeFrame = null;

const history = new HistoryManager(project);
if (cachedProject) {
  history.reset(project);
}
const audioEngine = new AudioEngine();
const safeClone = (value) => JSON.parse(JSON.stringify(value));
const createRuntimeId = () => Math.random().toString(36).slice(2, 10);
let assetHydrationPromise = null;

function createWaveformPeaks(buffer, bucketCount = 160) {
  const peaks = [];
  const bucketSize = Math.max(1, Math.floor(buffer.length / bucketCount));
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const from = bucket * bucketSize;
    const to = Math.min(buffer.length, from + bucketSize);
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = from; index < to; index += 1) {
        peak = Math.max(peak, Math.abs(data[index]));
      }
    }
    peaks.push(peak);
  }
  return peaks;
}

async function ensureProjectAssetsLoaded() {
  if (assetHydrationPromise) return assetHydrationPromise;
  const assets = [...(project.assets || [])];
  assetHydrationPromise = Promise.all(
    assets.map(async (asset) => {
      if (audioEngine.hasSampleAsset(asset.id)) return;
      const record = await getAsset(asset.id);
      if (!record?.blob) return;
      await audioEngine.loadSampleAsset(asset.id, await record.blob.arrayBuffer());
    }),
  )
    .catch((error) => {
      console.warn("Some audio assets could not be loaded", error);
    })
    .finally(() => {
      assetHydrationPromise = null;
    });
  return assetHydrationPromise;
}

async function importSampleIntoTrack(file, trackId, blockId = null) {
  const track = project.tracks.find((item) => item.id === trackId && item.type === "sample");
  if (!track) return;

  const arrayBuffer = await file.arrayBuffer();
  const assetId = await createAssetId(arrayBuffer);
  const audioBuffer = await audioEngine.loadSampleAsset(assetId, arrayBuffer);
  const asset = {
    id: assetId,
    name: file.name || "Sample",
    type: file.type || "application/octet-stream",
    size: file.size,
    duration: audioBuffer.duration,
    peaks: createWaveformPeaks(audioBuffer),
  };
  await putAsset({
    id: assetId,
    name: asset.name,
    type: asset.type,
    blob: file,
  });

  const existingAssetIndex = project.assets.findIndex((item) => item.id === assetId);
  if (existingAssetIndex >= 0) {
    project.assets[existingAssetIndex] = asset;
  } else {
    project.assets.push(asset);
  }

  let block = track.blocks.find((item) => item.id === blockId);
  if (!block) {
    const length = Math.max(snap, audioBuffer.duration * (project.bpm / 60));
    block = createBlock({ startBeat: cursorBeat, length, type: "sample" });
    track.blocks.push(block);
  } else if (block.mode !== "loop") {
    block.length = Math.max(snap, audioBuffer.duration * (project.bpm / 60));
  }
  block.assetId = assetId;
  block.sourceStart = 0;
  block.sourceEnd = audioBuffer.duration;
  block.offset = 0;
  block.loopStart = 0;
  block.loopEnd = audioBuffer.duration;
  const warp = ensureSampleWarp(block);
  const rawBars = (audioBuffer.duration * project.bpm) / 240;
  warp.bars = SAMPLE_WARP_BAR_OPTIONS.reduce((closest, value) =>
    Math.abs(value - rawBars) < Math.abs(closest - rawBars) ? value : closest,
  );
  warp.sourceBpm = Math.min(
    400,
    Math.max(20, (warp.bars * 4 * 60) / audioBuffer.duration),
  );
  selectedSampleBlockByTrack.set(track.id, block.id);
  selectedTrackId = track.id;
  commitChange();
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getSafeProjectName(extension) {
  const rawName = (project.name || "chiptune-project").trim();
  const safeName = rawName
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `${safeName || "chiptune-project"}.${extension}`;
}

function findDuplicateStart(track, source) {
  const length = Math.max(0.25, source.length);
  let startBeat = source.startBeat + length;
  const otherBlocks = track.blocks
    .filter((block) => block.id !== source.id)
    .sort((a, b) => a.startBeat - b.startBeat);

  while (true) {
    const conflict = otherBlocks.find((block) => {
      const blockEnd = block.startBeat + block.length;
      const cloneEnd = startBeat + length;
      return startBeat < blockEnd - 0.0001 && cloneEnd > block.startBeat + 0.0001;
    });
    if (!conflict) return startBeat;
    startBeat = conflict.startBeat + conflict.length;
  }
}

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
    if (selectedSampleBlockByTrack.get(trackId) === blockId) {
      selectedSampleBlockByTrack.delete(trackId);
    }
    commitChange();
  },
  onBlockDuplicate: (trackId, blockId) => {
    const track = project.tracks.find((item) => item.id === trackId);
    if (!track) return;
    const source = track.blocks.find((block) => block.id === blockId);
    if (!source) return;
    const clone = safeClone(source);
    clone.id = createRuntimeId();
    clone.startBeat = findDuplicateStart(track, source);
    if (track.type === "drums") {
      ensureDrumPattern(clone, getDrumRowsForConsole(track.console));
      clone.pattern.events = clone.pattern.events.map((event) => ({
        ...event,
        id: createRuntimeId(),
      }));
    }
    track.blocks.push(clone);
    if (track.type === "sample") {
      selectedSampleBlockByTrack.set(track.id, clone.id);
    }
    commitChange();
  },
  onBlockChange: (trackId, blockId, changes, meta = {}) => {
    const track = project.tracks.find((item) => item.id === trackId);
    if (!track) return;
    const block = track.blocks.find((item) => item.id === blockId);
    if (!block) return;
    if (track.type === "sample" && meta.edge === "left") {
      const asset = project.assets?.find((item) => item.id === block.assetId);
      applySampleLeftTrim(
        block,
        changes,
        meta.deltaBeats || 0,
        asset?.duration || block.sourceEnd || 1,
      );
    }
    Object.assign(block, changes);
    if (typeof changes.length === "number" && track.type === "synth") {
      trimNotesToBlock(block);
    }
    commitChange();
  },
  onAddBlock: (trackId) => {
    const track = project.tracks.find((item) => item.id === trackId);
    if (!track) return;
    if (track.type === "sample") {
      requestSampleFile(track.id);
      return;
    }
    const newBlock = createBlock({ startBeat: cursorBeat, length: 4, type: track.type });
    if (track.type === "drums") {
      ensureDrumPattern(newBlock, getDrumRowsForConsole(track.console));
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
        ensureDrumPattern(block, rows);
      });
    }
    const isMuteSolo = Object.prototype.hasOwnProperty.call(changes, "mute") ||
      Object.prototype.hasOwnProperty.call(changes, "solo");
    const isVolume = Object.prototype.hasOwnProperty.call(changes, "volume");
    commitChange({
      reRenderEditors: track.id === activeTrackId,
      shouldRestartPlayback: !(isMuteSolo || isVolume),
    });
    if (audioEngine.isPlaying && (isMuteSolo || isVolume)) {
      audioEngine.updateTrackMix(project);
    }
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
        if (selectedTrackId === trackId) {
          selectedTrackId = project.tracks[0]?.id || null;
          timeline.setSelectedTrackId(selectedTrackId);
        }
        commitChange();
      },
    });
  },
  onTrackSelect: (trackId) => {
    selectTrack(trackId);
  },
  onBlockSelect: (trackId, blockId) => {
    const track = project.tracks.find((item) => item.id === trackId);
    if (track?.type !== "sample") return;
    selectedSampleBlockByTrack.set(trackId, blockId);
    renderDevicePanel();
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

function getSelectedTrack() {
  return project.tracks.find((track) => track.id === selectedTrackId) || project.tracks[0] || null;
}

function selectTrack(trackId) {
  if (!project.tracks.some((track) => track.id === trackId)) return;
  selectedTrackId = trackId;
  timeline.setSelectedTrackId(selectedTrackId);
  renderDevicePanel();
}

function ensureTrackAdsr(track) {
  if (!track.adsr || typeof track.adsr !== "object") {
    track.adsr = { ...DEFAULT_ADSR };
  }
  return track.adsr;
}

function getTrackLabel(track) {
  const index = project.tracks.findIndex((item) => item.id === track?.id);
  if (index === -1) return "No Track";
  return `Track ${index + 1} - ${track.type}`;
}

function createDeviceField(labelText, control) {
  const label = document.createElement("label");
  label.className = "device-field";
  const labelSpan = document.createElement("span");
  labelSpan.textContent = labelText;
  label.appendChild(labelSpan);
  label.appendChild(control);
  return label;
}

function getSelectedSampleBlock(track) {
  if (!track || track.type !== "sample") return null;
  const selectedId = selectedSampleBlockByTrack.get(track.id);
  const selected = track.blocks.find((block) => block.id === selectedId);
  const block = selected || track.blocks[0] || null;
  if (block) selectedSampleBlockByTrack.set(track.id, block.id);
  return block;
}

function requestSampleFile(trackId, blockId = null) {
  pendingSampleTrackId = trackId;
  pendingSampleBlockId = blockId;
  ui.sampleInput.click();
}

function createSampleNumberControl(block, key, { min, max, step }) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = Number.isFinite(block[key]) ? block[key] : min;
  input.addEventListener("change", () => {
    const parsed = parseFloat(input.value);
    block[key] = Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : min));
    if (["sourceStart", "sourceEnd", "loopStart", "loopEnd"].includes(key)) {
      normalizeSampleBoundaries(block, max);
    }
    commitChange({ reRenderEditors: false });
  });
  return input;
}

function getClosestWarpBars(value) {
  return SAMPLE_WARP_BAR_OPTIONS.reduce((closest, option) =>
    Math.abs(option - value) < Math.abs(closest - value) ? option : closest,
  );
}

function getSampleRegionDuration(block, fallbackDuration) {
  const start = Number.isFinite(block.sourceStart) ? block.sourceStart : 0;
  const end = Number.isFinite(block.sourceEnd) ? block.sourceEnd : fallbackDuration;
  return Math.max(0.001, end - start);
}

function getSampleActiveRegion(block, fallbackDuration) {
  const duration = Math.max(0.001, fallbackDuration || 0.001);
  const sourceStart = Math.min(
    duration - 0.001,
    Math.max(0, Number.isFinite(block.sourceStart) ? block.sourceStart : 0),
  );
  const sourceEnd = Math.min(
    duration,
    Math.max(
      sourceStart + 0.001,
      Number.isFinite(block.sourceEnd) ? block.sourceEnd : duration,
    ),
  );
  if (block.mode !== "loop") {
    return { start: sourceStart, end: sourceEnd, duration: sourceEnd - sourceStart };
  }
  const loopStart = Math.min(
    sourceEnd - 0.001,
    Math.max(
      sourceStart,
      Number.isFinite(block.loopStart) ? block.loopStart : sourceStart,
    ),
  );
  const loopEnd = Math.min(
    sourceEnd,
    Math.max(
      loopStart + 0.001,
      Number.isFinite(block.loopEnd) ? block.loopEnd : sourceEnd,
    ),
  );
  return { start: loopStart, end: loopEnd, duration: loopEnd - loopStart };
}

function normalizeSampleBoundaries(block, fallbackDuration) {
  const duration = Math.max(0.001, fallbackDuration || 0.001);
  block.sourceStart = Math.min(
    Math.max(0, duration - 0.001),
    Math.max(0, Number.isFinite(block.sourceStart) ? block.sourceStart : 0),
  );
  block.sourceEnd = Math.min(
    duration,
    Math.max(
      block.sourceStart + 0.001,
      Number.isFinite(block.sourceEnd) ? block.sourceEnd : duration,
    ),
  );
  block.loopStart = Math.min(
    block.sourceEnd - 0.001,
    Math.max(
      block.sourceStart,
      Number.isFinite(block.loopStart) ? block.loopStart : block.sourceStart,
    ),
  );
  block.loopEnd = Math.min(
    block.sourceEnd,
    Math.max(
      block.loopStart + 0.001,
      Number.isFinite(block.loopEnd) ? block.loopEnd : block.sourceEnd,
    ),
  );
  normalizeSampleOffset(block, duration);
}

function normalizeSampleOffset(block, fallbackDuration) {
  const region = getSampleActiveRegion(block, fallbackDuration);
  const rawOffset = Number.isFinite(block.offset) ? Math.max(0, block.offset) : 0;
  if (block.mode === "loop") {
    const wrapped = rawOffset % region.duration;
    block.offset =
      wrapped < 0.000001 || region.duration - wrapped < 0.000001 ? 0 : wrapped;
  } else {
    block.offset = Math.min(rawOffset, Math.max(0, region.duration - 0.001));
  }
  return block.offset;
}

function getSampleSourceRate(block) {
  const warp = ensureSampleWarp(block);
  const warpRate = warp.enabled
    ? project.bpm / Math.min(400, Math.max(20, warp.sourceBpm || project.bpm))
    : 1;
  return warp.enabled && warp.mode === "beats"
    ? warpRate
    : warpRate * 2 ** ((block.pitch || 0) / 12);
}

function applySampleLeftTrim(block, changes, deltaBeats, fallbackDuration) {
  const region = getSampleActiveRegion(block, fallbackDuration);
  const oldOffset = normalizeSampleOffset(block, fallbackDuration);
  const sourceRate = Math.max(0.001, getSampleSourceRate(block));
  const sourceDelta = deltaBeats * (60 / project.bpm) * sourceRate;

  if (block.mode === "loop") {
    const wrapped = ((oldOffset + sourceDelta) % region.duration + region.duration) %
      region.duration;
    block.offset =
      wrapped < 0.000001 || region.duration - wrapped < 0.000001 ? 0 : wrapped;
    return;
  }

  const nextOffset = Math.min(
    Math.max(0, region.duration - 0.001),
    Math.max(0, oldOffset + sourceDelta),
  );
  const actualDeltaBeats = ((nextOffset - oldOffset) / sourceRate) * (project.bpm / 60);
  changes.startBeat = block.startBeat + actualDeltaBeats;
  changes.length = Math.max(snap, block.length - actualDeltaBeats);
  block.offset = nextOffset;
}

function drawSampleWaveform(canvas, asset, block) {
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#172027";
  context.fillRect(0, 0, width, height);

  const peaks = asset?.peaks || [];
  context.strokeStyle = "#58c7c2";
  context.lineWidth = 1.5;
  context.beginPath();
  peaks.forEach((peak, index) => {
    const x = (index / Math.max(1, peaks.length - 1)) * width;
    const amplitude = peak * height * 0.44;
    context.moveTo(x, height / 2 - amplitude);
    context.lineTo(x, height / 2 + amplitude);
  });
  context.stroke();

  const duration = Math.max(0.001, asset?.duration || 0.001);
  const sourceStartTime = Math.max(0, block.sourceStart || 0);
  const sourceEndTime = Math.min(duration, block.sourceEnd ?? duration);
  const sourceStart = (sourceStartTime / duration) * width;
  const sourceEnd = (sourceEndTime / duration) * width;
  context.fillStyle = "rgba(8, 12, 15, 0.58)";
  context.fillRect(0, 0, sourceStart, height);
  context.fillRect(sourceEnd, 0, width - sourceEnd, height);

  if (block.mode === "loop") {
    const loopStart = ((block.loopStart ?? sourceStartTime) / duration) * width;
    const loopEnd = ((block.loopEnd ?? sourceEndTime) / duration) * width;
    context.fillStyle = "rgba(244, 184, 73, 0.2)";
    context.fillRect(loopStart, 0, loopEnd - loopStart, height);
    context.strokeStyle = "#f4b849";
    context.strokeRect(loopStart, 1, loopEnd - loopStart, height - 2);
  }

  const warp = ensureSampleWarp(block);
  if (warp.enabled) {
    warp.markers.forEach((marker) => {
      if (marker.sourceTime < sourceStartTime || marker.sourceTime > sourceEndTime) return;
      const x = (marker.sourceTime / duration) * width;
      context.strokeStyle = "#f4b849";
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
      context.fillStyle = "#f4b849";
      context.beginPath();
      context.moveTo(x - 5, 0);
      context.lineTo(x + 5, 0);
      context.lineTo(x, 7);
      context.closePath();
      context.fill();
    });
  }

  const drawBoundary = (time, color, fromTop) => {
    const x = (time / duration) * width;
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.fillStyle = color;
    context.beginPath();
    if (fromTop) {
      context.moveTo(x - 5, 0);
      context.lineTo(x + 5, 0);
      context.lineTo(x, 7);
    } else {
      context.moveTo(x - 5, height);
      context.lineTo(x + 5, height);
      context.lineTo(x, height - 7);
    }
    context.closePath();
    context.fill();
  };

  drawBoundary(sourceStartTime, "#dbe8e7", true);
  drawBoundary(sourceEndTime, "#dbe8e7", true);
  if (block.mode === "loop") {
    drawBoundary(block.loopStart ?? sourceStartTime, "#f4b849", false);
    drawBoundary(block.loopEnd ?? sourceEndTime, "#f4b849", false);
  }

  const region = getSampleActiveRegion(block, duration);
  const offset = normalizeSampleOffset(block, duration);
  const offsetTime = block.reverse ? region.end - offset : region.start + offset;
  const offsetX = (offsetTime / duration) * width;
  context.strokeStyle = "#ff7668";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(offsetX, 0);
  context.lineTo(offsetX, height);
  context.stroke();
  context.fillStyle = "#ff7668";
  context.beginPath();
  context.arc(offsetX, height / 2, 4, 0, Math.PI * 2);
  context.fill();
}

function attachSampleWaveformHandlers(canvas, asset, block) {
  const duration = Math.max(0.001, asset?.duration || block.sourceEnd || 1);
  let activeMarker = null;
  let pointerId = null;

  const eventTime = (event) => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const markerList = () => {
    const region = getSampleActiveRegion(block, duration);
    const offset = normalizeSampleOffset(block, duration);
    const markers = [
      { type: "sourceStart", time: block.sourceStart || 0, y: 0 },
      { type: "sourceEnd", time: block.sourceEnd ?? duration, y: 0 },
      {
        type: "offset",
        time: block.reverse ? region.end - offset : region.start + offset,
        y: canvas.height / 2,
      },
    ];
    if (block.mode === "loop") {
      markers.push(
        { type: "loopStart", time: block.loopStart ?? region.start, y: canvas.height },
        { type: "loopEnd", time: block.loopEnd ?? region.end, y: canvas.height },
      );
    }
    return markers;
  };

  const updateMarker = (time) => {
    const sourceStart = Math.max(0, block.sourceStart || 0);
    const sourceEnd = Math.min(duration, block.sourceEnd ?? duration);
    if (activeMarker === "sourceStart") {
      block.sourceStart = Math.min(sourceEnd - 0.001, Math.max(0, time));
      block.loopStart = Math.max(block.sourceStart, block.loopStart ?? block.sourceStart);
    } else if (activeMarker === "sourceEnd") {
      block.sourceEnd = Math.max(sourceStart + 0.001, Math.min(duration, time));
      block.loopEnd = Math.min(block.sourceEnd, block.loopEnd ?? block.sourceEnd);
    } else if (activeMarker === "loopStart") {
      const loopEnd = Math.min(sourceEnd, block.loopEnd ?? sourceEnd);
      block.loopStart = Math.min(loopEnd - 0.001, Math.max(sourceStart, time));
    } else if (activeMarker === "loopEnd") {
      const loopStart = Math.max(sourceStart, block.loopStart ?? sourceStart);
      block.loopEnd = Math.max(loopStart + 0.001, Math.min(sourceEnd, time));
    } else {
      const region = getSampleActiveRegion(block, duration);
      block.offset = block.reverse ? region.end - time : time - region.start;
    }
    normalizeSampleBoundaries(block, duration);
    drawSampleWaveform(canvas, asset, block);
  };

  const finishDrag = (event) => {
    if (pointerId === null || (event.pointerId !== undefined && event.pointerId !== pointerId)) return;
    activeMarker = null;
    pointerId = null;
    commitChange({ reRenderEditors: false });
  };

  canvas.title = "Drag the markers to edit start, end, loop and playback offset";
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const markers = markerList()
      .map((marker) => ({
        ...marker,
        score: Math.abs((marker.time / duration) * rect.width - x) +
          Math.abs(marker.y - y) * 0.18,
      }))
      .sort((a, b) => a.score - b.score);
    activeMarker = markers[0]?.score <= 24 ? markers[0].type : "offset";
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    updateMarker(eventTime(event));
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId || !activeMarker) return;
    updateMarker(eventTime(event));
  });
  canvas.addEventListener("pointerup", finishDrag);
  canvas.addEventListener("pointercancel", finishDrag);
}

const SAMPLE_MARKER_ZOOM_LEVELS = [48, 72, 96, 144, 216, 320];
const clampValue = (value, min, max) => Math.min(Math.max(value, min), max);
const MAX_WAVEFORM_CANVAS_DIMENSION = 32760;
const MAX_WAVEFORM_CANVAS_PIXELS = 16 * 1024 * 1024;
const waveformAnalysisCache = new WeakMap();
let sampleMarkerBaseCache = null;

function getSampleMarkerContext() {
  const track = project.tracks.find((item) => item.id === activeSampleMarkerTrackId);
  if (!track || track.type !== "sample") return null;
  const block = track.blocks.find((item) => item.id === activeSampleMarkerBlockId);
  if (!block) return null;
  const asset = project.assets?.find((item) => item.id === block.assetId);
  if (!asset) return null;
  const duration = Math.max(0.001, asset.duration || block.sourceEnd || 1);
  normalizeSampleBoundaries(block, duration);
  return {
    track,
    block,
    asset,
    duration,
    warp: ensureSampleWarp(block),
    audioBuffer: audioEngine.getSampleAssetBuffer(block.assetId),
  };
}

function getWarpEditorAnchors(block, warp, duration) {
  const region = getSampleActiveRegion(block, duration);
  const totalBeats = Math.max(0.001, warp.bars * 4);
  const markers = warp.markers
    .filter((marker) =>
      marker.sourceTime > region.start &&
      marker.sourceTime < region.end &&
      marker.beat > 0 &&
      marker.beat < totalBeats,
    )
    .sort((a, b) => a.sourceTime - b.sourceTime);
  const validMarkers = [];
  markers.forEach((marker) => {
    const previous = validMarkers[validMarkers.length - 1];
    if (!previous || marker.beat > previous.beat) validMarkers.push(marker);
  });
  return {
    region,
    totalBeats,
    markers: validMarkers,
    anchors: [
      { id: "range-start", sourceTime: region.start, beat: 0, implicit: true },
      ...validMarkers,
      { id: "range-end", sourceTime: region.end, beat: totalBeats, implicit: true },
    ],
  };
}

function interpolateWarpValue(anchors, value, inputKey, outputKey) {
  const clamped = clampValue(value, anchors[0][inputKey], anchors[anchors.length - 1][inputKey]);
  const nextIndex = anchors.findIndex((anchor) => anchor[inputKey] >= clamped);
  if (nextIndex <= 0) return anchors[0][outputKey];
  const before = anchors[nextIndex - 1];
  const after = anchors[nextIndex];
  const ratio =
    (clamped - before[inputKey]) /
    Math.max(0.000001, after[inputKey] - before[inputKey]);
  return before[outputKey] + (after[outputKey] - before[outputKey]) * ratio;
}

function sourceTimeAtWarpBeat(anchors, beat) {
  return interpolateWarpValue(anchors, beat, "beat", "sourceTime");
}

function warpBeatAtSourceTime(anchors, sourceTime) {
  return interpolateWarpValue(anchors, sourceTime, "sourceTime", "beat");
}

function formatMarkerBeat(beat) {
  const bar = Math.floor(beat / 4) + 1;
  const beatInBar = Math.floor(beat % 4) + 1;
  const sixteenth = Math.round(((beat % 1) / 0.25)) + 1;
  return `${bar}.${beatInBar}.${sixteenth}`;
}

function getSelectedWarpMarker(context = getSampleMarkerContext()) {
  return context?.warp.markers.find((marker) => marker.id === selectedWarpMarkerId) || null;
}

function syncSampleMarkerSelection() {
  const context = getSampleMarkerContext();
  const marker = getSelectedWarpMarker(context);
  ui.sampleMarkerSelection.innerHTML = "";
  ui.sampleMarkerDeleteBtn.disabled = !marker;
  if (!context || !marker) {
    const empty = document.createElement("span");
    empty.textContent = "No marker selected";
    ui.sampleMarkerSelection.appendChild(empty);
    return;
  }

  const beatLabel = document.createElement("label");
  beatLabel.textContent = "Beat";
  const beatInput = document.createElement("input");
  beatInput.type = "number";
  beatInput.min = 0;
  beatInput.max = context.warp.bars * 4;
  beatInput.step = ui.sampleMarkerSnapSelect.value;
  beatInput.value = marker.beat.toFixed(3);
  beatInput.addEventListener("change", () => {
    moveSelectedWarpMarkerToBeat(parseFloat(beatInput.value));
  });
  beatLabel.appendChild(beatInput);

  const sourceLabel = document.createElement("label");
  sourceLabel.textContent = "Source";
  const sourceInput = document.createElement("input");
  sourceInput.type = "number";
  sourceInput.min = 0;
  sourceInput.max = context.duration;
  sourceInput.step = 0.001;
  sourceInput.value = marker.sourceTime.toFixed(3);
  sourceInput.addEventListener("change", () => {
    moveSelectedWarpMarkerSource(parseFloat(sourceInput.value));
  });
  sourceLabel.appendChild(sourceInput);
  ui.sampleMarkerSelection.append(beatLabel, sourceLabel);
}

function syncSampleRangeInputs() {
  const context = getSampleMarkerContext();
  if (!context) return;
  const { block, duration } = context;
  ui.sampleRangeStartInput.max = duration;
  ui.sampleRangeEndInput.max = duration;
  ui.sampleLoopStartInput.max = duration;
  ui.sampleLoopEndInput.max = duration;
  ui.sampleRangeStartInput.value = block.sourceStart.toFixed(3);
  ui.sampleRangeEndInput.value = block.sourceEnd.toFixed(3);
  ui.sampleLoopStartInput.value = block.loopStart.toFixed(3);
  ui.sampleLoopEndInput.value = block.loopEnd.toFixed(3);
  ui.sampleLoopStartField.hidden = block.mode !== "loop";
  ui.sampleLoopEndField.hidden = block.mode !== "loop";
}

function updateSampleMarkerControls() {
  const context = getSampleMarkerContext();
  if (!context) return;
  const zoomIndex = SAMPLE_MARKER_ZOOM_LEVELS.indexOf(sampleMarkerZoom);
  ui.sampleMarkerZoomOutBtn.disabled = zoomIndex <= 0;
  ui.sampleMarkerZoomInBtn.disabled = zoomIndex >= SAMPLE_MARKER_ZOOM_LEVELS.length - 1;
  ui.sampleMarkerZoomValue.textContent = `${Math.round((sampleMarkerZoom / 96) * 100)}%`;
  ui.sampleMarkerWarpBtn.setAttribute("aria-pressed", context.warp.enabled ? "true" : "false");
  ui.sampleMarkerBarsSelect.value = String(context.warp.bars);
  ui.sampleMarkerStatus.textContent =
    `${context.warp.markers.length} marker${context.warp.markers.length === 1 ? "" : "s"} · ` +
    `${context.warp.bars * 4} beats`;
  syncSampleMarkerSelection();
  syncSampleRangeInputs();
}

function prepareWaveformCanvas(canvas, width, height, cssWidth = width, cssHeight = height) {
  const requestedRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const dimensionRatio = Math.min(
    MAX_WAVEFORM_CANVAS_DIMENSION / Math.max(1, width),
    MAX_WAVEFORM_CANVAS_DIMENSION / Math.max(1, height),
  );
  const areaRatio = Math.sqrt(
    MAX_WAVEFORM_CANVAS_PIXELS / Math.max(1, width * height),
  );
  const pixelRatio = Math.max(
    0.25,
    Math.min(requestedRatio, dimensionRatio, areaRatio),
  );
  const backingWidth = Math.max(1, Math.round(width * pixelRatio));
  const backingHeight = Math.max(1, Math.round(height * pixelRatio));
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.dataset.logicalWidth = String(width);
  canvas.dataset.logicalHeight = String(height);
  const drawing = canvas.getContext("2d");
  drawing.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  drawing.imageSmoothingEnabled = false;
  return { drawing, pixelRatio };
}

function getWaveformAnalysis(buffer) {
  if (!buffer) return null;
  const cached = waveformAnalysisCache.get(buffer);
  if (cached) return cached;

  const binCount = Math.min(
    65536,
    Math.max(2048, Math.ceil(buffer.length / 128)),
  );
  const channels = Array.from(
    { length: Math.min(2, buffer.numberOfChannels) },
    (_, channel) => {
      const data = buffer.getChannelData(channel);
      const minimums = new Float32Array(binCount);
      const maximums = new Float32Array(binCount);
      for (let bin = 0; bin < binCount; bin += 1) {
        const from = Math.floor((bin / binCount) * data.length);
        const to = Math.max(from + 1, Math.floor(((bin + 1) / binCount) * data.length));
        let minimum = 1;
        let maximum = -1;
        for (let index = from; index < to; index += 1) {
          const value = data[index];
          if (value < minimum) minimum = value;
          if (value > maximum) maximum = value;
        }
        minimums[bin] = minimum;
        maximums[bin] = maximum;
      }
      return { data, minimums, maximums };
    },
  );

  const transients = [];
  let envelope = 0;
  let lastTransient = -1;
  for (let bin = 0; bin < binCount; bin += 1) {
    let peak = 0;
    channels.forEach((channel) => {
      peak = Math.max(
        peak,
        Math.abs(channel.minimums[bin]),
        Math.abs(channel.maximums[bin]),
      );
    });
    const onset = peak - envelope;
    envelope = Math.max(peak, envelope * 0.94);
    const time = (bin / binCount) * buffer.duration;
    if (
      peak >= 0.14 &&
      onset >= 0.075 &&
      time - lastTransient >= 0.045
    ) {
      transients.push(time);
      lastTransient = time;
      if (transients.length >= 1000) break;
    }
  }

  const analysis = { buffer, binCount, channels, transients };
  waveformAnalysisCache.set(buffer, analysis);
  return analysis;
}

function readWaveformEnvelope(analysis, channelIndex, startTime, endTime) {
  if (!analysis?.channels.length) return { minimum: 0, maximum: 0 };
  const channel = analysis.channels[Math.min(channelIndex, analysis.channels.length - 1)];
  const duration = Math.max(0.001, analysis.buffer.duration);
  const fromTime = clampValue(Math.min(startTime, endTime), 0, duration);
  const toTime = clampValue(Math.max(startTime, endTime), fromTime, duration);
  const sampleFrom = Math.floor((fromTime / duration) * channel.data.length);
  const sampleTo = Math.max(
    sampleFrom + 1,
    Math.ceil((toTime / duration) * channel.data.length),
  );
  let minimum = 1;
  let maximum = -1;

  if (sampleTo - sampleFrom <= 512) {
    for (let index = sampleFrom; index < sampleTo && index < channel.data.length; index += 1) {
      const value = channel.data[index];
      if (value < minimum) minimum = value;
      if (value > maximum) maximum = value;
    }
  } else {
    const binFrom = Math.floor((fromTime / duration) * analysis.binCount);
    const binTo = Math.max(
      binFrom + 1,
      Math.ceil((toTime / duration) * analysis.binCount),
    );
    for (let bin = binFrom; bin < binTo && bin < analysis.binCount; bin += 1) {
      if (channel.minimums[bin] < minimum) minimum = channel.minimums[bin];
      if (channel.maximums[bin] > maximum) maximum = channel.maximums[bin];
    }
  }
  return {
    minimum: minimum === 1 ? 0 : minimum,
    maximum: maximum === -1 ? 0 : maximum,
  };
}

function getFallbackEnvelope(asset, sourceTime, duration) {
  const peaks = asset.peaks || [];
  const peakIndex = Math.round(
    clampValue(sourceTime / duration, 0, 1) * Math.max(0, peaks.length - 1),
  );
  const peak = peaks[peakIndex] || 0;
  return { minimum: -peak, maximum: peak };
}

function drawDetailedWaveform(
  drawing,
  {
    analysis,
    asset,
    duration,
    width,
    top,
    height,
    sourceTimeAtX,
  },
) {
  const channelCount = Math.max(1, analysis?.channels.length || 1);
  const channelColors = [
    { fill: "rgba(88, 199, 194, 0.34)", stroke: "#75ddd4", label: "L" },
    { fill: "rgba(255, 176, 163, 0.3)", stroke: "#ffb0a3", label: "R" },
  ];
  const sourceTimes = new Float64Array(width + 1);
  for (let x = 0; x <= width; x += 1) sourceTimes[x] = sourceTimeAtX(x);

  for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
    const laneTop = top + (channelIndex / channelCount) * height;
    const laneHeight = height / channelCount;
    const center = laneTop + laneHeight / 2;
    const amplitude = laneHeight * 0.43;
    const minimums = new Float32Array(width);
    const maximums = new Float32Array(width);
    for (let x = 0; x < width; x += 1) {
      const envelope = analysis
        ? readWaveformEnvelope(analysis, channelIndex, sourceTimes[x], sourceTimes[x + 1])
        : getFallbackEnvelope(asset, sourceTimes[x], duration);
      minimums[x] = envelope.minimum;
      maximums[x] = envelope.maximum;
    }

    drawing.strokeStyle = "rgba(238, 242, 244, 0.18)";
    drawing.lineWidth = 1;
    drawing.beginPath();
    drawing.moveTo(0, center + 0.5);
    drawing.lineTo(width, center + 0.5);
    drawing.stroke();

    const colors = channelColors[channelIndex] || channelColors[0];
    drawing.beginPath();
    drawing.moveTo(0, center - maximums[0] * amplitude);
    for (let x = 1; x < width; x += 1) {
      drawing.lineTo(x, center - maximums[x] * amplitude);
    }
    for (let x = width - 1; x >= 0; x -= 1) {
      drawing.lineTo(x, center - minimums[x] * amplitude);
    }
    drawing.closePath();
    drawing.fillStyle = colors.fill;
    drawing.fill();

    drawing.strokeStyle = colors.stroke;
    drawing.lineWidth = 1;
    drawing.beginPath();
    for (let x = 0; x < width; x += 1) {
      const y = center - maximums[x] * amplitude;
      if (x === 0) drawing.moveTo(x, y);
      else drawing.lineTo(x, y);
    }
    drawing.stroke();
    drawing.beginPath();
    for (let x = 0; x < width; x += 1) {
      const y = center - minimums[x] * amplitude;
      if (x === 0) drawing.moveTo(x, y);
      else drawing.lineTo(x, y);
    }
    drawing.stroke();

    if (channelCount > 1) {
      drawing.fillStyle = colors.stroke;
      drawing.font = '10px "JetBrains Mono", monospace';
      drawing.fillText(colors.label, 7, laneTop + 14);
    }
  }
}

function drawWarpMarkerCanvas() {
  const context = getSampleMarkerContext();
  if (!context) return;
  const { block, asset, warp, duration, audioBuffer } = context;
  const { anchors, markers, totalBeats } = getWarpEditorAnchors(block, warp, duration);
  const viewportWidth = Math.max(320, ui.sampleMarkerViewport.clientWidth);
  const width = Math.max(viewportWidth, Math.ceil(totalBeats * sampleMarkerZoom));
  const height = Math.max(330, ui.sampleMarkerViewport.clientHeight);
  const canvas = ui.sampleMarkerCanvas;
  const { drawing, pixelRatio } = prepareWaveformCanvas(canvas, width, height);
  const rulerHeight = 32;
  const gridStep = parseFloat(ui.sampleMarkerSnapSelect.value) || 0.25;
  const analysis = getWaveformAnalysis(audioBuffer);
  const markerKey = anchors
    .map((marker) => `${marker.sourceTime.toFixed(5)}:${marker.beat.toFixed(5)}`)
    .join("|");
  const baseKey = [
    asset.id,
    width,
    height,
    pixelRatio,
    gridStep,
    project.bpm,
    markerKey,
    analysis?.buffer.length || 0,
  ].join(":");

  if (sampleMarkerBaseCache?.key !== baseKey) {
    const baseCanvas = document.createElement("canvas");
    const { drawing: base } = prepareWaveformCanvas(baseCanvas, width, height);
    const waveformTop = rulerHeight + 36;
    const waveformHeight = height - waveformTop;

    base.fillStyle = "#172027";
    base.fillRect(0, 0, width, height);
    base.fillStyle = "#202c34";
    base.fillRect(0, 0, width, rulerHeight);

    for (let index = 0; index < anchors.length - 1; index += 1) {
      const before = anchors[index];
      const after = anchors[index + 1];
      const left = (before.beat / totalBeats) * width;
      const right = (after.beat / totalBeats) * width;
      const targetSeconds = (after.beat - before.beat) * (60 / project.bpm);
      const sourceSeconds = after.sourceTime - before.sourceTime;
      const sourceRate = sourceSeconds / Math.max(0.001, targetSeconds);
      base.fillStyle = sourceRate > 1.03
        ? "rgba(255, 176, 163, 0.055)"
        : sourceRate < 0.97
          ? "rgba(88, 199, 194, 0.06)"
          : index % 2
            ? "rgba(238, 242, 244, 0.022)"
            : "rgba(238, 242, 244, 0.01)";
      base.fillRect(left, rulerHeight, right - left, height - rulerHeight);
      if (right - left >= 86) {
        base.fillStyle = sourceRate > 1.03 ? "#ffb0a3" : sourceRate < 0.97 ? "#75ddd4" : "#aeb9bd";
        base.font = '10px "JetBrains Mono", monospace';
        base.fillText(`${sourceRate.toFixed(2)}x`, left + 7, rulerHeight + 14);
      }
    }

    for (let beat = 0; beat <= totalBeats + 0.0001; beat += gridStep) {
      const x = (beat / totalBeats) * width;
      const isBar = Math.abs(beat % 4) < 0.0001;
      const isBeat = Math.abs(beat % 1) < 0.0001;
      base.strokeStyle = isBar
        ? "rgba(238, 242, 244, 0.46)"
        : isBeat
          ? "rgba(238, 242, 244, 0.24)"
          : "rgba(238, 242, 244, 0.09)";
      base.lineWidth = isBar ? 1.5 : 1;
      base.beginPath();
      base.moveTo(x, 0);
      base.lineTo(x, height);
      base.stroke();
      if (isBeat) {
        base.fillStyle = "rgba(238, 242, 244, 0.78)";
        base.font = '11px "JetBrains Mono", monospace';
        base.fillText(formatMarkerBeat(beat), x + 5, 20);
      }
    }

    if (analysis) {
      analysis.transients.forEach((sourceTime) => {
        if (sourceTime <= anchors[0].sourceTime || sourceTime >= anchors[anchors.length - 1].sourceTime) {
          return;
        }
        const beat = warpBeatAtSourceTime(anchors, sourceTime);
        const x = (beat / totalBeats) * width;
        base.strokeStyle = "rgba(117, 221, 212, 0.17)";
        base.lineWidth = 1;
        base.beginPath();
        base.moveTo(x, rulerHeight);
        base.lineTo(x, height);
        base.stroke();
        base.fillStyle = "rgba(117, 221, 212, 0.7)";
        base.beginPath();
        base.moveTo(x - 3, rulerHeight);
        base.lineTo(x + 3, rulerHeight);
        base.lineTo(x, rulerHeight + 5);
        base.closePath();
        base.fill();
      });
    }

    drawDetailedWaveform(base, {
      analysis,
      asset,
      duration,
      width,
      top: waveformTop,
      height: waveformHeight,
      sourceTimeAtX: (x) =>
        sourceTimeAtWarpBeat(anchors, (clampValue(x, 0, width) / width) * totalBeats),
    });

    sampleMarkerBaseCache = { key: baseKey, canvas: baseCanvas };
  }

  drawing.clearRect(0, 0, width, height);
  drawing.drawImage(
    sampleMarkerBaseCache.canvas,
    0,
    0,
    sampleMarkerBaseCache.canvas.width,
    sampleMarkerBaseCache.canvas.height,
    0,
    0,
    width,
    height,
  );

  const drawMarker = (marker, implicit = false) => {
    const x = (marker.beat / totalBeats) * width;
    const selected = marker.id === selectedWarpMarkerId;
    drawing.strokeStyle = implicit ? "#dbe8e7" : selected ? "#ff7668" : "#f4b849";
    drawing.lineWidth = selected ? 2.5 : 1.5;
    drawing.beginPath();
    drawing.moveTo(x, rulerHeight);
    drawing.lineTo(x, height);
    drawing.stroke();
    drawing.fillStyle = drawing.strokeStyle;
    drawing.beginPath();
    drawing.moveTo(x - 7, rulerHeight);
    drawing.lineTo(x + 7, rulerHeight);
    drawing.lineTo(x, rulerHeight + 9);
    drawing.closePath();
    drawing.fill();
    drawing.fillStyle = implicit ? "#dbe8e7" : selected ? "#ffb0a3" : "#f4b849";
    drawing.font = '10px "JetBrains Mono", monospace';
    const label = implicit
      ? marker.id === "range-start" ? "START" : "END"
      : `${formatMarkerBeat(marker.beat)} · ${marker.sourceTime.toFixed(3)}s`;
    drawing.fillText(label, clampValue(x + 6, 4, width - 130), rulerHeight + 30);
  };
  drawMarker(anchors[0], true);
  markers.forEach((marker) => drawMarker(marker));
  drawMarker(anchors[anchors.length - 1], true);

  if (sampleMarkerPreview) {
    const previewBeat = audioEngine.getPreviewBeat(project.bpm) % totalBeats;
    const x = (previewBeat / totalBeats) * width;
    drawing.strokeStyle = "#ff6973";
    drawing.lineWidth = 2;
    drawing.beginPath();
    drawing.moveTo(x, 0);
    drawing.lineTo(x, height);
    drawing.stroke();
    drawing.fillStyle = "#ff6973";
    drawing.beginPath();
    drawing.moveTo(x - 5, rulerHeight);
    drawing.lineTo(x + 5, rulerHeight);
    drawing.lineTo(x, rulerHeight + 7);
    drawing.closePath();
    drawing.fill();
  }
}

function drawSampleRangeCanvas() {
  const context = getSampleMarkerContext();
  if (!context) return;
  const { block, asset, duration, audioBuffer } = context;
  const canvas = ui.sampleRangeCanvas;
  const width = Math.max(320, Math.floor(canvas.clientWidth || 900));
  const height = 96;
  const { drawing } = prepareWaveformCanvas(canvas, width, height, width, height);
  drawing.fillStyle = "#172027";
  drawing.fillRect(0, 0, width, height);
  const analysis = getWaveformAnalysis(audioBuffer);
  drawDetailedWaveform(drawing, {
    analysis,
    asset,
    duration,
    width,
    top: 0,
    height,
    sourceTimeAtX: (x) => (clampValue(x, 0, width) / width) * duration,
  });

  analysis?.transients.forEach((time) => {
    const x = (time / duration) * width;
    drawing.strokeStyle = "rgba(117, 221, 212, 0.22)";
    drawing.lineWidth = 1;
    drawing.beginPath();
    drawing.moveTo(x, 0);
    drawing.lineTo(x, height);
    drawing.stroke();
  });

  const startX = (block.sourceStart / duration) * width;
  const endX = (block.sourceEnd / duration) * width;
  drawing.fillStyle = "rgba(8, 12, 15, 0.66)";
  drawing.fillRect(0, 0, startX, height);
  drawing.fillRect(endX, 0, width - endX, height);
  if (block.mode === "loop") {
    const loopStartX = (block.loopStart / duration) * width;
    const loopEndX = (block.loopEnd / duration) * width;
    drawing.fillStyle = "rgba(244, 184, 73, 0.18)";
    drawing.fillRect(loopStartX, 0, loopEndX - loopStartX, height);
    drawing.strokeStyle = "#f4b849";
    drawing.strokeRect(loopStartX, 1, loopEndX - loopStartX, height - 2);
  }

  const boundary = (time, color, bottom = false) => {
    const x = (time / duration) * width;
    drawing.strokeStyle = color;
    drawing.lineWidth = 2;
    drawing.beginPath();
    drawing.moveTo(x, 0);
    drawing.lineTo(x, height);
    drawing.stroke();
    drawing.fillStyle = color;
    drawing.beginPath();
    drawing.moveTo(x - 6, bottom ? height : 0);
    drawing.lineTo(x + 6, bottom ? height : 0);
    drawing.lineTo(x, bottom ? height - 9 : 9);
    drawing.closePath();
    drawing.fill();
  };
  boundary(block.sourceStart, "#dbe8e7");
  boundary(block.sourceEnd, "#dbe8e7");
  if (block.mode === "loop") {
    boundary(block.loopStart, "#f4b849", true);
    boundary(block.loopEnd, "#f4b849", true);
  }
}

function renderSampleMarkerEditor() {
  updateSampleMarkerControls();
  drawWarpMarkerCanvas();
  drawSampleRangeCanvas();
}

function addWarpMarkerAtBeat(beat) {
  const context = getSampleMarkerContext();
  if (!context) return;
  const { anchors, totalBeats } = getWarpEditorAnchors(
    context.block,
    context.warp,
    context.duration,
  );
  const freeBeat = clampValue(beat, 0.001, totalBeats - 0.001);
  const sourceTime = sourceTimeAtWarpBeat(anchors, freeBeat);
  const duplicate = context.warp.markers.some(
    (marker) => Math.abs(marker.sourceTime - sourceTime) < 0.002,
  );
  if (duplicate || totalBeats <= 0.002) return;
  const marker = { id: createRuntimeId(), sourceTime, beat: freeBeat };
  context.warp.markers.push(marker);
  context.warp.markers.sort((a, b) => a.sourceTime - b.sourceTime);
  context.warp.enabled = true;
  context.warp.mode = "beats";
  selectedWarpMarkerId = marker.id;
  commitChange({ reRenderEditors: false });
  renderSampleMarkerEditor();
}

function moveSelectedWarpMarkerToBeat(value, commit = true) {
  const context = getSampleMarkerContext();
  const marker = getSelectedWarpMarker(context);
  if (!context || !marker || !Number.isFinite(value)) return;
  const markers = context.warp.markers.slice().sort((a, b) => a.sourceTime - b.sourceTime);
  const index = markers.findIndex((item) => item.id === marker.id);
  const totalBeats = context.warp.bars * 4;
  const snapStep = parseFloat(ui.sampleMarkerSnapSelect.value) || 0.25;
  const minimum = index > 0 ? markers[index - 1].beat + snapStep : snapStep;
  const maximum = index < markers.length - 1
    ? markers[index + 1].beat - snapStep
    : totalBeats - snapStep;
  marker.beat = clampValue(Math.round(value / snapStep) * snapStep, minimum, maximum);
  context.warp.enabled = true;
  context.warp.mode = "beats";
  if (commit) commitChange({ reRenderEditors: false });
  renderSampleMarkerEditor();
}

function moveSelectedWarpMarkerSource(value) {
  const context = getSampleMarkerContext();
  const marker = getSelectedWarpMarker(context);
  if (!context || !marker || !Number.isFinite(value)) return;
  const markers = context.warp.markers.slice().sort((a, b) => a.sourceTime - b.sourceTime);
  const index = markers.findIndex((item) => item.id === marker.id);
  const region = getSampleActiveRegion(context.block, context.duration);
  const minimum = index > 0 ? markers[index - 1].sourceTime + 0.001 : region.start + 0.001;
  const maximum = index < markers.length - 1
    ? markers[index + 1].sourceTime - 0.001
    : region.end - 0.001;
  marker.sourceTime = clampValue(value, minimum, maximum);
  context.warp.markers.sort((a, b) => a.sourceTime - b.sourceTime);
  commitChange({ reRenderEditors: false });
  renderSampleMarkerEditor();
}

function deleteSelectedWarpMarker() {
  const context = getSampleMarkerContext();
  if (!context || !selectedWarpMarkerId) return;
  context.warp.markers = context.warp.markers.filter(
    (marker) => marker.id !== selectedWarpMarkerId,
  );
  selectedWarpMarkerId = null;
  commitChange({ reRenderEditors: false });
  renderSampleMarkerEditor();
}

async function openSampleMarkerEditor(track, block) {
  if (!track || !block?.assetId) return;
  await ensureProjectAssetsLoaded();
  activeSampleMarkerTrackId = track.id;
  activeSampleMarkerBlockId = block.id;
  selectedWarpMarkerId = null;
  sampleMarkerPreview = false;
  ui.sampleMarkerPreviewBtn.setAttribute("aria-pressed", "false");
  const asset = project.assets?.find((item) => item.id === block.assetId);
  ui.sampleMarkerTitle.textContent = asset?.name || "Warp Markers";
  ui.sampleMarkerMeta.textContent = `${getTrackLabel(track)} · ${asset?.duration?.toFixed(3) || "0.000"} s`;
  ui.sampleMarkerOverlay.classList.remove("hidden");
  audioEngine.unlock();
  window.requestAnimationFrame(renderSampleMarkerEditor);
}

function stopSampleMarkerPreview() {
  sampleMarkerPreview = false;
  ui.sampleMarkerPreviewBtn.setAttribute("aria-pressed", "false");
  audioEngine.stopPreview();
  if (sampleMarkerAnimationFrame) {
    window.cancelAnimationFrame(sampleMarkerAnimationFrame);
    sampleMarkerAnimationFrame = null;
  }
}

function closeSampleMarkerEditor() {
  stopSampleMarkerPreview();
  activeSampleMarkerTrackId = null;
  activeSampleMarkerBlockId = null;
  selectedWarpMarkerId = null;
  ui.sampleMarkerOverlay.classList.add("hidden");
}

function renderSampleDevice(track) {
  ui.addDeviceBtn.disabled = false;
  ui.addDeviceBtn.title = "Import sample";
  ui.addDeviceBtn.setAttribute("aria-label", "Import sample");

  const block = getSelectedSampleBlock(track);
  const asset = project.assets?.find((item) => item.id === block?.assetId);
  const warp = block ? ensureSampleWarp(block) : null;
  const sampleBox = document.createElement("div");
  sampleBox.className = "sample-device";

  const head = document.createElement("div");
  head.className = "sample-device-head";
  const heading = document.createElement("div");
  heading.className = "sample-device-heading";
  const title = document.createElement("strong");
  title.textContent = asset?.name || "Sample Player";
  const detail = document.createElement("span");
  detail.textContent = block
    ? `${warp.enabled ? `Warp ${warp.mode === "beats" ? "Beats" : "Repitch"} · ${warp.sourceBpm.toFixed(1)} BPM` : block.mode === "loop" ? "Loop" : "One Shot"} · ${asset?.duration?.toFixed(2) || "0.00"} s`
    : "No audio clip";
  heading.append(title, detail);

  const actions = document.createElement("div");
  actions.className = "sample-device-actions";
  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.className = "btn tiny";
  importButton.textContent = block ? "Add Sample" : "Import Sample";
  importButton.addEventListener("click", () => requestSampleFile(track.id));
  actions.appendChild(importButton);

  if (block) {
    const replaceButton = document.createElement("button");
    replaceButton.type = "button";
    replaceButton.className = "btn tiny";
    replaceButton.textContent = "Replace";
    replaceButton.addEventListener("click", () => requestSampleFile(track.id, block.id));
    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "btn tiny";
    previewButton.textContent = "Preview";
    previewButton.addEventListener("click", async () => {
      await ensureProjectAssetsLoaded();
      audioEngine.previewBlock(track, block, project.bpm, { loop: false });
    });
    const editMarkersButton = document.createElement("button");
    editMarkersButton.type = "button";
    editMarkersButton.className = "btn tiny";
    editMarkersButton.textContent = "Edit Markers";
    editMarkersButton.addEventListener("click", () => openSampleMarkerEditor(track, block));
    actions.append(replaceButton, previewButton, editMarkersButton);
  }

  head.append(heading, actions);
  sampleBox.appendChild(head);

  if (!block) {
    const empty = document.createElement("div");
    empty.className = "device-empty";
    empty.textContent = "Import an audio file to create a clip.";
    sampleBox.appendChild(empty);
    ui.deviceContent.appendChild(sampleBox);
    return;
  }

  const waveform = document.createElement("canvas");
  waveform.className = "sample-waveform";
  waveform.width = 720;
  waveform.height = 116;
  sampleBox.appendChild(waveform);

  const controls = document.createElement("div");
  controls.className = "sample-device-controls";
  const mode = document.createElement("div");
  mode.className = "sample-mode";
  ["one-shot", "loop"].forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn tiny toggle";
    button.textContent = value === "loop" ? "Loop" : "One Shot";
    button.setAttribute("aria-pressed", block.mode === value ? "true" : "false");
    button.addEventListener("click", () => {
      block.mode = value;
      normalizeSampleOffset(block, asset?.duration || block.sourceEnd || 1);
      commitChange({ reRenderEditors: false });
    });
    mode.appendChild(button);
  });
  controls.appendChild(createDeviceField("Mode", mode));

  const duration = Math.max(0.001, asset?.duration || block.sourceEnd || 1);
  normalizeSampleBoundaries(block, duration);
  const warpToggle = document.createElement("button");
  warpToggle.type = "button";
  warpToggle.className = "btn tiny toggle";
  warpToggle.textContent = "Warp";
  warpToggle.setAttribute("aria-pressed", warp.enabled ? "true" : "false");
  warpToggle.addEventListener("click", () => {
    if (!warp.enabled) {
      warp.bars = getClosestWarpBars(block.length / 4);
      const regionDuration = getSampleRegionDuration(block, duration);
      warp.sourceBpm = Math.min(
        400,
        Math.max(20, (warp.bars * 4 * 60) / regionDuration),
      );
      block.length = warp.bars * 4;
    }
    warp.enabled = !warp.enabled;
    commitChange({ reRenderEditors: false });
  });
  controls.appendChild(createDeviceField("Sync", warpToggle));

  if (warp.enabled) {
    const warpMode = document.createElement("div");
    warpMode.className = "sample-mode";
    [
      { value: "repitch", label: "Repitch" },
      { value: "beats", label: "Beats" },
    ].forEach(({ value, label }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn tiny toggle";
      button.textContent = label;
      button.setAttribute("aria-pressed", warp.mode === value ? "true" : "false");
      button.addEventListener("click", () => {
        warp.mode = value;
        commitChange({ reRenderEditors: false });
      });
      warpMode.appendChild(button);
    });
    controls.appendChild(createDeviceField("Warp", warpMode));

    const sourceBpm = document.createElement("div");
    sourceBpm.className = "warp-bpm-control";
    const bpmInput = document.createElement("input");
    bpmInput.type = "number";
    bpmInput.min = 20;
    bpmInput.max = 400;
    bpmInput.step = 0.1;
    bpmInput.value = warp.sourceBpm.toFixed(1);
    bpmInput.setAttribute("aria-label", "Source BPM");
    bpmInput.addEventListener("change", () => {
      const value = parseFloat(bpmInput.value);
      warp.sourceBpm = Math.min(400, Math.max(20, Number.isFinite(value) ? value : 120));
      commitChange({ reRenderEditors: false });
    });
    const halfButton = document.createElement("button");
    halfButton.type = "button";
    halfButton.className = "btn tiny";
    halfButton.textContent = "÷2";
    halfButton.title = "Halve source BPM";
    halfButton.addEventListener("click", () => {
      warp.sourceBpm = Math.max(20, warp.sourceBpm / 2);
      commitChange({ reRenderEditors: false });
    });
    const doubleButton = document.createElement("button");
    doubleButton.type = "button";
    doubleButton.className = "btn tiny";
    doubleButton.textContent = "×2";
    doubleButton.title = "Double source BPM";
    doubleButton.addEventListener("click", () => {
      warp.sourceBpm = Math.min(400, warp.sourceBpm * 2);
      commitChange({ reRenderEditors: false });
    });
    sourceBpm.append(bpmInput, halfButton, doubleButton);
    const sourceField = createDeviceField("Source", sourceBpm);
    sourceField.classList.add("warp-source-field");
    controls.appendChild(sourceField);

    const barsSelect = document.createElement("select");
    SAMPLE_WARP_BAR_OPTIONS.forEach((bars) => {
      const option = document.createElement("option");
      option.value = bars;
      option.textContent = bars < 1 ? `${bars * 4} beat${bars * 4 === 1 ? "" : "s"}` : `${bars} bar${bars === 1 ? "" : "s"}`;
      option.selected = bars === warp.bars;
      barsSelect.appendChild(option);
    });
    barsSelect.addEventListener("change", () => {
      warp.bars = parseFloat(barsSelect.value);
      const regionDuration = getSampleRegionDuration(block, duration);
      warp.sourceBpm = Math.min(
        400,
        Math.max(20, (warp.bars * 4 * 60) / regionDuration),
      );
      block.length = warp.bars * 4;
      commitChange({ reRenderEditors: false });
    });
    controls.appendChild(createDeviceField("Length", barsSelect));
  }

  controls.appendChild(
    createDeviceField(
      "Gain",
      createSampleNumberControl(block, "gain", { min: 0, max: 2, step: 0.01 }),
    ),
  );
  controls.appendChild(
    createDeviceField(
      "Pitch",
      createSampleNumberControl(block, "pitch", { min: -24, max: 24, step: 1 }),
    ),
  );
  controls.appendChild(
    createDeviceField(
      "Offset",
      createSampleNumberControl(block, "offset", {
        min: 0,
        max: Math.max(0, getSampleActiveRegion(block, duration).duration - 0.001),
        step: 0.01,
      }),
    ),
  );
  controls.appendChild(
    createDeviceField(
      "Start",
      createSampleNumberControl(block, "sourceStart", { min: 0, max: duration, step: 0.01 }),
    ),
  );
  controls.appendChild(
    createDeviceField(
      "End",
      createSampleNumberControl(block, "sourceEnd", { min: 0.001, max: duration, step: 0.01 }),
    ),
  );
  if (block.mode === "loop") {
    controls.appendChild(
      createDeviceField(
        "Loop In",
        createSampleNumberControl(block, "loopStart", { min: 0, max: duration, step: 0.01 }),
      ),
    );
    controls.appendChild(
      createDeviceField(
        "Loop Out",
        createSampleNumberControl(block, "loopEnd", { min: 0.001, max: duration, step: 0.01 }),
      ),
    );
  }
  controls.appendChild(
    createDeviceField(
      "Fade In",
      createSampleNumberControl(block, "fadeIn", { min: 0, max: 10, step: 0.01 }),
    ),
  );
  controls.appendChild(
    createDeviceField(
      "Fade Out",
      createSampleNumberControl(block, "fadeOut", { min: 0, max: 10, step: 0.01 }),
    ),
  );

  const reverse = document.createElement("button");
  reverse.type = "button";
  reverse.className = "btn tiny toggle";
  reverse.textContent = "Reverse";
  reverse.setAttribute("aria-pressed", block.reverse ? "true" : "false");
  reverse.addEventListener("click", () => {
    block.reverse = !block.reverse;
    commitChange({ reRenderEditors: false });
  });
  controls.appendChild(createDeviceField("Direction", reverse));

  if (asset && !audioEngine.hasSampleAsset(asset.id)) {
    const status = document.createElement("div");
    status.className = "sample-missing";
    status.textContent = "Audio asset is not available in this browser.";
    controls.appendChild(status);
  }

  sampleBox.appendChild(controls);
  ui.deviceContent.appendChild(sampleBox);
  drawSampleWaveform(waveform, asset, block);
  attachSampleWaveformHandlers(waveform, asset, block);
}

function createAdsrSlider(track, key, labelText, min, max, step) {
  const adsr = ensureTrackAdsr(track);
  const wrap = document.createElement("label");
  wrap.className = "adsr-control";

  const title = document.createElement("span");
  title.textContent = labelText;

  const value = document.createElement("span");
  value.className = "adsr-value";
  value.textContent = Number(adsr[key]).toFixed(key === "sustain" ? 2 : 3);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = min;
  slider.max = max;
  slider.step = step;
  slider.value = adsr[key];
  slider.addEventListener("input", () => {
    adsr[key] = parseFloat(slider.value);
    value.textContent = Number(adsr[key]).toFixed(key === "sustain" ? 2 : 3);
    commitChange({
      reRenderTimeline: false,
      reRenderEditors: false,
      reRenderDevice: false,
    });
  });

  wrap.appendChild(title);
  wrap.appendChild(slider);
  wrap.appendChild(value);
  return wrap;
}

function setTrackConsole(track, consoleName) {
  if (track.type === "drums") {
    if (!DRUM_KITS[consoleName]) return;
    track.console = consoleName;
    if (consoleName === CHIP_DRUM_CONSOLE) {
      ensureChipDrumPads(track);
    }
    const rows = getDrumRowsForConsole(consoleName);
    track.blocks.forEach((block) => {
      ensureDrumPattern(block, rows);
    });
    return;
  }

  const waves = CONSOLE_WAVES[consoleName] || [];
  if (!waves.length) return;
  track.console = consoleName;
  track.waveform = waves[0];
  ensureTrackAdsr(track);
}

function createConsoleButton() {
  const consoleButton = document.createElement("button");
  consoleButton.type = "button";
  consoleButton.className = "btn tiny";
  consoleButton.textContent = "Console";
  consoleButton.addEventListener("click", openConsolePicker);
  return consoleButton;
}

function ensureCustomDrumVoice(track, drum) {
  track.drumVoices = track.drumVoices || {};
  track.drumVoices[track.console] = track.drumVoices[track.console] || {};
  if (!track.drumVoices[track.console][drum]) {
    track.drumVoices[track.console][drum] = getDrumVoicePreset(track.console, drum);
  }
  return track.drumVoices[track.console][drum];
}

function createDrumParameterControl(track, drum, key, labelText) {
  const settings = getDrumVoiceSettings(track, drum);
  const wrap = document.createElement("label");
  wrap.className = "drum-param-control";

  const label = document.createElement("span");
  label.textContent = labelText;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = 0;
  slider.max = 1;
  slider.step = 0.01;
  slider.value = settings[key];

  const value = document.createElement("span");
  value.className = "drum-param-value";
  value.textContent = Math.round(settings[key] * 100);

  slider.addEventListener("input", () => {
    const custom = ensureCustomDrumVoice(track, drum);
    custom[key] = parseFloat(slider.value);
    value.textContent = Math.round(custom[key] * 100);
  });
  slider.addEventListener("change", () => {
    commitChange({
      reRenderTimeline: false,
      reRenderEditors: false,
      reRenderDevice: true,
    });
    audioEngine.previewDrum(track, drum, 0.9);
  });

  wrap.appendChild(label);
  wrap.appendChild(slider);
  wrap.appendChild(value);
  return wrap;
}

function renderChipDrumDevice(track) {
  const pads = ensureChipDrumPads(track);
  let selectedPadId = selectedDrumVoiceByTrack.get(track.id);
  if (!pads.some((pad) => pad.id === selectedPadId)) {
    selectedPadId = pads[0].id;
    selectedDrumVoiceByTrack.set(track.id, selectedPadId);
  }
  const selectedPad = pads.find((pad) => pad.id === selectedPadId);

  const device = document.createElement("div");
  device.className = "synth-device chip-drum-device-compact";

  const deviceHead = document.createElement("div");
  deviceHead.className = "synth-device-head";

  const title = document.createElement("div");
  title.className = "synth-device-title";
  title.textContent = "Chip Drum";

  const type = document.createElement("div");
  type.className = "synth-device-type";
  type.textContent = "16-voice Drum Machine";

  deviceHead.appendChild(title);
  deviceHead.appendChild(type);

  const padGrid = document.createElement("div");
  padGrid.className = "chip-device-pad-grid";
  pads.forEach((pad, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip-device-pad";
    button.classList.toggle("is-selected", pad.id === selectedPadId);
    button.textContent = String(index + 1).padStart(2, "0");
    button.title = pad.name;
    button.setAttribute("aria-label", `Preview ${pad.name}`);
    button.addEventListener("click", (event) => {
      selectedDrumVoiceByTrack.set(track.id, pad.id);
      previewChipDrumPad(track, pad.id, event);
      renderDevicePanel();
    });
    padGrid.appendChild(button);
  });

  const actions = document.createElement("div");
  actions.className = "chip-device-actions";

  const selectedName = document.createElement("div");
  selectedName.className = "chip-device-selected";
  selectedName.textContent = selectedPad?.name || "Pad";

  const consoleButton = createConsoleButton();

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "btn";
  editButton.textContent = "Edit Machine";
  editButton.addEventListener("click", () => openChipDrumEditor(track));

  actions.appendChild(selectedName);
  actions.appendChild(consoleButton);
  actions.appendChild(editButton);

  device.appendChild(deviceHead);
  device.appendChild(padGrid);
  device.appendChild(actions);
  ui.deviceContent.appendChild(device);
}

function renderDrumDevice(track) {
  if (track.console === CHIP_DRUM_CONSOLE) {
    renderChipDrumDevice(track);
    return;
  }

  const rows = getDrumRowsForConsole(track.console);
  let selectedDrum = selectedDrumVoiceByTrack.get(track.id);
  if (!rows.includes(selectedDrum)) {
    selectedDrum = rows[0];
    selectedDrumVoiceByTrack.set(track.id, selectedDrum);
  }
  const hasCustomVoice = Boolean(track.drumVoices?.[track.console]?.[selectedDrum]);

  const drumBox = document.createElement("div");
  drumBox.className = "synth-device drum-device";

  const deviceHead = document.createElement("div");
  deviceHead.className = "synth-device-head";

  const title = document.createElement("div");
  title.className = "synth-device-title";
  title.textContent = track.console || "Drums";

  const type = document.createElement("div");
  type.className = "synth-device-type";
  type.textContent = "Chiptune Drums";

  deviceHead.appendChild(title);
  deviceHead.appendChild(type);

  const kitBrowser = document.createElement("div");
  kitBrowser.className = "drum-kit-browser";

  const kitActions = document.createElement("div");
  kitActions.className = "drum-kit-actions";
  kitActions.appendChild(createConsoleButton());

  const kitPanel = document.createElement("div");
  kitPanel.className = "drum-kit-panel";
  rows.forEach((drum) => {
    const pad = document.createElement("button");
    pad.type = "button";
    pad.className = "drum-device-pad";
    pad.textContent = drum;
    pad.title = `Preview ${drum}`;
    pad.classList.toggle("is-selected", drum === selectedDrum);
    pad.setAttribute("aria-pressed", drum === selectedDrum ? "true" : "false");
    pad.addEventListener("click", () => {
      selectedDrumVoiceByTrack.set(track.id, drum);
      audioEngine.previewDrum(track, drum, 0.9);
      renderDevicePanel();
    });
    kitPanel.appendChild(pad);
  });

  kitBrowser.appendChild(kitActions);
  kitBrowser.appendChild(kitPanel);

  const voiceEditor = document.createElement("div");
  voiceEditor.className = "drum-voice-editor";

  const editorHeader = document.createElement("div");
  editorHeader.className = "drum-voice-header";

  const voiceName = document.createElement("div");
  voiceName.className = "drum-voice-name";
  voiceName.textContent = selectedDrum;

  const voiceStatus = document.createElement("span");
  voiceStatus.className = "drum-voice-status";
  voiceStatus.textContent = hasCustomVoice ? "Custom" : `${track.console} preset`;

  const previewButton = document.createElement("button");
  previewButton.type = "button";
  previewButton.className = "btn tiny";
  previewButton.textContent = "Preview";
  previewButton.addEventListener("click", () => {
    audioEngine.previewDrum(track, selectedDrum, 0.9);
  });

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "btn tiny";
  resetButton.textContent = "Reset";
  resetButton.disabled = !hasCustomVoice;
  resetButton.addEventListener("click", () => {
    delete track.drumVoices?.[track.console]?.[selectedDrum];
    commitChange({
      reRenderTimeline: false,
      reRenderEditors: false,
    });
    audioEngine.previewDrum(track, selectedDrum, 0.9);
  });

  editorHeader.appendChild(voiceName);
  editorHeader.appendChild(voiceStatus);
  editorHeader.appendChild(previewButton);
  editorHeader.appendChild(resetButton);

  const parameterLabels = {
    pitch: "Pitch",
    tone: "Tone",
    decay: "Decay",
    noise: "Noise",
    drive: "Drive",
  };
  const parameterGrid = document.createElement("div");
  parameterGrid.className = "drum-param-grid";
  DRUM_PARAMETER_KEYS.forEach((key) => {
    parameterGrid.appendChild(
      createDrumParameterControl(track, selectedDrum, key, parameterLabels[key]),
    );
  });

  voiceEditor.appendChild(editorHeader);
  voiceEditor.appendChild(parameterGrid);

  drumBox.appendChild(deviceHead);
  drumBox.appendChild(kitBrowser);
  drumBox.appendChild(voiceEditor);
  ui.deviceContent.appendChild(drumBox);
}

function renderDevicePanel() {
  const track = getSelectedTrack();
  ui.deviceContent.innerHTML = "";
  ui.deviceTrackName.textContent = getTrackLabel(track);

  if (!track) {
    ui.addDeviceBtn.disabled = true;
    ui.deviceContent.innerHTML = '<div class="device-empty">No track selected</div>';
    return;
  }

  ui.addDeviceBtn.disabled = false;
  ui.addDeviceBtn.title = "Choose console";
  ui.addDeviceBtn.setAttribute("aria-label", "Choose console");

  if (track.type === "drums") {
    renderDrumDevice(track);
    return;
  }
  if (track.type === "sample") {
    renderSampleDevice(track);
    return;
  }

  const adsr = ensureTrackAdsr(track);
  const waves = CONSOLE_WAVES[track.console] || [];

  const synthBox = document.createElement("div");
  synthBox.className = "synth-device";

  const deviceHead = document.createElement("div");
  deviceHead.className = "synth-device-head";

  const title = document.createElement("div");
  title.className = "synth-device-title";
  title.textContent = track.console || "Synth";

  const type = document.createElement("div");
  type.className = "synth-device-type";
  type.textContent = "Chiptune Synth";

  deviceHead.appendChild(title);
  deviceHead.appendChild(type);

  const waveSelect = document.createElement("select");
  waves.forEach((wave) => {
    const option = document.createElement("option");
    option.value = wave;
    option.textContent = wave;
    if (wave === track.waveform) option.selected = true;
    waveSelect.appendChild(option);
  });
  waveSelect.addEventListener("change", () => {
    track.waveform = waveSelect.value;
    commitChange({ reRenderTimeline: false, reRenderEditors: false });
  });

  const deviceControls = document.createElement("div");
  deviceControls.className = "synth-device-controls";
  deviceControls.appendChild(createConsoleButton());
  deviceControls.appendChild(createDeviceField("Wave", waveSelect));

  const adsrPanel = document.createElement("div");
  adsrPanel.className = "adsr-panel";
  adsrPanel.appendChild(createAdsrSlider(track, "attack", "A", 0, 1, 0.001));
  adsrPanel.appendChild(createAdsrSlider(track, "decay", "D", 0, 1, 0.001));
  adsrPanel.appendChild(createAdsrSlider(track, "sustain", "S", 0, 1, 0.01));
  adsrPanel.appendChild(createAdsrSlider(track, "release", "R", 0, 2, 0.001));

  synthBox.appendChild(deviceHead);
  synthBox.appendChild(deviceControls);
  synthBox.appendChild(adsrPanel);
  ui.deviceContent.appendChild(synthBox);

  track.adsr = adsr;
}

function openConsolePicker() {
  const track = getSelectedTrack();
  if (!track) return;
  if (track.type === "sample") {
    requestSampleFile(track.id);
    return;
  }
  ui.consolePickerList.innerHTML = "";
  ui.consolePickerTitle.textContent =
    track.type === "drums" ? "Choose Drum Console" : "Choose Synth Console";
  const consoleOptions = track.type === "drums" ? DRUM_KITS : CONSOLE_WAVES;

  Object.entries(consoleOptions).forEach(([consoleName, sounds]) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "console-option";
    option.classList.toggle("is-selected", consoleName === track.console);

    const title = document.createElement("span");
    title.className = "console-option-title";
    title.textContent = consoleName;

    const detail = document.createElement("span");
    detail.className = "console-option-detail";
    detail.textContent =
      consoleName === CHIP_DRUM_CONSOLE
        ? "16 editable pads · kick, snare, clap, hats, FM and chip percussion"
        : sounds.join(", ");

    option.appendChild(title);
    option.appendChild(detail);
    option.addEventListener("click", () => {
      setTrackConsole(track, consoleName);
      closeConsolePicker();
      commitChange();
    });

    ui.consolePickerList.appendChild(option);
  });

  ui.consolePickerOverlay.classList.remove("hidden");
}

function closeConsolePicker() {
  ui.consolePickerOverlay.classList.add("hidden");
}

function getActiveChipDrumTrack() {
  return project.tracks.find(
    (track) =>
      track.id === activeChipDrumTrackId &&
      track.type === "drums" &&
      track.console === CHIP_DRUM_CONSOLE,
  );
}

function getActiveChipDrumPad() {
  const track = getActiveChipDrumTrack();
  if (!track) return null;
  return ensureChipDrumPads(track).find((pad) => pad.id === activeChipDrumPadId) || null;
}

function previewChipDrumPad(track, padId, event = null) {
  let level = 0.9;
  if (event?.currentTarget && Number.isFinite(event.clientY)) {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
    level = 1 - position * 0.6;
  }
  audioEngine.previewDrum(track, padId, level);
}

function createChipEditorField(labelText, control) {
  const label = document.createElement("label");
  label.className = "chip-editor-field";
  const text = document.createElement("span");
  text.textContent = labelText;
  label.appendChild(text);
  label.appendChild(control);
  return label;
}

function commitChipDrumPadChange(track, padId, { refreshEditor = false } = {}) {
  commitChange({
    reRenderTimeline: false,
    reRenderEditors: refreshEditor,
    reRenderDevice: true,
  });
  audioEngine.previewDrum(track, padId, 0.9);
}

function createChipDrumControl(track, pad, key, labelText) {
  const control = document.createElement("label");
  control.className = "chip-drum-control";

  const label = document.createElement("span");
  label.textContent = labelText;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = 0;
  slider.max = 1;
  slider.step = 0.01;
  slider.value = pad[key];

  const value = document.createElement("span");
  value.className = "chip-drum-control-value";
  value.textContent = Math.round(pad[key] * 100);

  slider.addEventListener("input", () => {
    pad[key] = parseFloat(slider.value);
    value.textContent = Math.round(pad[key] * 100);
  });
  slider.addEventListener("change", () => {
    commitChipDrumPadChange(track, pad.id);
  });

  control.appendChild(label);
  control.appendChild(slider);
  control.appendChild(value);
  return control;
}

function renderChipDrumEditor() {
  const track = getActiveChipDrumTrack();
  if (!track) {
    closeChipDrumEditor();
    return;
  }

  const pads = ensureChipDrumPads(track);
  if (!pads.some((pad) => pad.id === activeChipDrumPadId)) {
    activeChipDrumPadId = pads[0].id;
  }
  selectedDrumVoiceByTrack.set(track.id, activeChipDrumPadId);
  const pad = pads.find((item) => item.id === activeChipDrumPadId);
  const trackIndex = project.tracks.findIndex((item) => item.id === track.id);

  ui.chipDrumTrackName.textContent = `Track ${trackIndex + 1} · ${pad.name}`;
  ui.chipDrumPadGrid.innerHTML = "";
  ui.chipDrumPadHeader.innerHTML = "";
  ui.chipDrumControls.innerHTML = "";

  pads.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip-machine-pad";
    button.classList.toggle("is-selected", item.id === pad.id);
    button.setAttribute("aria-pressed", item.id === pad.id ? "true" : "false");

    const number = document.createElement("span");
    number.className = "chip-machine-pad-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const name = document.createElement("span");
    name.className = "chip-machine-pad-name";
    name.textContent = item.name;

    button.appendChild(number);
    button.appendChild(name);
    button.addEventListener("click", (event) => {
      activeChipDrumPadId = item.id;
      selectedDrumVoiceByTrack.set(track.id, item.id);
      previewChipDrumPad(track, item.id, event);
      renderChipDrumEditor();
      renderDevicePanel();
    });
    ui.chipDrumPadGrid.appendChild(button);
  });

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.maxLength = 24;
  nameInput.value = pad.name;
  nameInput.addEventListener("change", () => {
    const nextName = nameInput.value.trim();
    if (nextName) {
      pad.name = nextName.slice(0, 24);
    } else {
      nameInput.value = pad.name;
    }
    commitChipDrumPadChange(track, pad.id, { refreshEditor: true });
    renderChipDrumEditor();
  });

  const engineSelect = document.createElement("select");
  CHIP_DRUM_ENGINES.forEach((engine) => {
    const option = document.createElement("option");
    option.value = engine;
    option.textContent = engine;
    option.selected = engine === pad.engine;
    engineSelect.appendChild(option);
  });
  engineSelect.addEventListener("change", () => {
    pad.engine = engineSelect.value;
    commitChipDrumPadChange(track, pad.id);
  });

  const waveformSelect = document.createElement("select");
  CHIP_DRUM_WAVEFORMS.forEach((waveform) => {
    const option = document.createElement("option");
    option.value = waveform;
    option.textContent = waveform;
    option.selected = waveform === pad.waveform;
    waveformSelect.appendChild(option);
  });
  waveformSelect.addEventListener("change", () => {
    pad.waveform = waveformSelect.value;
    commitChipDrumPadChange(track, pad.id);
  });

  const bitsSelect = document.createElement("select");
  for (let bits = 2; bits <= 12; bits += 1) {
    const option = document.createElement("option");
    option.value = bits;
    option.textContent = `${bits} bit`;
    option.selected = bits === pad.bits;
    bitsSelect.appendChild(option);
  }
  bitsSelect.addEventListener("change", () => {
    pad.bits = parseInt(bitsSelect.value, 10);
    commitChipDrumPadChange(track, pad.id);
  });

  ui.chipDrumPadHeader.appendChild(createChipEditorField("Pad name", nameInput));
  ui.chipDrumPadHeader.appendChild(createChipEditorField("Engine", engineSelect));
  ui.chipDrumPadHeader.appendChild(createChipEditorField("Wave", waveformSelect));
  ui.chipDrumPadHeader.appendChild(createChipEditorField("Resolution", bitsSelect));

  const labels = {
    pitch: "Pitch",
    sweep: "Pitch Sweep",
    tone: "Tone / Filter",
    decay: "Decay",
    noise: "Noise Mix",
    drive: "Drive",
  };
  CHIP_DRUM_PARAMETER_KEYS.forEach((key) => {
    ui.chipDrumControls.appendChild(createChipDrumControl(track, pad, key, labels[key]));
  });
}

function startChipDrumOscilloscope() {
  const canvas = ui.chipDrumOscilloscopeCanvas;
  if (!canvas || chipDrumOscilloscopeFrame) return;
  const ctx = canvas.getContext("2d");
  const buffer = new Uint8Array(512);

  const render = () => {
    chipDrumOscilloscopeFrame = window.requestAnimationFrame(render);
    const analyser = audioEngine.getDrumPreviewAnalyser();
    if (analyser) {
      analyser.getByteTimeDomainData(buffer);
    } else {
      buffer.fill(128);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(238, 242, 244, 0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += canvas.width / 8) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += canvas.height / 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#37d9d3";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const slice = canvas.width / buffer.length;
    for (let index = 0; index < buffer.length; index += 1) {
      const normalized = buffer[index] / 128 - 1;
      const x = index * slice;
      const y = (canvas.height / 2) * (1 - normalized);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  };

  render();
}

function stopChipDrumOscilloscope() {
  if (!chipDrumOscilloscopeFrame) return;
  window.cancelAnimationFrame(chipDrumOscilloscopeFrame);
  chipDrumOscilloscopeFrame = null;
}

function openChipDrumEditor(track = getSelectedTrack()) {
  if (!track || track.type !== "drums" || track.console !== CHIP_DRUM_CONSOLE) return;
  const pads = ensureChipDrumPads(track);
  activeChipDrumTrackId = track.id;
  activeChipDrumPadId = selectedDrumVoiceByTrack.get(track.id) || pads[0].id;
  ui.chipDrumOverlay.classList.remove("hidden");
  renderChipDrumEditor();
  startChipDrumOscilloscope();
}

function closeChipDrumEditor() {
  ui.chipDrumOverlay.classList.add("hidden");
  stopChipDrumOscilloscope();
  activeChipDrumTrackId = null;
  activeChipDrumPadId = null;
}

function resetActiveChipDrumPad() {
  const track = getActiveChipDrumTrack();
  const pad = getActiveChipDrumPad();
  if (!track || !pad) return;
  const resetPad = resetChipDrumPad(track, pad.id);
  commitChipDrumPadChange(track, resetPad.id, { refreshEditor: true });
  renderChipDrumEditor();
}

function commitChange(options = {}) {
  const {
    reRenderTimeline = true,
    reRenderEditors = true,
    reRenderDevice = true,
    record = true,
    shouldRestartPlayback = record,
  } = options;
  if (record) {
    history.push(project);
    scheduleCacheSave();
  }
  if (reRenderTimeline) {
    timeline.setProject(project);
    timeline.setSelectedTrackId(selectedTrackId);
  }
  ui.addTrackBtn.disabled = project.tracks.length >= MAX_TRACKS;
  if (reRenderEditors && activeBlockId) {
    refreshEditor();
  }
  if (reRenderDevice) {
    renderDevicePanel();
  }
  if (isPlaying && shouldRestartPlayback && typeof restartPlayback === "function") {
    restartPlayback();
  }
}

function applyState(nextState) {
  project = nextState;
  if (!project.tracks.some((track) => track.id === selectedTrackId)) {
    selectedTrackId = project.tracks[0]?.id || null;
  }
  ui.projectNameInput.value = project.name || "Untitled Project";
  ui.masterVolumeInput.value = Number.isFinite(project.masterVolume) ? project.masterVolume : 0.9;
  audioEngine.setMasterVolume(project.masterVolume ?? 0.9);
  scheduleCacheSave();
  ui.bpmInput.value = project.bpm;
  timeline.setProject(project);
  timeline.setSelectedTrackId(selectedTrackId);
  renderDevicePanel();
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
  if (activeChipDrumTrackId) {
    if (getActiveChipDrumTrack()) {
      renderChipDrumEditor();
    } else {
      closeChipDrumEditor();
    }
  }
  if (activeSampleMarkerBlockId) {
    if (getSampleMarkerContext()) {
      renderSampleMarkerEditor();
    } else {
      closeSampleMarkerEditor();
    }
  }
  if (isPlaying) {
    restartPlayback();
  }
  void ensureProjectAssetsLoaded().then(() => renderDevicePanel());
}

async function restartPlayback() {
  audioEngine.stop();
  await ensureProjectAssetsLoaded();
  audioEngine.playProject(project, { loop: loopEnabled });
  scheduleStopTimer();
}

function openEditor(trackId, blockId) {
  selectTrack(trackId);
  const track = project.tracks.find((item) => item.id === trackId);
  if (track?.type === "sample") {
    selectedSampleBlockByTrack.set(trackId, blockId);
    renderDevicePanel();
    return;
  }
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
    ui.pianoZoomControls.classList.remove("hidden");
    ui.pianoRoll.classList.remove("hidden");
    ui.drumEditor.classList.add("hidden");
    pianoRoll.setSnap(snap);
    pianoRoll.setZoom(pianoZoom);
    pianoRoll.setData(track, block);
  } else if (track.type === "drums") {
    ui.editorTitle.textContent = "Drum Grid";
    ui.pianoZoomControls.classList.add("hidden");
    ui.drumEditor.classList.remove("hidden");
    ui.pianoRoll.classList.add("hidden");
    drumEditor.setZoom(zoom);
    drumEditor.setData(track, block);
  } else {
    closeEditor();
    selectedSampleBlockByTrack.set(track.id, block.id);
    renderDevicePanel();
    return;
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

function startOscilloscope() {
  const canvas = ui.oscilloscopeCanvas;
  const analyser = audioEngine.getAnalyser();
  if (!canvas || !analyser) return;
  const ctx = canvas.getContext("2d");
  const buffer = new Uint8Array(analyser.fftSize);

  const render = () => {
    oscilloscopeFrame = window.requestAnimationFrame(render);
    analyser.getByteTimeDomainData(buffer);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#15788c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const slice = canvas.width / buffer.length;
    let x = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const v = buffer[i] / 128 - 1;
      const y = (canvas.height / 2) * (1 - v);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += slice;
    }
    ctx.stroke();
  };

  if (!oscilloscopeFrame) {
    render();
  }
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

ui.playBtn.addEventListener("click", async () => {
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
  await ensureProjectAssetsLoaded();
  audioEngine.playProject(project, { loop: loopEnabled });
  scheduleStopTimer();
  animationFrame = window.requestAnimationFrame(tick);
  startOscilloscope();
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
  const requestedType = ui.trackTypeSelect?.value;
  const type = ["synth", "drums", "sample"].includes(requestedType)
    ? requestedType
    : "synth";
  const newTrack = createTrack(project.tracks.length, { type });
  project.tracks.push(newTrack);
  selectedTrackId = newTrack.id;
  commitChange();
});

ui.bpmInput.value = project.bpm;
ui.bpmInput.addEventListener("change", () => {
  project.bpm = parseInt(ui.bpmInput.value, 10) || 120;
  ui.bpmInput.value = project.bpm;
  commitChange({ reRenderTimeline: false, reRenderEditors: false });
});

ui.masterVolumeInput.value = Number.isFinite(project.masterVolume) ? project.masterVolume : 0.9;
ui.masterVolumeInput.addEventListener("input", () => {
  project.masterVolume = parseFloat(ui.masterVolumeInput.value);
  audioEngine.setMasterVolume(project.masterVolume);
  commitChange({ reRenderTimeline: false, reRenderEditors: false, shouldRestartPlayback: false });
});

ui.projectNameInput.value = project.name || "Untitled Project";
ui.projectNameInput.addEventListener("change", () => {
  const name = ui.projectNameInput.value.trim();
  project.name = name || "Untitled Project";
  ui.projectNameInput.value = project.name;
  commitChange({ reRenderTimeline: false, reRenderEditors: false });
});

function setGridSnap(value) {
  snap = Number.isFinite(value) ? value : 0.25;
  ui.snapSelect.value = `${snap}`;
  ui.pianoSnapSelect.value = `${snap}`;
  timeline.setSnap(snap);
  pianoRoll.setSnap(snap);
  drumEditor.setSnap(snap);
}

function updatePianoZoomControls() {
  const index = PIANO_ZOOM_LEVELS.indexOf(pianoZoom);
  ui.pianoZoomOutBtn.disabled = index <= 0;
  ui.pianoZoomInBtn.disabled = index >= PIANO_ZOOM_LEVELS.length - 1;
  ui.pianoZoomValue.value = `${Math.round((pianoZoom / PIANO_ZOOM_BASE) * 100)}%`;
}

function stepPianoZoom(direction) {
  const currentIndex = PIANO_ZOOM_LEVELS.indexOf(pianoZoom);
  const nextIndex = Math.min(
    PIANO_ZOOM_LEVELS.length - 1,
    Math.max(0, currentIndex + direction),
  );
  if (nextIndex === currentIndex) return;
  pianoZoom = PIANO_ZOOM_LEVELS[nextIndex];
  pianoRoll.setZoom(pianoZoom);
  updatePianoZoomControls();
}

ui.snapSelect.addEventListener("change", () => {
  setGridSnap(parseFloat(ui.snapSelect.value));
});

ui.pianoSnapSelect.value = `${snap}`;
ui.pianoSnapSelect.addEventListener("change", () => {
  setGridSnap(parseFloat(ui.pianoSnapSelect.value));
});
ui.pianoZoomOutBtn.addEventListener("click", () => stepPianoZoom(-1));
ui.pianoZoomInBtn.addEventListener("click", () => stepPianoZoom(1));
updatePianoZoomControls();

ui.globalConsoleSelect.addEventListener("change", () => {
  const consoleName = ui.globalConsoleSelect.value;
  if (!consoleName) return;
  const waves = CONSOLE_WAVES[consoleName] || [];
  project.tracks.forEach((track) => {
    if (track.type !== "synth") return;
    track.console = consoleName;
    track.waveform = waves[0] || track.waveform;
  });
  commitChange();
  ui.globalWaveformSelect.innerHTML = '<option value="">—</option>';
  waves.forEach((wave) => {
    const option = document.createElement("option");
    option.value = wave;
    option.textContent = wave;
    ui.globalWaveformSelect.appendChild(option);
  });
  ui.globalConsoleSelect.value = "";
});

ui.globalWaveformSelect.addEventListener("change", () => {
  const wave = ui.globalWaveformSelect.value;
  if (!wave) return;
  project.tracks.forEach((track) => {
    if (track.type !== "synth") return;
    const waves = CONSOLE_WAVES[track.console] || [];
    if (!waves.includes(wave)) return;
    track.waveform = wave;
  });
  commitChange();
  ui.globalWaveformSelect.value = "";
});

ui.zoomSlider.value = zoom;
ui.zoomSlider.addEventListener("input", () => {
  zoom = parseInt(ui.zoomSlider.value, 10);
  timeline.setZoom(zoom);
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
  downloadBlob(blob, getSafeProjectName("json"));
});

ui.loadBtn.addEventListener("click", () => {
  ui.loadInput.click();
});

ui.saveProjectBtn.addEventListener("click", async () => {
  try {
    const blob = await createChipProjectBlob(project, getAsset);
    downloadBlob(blob, getSafeProjectName("chipproject"));
  } catch (error) {
    console.error("Failed to save project bundle", error);
    window.alert(`Project export failed: ${error.message}`);
  }
});

ui.openProjectBtn.addEventListener("click", () => {
  ui.projectInput.click();
});

ui.importMidiBtn.addEventListener("click", () => {
  ui.midiInput.click();
});

ui.sampleInput.addEventListener("change", async () => {
  const file = ui.sampleInput.files[0];
  const trackId = pendingSampleTrackId;
  const blockId = pendingSampleBlockId;
  ui.sampleInput.value = "";
  pendingSampleTrackId = null;
  pendingSampleBlockId = null;
  if (!file || !trackId) return;
  try {
    await importSampleIntoTrack(file, trackId, blockId);
  } catch (error) {
    console.error("Failed to import sample", error);
    window.alert(`Sample import failed: ${error.message}`);
  }
});

ui.projectInput.addEventListener("change", async () => {
  const file = ui.projectInput.files[0];
  ui.projectInput.value = "";
  if (!file) return;
  try {
    const imported = await readChipProject(file);
    for (const asset of imported.assets) {
      await putAsset(asset);
    }
    project = normalizeProject(imported.project);
    history.reset(project);
    await ensureProjectAssetsLoaded();
    applyState(project);
  } catch (error) {
    console.error("Failed to open project bundle", error);
    window.alert(`Project import failed: ${error.message}`);
  }
});

ui.loadInput.addEventListener("change", async () => {
  const file = ui.loadInput.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const parsed = JSON.parse(text);
    project = normalizeProject(parsed);
    history.reset(project);
    await ensureProjectAssetsLoaded();
    applyState(project);
  } catch (error) {
    console.error("Invalid JSON", error);
  }
  ui.loadInput.value = "";
});

ui.midiInput.addEventListener("change", async () => {
  const file = ui.midiInput.files[0];
  if (!file) return;
  try {
    const importedProject = await importMidiFile(file);
    project = normalizeProject(importedProject);
    history.reset(project);
    applyState(project);
  } catch (error) {
    console.error("Failed to import MIDI", error);
  }
  ui.midiInput.value = "";
});

ui.clearCacheBtn.addEventListener("click", async () => {
  const confirmClear = window.confirm("Clear cached project data and stored audio assets?");
  if (!confirmClear) return;
  localStorage.removeItem(STORAGE_KEY);
  await clearAssets();
});

ui.exportBtn.addEventListener("click", async () => {
  await ensureProjectAssetsLoaded();
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
    startOscilloscope();
  } else {
    audioEngine.stopPreview();
    stopPreviewAnimation();
  }
});

ui.sampleMarkerCanvas.addEventListener("dblclick", (event) => {
  const context = getSampleMarkerContext();
  if (!context) return;
  const rect = ui.sampleMarkerCanvas.getBoundingClientRect();
  const logicalWidth =
    Number(ui.sampleMarkerCanvas.dataset.logicalWidth) || ui.sampleMarkerCanvas.width;
  const x = (event.clientX - rect.left) * (logicalWidth / rect.width);
  addWarpMarkerAtBeat((x / logicalWidth) * context.warp.bars * 4);
});

{
  let draggedMarkerId = null;
  let pointerId = null;
  const eventBeat = (event) => {
    const context = getSampleMarkerContext();
    if (!context) return 0;
    const rect = ui.sampleMarkerCanvas.getBoundingClientRect();
    const logicalWidth =
      Number(ui.sampleMarkerCanvas.dataset.logicalWidth) || ui.sampleMarkerCanvas.width;
    const x = (event.clientX - rect.left) * (logicalWidth / rect.width);
    return clampValue(x / logicalWidth, 0, 1) * context.warp.bars * 4;
  };
  ui.sampleMarkerCanvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const context = getSampleMarkerContext();
    if (!context) return;
    const rect = ui.sampleMarkerCanvas.getBoundingClientRect();
    const logicalWidth =
      Number(ui.sampleMarkerCanvas.dataset.logicalWidth) || ui.sampleMarkerCanvas.width;
    const x = (event.clientX - rect.left) * (logicalWidth / rect.width);
    const totalBeats = context.warp.bars * 4;
    const nearest = context.warp.markers
      .map((marker) => ({
        marker,
        distance: Math.abs((marker.beat / totalBeats) * logicalWidth - x),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearest || nearest.distance > 12) {
      selectedWarpMarkerId = null;
      renderSampleMarkerEditor();
      return;
    }
    event.preventDefault();
    draggedMarkerId = nearest.marker.id;
    selectedWarpMarkerId = nearest.marker.id;
    pointerId = event.pointerId;
    ui.sampleMarkerCanvas.setPointerCapture(pointerId);
    renderSampleMarkerEditor();
  });
  ui.sampleMarkerCanvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId || !draggedMarkerId) return;
    selectedWarpMarkerId = draggedMarkerId;
    moveSelectedWarpMarkerToBeat(eventBeat(event), false);
  });
  const finishMarkerDrag = (event) => {
    if (event.pointerId !== pointerId || !draggedMarkerId) return;
    draggedMarkerId = null;
    pointerId = null;
    commitChange({ reRenderEditors: false });
    renderSampleMarkerEditor();
  };
  ui.sampleMarkerCanvas.addEventListener("pointerup", finishMarkerDrag);
  ui.sampleMarkerCanvas.addEventListener("pointercancel", finishMarkerDrag);
}

{
  let rangeMarker = null;
  let pointerId = null;
  const eventSourceTime = (event) => {
    const context = getSampleMarkerContext();
    if (!context) return 0;
    const rect = ui.sampleRangeCanvas.getBoundingClientRect();
    return clampValue((event.clientX - rect.left) / rect.width, 0, 1) * context.duration;
  };
  const updateRangeMarker = (time) => {
    const context = getSampleMarkerContext();
    if (!context || !rangeMarker) return;
    const { block, duration } = context;
    if (rangeMarker === "sourceStart") {
      block.sourceStart = Math.min(block.sourceEnd - 0.001, Math.max(0, time));
    } else if (rangeMarker === "sourceEnd") {
      block.sourceEnd = Math.max(block.sourceStart + 0.001, Math.min(duration, time));
    } else if (rangeMarker === "loopStart") {
      block.loopStart = Math.min(block.loopEnd - 0.001, Math.max(block.sourceStart, time));
    } else if (rangeMarker === "loopEnd") {
      block.loopEnd = Math.max(block.loopStart + 0.001, Math.min(block.sourceEnd, time));
    }
    normalizeSampleBoundaries(block, duration);
    renderSampleMarkerEditor();
  };
  ui.sampleRangeCanvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const context = getSampleMarkerContext();
    if (!context) return;
    event.preventDefault();
    const rect = ui.sampleRangeCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const bottomLane = event.clientY - rect.top > rect.height / 2;
    const candidates = bottomLane && context.block.mode === "loop"
      ? [
          { type: "loopStart", time: context.block.loopStart },
          { type: "loopEnd", time: context.block.loopEnd },
        ]
      : [
          { type: "sourceStart", time: context.block.sourceStart },
          { type: "sourceEnd", time: context.block.sourceEnd },
        ];
    const nearest = candidates
      .map((marker) => ({
        ...marker,
        distance: Math.abs((marker.time / context.duration) * rect.width - x),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearest || nearest.distance > 24) return;
    rangeMarker = nearest.type;
    pointerId = event.pointerId;
    ui.sampleRangeCanvas.setPointerCapture(pointerId);
    updateRangeMarker(eventSourceTime(event));
  });
  ui.sampleRangeCanvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId || !rangeMarker) return;
    updateRangeMarker(eventSourceTime(event));
  });
  const finishRangeDrag = (event) => {
    if (event.pointerId !== pointerId || !rangeMarker) return;
    rangeMarker = null;
    pointerId = null;
    commitChange({ reRenderEditors: false });
    renderSampleMarkerEditor();
  };
  ui.sampleRangeCanvas.addEventListener("pointerup", finishRangeDrag);
  ui.sampleRangeCanvas.addEventListener("pointercancel", finishRangeDrag);
}

ui.sampleMarkerSnapSelect.addEventListener("change", renderSampleMarkerEditor);
ui.sampleMarkerZoomOutBtn.addEventListener("click", () => {
  const index = SAMPLE_MARKER_ZOOM_LEVELS.indexOf(sampleMarkerZoom);
  sampleMarkerZoom = SAMPLE_MARKER_ZOOM_LEVELS[Math.max(0, index - 1)];
  renderSampleMarkerEditor();
});
ui.sampleMarkerZoomInBtn.addEventListener("click", () => {
  const index = SAMPLE_MARKER_ZOOM_LEVELS.indexOf(sampleMarkerZoom);
  sampleMarkerZoom =
    SAMPLE_MARKER_ZOOM_LEVELS[Math.min(SAMPLE_MARKER_ZOOM_LEVELS.length - 1, index + 1)];
  renderSampleMarkerEditor();
});
ui.sampleMarkerAddBtn.addEventListener("click", () => {
  const context = getSampleMarkerContext();
  if (!context) return;
  const canvas = ui.sampleMarkerCanvas;
  const logicalWidth = Number(canvas.dataset.logicalWidth) || canvas.width;
  const centerX = ui.sampleMarkerViewport.scrollLeft + ui.sampleMarkerViewport.clientWidth / 2;
  addWarpMarkerAtBeat((centerX / logicalWidth) * context.warp.bars * 4);
});
ui.sampleMarkerDeleteBtn.addEventListener("click", deleteSelectedWarpMarker);
ui.sampleMarkerResetBtn.addEventListener("click", () => {
  const context = getSampleMarkerContext();
  if (!context) return;
  context.warp.markers = [];
  selectedWarpMarkerId = null;
  commitChange({ reRenderEditors: false });
  renderSampleMarkerEditor();
});
ui.sampleMarkerWarpBtn.addEventListener("click", () => {
  const context = getSampleMarkerContext();
  if (!context) return;
  context.warp.enabled = !context.warp.enabled;
  if (context.warp.enabled) context.warp.mode = "beats";
  commitChange({ reRenderEditors: false });
  renderSampleMarkerEditor();
});
ui.sampleMarkerBarsSelect.addEventListener("change", () => {
  const context = getSampleMarkerContext();
  const bars = parseFloat(ui.sampleMarkerBarsSelect.value);
  if (!context || !Number.isFinite(bars)) return;
  context.warp.bars = bars;
  context.block.length = bars * 4;
  const regionDuration = getSampleRegionDuration(context.block, context.duration);
  context.warp.sourceBpm = Math.min(
    400,
    Math.max(20, (bars * 4 * 60) / regionDuration),
  );
  context.warp.markers = context.warp.markers.filter((marker) => marker.beat < bars * 4);
  if (!context.warp.markers.some((marker) => marker.id === selectedWarpMarkerId)) {
    selectedWarpMarkerId = null;
  }
  commitChange({ reRenderEditors: false });
  renderSampleMarkerEditor();
});
ui.sampleMarkerPreviewBtn.addEventListener("click", () => {
  const context = getSampleMarkerContext();
  if (!context) return;
  sampleMarkerPreview = !sampleMarkerPreview;
  ui.sampleMarkerPreviewBtn.setAttribute("aria-pressed", sampleMarkerPreview ? "true" : "false");
  if (!sampleMarkerPreview) {
    stopSampleMarkerPreview();
    drawWarpMarkerCanvas();
    return;
  }
  const previewBlock = {
    ...context.block,
    warp: { ...context.warp, enabled: true, mode: "beats" },
  };
  audioEngine.previewBlock(context.track, previewBlock, project.bpm, { loop: true });
  const animate = () => {
    if (!sampleMarkerPreview) return;
    drawWarpMarkerCanvas();
    sampleMarkerAnimationFrame = window.requestAnimationFrame(animate);
  };
  sampleMarkerAnimationFrame = window.requestAnimationFrame(animate);
  updateSampleMarkerControls();
});

[
  [ui.sampleRangeStartInput, "sourceStart"],
  [ui.sampleRangeEndInput, "sourceEnd"],
  [ui.sampleLoopStartInput, "loopStart"],
  [ui.sampleLoopEndInput, "loopEnd"],
].forEach(([input, key]) => {
  input.addEventListener("change", () => {
    const context = getSampleMarkerContext();
    const value = parseFloat(input.value);
    if (!context || !Number.isFinite(value)) return;
    context.block[key] = value;
    normalizeSampleBoundaries(context.block, context.duration);
    commitChange({ reRenderEditors: false });
    renderSampleMarkerEditor();
  });
});

ui.closeEditorBtn.addEventListener("click", closeEditor);
ui.closeChipDrumBtn.addEventListener("click", closeChipDrumEditor);
ui.closeSampleMarkerBtn.addEventListener("click", closeSampleMarkerEditor);
ui.chipDrumPreviewBtn.addEventListener("click", () => {
  const track = getActiveChipDrumTrack();
  const pad = getActiveChipDrumPad();
  if (track && pad) {
    audioEngine.previewDrum(track, pad.id, 0.9);
  }
});
ui.chipDrumResetPadBtn.addEventListener("click", resetActiveChipDrumPad);
ui.confirmCancelBtn.addEventListener("click", closeConfirm);
ui.confirmOkBtn.addEventListener("click", () => {
  if (pendingConfirm) {
    pendingConfirm();
  }
  closeConfirm();
});

ui.addDeviceBtn.addEventListener("click", openConsolePicker);
ui.closeConsolePickerBtn.addEventListener("click", closeConsolePicker);

ui.consolePickerOverlay.addEventListener("pointerdown", (event) => {
  if (event.target === ui.consolePickerOverlay) {
    closeConsolePicker();
  }
});

ui.chipDrumOverlay.addEventListener("pointerdown", (event) => {
  audioEngine.unlock();
  if (event.target === ui.chipDrumOverlay) {
    closeChipDrumEditor();
  }
});

ui.sampleMarkerOverlay.addEventListener("pointerdown", (event) => {
  audioEngine.unlock();
  if (event.target === ui.sampleMarkerOverlay) closeSampleMarkerEditor();
});

ui.confirmOverlay.addEventListener("pointerdown", (event) => {
  if (event.target === ui.confirmOverlay) {
    closeConfirm();
  }
});

ui.editorOverlay.addEventListener("pointerdown", () => {
  audioEngine.unlock();
  startOscilloscope();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !ui.sampleMarkerOverlay.classList.contains("hidden")) {
    closeSampleMarkerEditor();
    return;
  }
  if (event.key === "Escape" && !ui.chipDrumOverlay.classList.contains("hidden")) {
    closeChipDrumEditor();
    return;
  }
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
  stopChipDrumOscilloscope();
  stopSampleMarkerPreview();
  audioEngine.stop();
});

window.addEventListener("resize", () => {
  if (!ui.sampleMarkerOverlay.classList.contains("hidden")) {
    renderSampleMarkerEditor();
  }
});

if (project.tracks[0].blocks.length === 0) {
  const defaultBlock = createBlock({ startBeat: 0, length: 4, type: "synth" });
  defaultBlock.notes.push({ pitch: 60, start: 0, duration: 1, velocity: 0.9 });
  project.tracks[0].blocks.push(defaultBlock);
  history.push(project);
  timeline.setProject(project);
}

timeline.setSelectedTrackId(selectedTrackId);
renderDevicePanel();
void ensureProjectAssetsLoaded().then(() => renderDevicePanel());
