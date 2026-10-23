// UI tests only: the engine tests stay on node:test (`npm test`), which needs no browser, no DOM and no Vite.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['ui-tests/**/*.test.tsx', 'ui-tests/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['ui-tests/setup.ts'],
    globals: false,
    restoreMocks: true,
  },
});
