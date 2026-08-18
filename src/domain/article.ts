export interface ArticleMetadata {
  title: string;
  author: string;
  digest: string;
  cover: string | null;
  contentSourceUrl: string;
}

export interface NoteSnapshot {
  vaultPath: string;
  basename: string;
  modifiedAt: number;
  markdown: string;
  frontmatter: Readonly<Record<string, unknown>>;
  metadata: Readonly<ArticleMetadata>;
  selectedThemeId: string;
  sourceHash: string;
}
