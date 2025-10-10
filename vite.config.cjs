import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  server: {
    // Allow local development via ngrok without hardcoding single subdomains.
    // Vite treats entries as hostnames; providing a parent domain allows any subdomain.
    // You can also extend via env: VITE_ALLOWED_HOSTS="foo.example.com,bar.example.com"
    allowedHosts: [
      // Local
      'localhost',
      '127.0.0.1',
      // Any subdomain of ngrok (v2 and v3 domains)
      /.+\.ngrok-free\.app$/,
      /.+\.ngrok\.app$/,
      // Optional additional hosts via env
      ...(process.env.VITE_ALLOWED_HOSTS
        ? process.env.VITE_ALLOWED_HOSTS.split(',').map((s) => s.trim()).filter(Boolean)
        : [])
    ],
    // Optional HMR tweaks for ngrok: set NGROK_HOST to your public domain (e.g. abc.ngrok-free.app)
    // and HMR will connect over wss:443 which fixes websocket upgrade issues behind HTTPS tunnels.
    hmr: process.env.NGROK_HOST
      ? {
          host: process.env.NGROK_HOST,
          protocol: 'wss',
          clientPort: 443,
        }
      : undefined,
    proxy: {
      // Image endpoints live on proxy server (3002)
      '/api/r2-image': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
        timeout: 120000,
        proxyTimeout: 120000,
      },
      '/api/avatar': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        timeout: 120000,
        proxyTimeout: 120000,
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
        proxyTimeout: 180000, // 180 second proxy timeout for long AI operations
        timeout: 180000, // 180 second socket timeout
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log(`[VITE PROXY] ${req.method} ${req.url} → http://localhost:3000${req.url}`);
            // Set socket timeouts to prevent premature closure
            if (req.socket) {
              req.socket.setTimeout(180000); // 180 seconds
              req.socket.setKeepAlive(true, 60000); // Keep alive every 60s
            }
            // CRITICAL: Set timeout on OUTGOING proxy request socket to backend
            if (proxyReq.socket) {
              proxyReq.socket.setTimeout(180000); // 180 seconds for long AI operations
              proxyReq.socket.setKeepAlive(true, 60000);
            }
            // Handle socket assignment event (socket might not be available immediately)
            proxyReq.on('socket', (socket) => {
              socket.setTimeout(180000); // 180 seconds for long AI operations
              socket.setKeepAlive(true, 60000);
            });
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            // Set response socket timeout
            if (proxyRes.socket) {
              proxyRes.socket.setTimeout(180000); // 180 seconds
            }
          });
        }
      },
      // Proxy posts endpoint (used by PostCooked component)
      '/posts': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        timeout: 120000,
        proxyTimeout: 120000,
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
