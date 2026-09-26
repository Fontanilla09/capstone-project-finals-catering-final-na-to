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
        target: 'http://localhost/capstone-project-finals-catering',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost/capstone-project-finals-catering',
        changeOrigin: true,
        rewrite: (path) => `/backend/upload_file.php?path=${encodeURIComponent(path.replace(/^\/uploads\/?/, ''))}`,
      },
      '/capstone-project-finals-catering/backend': {
        target: 'http://localhost/capstone-project-finals-catering',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/capstone-project-finals-catering/, ''),
      },
    },
  },
});