import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['sqlocal'],
  },
  server: {
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      // 'credentialless' allows cross-origin resources (Clerk, etc.) to load
      // while still enabling SharedArrayBuffer/OPFS
      // 'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    proxy: {
      // Nhost local functions run behind traefik on port 443 (HTTPS).
      // local.functions.local.nhost.run is a wildcard DNS → 127.0.0.1:443
      // Proxying server-side bypasses browser CORS entirely.
      '/nhost-fn': {
        target: 'https://local.functions.local.nhost.run',
        changeOrigin: true,
        secure: false, // self-signed cert in local dev
        rewrite: (path) => path.replace(/^\/nhost-fn/, '/v1'),
      },
      '/api/auth/callback/github': {
        target: 'https://local.functions.local.nhost.run',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/auth\/callback\/github/, '/v1/github/callback'),
      },
    },
  },
});
