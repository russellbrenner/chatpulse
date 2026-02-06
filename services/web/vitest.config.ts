import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@server': resolve(__dirname, 'src/server'),
      '@client': resolve(__dirname, 'src/client'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/server/**/*.ts'],
      exclude: ['src/server/types/**', 'src/server/__tests__/**'],
    },
  },
});
