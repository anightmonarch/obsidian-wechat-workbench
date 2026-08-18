import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type { VaultFileRef, VaultPort } from '../../../src/domain/ports';
import {
  NoteSnapshotService,
  type MetadataPort,
  type SnapshotDefaults,
} from '../../../src/render/note-snapshot-service';

const file: VaultFileRef = Object.freeze({
  path: '01-公众号/article.md',
  basename: 'article',
  modifiedAt: 123456,
});

class MemoryVault implements VaultPort {
  constructor(private readonly markdown: string) {}

  async readText(_path: string): Promise<string> {
    return this.markdown;
  }
}

class MemoryMetadata implements MetadataPort {
  constructor(private readonly frontmatter: Readonly<Record<string, unknown>>) {}

  getFrontmatter(_path: string): Readonly<Record<string, unknown>> {
    return this.frontmatter;
  }
}

const defaults: SnapshotDefaults = Object.freeze({
  defaultAuthor: 'Default author',
  defaultSourceUrl: 'https://example.test/default',
  defaultThemeId: 'native',
});

describe('NoteSnapshotService', () => {
  it('merges article metadata over global defaults and freezes the snapshot', async () => {
    const service = new NoteSnapshotService(
      new MemoryVault('# Heading\r\n\r\nBody\r\n'),
      new MemoryMetadata({
        title: 'Frontmatter title',
        digest: 'Short digest',
        cover: 'images/cover.png',
        content_source_url: 'https://example.test/article',
        nested: { keep: true },
      }),
      defaults,
    );

    const snapshot = await service.snapshot(file);

    expect(snapshot.metadata).toEqual({
      title: 'Frontmatter title',
      author: 'Default author',
      digest: 'Short digest',
      cover: 'images/cover.png',
      contentSourceUrl: 'https://example.test/article',
    });
    expect(snapshot.markdown).toBe('# Heading\n\nBody\n');
    expect(snapshot.selectedThemeId).toBe('native');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.metadata)).toBe(true);
    expect(Object.isFrozen(snapshot.frontmatter)).toBe(true);
    expect(Object.isFrozen(snapshot.frontmatter.nested)).toBe(true);
  });

  it('normalizes line endings before calculating the source hash', async () => {
    const crlf = await new NoteSnapshotService(
      new MemoryVault('A\r\nB\r\n'),
      new MemoryMetadata({}),
      defaults,
    ).snapshot(file);
    const lf = await new NoteSnapshotService(
      new MemoryVault('A\nB\n'),
      new MemoryMetadata({}),
      defaults,
    ).snapshot(file);

    expect(crlf.sourceHash).toBe(lf.sourceHash);
    expect(crlf.sourceHash).toBe(createHash('sha256').update('A\nB\n').digest('hex'));
  });

  it('falls back to the filename and configured defaults', async () => {
    const snapshot = await new NoteSnapshotService(
      new MemoryVault('Body'),
      new MemoryMetadata({ 'wechat-theme-id': 'technical' }),
      defaults,
    ).snapshot(file);

    expect(snapshot.metadata).toEqual({
      title: 'article',
      author: 'Default author',
      digest: '',
      cover: null,
      contentSourceUrl: 'https://example.test/default',
    });
    expect(snapshot.selectedThemeId).toBe('technical');
  });

  it('removes only leading YAML frontmatter from the renderable markdown', async () => {
    const snapshot = await new NoteSnapshotService(
      new MemoryVault('---   \r\ntitle: Hidden metadata\r\n---  \r\n\r\n# Visible body\r\n\r\n---\r\n'),
      new MemoryMetadata({ title: 'Hidden metadata' }),
      defaults,
    ).snapshot(file);

    expect(snapshot.markdown).toBe('\n# Visible body\n\n---\n');
    expect(snapshot.sourceHash).toBe(createHash('sha256').update('\n# Visible body\n\n---\n').digest('hex'));
  });
});
