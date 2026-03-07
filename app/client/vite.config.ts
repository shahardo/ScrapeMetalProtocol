/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Three.js is large; pre-bundling it speeds up dev server cold starts
    include: ['three'],
  },
  server: {
    port: 5173,
  },
  test: {
    // Node environment — our tests cover pure functions and Zustand stores,
    // not DOM rendering, so we don't need jsdom/happy-dom overhead.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
