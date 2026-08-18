import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL('./tests/mocks/obsidian.ts', import.meta.url)),
      electron: fileURLToPath(new URL('./tests/mocks/electron.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    clearMocks: true,
    restoreMocks: true,
    include: ['tests/**/*.test.ts'],
  },
});
