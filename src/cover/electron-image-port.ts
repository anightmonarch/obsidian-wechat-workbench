import { nativeImage, type NativeImage } from 'electron';

export const MAX_COVER_INPUT_BYTES = 20 * 1024 * 1024;
const ASPECT_WIDTH = 47;
const ASPECT_HEIGHT = 20;

export interface ImageSize {
  width: number;
  height: number;
}

export interface CropRect extends ImageSize {
  x: number;
  y: number;
}

export interface DecodedCoverImage {
  native: NativeImage;
  size: Readonly<ImageSize>;
}

export function centerCropRect(size: Readonly<ImageSize>): Readonly<CropRect> {
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height)
    || size.width <= 0 || size.height <= 0) {
    throw new Error('Cover image dimensions are invalid.');
  }
  const scale = Math.min(
    Math.floor(size.width / ASPECT_WIDTH),
    Math.floor(size.height / ASPECT_HEIGHT),
  );
  if (scale < 1) throw new Error('Cover image is too small for a 2.35:1 crop.');
  const width = ASPECT_WIDTH * scale;
  const height = ASPECT_HEIGHT * scale;
  return Object.freeze({
    x: Math.floor((size.width - width) / 2),
    y: Math.floor((size.height - height) / 2),
    width,
    height,
  });
}

export class ElectronImagePort {
  decode(bytes: Uint8Array): Readonly<DecodedCoverImage> {
    if (bytes.byteLength === 0) throw new Error('Cover image input is empty.');
    if (bytes.byteLength > MAX_COVER_INPUT_BYTES) throw new Error('Cover image input exceeds 20 MiB.');
    const image = nativeImage.createFromBuffer(Uint8Array.from(bytes));
    if (image.isEmpty()) throw new Error('Cover image could not be decoded.');
    const size = image.getSize();
    if (size.width <= 0 || size.height <= 0) throw new Error('Cover image dimensions are invalid.');
    return Object.freeze({ native: image, size: Object.freeze({ ...size }) });
  }

  cropToAspect(image: Readonly<DecodedCoverImage>): Readonly<DecodedCoverImage> {
    const cropped = image.native.crop(centerCropRect(image.size));
    if (cropped.isEmpty()) throw new Error('Cover image crop failed.');
    const size = cropped.getSize();
    return Object.freeze({ native: cropped, size: Object.freeze({ ...size }) });
  }

  encodePng(image: Readonly<DecodedCoverImage>): Uint8Array {
    const bytes = new Uint8Array(image.native.toPNG());
    if (bytes.byteLength === 0) throw new Error('Cover PNG encoding failed.');
    return bytes;
  }

  process(bytes: Uint8Array): Uint8Array {
    return this.encodePng(this.cropToAspect(this.decode(bytes)));
  }
}
