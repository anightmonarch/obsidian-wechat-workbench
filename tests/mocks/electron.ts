function image(width = 2350, height = 1000) {
  const self = {
    isEmpty: () => false,
    getSize: () => ({ width, height }),
    crop: (rect: { width: number; height: number }) => image(rect.width, rect.height),
    resize: (opts: { width: number; height: number }) => image(opts.width, opts.height),
    toPNG: () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
    toJPEG: (_quality: number) => Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
    toBitmap: () => Buffer.alloc(width * height * 4),
  };
  return self;
}

/** Reads the real IHDR size from a PNG buffer so size-dependent paths are testable. */
function pngIhdrSize(buffer: Buffer): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length < 24 || !signature.every((byte, index) => buffer[index] === byte)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export const nativeImage = {
  createFromDataURL: () => image(),
  createFromBuffer: (buffer: Buffer) => {
    const size = pngIhdrSize(buffer);
    return size === null ? image() : image(size.width, size.height);
  },
  createFromBitmap: (_buf: Buffer, size: { width: number; height: number }) => image(size.width, size.height),
};

export const clipboard = {
  write: () => undefined,
};

export const shell = {
  openExternal: async (_url: string): Promise<void> => undefined,
};
