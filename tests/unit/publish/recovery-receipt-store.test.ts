import { describe, expect, it } from 'vitest';

import {
  RecoveryReceiptStore,
  type RecoveryDataPort,
  type RecoveryReceipt,
} from '../../../src/publish/recovery-receipt-store';

class MemoryData implements RecoveryDataPort {
  receipts: readonly Readonly<RecoveryReceipt>[] = Object.freeze([]);
  async save(receipts: readonly Readonly<RecoveryReceipt>[]): Promise<void> {
    this.receipts = receipts;
  }
}

function receipt(index = 1): Readonly<RecoveryReceipt> {
  return Object.freeze({
    taskId: `TASK_${index}`,
    accountHash: 'ACCOUNT_HASH',
    mediaId: `TEST_MEDIA_ID_${index}`,
    operation: 'CREATE',
    contentHash: `CONTENT_HASH_${index}`,
    themeHash: 'THEME_HASH',
    coverHash: 'COVER_HASH',
    remoteTimestamp: index,
    status: 'UNRESOLVED',
  });
}

describe('RecoveryReceiptStore', () => {
  it('persists only recovery metadata and keeps unresolved receipts', async () => {
    const data = new MemoryData();
    const store = new RecoveryReceiptStore(data);

    await store.record(receipt());

    expect(store.listUnresolved()).toEqual([receipt()]);
    expect(JSON.stringify(data.receipts)).not.toMatch(/article|title|token|secret|html/iu);
  });

  it('marks a task resolved and caps resolved summaries at twenty', async () => {
    const data = new MemoryData();
    const store = new RecoveryReceiptStore(data);
    for (let index = 1; index <= 22; index += 1) {
      await store.record(receipt(index));
      await store.resolve(`TASK_${index}`);
    }
    await store.record(receipt(99));

    expect(data.receipts.filter(item => item.status === 'RESOLVED')).toHaveLength(20);
    expect(store.listUnresolved().map(item => item.taskId)).toEqual(['TASK_99']);
    expect(data.receipts.some(item => item.taskId === 'TASK_1')).toBe(false);
  });

  it('replaces duplicate task IDs instead of creating ambiguous local receipts', async () => {
    const data = new MemoryData();
    const store = new RecoveryReceiptStore(data);
    await store.record(receipt());
    await store.record(Object.freeze({ ...receipt(), mediaId: 'TEST_MEDIA_ID_REPLACED' }));

    expect(data.receipts).toHaveLength(1);
    expect(data.receipts[0]?.mediaId).toBe('TEST_MEDIA_ID_REPLACED');
  });
});
