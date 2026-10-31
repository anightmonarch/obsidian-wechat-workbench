import { Buffer } from 'node:buffer';
import { nativeImage, type NativeImage } from 'electron';

import { detectImageMime, type SupportedImageMime } from './image-format';
import { orientationNeedsTransform, readJpegExifOrientation } from './jpeg-orientation';

/** Soft cap before WeChat paste often fails (~5 MiB hard fail in clipboard path). */
export const CLIPBOARD_TARGET_MAX_BYTES = 3 * 1024 * 1024;
export const CLIPBOARD_MAX_EDGE = 2560;

export interface NormalizedClipboardImage {
  bytes: Uint8Array;
  mime: SupportedImageMime;
}

function resizeToMaxEdge(
  image: NativeImage,
  maxEdge: number,
): NativeImage {
  const { width, height } = image.getSize();
  const edge = Math.max(width, height);
  if (edge <= maxEdge) return image;
  const scale = maxEdge / edge;
  return image.resize({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    quality: 'best',
  });
}

function rotateBitmap(
  src: Buffer,
  width: number,
  height: number,
  orientation: number,
): { data: Buffer; width: number; height: number } {
  const srcStride = width * 4;
  const sample = (x: number, y: number, dst: Buffer, di: number): void => {
    const si = y * srcStride + x * 4;
    dst[di] = src[si]!;
    dst[di + 1] = src[si + 1]!;
    dst[di + 2] = src[si + 2]!;
    dst[di + 3] = src[si + 3]!;
  };

  // Map EXIF orientation → upright pixels (no EXIF left on output).
  switch (orientation) {
    case 2: { // mirror horizontal
      const dst = Buffer.alloc(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          sample(width - 1 - x, y, dst, (y * width + x) * 4);
        }
      }
      return { data: dst, width, height };
    }
    case 3: { // 180
      const dst = Buffer.alloc(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          sample(width - 1 - x, height - 1 - y, dst, (y * width + x) * 4);
        }
      }
      return { data: dst, width, height };
    }
    case 4: { // mirror vertical
      const dst = Buffer.alloc(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          sample(x, height - 1 - y, dst, (y * width + x) * 4);
        }
      }
      return { data: dst, width, height };
    }
    case 5: { // mirror horizontal + rotate 90 CW
      const dw = height;
      const dh = width;
      const dst = Buffer.alloc(dw * dh * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const dx = y;
          const dy = x;
          sample(width - 1 - x, y, dst, (dy * dw + dx) * 4);
        }
      }
      return { data: dst, width: dw, height: dh };
    }
    case 6: { // rotate 90 CW
      const dw = height;
      const dh = width;
      const dst = Buffer.alloc(dw * dh * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const dx = height - 1 - y;
          const dy = x;
          sample(x, y, dst, (dy * dw + dx) * 4);
        }
      }
      return { data: dst, width: dw, height: dh };
    }
    case 7: { // mirror horizontal + rotate 90 CCW
      const dw = height;
      const dh = width;
      const dst = Buffer.alloc(dw * dh * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const dx = height - 1 - y;
          const dy = width - 1 - x;
          sample(width - 1 - x, y, dst, (dy * dw + dx) * 4);
        }
      }
      return { data: dst, width: dw, height: dh };
    }
    case 8: { // rotate 90 CCW
      const dw = height;
      const dh = width;
      const dst = Buffer.alloc(dw * dh * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const dx = y;
          const dy = width - 1 - x;
          sample(x, y, dst, (dy * dw + dx) * 4);
        }
      }
      return { data: dst, width: dw, height: dh };
    }
    default:
      return { data: src, width, height };
  }
}

function encodeJpeg(image: NativeImage, quality: number): Uint8Array {
  return new Uint8Array(image.toJPEG(quality));
}

/**
 * Bake EXIF orientation into pixels, strip metadata via re-encode, and shrink
 * oversized images so WeChat paste upload is less likely to hit「系统错误」.
 */
export function normalizeImageBytesForClipboard(bytes: Uint8Array): NormalizedClipboardImage {
  const detected = detectImageMime(bytes);
  if (detected === null) {
    return { bytes, mime: 'image/jpeg' };
  }

  const orientation = detected === 'image/jpeg' ? readJpegExifOrientation(bytes) : 1;
  let image = nativeImage.createFromBuffer(Buffer.from(bytes));
  if (image.isEmpty()) {
    return { bytes, mime: detected };
  }

  image = resizeToMaxEdge(image, CLIPBOARD_MAX_EDGE);

  if (orientationNeedsTransform(orientation)) {
    const size = image.getSize();
    const bitmap = Buffer.from(image.toBitmap());
    const rotated = rotateBitmap(bitmap, size.width, size.height, orientation);
    image = nativeImage.createFromBitmap(rotated.data, {
      width: rotated.width,
      height: rotated.height,
    });
    if (image.isEmpty()) {
      return { bytes, mime: detected };
    }
  } else if (
    detected !== 'image/jpeg'
    && bytes.byteLength <= CLIPBOARD_TARGET_MAX_BYTES
    && Math.max(image.getSize().width, image.getSize().height) <= CLIPBOARD_MAX_EDGE
  ) {
    // PNG/GIF/WebP under limits and upright: keep original bytes.
    return { bytes, mime: detected };
  }

  // Always re-encode JPEG after orientation bake (strips EXIF). Prefer JPEG for photos.
  let quality = 82;
  let encoded = encodeJpeg(image, quality);
  while (encoded.byteLength > CLIPBOARD_TARGET_MAX_BYTES && quality > 55) {
    quality -= 8;
    encoded = encodeJpeg(image, quality);
  }
  if (encoded.byteLength > CLIPBOARD_TARGET_MAX_BYTES) {
    image = resizeToMaxEdge(image, 1920);
    quality = 75;
    encoded = encodeJpeg(image, quality);
    while (encoded.byteLength > CLIPBOARD_TARGET_MAX_BYTES && quality > 45) {
      quality -= 8;
      encoded = encodeJpeg(image, quality);
    }
  }
  return { bytes: encoded, mime: 'image/jpeg' };
}
