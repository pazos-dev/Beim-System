import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        // Bundle workspace TS packages (raw .ts source) into the main bundle;
        // keep @prisma/client and other node_modules external.
        exclude: ['@beim/data', '@beim/contracts'],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['electron'],
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
      },
    },
    plugins: [react()],
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
  },
});
