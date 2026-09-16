// Validate Browser Run output before promising a usable screenshot to callers.
// PNGs may be perfectly valid yet contain no visible content. Inspect bounded, 8-bit
// images without adding a heavyweight image-processing dependency to the Worker.
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_SCAN_BYTES = 12 * 1024 * 1024;

export type ShotInspection = { ok: boolean; blank: boolean; width?: number; height?: number; reason?: string };

function pngSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 33 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}
function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
}
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// null means PNG format/size is unsupported for blankness analysis; it is not proof of a blank image.
async function fullyWhitePng(bytes: Uint8Array, width: number, height: number): Promise<boolean | null> {
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
  if (bitDepth !== 8 || !channels || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) return null;
  const stride = width * channels;
  if ((stride + 1) * height > MAX_SCAN_BYTES) return null;
  const compressed: Uint8Array[] = [];
  let compressedSize = 0;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const size = readU32(bytes, offset);
    const end = offset + 12 + size;
    if (size > MAX_IMAGE_BYTES || end > bytes.length) return null;
    const kind = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (kind === 'IDAT') {
      compressedSize += size;
      if (compressedSize > MAX_SCAN_BYTES) return null;
      compressed.push(bytes.slice(offset + 8, offset + 8 + size));
    }
    if (kind === 'IEND') break;
    offset = end;
  }
  if (!compressed.length) return null;
  const joined = new Uint8Array(compressedSize);
  let position = 0;
  for (const part of compressed) { joined.set(part, position); position += part.length; }
  let decoded: Uint8Array;
  try {
    const stream = new Blob([joined]).stream().pipeThrough(new DecompressionStream('deflate'));
    decoded = new Uint8Array(await new Response(stream).arrayBuffer());
  } catch { return null; }
  if (decoded.length !== (stride + 1) * height) return null;
  let previous = new Uint8Array(stride);
  let current = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    const filter = decoded[start];
    if (filter > 4) return null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x];
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      const value = decoded[start + 1 + x];
      current[x] = (value + (filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : 0)) & 255;
    }
    for (let x = 0; x < stride; x += channels) {
      const invisible = (channels === 2 && current[x + 1] === 0) || (channels === 4 && current[x + 3] === 0);
      if (invisible) continue;
      const colorChannels = channels === 2 ? 1 : channels === 4 ? 3 : channels;
      for (let c = 0; c < colorChannels; c += 1) if (current[x + c] < 248) return false;
    }
    [previous, current] = [current, previous];
  }
  return true;
}

export async function inspectShot(bytes: Uint8Array, format: 'png' | 'pdf'): Promise<ShotInspection> {
  if (bytes.byteLength < 100 || bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, blank: false, reason: 'Capture is empty or exceeds 20 MiB' };
  if (format === 'pdf') {
    const valid = bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70 && bytes[4] === 45;
    return valid ? { ok: true, blank: false } : { ok: false, blank: false, reason: 'Renderer returned a non-PDF response' };
  }
  if (!pngSignature(bytes) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') {
    return { ok: false, blank: false, reason: 'Renderer returned a non-PNG response' };
  }
  const width = readU32(bytes, 16), height = readU32(bytes, 20);
  if (!width || !height || width > 16_384 || height > 65_535) return { ok: false, blank: false, reason: 'Invalid screenshot dimensions' };
  const blank = await fullyWhitePng(bytes, width, height);
  return { ok: true, blank: blank === true, width, height };
}
