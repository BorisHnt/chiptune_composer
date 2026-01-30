import { getProjectEndBeat } from "./dataModel.js";
import { scheduleProject } from "./audioEngine.js";

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const samples = buffer.length;
  const blockAlign = (numChannels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  let offset = 0;
  const writeString = (value) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
    offset += value.length;
  };

  writeString("RIFF");
  view.setUint32(offset, bufferSize - 8, true);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, format, true);
  offset += 2;
  view.setUint16(offset, numChannels, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bitDepth, true);
  offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  const channelData = [];
  for (let channel = 0; channel < numChannels; channel += 1) {
    channelData.push(buffer.getChannelData(channel));
  }

  for (let i = 0; i < samples; i += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

export async function exportProjectToWav(project) {
  const secondsPerBeat = 60 / project.bpm;
  const totalBeats = getProjectEndBeat(project);
  const duration = totalBeats * secondsPerBeat + 1;
  const sampleRate = 44100;
  const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContextClass) {
    throw new Error("OfflineAudioContext not supported");
  }

  const offline = new OfflineContextClass(2, duration * sampleRate, sampleRate);
  const master = offline.createGain();
  master.gain.value = 0.9;
  master.connect(offline.destination);

  scheduleProject(offline, project, { startTime: 0, master });

  const rendered = await offline.startRendering();
  const wavData = audioBufferToWav(rendered);
  const blob = new Blob([wavData], { type: "audio/wav" });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "chiptune-export.wav";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
