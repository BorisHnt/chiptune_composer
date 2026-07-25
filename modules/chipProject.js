const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_ENTRY_COUNT = 1024;
const MAX_UNCOMPRESSED_SIZE = 512 * 1024 * 1024;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts) {
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.byteLength;
  });
  return result;
}

function safeFileName(name) {
  return String(name || "sample")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^[-_.]+/, "")
    .slice(0, 120) || "sample";
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  entries.forEach(({ name, data }) => {
    const nameBytes = encoder.encode(name);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const crc = crc32(bytes);

    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, bytes.byteLength, true);
    localView.setUint32(22, bytes.byteLength, true);
    localView.setUint16(26, nameBytes.byteLength, true);
    localParts.push(localHeader, nameBytes, bytes);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, bytes.byteLength, true);
    centralView.setUint32(24, bytes.byteLength, true);
    centralView.setUint16(28, nameBytes.byteLength, true);
    centralView.setUint32(42, localOffset, true);
    centralParts.push(centralHeader, nameBytes);

    localOffset += localHeader.byteLength + nameBytes.byteLength + bytes.byteLength;
  });

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.byteLength, true);
  endView.setUint32(16, localOffset, true);

  return concatBytes([...localParts, centralDirectory, end]);
}

export async function createChipProjectBlob(project, getAsset) {
  const manifestAssets = [];
  const entries = [];

  for (const asset of project.assets || []) {
    const record = await getAsset(asset.id);
    if (!record?.blob) {
      throw new Error(`Audio asset is unavailable: ${asset.name || asset.id}`);
    }
    const extensionName = safeFileName(record.name || asset.name);
    const path = `assets/audio/${asset.id}-${extensionName}`;
    const data = new Uint8Array(await record.blob.arrayBuffer());
    entries.push({ name: path, data });
    manifestAssets.push({
      id: asset.id,
      path,
      name: asset.name,
      type: asset.type || record.type,
    });
  }

  const manifest = {
    format: "chiptune-composer-project",
    version: 1,
    createdAt: new Date().toISOString(),
    project: "project.json",
    assets: manifestAssets,
  };
  entries.unshift(
    { name: "manifest.json", data: encoder.encode(JSON.stringify(manifest, null, 2)) },
    { name: "project.json", data: encoder.encode(JSON.stringify(project, null, 2)) },
  );

  return new Blob([createZip(entries)], { type: "application/x-chipproject" });
}

function findEndOfCentralDirectory(bytes) {
  const start = Math.max(0, bytes.byteLength - 65557);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.byteLength - 22; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

function validateEntryName(name) {
  if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) {
    throw new Error("Archive contains an unsafe path");
  }
}

async function inflateRaw(bytes) {
  if (!window.DecompressionStream) {
    throw new Error("This compressed project requires a newer browser");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZip(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(bytes);
  if (endOffset < 0) throw new Error("Invalid .chipproject archive");

  const entryCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  if (entryCount > MAX_ENTRY_COUNT) throw new Error("Project contains too many files");

  const entries = new Map();
  let totalSize = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Invalid ZIP directory");
    }
    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    validateEntryName(name);
    if (uncompressedSize > MAX_UNCOMPRESSED_SIZE - totalSize) {
      throw new Error("Project archive is too large");
    }

    if (view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error("Invalid ZIP entry");
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > bytes.byteLength) {
      throw new Error(`Truncated project entry: ${name}`);
    }
    const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
    let data;
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      data = await inflateRaw(compressed);
    } else {
      throw new Error(`Unsupported ZIP compression method: ${method}`);
    }
    if (data.byteLength !== uncompressedSize || crc32(data) !== crc) {
      throw new Error(`Corrupted project entry: ${name}`);
    }
    totalSize += data.byteLength;
    if (totalSize > MAX_UNCOMPRESSED_SIZE) throw new Error("Project archive is too large");
    entries.set(name, data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export async function readChipProject(file) {
  const entries = await readZip(file);
  const manifestBytes = entries.get("manifest.json");
  const projectBytes = entries.get("project.json");
  if (!manifestBytes || !projectBytes) throw new Error("Incomplete .chipproject archive");

  const manifest = JSON.parse(decoder.decode(manifestBytes));
  if (manifest.format !== "chiptune-composer-project" || manifest.version !== 1) {
    throw new Error("Unsupported .chipproject version");
  }

  const project = JSON.parse(decoder.decode(projectBytes));
  const assets = [];
  for (const item of manifest.assets || []) {
    if (!item || typeof item.id !== "string" || !item.id || typeof item.path !== "string") {
      throw new Error("Invalid audio asset manifest");
    }
    validateEntryName(item.path);
    const data = entries.get(item.path);
    if (!data) throw new Error(`Missing audio asset: ${item.name || item.id}`);
    assets.push({
      id: item.id,
      name: item.name || "Sample",
      type: item.type || "application/octet-stream",
      blob: new Blob([data], { type: item.type || "application/octet-stream" }),
    });
  }
  return { project, assets };
}
