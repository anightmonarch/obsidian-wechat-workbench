declare module 'electron' {
  export interface NativeImage {
    isEmpty(): boolean;
    toPNG(): Uint8Array;
  }

  export const nativeImage: {
    createFromDataURL(dataUrl: string): NativeImage;
  };
}
