import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  optimizeDeps: {
    // transformers.js ships its own workers/wasm; let it resolve at runtime.
    exclude: ['@huggingface/transformers'],
  },
  build: {
    target: 'es2022',
  },
})
