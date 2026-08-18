export interface WeChatDraftArticle {
  title: string;
  author: string;
  digest: string;
  html: string;
  contentSourceUrl: string;
  coverMediaId: string;
}

export interface DraftReceipt {
  mediaId: string;
  operation: 'CREATE' | 'UPDATE';
}

export interface RemoteDraft {
  mediaId: string;
  articles: readonly Readonly<Record<string, unknown>>[];
  updateTime: number;
}

export interface RemoteDraftPage {
  totalCount: number;
  itemCount: number;
  items: readonly RemoteDraft[];
}
