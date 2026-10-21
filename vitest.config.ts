import { defineConfig } from 'vitest/config'

// Plain Node tests (no Cloudflare plugin): the Worker's pure parts and the site's helpers
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
})
