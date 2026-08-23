import { describe, expect, it } from 'vitest';

import { readingTime } from '../../../src/render/reading-time';

describe('readingTime', () => {
  it.each([
    ['', { text: '0 min read', words: 0, minutes: 0, time: 0 }],
    ['hello world', { text: '1 min read', words: 2, minutes: 0.01, time: 600 }],
    ['你好，世界！', { text: '1 min read', words: 4, minutes: 0.02, time: 1200 }],
    ['Hello 微信 editor', { text: '1 min read', words: 4, minutes: 0.02, time: 1200 }],
  ])('matches the Doocs result for %j', (text, expected) => {
    expect(readingTime(text)).toEqual(expected);
  });

  it('uses a one-minute display for a non-empty short article', () => {
    const result = readingTime('一');

    expect(result.minutes).toBe(0.005);
    expect(result.text).toBe('1 min read');
    expect(Math.ceil(result.minutes)).toBe(1);
  });

  it('supports a caller-supplied words-per-minute value', () => {
    expect(readingTime('one two', 1)).toMatchObject({
      words: 2,
      minutes: 2,
      time: 120000,
      text: '2 min read',
    });
  });
});
