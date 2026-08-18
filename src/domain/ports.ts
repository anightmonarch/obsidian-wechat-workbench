export interface VaultFileRef {
  path: string;
  basename: string;
  modifiedAt: number;
}

export interface VaultPort {
  readText(path: string): Promise<string>;
}
