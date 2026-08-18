import type { RenderArtifact } from '../domain/artifact';
import type { VaultFileRef } from '../domain/ports';
import type { UploadImage } from './asset-upload-service';
import type { PublicError } from '../wechat/errors';

export type PublishStage =
  | 'PREPARING'
  | 'UPLOADING_ASSETS'
  | 'READY_TO_COMMIT'
  | 'REMOTE_COMMITTED'
  | 'LOCAL_COMMITTED'
  | 'FAILED'
  | 'AMBIGUOUS';

export type PublishAction = 'CREATE' | 'UPDATE' | 'SKIP';

export interface PublishDialogInput {
  action: PublishAction;
  appId: string;
  title: string;
  digest: string;
  themeId: string;
  themeVersion: string;
  contentHash: string;
  themeHash: string;
  coverHash: string;
  imageCount: number;
  coverLabel: string;
}

export interface PublishCommand {
  file: VaultFileRef;
  artifact: Readonly<RenderArtifact>;
  accountHash: string;
  cover: Readonly<UploadImage>;
  coverPath: string;
  coverHash: string;
}

export interface PublishOutcome {
  taskId: string;
  state: PublishStage;
  action: PublishAction | null;
  mediaId: string | null;
  error: PublicError | null;
  hasUnsyncedChanges: boolean;
}
