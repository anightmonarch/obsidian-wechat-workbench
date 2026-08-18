export const nativeImage = {
  createFromDataURL: () => ({
    isEmpty: () => false,
    toPNG: () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
  }),
};
