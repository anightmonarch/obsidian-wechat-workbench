import { describe, expect, it } from 'vitest';

import { orientationNeedsTransform, readJpegExifOrientation } from '../../../src/media/jpeg-orientation';

/** Minimal JPEG with EXIF Orientation = 6 (SOF not required for our parser). */
function jpegWithOrientation(orientation: number): Uint8Array {
  const exifBody = [
    // Exif\0\0
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    // TIFF little-endian + magic 42
    0x49, 0x49, 0x2a, 0x00,
    // offset to IFD0 = 8
    0x08, 0x00, 0x00, 0x00,
    // 1 entry
    0x01, 0x00,
    // tag 0x0112 Orientation, type SHORT, count 1
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
    orientation & 0xff, (orientation >> 8) & 0xff, 0x00, 0x00,
    // next IFD = 0
    0x00, 0x00, 0x00, 0x00,
  ];
  const app1Len = exifBody.length + 2;
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff,
    ...exifBody,
    0xff, 0xd9,
  ]);
}

describe('readJpegExifOrientation', () => {
  it('returns 1 for non-jpeg or missing EXIF', () => {
    expect(readJpegExifOrientation(Uint8Array.from([0x89, 0x50]))).toBe(1);
    expect(readJpegExifOrientation(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBe(1);
  });

  it('reads Orientation=6 from APP1', () => {
    expect(readJpegExifOrientation(jpegWithOrientation(6))).toBe(6);
    expect(orientationNeedsTransform(6)).toBe(true);
    expect(orientationNeedsTransform(1)).toBe(false);
  });
});
