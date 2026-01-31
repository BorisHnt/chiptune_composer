import { createBlock, createTrack, ensureDrumPattern, getDrumRowsForConsole } from "./dataModel.js";

const TEXT_DECODER = new TextDecoder("ascii");

const readString = (data, offset, length) =>
  TEXT_DECODER.decode(data.subarray(offset, offset + length));

const readUint32 = (data, offset) =>
  (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];

const readUint16 = (data, offset) => (data[offset] << 8) | data[offset + 1];

const readVarInt = (data, offset) => {
  let result = 0;
  let position = offset;
  while (position < data.length) {
    const byte = data[position++];
    result = (result << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  return { value: result, next: position };
};

const mapDrum = (noteNumber) => {
  if (noteNumber === 35 || noteNumber === 36) return "kick";
  if (noteNumber === 38 || noteNumber === 40) return "snare";
  if (noteNumber === 42 || noteNumber === 44 || noteNumber === 46) return "hat";
  return "perc";
};

function parseMidi(data) {
  let offset = 0;
  const headerId = readString(data, offset, 4);
  if (headerId !== "MThd") {
    throw new Error("Invalid MIDI header");
  }
  offset += 4;
  const headerLength = readUint32(data, offset);
  offset += 4;
  const format = readUint16(data, offset);
  const trackCount = readUint16(data, offset + 2);
  const division = readUint16(data, offset + 4);
  offset += headerLength;

  const ppq = (division & 0x8000) ? 480 : division;
  const tracks = [];
  let tempo = 500000;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    const chunkId = readString(data, offset, 4);
    if (chunkId !== "MTrk") {
      throw new Error("Invalid track header");
    }
    offset += 4;
    const chunkLength = readUint32(data, offset);
    offset += 4;
    const trackEnd = offset + chunkLength;

    let currentTick = 0;
    let runningStatus = null;
    const notes = [];
    const openNotes = new Map();

    while (offset < trackEnd) {
      const delta = readVarInt(data, offset);
      currentTick += delta.value;
      offset = delta.next;

      let status = data[offset];
      if (status < 0x80) {
        if (runningStatus === null) {
          break;
        }
        status = runningStatus;
      } else {
        offset += 1;
        runningStatus = status;
      }

      if (status === 0xff) {
        const metaType = data[offset++];
        const lengthInfo = readVarInt(data, offset);
        const length = lengthInfo.value;
        offset = lengthInfo.next;
        if (metaType === 0x51 && length === 3) {
          tempo = (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
        }
        offset += length;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const lengthInfo = readVarInt(data, offset);
        offset = lengthInfo.next + lengthInfo.value;
        continue;
      }

      const eventType = status & 0xf0;
      const channel = status & 0x0f;
      const param1 = data[offset++];
      const param2 = eventType === 0xc0 || eventType === 0xd0 ? null : data[offset++];

      if (eventType === 0x90 && param2 > 0) {
        const key = `${channel}:${param1}`;
        if (!openNotes.has(key)) {
          openNotes.set(key, []);
        }
        openNotes.get(key).push({ start: currentTick, velocity: param2 });
      } else if (eventType === 0x80 || (eventType === 0x90 && param2 === 0)) {
        const key = `${channel}:${param1}`;
        const stack = openNotes.get(key);
        if (stack && stack.length) {
          const startEvent = stack.shift();
          notes.push({
            channel,
            note: param1,
            start: startEvent.start,
            end: currentTick,
            velocity: startEvent.velocity,
          });
        }
      }
    }

    tracks.push({ notes });
    offset = trackEnd;
  }

  return { format, ppq, tempo, tracks };
}

function buildProjectFromMidi(midi, filename) {
  const bpm = Math.round(60000000 / (midi.tempo || 500000));
  const name = filename ? filename.replace(/\.[^/.]+$/, "") : "Imported MIDI";

  const drumNotes = [];
  const trackNotes = midi.tracks.map((track) => track.notes || []);

  const channels = new Set();
  trackNotes.forEach((notes) => {
    notes.forEach((note) => {
      if (note.channel === 9) {
        drumNotes.push(note);
      } else {
        channels.add(note.channel);
      }
    });
  });

  const channelList = Array.from(channels);
  const useChannelGrouping = channelList.length > 1;

  let maxBeat = 4;

  const synthGroups = [];
  if (useChannelGrouping) {
    channelList.forEach((channel) => {
      const groupNotes = [];
      trackNotes.forEach((notes) => {
        notes.forEach((note) => {
          if (note.channel === channel) groupNotes.push(note);
        });
      });
      if (groupNotes.length) synthGroups.push({ label: `ch${channel + 1}`, notes: groupNotes });
    });
  } else {
    trackNotes.forEach((notes, index) => {
      const synthNotes = notes.filter((note) => note.channel !== 9);
      if (synthNotes.length) synthGroups.push({ label: `trk${index + 1}`, notes: synthNotes });
    });
  }

  const tracks = [];

  synthGroups.forEach((group, index) => {
    const track = createTrack(index, { type: "synth" });
    const block = createBlock({ startBeat: 0, length: 4, type: "synth" });
    block.notes = group.notes.map((note) => {
      const start = note.start / midi.ppq;
      const duration = Math.max(0.05, (note.end - note.start) / midi.ppq);
      const velocity = Math.max(0.1, Math.min(1, note.velocity / 127));
      const endBeat = start + duration;
      maxBeat = Math.max(maxBeat, endBeat);
      return { pitch: note.note, start, duration, velocity };
    });
    track.blocks.push(block);
    tracks.push(track);
  });

  if (drumNotes.length) {
    const drumTrack = createTrack(tracks.length, { type: "drums" });
    drumTrack.console = "NES";
    const rows = getDrumRowsForConsole(drumTrack.console);
    const drumBlock = createBlock({ startBeat: 0, length: 4, type: "drums" });
    const pattern = ensureDrumPattern(drumBlock, rows);
    pattern.events = drumNotes.map((note) => {
      const start = note.start / midi.ppq;
      const duration = Math.max(0.05, (note.end - note.start) / midi.ppq);
      const endBeat = start + duration;
      maxBeat = Math.max(maxBeat, endBeat);
      return {
        id: Math.random().toString(36).slice(2, 10),
        drum: mapDrum(note.note),
        start,
        duration,
        velocity: Math.max(0.1, Math.min(1, note.velocity / 127)),
      };
    });
    drumBlock.pattern = pattern;
    drumTrack.blocks.push(drumBlock);
    tracks.push(drumTrack);
  }

  const totalBeats = Math.max(4, Math.ceil(maxBeat / 4) * 4);
  tracks.forEach((track) => {
    track.blocks.forEach((block) => {
      block.length = totalBeats;
    });
  });

  return { name, bpm, tracks };
}

export async function importMidiFile(file) {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const midi = parseMidi(data);
  return buildProjectFromMidi(midi, file.name);
}
