import { describe, expect, it } from 'vitest';

import {
  IMAGE_PROVIDER_TIMEOUT_MS,
  TEXT_PROVIDER_TIMEOUT_MS,
} from '../../../src/ai/provider-timeout-policy';

describe('provider timeout policy', () => {
  it('covers observed text-provider latency without making it as long as image generation', () => {
    expect(TEXT_PROVIDER_TIMEOUT_MS).toBe(60_000);
    expect(IMAGE_PROVIDER_TIMEOUT_MS).toBe(120_000);
    expect(IMAGE_PROVIDER_TIMEOUT_MS).toBeGreaterThan(TEXT_PROVIDER_TIMEOUT_MS);
  });
});
