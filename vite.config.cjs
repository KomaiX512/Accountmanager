import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Image endpoints live on proxy server (3002)
      '/api/r2-image': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
      },
      '/api/avatar': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
      },
      // Proxy-only health endpoint lives on proxy server (3002)
      '/api/proxy-health': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
      },
      // Proxy all other API calls to main backend
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log(`[VITE PROXY] ${req.method} ${req.url} → http://localhost:3000${req.url}`);
          });
        }
      },
      // Proxy posts endpoint (used by PostCooked component)
      '/posts': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path}`
      },
      // Proxy events endpoint for SSE
      '/events': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        ws: true // Enable WebSocket proxy for SSE
      }
    }
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      external: [],
      output: {
        manualChunks: (id) => {
          // Put all third-party deps into a single vendor chunk
          if (id.includes('node_modules/')) return 'vendor';
        }
      }
    }
  },
});
