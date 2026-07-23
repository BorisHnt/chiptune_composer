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
} from "./modules/dataModel.js";
import { AudioEngine } from "./modules/audioEngine.js";
import { Timeline } from "./modules/timeline.js";
import { PianoRoll } from "./modules/pianoRoll.js";
import { DrumEditor } from "./modules/drumEditor.js";
import { exportProjectToWav } from "./modules/exportWav.js";
import { importMidiFile } from "./modules/midiImport.js";

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
  importMidiBtn: document.getElementById("importMidiBtn"),
  clearCacheBtn: document.getElementById("clearCacheBtn"),
  loadInput: document.getElementById("loadInput"),
  midiInput: document.getElementById("midiInput"),
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
let selectedTrackId = project.tracks[0]?.id || null;
const selectedDrumVoiceByTrack = new Map();
let activeChipDrumTrackId = null;
let activeChipDrumPadId = null;
let chipDrumOscilloscopeFrame = null;
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

  if (track.type === "drums") {
    renderDrumDevice(track);
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
  selectTrack(trackId);
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
  const type = ui.trackTypeSelect?.value === "drums" ? "drums" : "synth";
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

ui.snapSelect.addEventListener("change", () => {
  snap = parseFloat(ui.snapSelect.value);
  timeline.setSnap(snap);
  pianoRoll.setSnap(snap);
  drumEditor.setSnap(snap);
});

ui.globalConsoleSelect.addEventListener("change", () => {
  const consoleName = ui.globalConsoleSelect.value;
  if (!consoleName) return;
  const waves = CONSOLE_WAVES[consoleName] || [];
  project.tracks.forEach((track) => {
    if (track.type === "drums") return;
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
    if (track.type === "drums") return;
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

ui.importMidiBtn.addEventListener("click", () => {
  ui.midiInput.click();
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
    startOscilloscope();
  } else {
    audioEngine.stopPreview();
    stopPreviewAnimation();
  }
});

ui.closeEditorBtn.addEventListener("click", closeEditor);
ui.closeChipDrumBtn.addEventListener("click", closeChipDrumEditor);
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
  audioEngine.stop();
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
