import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Relative base so the build works under https://<user>.github.io/visualizer/
export default defineConfig({
  base: './',
  build: {
    // three.js alone is ~550 kB; it is a single-purpose page.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        sales: resolve(import.meta.dirname, 'sales/index.html'),
        butterflies: resolve(import.meta.dirname, 'butterflies/index.html'),
      },
    },
  },
});
