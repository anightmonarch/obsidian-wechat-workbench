/** Read JPEG EXIF Orientation (1–8). Returns 1 when absent/unreadable. */
export function readJpegExifOrientation(bytes: Uint8Array): number {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1]!;
    offset += 2;
    if (marker === 0xda || marker === 0xd9) break; // SOS / EOI
    if (offset + 2 > bytes.byteLength) break;
    const size = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (size < 2 || offset + size > bytes.byteLength) break;
    if (marker === 0xe1) {
      const orientation = readOrientationFromExif(bytes, offset + 2, size - 2);
      if (orientation !== null) return orientation;
    }
    offset += size;
  }
  return 1;
}

function readOrientationFromExif(bytes: Uint8Array, start: number, length: number): number | null {
  if (length < 14) return null;
  // "Exif\0\0"
  if (
    bytes[start] !== 0x45 || bytes[start + 1] !== 0x78 || bytes[start + 2] !== 0x69
    || bytes[start + 3] !== 0x66 || bytes[start + 4] !== 0x00 || bytes[start + 5] !== 0x00
  ) {
    return null;
  }
  const tiff = start + 6;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const read16 = (at: number): number => (
    little
      ? bytes[at]! | (bytes[at + 1]! << 8)
      : (bytes[at]! << 8) | bytes[at + 1]!
  );
  const read32 = (at: number): number => (
    little
      ? bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)
      : (bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!
  );
  if (read16(tiff) !== 0x4949 && read16(tiff) !== 0x4d4d) return null;
  if (read16(tiff + 2) !== 42) return null;
  let ifd = tiff + read32(tiff + 4);
  if (ifd + 2 > start + 6 + length) return null;
  const entries = read16(ifd);
  ifd += 2;
  for (let i = 0; i < entries; i += 1) {
    const entry = ifd + i * 12;
    if (entry + 12 > bytes.byteLength) break;
    const tag = read16(entry);
    if (tag !== 0x0112) continue; // Orientation
    const type = read16(entry + 2);
    const count = read32(entry + 4);
    if (type !== 3 || count < 1) return null;
    const value = read16(entry + 8);
    return value >= 1 && value <= 8 ? value : null;
  }
  return null;
}

export function orientationNeedsTransform(orientation: number): boolean {
  return orientation >= 2 && orientation <= 8;
}
