import { Buffer } from 'node:buffer';

export type SupportedImageMime = 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp';

function startsWith(bytes: Uint8Array, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[index] === value);
}

export function detectImageMime(bytes: Uint8Array): SupportedImageMime | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])
    || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return 'image/gif';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
    && startsWith(bytes.slice(8), [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  return null;
}

export function imageDataUrl(bytes: Uint8Array, mime: SupportedImageMime): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}
