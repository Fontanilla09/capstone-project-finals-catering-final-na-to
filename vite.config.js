import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['slacker-denial-cure.ngrok-free.dev'],
    proxy: {
      '/backend': {
        target: 'http://localhost',
        changeOrigin: true,
        rewrite: (path) => `/capstone-project-finals-catering${path}`,
      },
      '/capstone-project-finals-catering/backend': {
        target: 'http://localhost',
        changeOrigin: true,
      },
    },
  },
});