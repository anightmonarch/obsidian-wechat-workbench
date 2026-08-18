import { describe, expect, it } from 'vitest';

import { progressFor } from '../../src/ui/publish-progress';

describe('publish progress UI contract', () => {
  it('maps one-to-one to transaction states without inventing a formal publish stage', () => {
    expect(progressFor('PREPARING').label).toBe('准备并冻结文章');
    expect(progressFor('UPLOADING_ASSETS').label).toBe('上传正文图片与封面');
    expect(progressFor('READY_TO_COMMIT').label).toBe('提交到公众号草稿箱');
    expect(progressFor('AMBIGUOUS').terminal).toBe(true);
    expect(progressFor('LOCAL_COMMITTED').terminal).toBe(true);
    expect(['PREPARING', 'UPLOADING_ASSETS', 'READY_TO_COMMIT', 'REMOTE_COMMITTED', 'LOCAL_COMMITTED'])
      .not.toContain('FORMAL_PUBLISH');
  });
});
