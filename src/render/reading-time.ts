export interface ReadingTimeResult {
  text: string;
  time: number;
  words: number;
  minutes: number;
}

const WORDS_PER_MINUTE = 200;
const CJK_RANGES: readonly (readonly [number, number])[] = [
  [0x3040, 0x309F],
  [0x4E00, 0x9FFF],
  [0xAC00, 0xD7A3],
  [0x20000, 0x2EBE0],
];
const PUNCTUATION_RANGES: readonly (readonly [number, number])[] = [
  [0x21, 0x2F],
  [0x3A, 0x40],
  [0x5B, 0x60],
  [0x7B, 0x7E],
  [0x3000, 0x303F],
  [0xFF00, 0xFFEF],
];

// Adapted from Doocs md/packages/shared/src/utils/readingTime.ts at commit
// 03b4b78f0a218d1a5916f8aa8afe9d4f9048e281. The local implementation avoids
// importing the Doocs editor runtime into the Obsidian plugin.
function inRanges(char: string | undefined, ranges: readonly (readonly [number, number])[]): boolean {
  if (typeof char !== 'string') return false;
  const code = char.charCodeAt(0);
  return ranges.some(([start, end]) => start <= code && code <= end);
}

function isWordBoundary(char: string | undefined): boolean {
  return typeof char === 'string' && ` \n\r\t`.includes(char);
}

function isPunctuation(char: string | undefined): boolean {
  return inRanges(char, PUNCTUATION_RANGES);
}

export function readingTime(
  text: string,
  wordsPerMinute = WORDS_PER_MINUTE,
): Readonly<ReadingTimeResult> {
  let words = 0;
  let start = 0;
  let end = text.length - 1;
  while (isWordBoundary(text[start])) start += 1;
  while (isWordBoundary(text[end])) end -= 1;

  const normalizedText = `${text}\n`;
  for (let index = start; index <= end; index += 1) {
    const current = normalizedText[index];
    const next = normalizedText[index + 1];
    if (inRanges(current, CJK_RANGES)
      || (!isWordBoundary(current) && (isWordBoundary(next) || inRanges(next, CJK_RANGES)))) {
      words += 1;
    }

    if (inRanges(current, CJK_RANGES)) {
      while (
        index <= end
        && (isPunctuation(normalizedText[index + 1]) || isWordBoundary(normalizedText[index + 1]))
      ) {
        index += 1;
      }
    }
  }

  const minutes = words / (wordsPerMinute || WORDS_PER_MINUTE);
  return Object.freeze({
    text: `${Math.ceil(Number(minutes.toFixed(2)))} min read`,
    time: Math.round(minutes * 60 * 1000),
    words,
    minutes,
  });
}
