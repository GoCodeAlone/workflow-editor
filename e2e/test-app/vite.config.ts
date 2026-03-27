import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      // Import from library source directly
      '@workflow-editor': resolve(__dirname, '../../src'),
    },
  },
  server: {
    port: 5174,
  },
});
