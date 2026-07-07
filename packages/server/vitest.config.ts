import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Test files share one real Postgres database with no per-test rollback. The auth
    // bootstrap test needs to briefly wipe the users table, which would race other files'
    // fixtures if they ran concurrently — keep file execution sequential.
    fileParallelism: false,
  },
})
