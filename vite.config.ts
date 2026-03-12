import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'stores/index': resolve(__dirname, 'src/stores/index.ts'),
        'utils/index': resolve(__dirname, 'src/utils/index.ts'),
        'types/index': resolve(__dirname, 'src/types/index.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'zustand',
        'zustand/middleware',
        '@xyflow/react',
      ],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
