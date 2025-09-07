const { defineConfig } = require('vite')
const react = require('@vitejs/plugin-react-swc')

// https://vitejs.dev/config/
module.exports = defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.ngrok-free.app', // Allow all ngrok-free.app subdomains
      '78291997257a.ngrok-free.app' // Specific ngrok host
    ],
    proxy: {
      // Proxy posts endpoint to the PROXY server (port 3002) where extension detection works
      '/posts': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
        onError: (err, req, res) => {
          console.warn('[Vite Proxy] Posts endpoint error:', err.message);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
        }
      },
      // Proxy health check to the proxy server to check the correct service
      '/health': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
        onError: (err, req, res) => {
          console.warn('[Vite Proxy] Health check error:', err.message);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Health check service temporarily unavailable' }));
        }
      },
      // Proxy R2 image endpoints to the proxy server (port 3002)
      '/api/r2-image': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
        onError: (err, req, res) => {
          console.warn('[Vite Proxy] R2 image endpoint error:', err.message);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Image service temporarily unavailable' }));
        }
      },
      // Proxy save-edited-post endpoint to the proxy server (port 3002)
      '/api/save-edited-post': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
        onError: (err, req, res) => {
          console.warn('[Vite Proxy] Save edited post endpoint error:', err.message);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Post saving service temporarily unavailable' }));
        }
      },
      // Proxy proxy-image endpoint to the main server (port 3000) where it's implemented
      '/api/proxy-image': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        onError: (err, req, res) => {
          console.warn('[Vite Proxy] Proxy image endpoint error:', err.message);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Image proxy service temporarily unavailable' }));
        }
      },
      // Proxy all other /api/* requests to the main server
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        onError: (err, req, res) => {
          console.warn('[Vite Proxy] API endpoint error:', err.message);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'API service temporarily unavailable' }));
        }
      },
      // Proxy webhook routes
      '/webhook': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        onError: (err, req, res) => {
          console.warn('[Vite Proxy] Webhook endpoint error:', err.message);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Webhook service temporarily unavailable' }));
        }
      },
      // Proxy events for SSE
      '/events': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        onError: (err, req, res) => {
          console.warn('[Vite Proxy] Events endpoint error:', err.message);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Events service temporarily unavailable' }));
        }
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Use Terser to drop console/debug statements in production builds
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      },
      mangle: true,
      format: {
        comments: false
      }
    },
    rollupOptions: {
      output: {
        // Add timestamp to asset names to force cache busting
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          return `assets/[name]-[hash]-${Date.now()}.${ext}`;
        },
        chunkFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
        entryFileNames: `assets/[name]-[hash]-${Date.now()}.js`
      }
    }
  },
  define: {
    // Expose environment variables to the client
    'process.env': {}
  }
})
