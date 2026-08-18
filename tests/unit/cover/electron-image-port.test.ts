import { describe, expect, it } from 'vitest';

import { centerCropRect, ElectronImagePort, MAX_COVER_INPUT_BYTES } from '../../../src/cover/electron-image-port';

describe('ElectronImagePort', () => {
  it('computes an exact centered 2.35:1 crop without upscaling', () => {
    expect(centerCropRect({ width: 3000, height: 1000 })).toEqual({ x: 325, y: 0, width: 2350, height: 1000 });
    expect(centerCropRect({ width: 2000, height: 1200 })).toEqual({ x: 13, y: 180, width: 1974, height: 840 });
  });

  it('rejects empty and oversized encoded input before native decoding', () => {
    const port = new ElectronImagePort();

    expect(() => port.decode(new Uint8Array())).toThrow(/empty/i);
    expect(() => port.decode(new Uint8Array(MAX_COVER_INPUT_BYTES + 1))).toThrow(/20 MiB/i);
  });
});
