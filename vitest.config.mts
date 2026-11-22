import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/**/*.test.{ts,tsx}', 'licence-server/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000
  }
})
