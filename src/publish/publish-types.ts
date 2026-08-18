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

export interface PublishCommand {
  file: VaultFileRef;
  artifact: Readonly<RenderArtifact>;
  accountHash: string;
  cover: Readonly<UploadImage>;
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
