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
})
