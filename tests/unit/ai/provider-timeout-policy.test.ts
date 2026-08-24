import { describe, expect, it } from 'vitest';

import {
  IMAGE_PROVIDER_TIMEOUT_MS,
  TEXT_PROVIDER_TIMEOUT_MS,
} from '../../../src/ai/provider-timeout-policy';

describe('provider timeout policy', () => {
  it('allows image generation more time than text generation without extending text requests', () => {
    expect(TEXT_PROVIDER_TIMEOUT_MS).toBe(35_000);
    expect(IMAGE_PROVIDER_TIMEOUT_MS).toBe(90_000);
    expect(IMAGE_PROVIDER_TIMEOUT_MS).toBeGreaterThan(TEXT_PROVIDER_TIMEOUT_MS);
  });
});
