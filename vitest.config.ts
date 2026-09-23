import { defineConfig } from 'vitest/config';
// CI runners are several times slower than a laptop when every file runs in parallel; the migration
// and concurrency tests build whole databases, so give each test 30 s instead of the 5 s default.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30000, hookTimeout: 30000 },
});
