import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    allowedHosts: ['slacker-denial-cure.ngrok-free.dev'],
    proxy: {
      '/backend': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});