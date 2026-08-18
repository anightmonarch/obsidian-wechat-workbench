import type { RecoveryReceiptRecord } from '../settings/model';

export type RecoveryStatus = 'UNRESOLVED' | 'RESOLVED';

export type RecoveryReceipt = RecoveryReceiptRecord;

export interface RecoveryDataPort {
  receipts: readonly Readonly<RecoveryReceipt>[];
  save(receipts: readonly Readonly<RecoveryReceipt>[]): Promise<void>;
}

function clean(receipt: Readonly<RecoveryReceipt>): Readonly<RecoveryReceipt> {
  return Object.freeze({
    taskId: receipt.taskId,
    accountHash: receipt.accountHash,
    mediaId: receipt.mediaId,
    operation: receipt.operation,
    contentHash: receipt.contentHash,
    themeHash: receipt.themeHash,
    coverHash: receipt.coverHash,
    remoteTimestamp: receipt.remoteTimestamp,
    status: receipt.status,
  });
}

function capped(receipts: readonly Readonly<RecoveryReceipt>[]): readonly Readonly<RecoveryReceipt>[] {
  const unresolved = receipts.filter(receipt => receipt.status === 'UNRESOLVED');
  const resolved = receipts
    .filter(receipt => receipt.status === 'RESOLVED')
    .sort((left, right) => right.remoteTimestamp - left.remoteTimestamp || left.taskId.localeCompare(right.taskId))
    .slice(0, 20);
  return Object.freeze([...unresolved, ...resolved].map(clean));
}

export class RecoveryReceiptStore {
  private mutation: Promise<void> = Promise.resolve();

  constructor(private readonly data: RecoveryDataPort) {}

  async record(receipt: Readonly<RecoveryReceipt>): Promise<void> {
    await this.enqueue(async () => {
      const next = [
        ...this.data.receipts.filter(item => item.taskId !== receipt.taskId),
        clean(receipt),
      ];
      await this.data.save(capped(next));
    });
  }

  async resolve(taskId: string): Promise<void> {
    await this.enqueue(async () => {
      const next = this.data.receipts.map(receipt => (
        receipt.taskId === taskId ? clean({ ...receipt, status: 'RESOLVED' }) : receipt
      ));
      await this.data.save(capped(next));
    });
  }

  listUnresolved(): readonly Readonly<RecoveryReceipt>[] {
    return Object.freeze(this.data.receipts
      .filter(receipt => receipt.status === 'UNRESOLVED')
      .map(clean));
  }

  get(taskId: string): Readonly<RecoveryReceipt> | null {
    const found = this.data.receipts.find(receipt => receipt.taskId === taskId);
    return found === undefined ? null : clean(found);
  }

  private async enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.mutation.then(operation, operation);
    this.mutation = next.then(() => undefined, () => undefined);
    await next;
  }
}
