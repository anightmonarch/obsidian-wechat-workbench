import type { PublishStage } from '../publish/publish-types';

export interface PublishProgressModel {
  stage: PublishStage;
  label: string;
  terminal: boolean;
}

const LABELS: Readonly<Record<PublishStage, string>> = Object.freeze({
  PREPARING: '准备并冻结文章',
  UPLOADING_ASSETS: '上传正文图片与封面',
  READY_TO_COMMIT: '提交到公众号草稿箱',
  REMOTE_COMMITTED: '草稿已提交，保存本地关联',
  LOCAL_COMMITTED: '草稿与本地关联已完成',
  FAILED: '同步失败',
  AMBIGUOUS: '远端结果未知，等待对账',
});

export function progressFor(stage: PublishStage): Readonly<PublishProgressModel> {
  return Object.freeze({
    stage,
    label: LABELS[stage],
    terminal: stage === 'LOCAL_COMMITTED' || stage === 'FAILED' || stage === 'AMBIGUOUS',
  });
}
