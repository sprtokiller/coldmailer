// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {},
  server: {
    allowedHosts: ['coldmailer.scg.cz'],
  },
})
