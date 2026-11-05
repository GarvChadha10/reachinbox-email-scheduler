import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const backend = process.env.VITE_BACKEND_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin /api in dev: the httpOnly session cookie just works and CORS stays simple.
    proxy: {
      '/api': { target: backend, changeOrigin: false },
      // Bull Board (HTTP Basic auth) is served by the API process.
      '/admin': { target: backend, changeOrigin: false },
    },
  },
});
