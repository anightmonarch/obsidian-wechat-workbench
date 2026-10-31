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

export const nativeImage = {
  createFromDataURL: () => image(),
  createFromBuffer: () => image(),
  createFromBitmap: (_buf: Buffer, size: { width: number; height: number }) => image(size.width, size.height),
};

export const clipboard = {
  write: () => undefined,
};

export const shell = {
  openExternal: async (_url: string): Promise<void> => undefined,
};
