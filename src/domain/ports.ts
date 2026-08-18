export interface VaultFileRef {
  path: string;
  basename: string;
  modifiedAt: number;
}

export interface VaultPort {
  readText(path: string): Promise<string>;
}

export interface BinaryFilePort {
  resolveLink(source: string, fromPath: string): Promise<string | null>;
  readBinary(path: string): Promise<Uint8Array>;
}
