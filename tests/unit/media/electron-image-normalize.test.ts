import { describe, expect, it } from 'vitest';

import {
  CLIPBOARD_MAX_EDGE,
  WECHAT_BODY_UPSCALE_MIN_WIDTH,
  WECHAT_BODY_WIDTH,
  normalizeImageBytesForClipboard,
  upscaleTargetWidth,
} from '../../../src/media/electron-image-normalize';

/** Minimal PNG whose IHDR carries the size the nativeImage mock reports. */
function pngWithSize(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([0x08, 0x06, 0x00, 0x00, 0x00], 24);
  return bytes;
}

const JPEG_MAGIC = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0xff, 0xd9]);
const GIF_MAGIC = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

describe('upscaleTargetWidth', () => {
  it('exposes the WeChat body width contract', () => {
    expect(WECHAT_BODY_WIDTH).toBe(677);
    expect(WECHAT_BODY_UPSCALE_MIN_WIDTH).toBe(480);
  });

  it('targets the body width for images narrower than the body column', () => {
    expect(upscaleTargetWidth(588, 'image/png')).toBe(677);
    expect(upscaleTargetWidth(588, 'image/jpeg')).toBe(677);
    expect(upscaleTargetWidth(588, 'image/webp')).toBe(677);
  });

  it('keeps images already at or beyond the body width', () => {
    expect(upscaleTargetWidth(677, 'image/jpeg')).toBeNull();
    expect(upscaleTargetWidth(1080, 'image/jpeg')).toBeNull();
  });

  it('keeps deliberately small images untouched', () => {
    expect(upscaleTargetWidth(479, 'image/png')).toBeNull();
    expect(upscaleTargetWidth(320, 'image/png')).toBeNull();
  });

  it('never resizes animated GIF', () => {
    expect(upscaleTargetWidth(588, 'image/gif')).toBeNull();
    expect(upscaleTargetWidth(500, 'image/gif')).toBeNull();
  });
});

describe('normalizeImageBytesForClipboard', () => {
  it('upscales a narrow static image to the WeChat body width', () => {
    const result = normalizeImageBytesForClipboard(pngWithSize(588, 1280));
    // Upscaled pixels must be re-encoded; JPEG keeps the clipboard path cheap.
    expect(result.mime).toBe('image/jpeg');
    expect(result.bytes.byteLength).toBeGreaterThan(0);
  });

  it('leaves deliberately small images at their original size and mime', () => {
    const source = pngWithSize(320, 200);
    const result = normalizeImageBytesForClipboard(source);
    expect(result.mime).toBe('image/png');
    expect([...result.bytes]).toEqual([...source]);
  });

  it('keeps body-width and wider images unchanged in mime', () => {
    const result = normalizeImageBytesForClipboard(pngWithSize(700, 400));
    expect(result.mime).toBe('image/png');
  });

  it('keeps undersized gif bytes untouched', () => {
    const result = normalizeImageBytesForClipboard(GIF_MAGIC);
    expect(result.mime).toBe('image/gif');
  });

  it('still re-encodes jpeg with orientation bake and caps', () => {
    const result = normalizeImageBytesForClipboard(JPEG_MAGIC);
    expect(result.mime).toBe('image/jpeg');
    expect(result.bytes.byteLength).toBeGreaterThan(0);
  });

  it('keeps the 2560 max-edge contract', () => {
    expect(CLIPBOARD_MAX_EDGE).toBe(2560);
  });
});
