import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['TESTS/unit/setup.ts'],
    include: ['TESTS/unit/**/*.spec.ts']
  }
});
