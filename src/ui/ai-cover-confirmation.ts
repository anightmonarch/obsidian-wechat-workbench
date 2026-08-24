import { type App, Modal } from 'obsidian';

import type { AiProviderProtocol } from '../cover/ai-provider';

export interface AiCoverSource {
  title: string;
  digest: string;
  supplementalPrompt?: string;
}

export interface AiCoverProviderSettings {
  imageApiProtocol: AiProviderProtocol;
  imageApiEndpoint: string;
  imageApiModel: string;
}

export interface AiCoverDisclosure {
  protocol: string;
  endpoint: string;
  model: string;
  sentFields: readonly string[];
  payload: Readonly<{ title: string; digest: string; supplementalPrompt: string }>;
  costNotice: string;
}

function supplemental(value: string | undefined): string {
  const sanitized = [...(value ?? '')].map(character => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 8 || code === 11 || code === 12 || code >= 14 && code <= 31 || code === 127
      ? ' '
      : character;
  }).join('').trim();
  return [...sanitized].slice(0, 500).join('');
}

export function buildAiCoverDisclosure(
  source: Readonly<AiCoverSource>,
  settings: Readonly<AiCoverProviderSettings>,
): Readonly<AiCoverDisclosure> {
  const supplementalPrompt = supplemental(source.supplementalPrompt);
  return Object.freeze({
    protocol: settings.imageApiProtocol === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容',
    endpoint: settings.imageApiEndpoint.trim(),
    model: settings.imageApiModel.trim(),
    sentFields: Object.freeze([
      'title', 'digest',
      ...(supplementalPrompt.length > 0 ? ['supplementalPrompt'] : []),
    ]),
    payload: Object.freeze({
      title: source.title,
      digest: source.digest,
      supplementalPrompt,
    }),
    costNotice: '此次请求将发送给第三方图片服务，可能产生第三方费用。',
  });
}

export class AiCoverConfirmationModal extends Modal {
  private decided = false;

  constructor(
    app: App,
    private readonly disclosure: Readonly<AiCoverDisclosure>,
    private readonly confirm: (supplementalPrompt: string) => void,
    private readonly cancel: () => void = () => undefined,
  ) { super(app); }

  onOpen(): void {
    this.contentEl.replaceChildren();
    this.titleEl.textContent = '确认生成智能封面';
    const rows: Array<[string, string]> = [
      ['接口协议', this.disclosure.protocol],
      ['接口地址', this.disclosure.endpoint],
      ['模型', this.disclosure.model],
      ['标题', this.disclosure.payload.title],
      ['摘要', this.disclosure.payload.digest || '空'],
    ];
    for (const [label, value] of rows) {
      const row = createEl('p');
      row.append(createEl('strong', { text: `${label}：` }), document.createTextNode(value));
      this.contentEl.append(row);
    }
    const promptLabel = createEl('label', { text: '补充封面要求（可选）' });
    promptLabel.className = 'wechat-workbench__cover-prompt-label';
    const prompt = createEl('textarea');
    prompt.dataset.testid = 'ai-cover-supplemental-prompt';
    prompt.placeholder = '例如：科技感、极简、暖色调；留空则完全依据文章内容生成';
    prompt.maxLength = 500;
    prompt.value = this.disclosure.payload.supplementalPrompt;
    promptLabel.append(prompt);
    this.contentEl.append(promptLabel);
    this.contentEl.append(createEl('p', {
      cls: 'wechat-workbench__publish-warning',
      text: this.disclosure.costNotice,
    }));
    const actions = createDiv('modal-button-container');
    const cancel = createEl('button', { text: '取消' });
    cancel.addEventListener('click', () => {
      this.decided = true;
      this.cancel();
      this.close();
    });
    const generate = createEl('button', { cls: 'mod-cta', text: '确认并生成' });
    generate.addEventListener('click', () => {
      this.decided = true;
      this.close();
      this.confirm(supplemental(prompt.value));
    });
    actions.append(cancel, generate);
    this.contentEl.append(actions);
  }

  onClose(): void {
    if (this.decided) return;
    this.decided = true;
    this.cancel();
  }
}
