declare module 'electron' {
  export interface NativeImage {
    isEmpty(): boolean;
    getSize(): { width: number; height: number };
    crop(rect: { x: number; y: number; width: number; height: number }): NativeImage;
    resize(options: {
      width?: number;
      height?: number;
      quality?: 'good' | 'better' | 'best';
    }): NativeImage;
    toPNG(): Uint8Array;
    toJPEG(quality: number): Uint8Array;
    toBitmap(): Uint8Array;
  }

  export const nativeImage: {
    createFromDataURL(dataUrl: string): NativeImage;
    createFromBuffer(buffer: Uint8Array): NativeImage;
    createFromBitmap(
      buffer: Uint8Array,
      options: { width: number; height: number },
    ): NativeImage;
  };

  export const clipboard: {
    write(content: { html?: string; text: string }): void;
  };

  export const shell: {
    openExternal(url: string): Promise<void>;
  };
}
