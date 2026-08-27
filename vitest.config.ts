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
    setupFiles: ['tests/setup/obsidian-dom.ts'],
    clearMocks: true,
    restoreMocks: true,
    // jsdom + KaTeX/Mermaid workers are memory-heavy. Serial file execution
    // keeps clean-install verification deterministic on ordinary laptops.
    fileParallelism: false,
    include: ['tests/**/*.test.ts'],
  },
});
