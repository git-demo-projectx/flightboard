/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.API_URL ?? 'http://127.0.0.1:8781'
const payTarget = process.env.PAY_URL ?? 'http://127.0.0.1:8782'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5781,
    proxy: {
      '/api': apiTarget,
      '/pay': { target: payTarget, rewrite: (path) => path.replace(/^\/pay/, '') },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // PayRunPage tests render 100+ work orders and need more than the 5 s default on CI runners.
    testTimeout: 20_000,
    // CI uploads coverage/lcov.info to SonarQube Cloud (npm run test:coverage).
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/**/*.d.ts'],
    },
  },
})
