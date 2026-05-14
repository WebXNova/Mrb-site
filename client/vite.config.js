import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@course-wizard-schema': path.resolve(process.cwd(), '../server/src/validators/courseWizard.schema.js'),
      '@': path.resolve(process.cwd(), './src'),
      '@components': path.resolve(process.cwd(), './src/components'),
      '@pages': path.resolve(process.cwd(), './src/pages'),
      '@styles': path.resolve(process.cwd(), './src/styles'),
      '@data': path.resolve(process.cwd(), './src/data'),
      '@assets': path.resolve(process.cwd(), './src/assets'),
    },
  },
  server: {
    port: 5173,
    open: true,
    fs: {
      allow: [path.resolve(process.cwd(), '..'), path.resolve(process.cwd(), '../server')],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
