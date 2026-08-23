function image(width = 2350, height = 1000) {
  return {
    isEmpty: () => false,
    getSize: () => ({ width, height }),
    crop: (rect: { width: number; height: number }) => image(rect.width, rect.height),
    toPNG: () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
  };
}

export const nativeImage = {
  createFromDataURL: () => image(),
  createFromBuffer: () => image(),
};

export const clipboard = {
  write: () => undefined,
};

export const shell = {
  openExternal: async (_url: string): Promise<void> => undefined,
};
