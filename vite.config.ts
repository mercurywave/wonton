import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/frontend',
  build: {
    outDir: '../../out',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/frontend/index.html',
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
