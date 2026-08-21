import type {
  FontFamilyId,
  FontSize,
  HeadingStyle,
  ImageCaptionMode,
} from '../domain/style';

export interface StyleOption<T extends string> {
  id: T;
  label: string;
  description: string;
}

export const STYLE_OPTIONS = Object.freeze({
  themes: Object.freeze([
    Object.freeze({ id: 'doocs-classic', label: '经典', description: '经典清晰的公众号排版。' }),
    Object.freeze({ id: 'doocs-grace', label: '优雅', description: '带有细腻层次和留白的排版。' }),
    Object.freeze({ id: 'doocs-simple', label: '简洁', description: '轻量现代的简洁排版。' }),
  ] satisfies readonly StyleOption<string>[]),
  fonts: Object.freeze([
    Object.freeze({ id: 'sans-serif' as FontFamilyId, label: '无衬线', description: '清晰现代。' }),
    Object.freeze({ id: 'serif' as FontFamilyId, label: '衬线', description: '更有阅读感。' }),
    Object.freeze({ id: 'monospace' as FontFamilyId, label: '等宽', description: '适合技术内容。' }),
  ] satisfies readonly StyleOption<FontFamilyId>[]),
  fontSizes: Object.freeze([14, 15, 16, 17, 18] as const),
  colors: Object.freeze([
    Object.freeze({ id: '#0F4C81', label: '经典蓝', description: '稳重冷静。' }),
    Object.freeze({ id: '#009874', label: '翡翠绿', description: '自然平衡。' }),
    Object.freeze({ id: '#FA5151', label: '活力橘', description: '热情活力。' }),
    Object.freeze({ id: '#FECE00', label: '柠檬黄', description: '明亮温暖。' }),
    Object.freeze({ id: '#92617E', label: '薰衣紫', description: '优雅神秘。' }),
    Object.freeze({ id: '#55C9EA', label: '天空蓝', description: '清爽自由。' }),
    Object.freeze({ id: '#B76E79', label: '玫瑰金', description: '奢华现代。' }),
    Object.freeze({ id: '#556B2F', label: '橄榄绿', description: '沉稳自然。' }),
    Object.freeze({ id: '#333333', label: '石墨黑', description: '内敛极简。' }),
    Object.freeze({ id: '#A9A9A9', label: '雾烟灰', description: '柔和低调。' }),
    Object.freeze({ id: '#FFB7C5', label: '樱花粉', description: '浪漫甜美。' }),
  ]),
  headingStyles: Object.freeze([
    Object.freeze({ id: 'default' as HeadingStyle, label: '默认', description: '使用主题默认标题。' }),
    Object.freeze({ id: 'color-only' as HeadingStyle, label: '主题色文字', description: '只使用主题色。' }),
    Object.freeze({ id: 'border-bottom' as HeadingStyle, label: '下边框', description: '主题色下边框。' }),
    Object.freeze({ id: 'border-left' as HeadingStyle, label: '左边框', description: '主题色左边框。' }),
  ] satisfies readonly StyleOption<HeadingStyle>[]),
  captionModes: Object.freeze([
    Object.freeze({ id: 'title-alt' as ImageCaptionMode, label: 'title 优先', description: '优先显示 title。' }),
    Object.freeze({ id: 'alt-title' as ImageCaptionMode, label: 'alt 优先', description: '优先显示 alt。' }),
    Object.freeze({ id: 'title' as ImageCaptionMode, label: '仅 title', description: '只显示 title。' }),
    Object.freeze({ id: 'alt' as ImageCaptionMode, label: '仅 alt', description: '只显示 alt。' }),
    Object.freeze({ id: 'filename' as ImageCaptionMode, label: '文件名', description: '显示图片文件名。' }),
    Object.freeze({ id: 'none' as ImageCaptionMode, label: '不显示', description: '隐藏图注。' }),
  ] satisfies readonly StyleOption<ImageCaptionMode>[]),
});
