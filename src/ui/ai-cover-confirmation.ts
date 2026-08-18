import { type App, Modal } from 'obsidian';

export interface AiCoverSource {
  title: string;
  digest: string;
  plainText: string;
}

export interface AiCoverProviderSettings {
  imageApiBaseUrl: string;
  imageApiModel: string;
}

export interface AiCoverDisclosure {
  baseUrl: string;
  model: string;
  sentFields: readonly ['title', 'digest', 'bodyExcerpt'];
  payload: Readonly<{ title: string; digest: string; bodyExcerpt: string }>;
  costNotice: string;
}

function excerpt(value: string): string {
  const sanitized = [...value].map(character => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 8 || code === 11 || code === 12 || code >= 14 && code <= 31 || code === 127
      ? ' '
      : character;
  }).join('').trim();
  return [...sanitized]
    .slice(0, 1_500)
    .join('');
}

export function buildAiCoverDisclosure(
  source: Readonly<AiCoverSource>,
  settings: Readonly<AiCoverProviderSettings>,
): Readonly<AiCoverDisclosure> {
  return Object.freeze({
    baseUrl: settings.imageApiBaseUrl.trim(),
    model: settings.imageApiModel.trim(),
    sentFields: Object.freeze(['title', 'digest', 'bodyExcerpt'] as const),
    payload: Object.freeze({
      title: source.title,
      digest: source.digest,
      bodyExcerpt: excerpt(source.plainText),
    }),
    costNotice: '此次请求将发送给第三方图片服务，可能产生第三方费用。',
  });
}

export class AiCoverConfirmationModal extends Modal {
  constructor(
    app: App,
    private readonly disclosure: Readonly<AiCoverDisclosure>,
    private readonly confirm: () => void,
  ) { super(app); }

  onOpen(): void {
    this.contentEl.replaceChildren();
    this.titleEl.textContent = '确认生成智能封面';
    const rows: Array<[string, string]> = [
      ['服务地址', this.disclosure.baseUrl],
      ['模型', this.disclosure.model],
      ['标题', this.disclosure.payload.title],
      ['摘要', this.disclosure.payload.digest || '空'],
      ['正文摘录', this.disclosure.payload.bodyExcerpt],
    ];
    for (const [label, value] of rows) {
      const row = createEl('p');
      row.append(createEl('strong', { text: `${label}：` }), document.createTextNode(value));
      this.contentEl.append(row);
    }
    this.contentEl.append(createEl('p', {
      cls: 'wechat-workbench__publish-warning',
      text: this.disclosure.costNotice,
    }));
    const actions = createDiv('modal-button-container');
    const cancel = createEl('button', { text: '取消' });
    cancel.addEventListener('click', () => this.close());
    const generate = createEl('button', { cls: 'mod-cta', text: '确认并生成' });
    generate.addEventListener('click', () => { this.close(); this.confirm(); });
    actions.append(cancel, generate);
    this.contentEl.append(actions);
  }
}
