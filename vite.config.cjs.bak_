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
    headers: {
      'Cache-Control': 'no-cache',
    },
    middlewareMode: false,
    proxy: {
      // Proxy posts endpoint to the MAIN server (port 3000) where it works correctly
      '/api/posts': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        onError: (err, req, res) => {
          console.warn('[Vite Proxy] Posts endpoint error:', err.message);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Posts service temporarily unavailable' }));
        }
      },
      // Proxy NON-API endpoints that were missing (like retrieve-strategies, retrieve, campaign-status, etc.)
      '/retrieve-strategies': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/retrieve-strategies/, '/api/retrieve-strategies')
      },
      '/retrieve': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/retrieve/, '/api/retrieve')
      },
      '/campaign-status': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/campaign-status/, '/api/campaign-status')
      },
      '/instagram-token-check': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        // Server route is '/instagram-token-check/:graphId' (no /api prefix)
        // Do not rewrite to /api/* or it will 404 locally
        rewrite: (path) => path
      },
      '/posts': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/posts/, '/api/posts')
      },
      // Notifications and related actions used by dashboards without /api prefix
      '/events-list': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false
      },
      '/send-dm-reply': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false
      },
      '/send-comment-reply': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false
      },
      '/mark-notification-handled': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false
      },
      '/ignore-notification': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false
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
    target: 'es2020', // Modern browsers for better performance
    sourcemap: false, // Disable sourcemaps in production for smaller files
    minify: 'terser', // Use terser for better compression
    // Aggressive unused code elimination
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
        unused: true,
        dead_code: true, // Remove dead code
        side_effects: false, // Assume no side effects for better tree-shaking
        passes: 3 // Multiple passes for better optimization
      },
      mangle: {
        safari10: true,
        toplevel: true // Mangle top-level names for smaller bundles
      },
      format: {
        comments: false
      }
    },
    chunkSizeWarningLimit: 1000, // Increase limit but still warn for huge chunks
    rollupOptions: {
      // Balanced tree-shaking - preserve functionality
      treeshake: {
        preset: 'recommended',
        manualPureFunctions: ['console.log', 'console.warn', 'console.error']
      },
      output: {
        // Fixed chunking order - React must load first
        manualChunks(id) {
          // ULTRA-AGGRESSIVE SPLITTING - Target <500KB main bundle
          
          // Only absolute React essentials in main bundle
          if (id.includes('react-dom/client')) {
            return 'react-dom-client';
          }
          
          if (id.includes('react-dom') && !id.includes('client')) {
            return 'react-dom';
          }
          
          if (id.includes('react/jsx-runtime')) {
            return 'jsx-runtime';
          }
          
          // React core - minimal
          if (id.includes('react') && !id.includes('react-router') && !id.includes('react-dom') && !id.includes('jsx-runtime')) {
            return 'react';
          }
          
          // Defer ALL routing
          if (id.includes('react-router')) {
            return 'router';
          }
          
          // Context providers - separate chunk
          if (id.includes('/context/') || id.includes('Context.tsx')) {
            return 'contexts';
          }
          
          // Heavy component chunks - defer all
          if (id.includes('/components/dashboard/') || id.includes('PlatformDashboard')) {
            return 'dashboard-components';
          }
          
          if (id.includes('/components/instagram/') && !id.includes('InstagramConnect')) {
            return 'instagram-components';
          }
          
          if (id.includes('/components/twitter/') && !id.includes('TwitterConnect')) {
            return 'twitter-components';
          }
          
          if (id.includes('/components/facebook/') && !id.includes('FacebookConnect')) {
            return 'facebook-components';
          }
          
          // Services - separate
          if (id.includes('/services/') || id.includes('Service.ts')) {
            return 'services';
          }
          
          // Utils - separate  
          if (id.includes('/utils/') && !id.includes('navigationGuard')) {
            return 'utils';
          }
          
          // Firebase - defer completely
          if (id.includes('firebase') || id.includes('@firebase')) {
            return 'firebase';
          }
          
          // TUI Editor - massive, defer
          if (id.includes('tui-image-editor') || id.includes('@toast-ui')) {
            return 'tui-editor';
          }
          
          // Animations - defer
          if (id.includes('framer-motion') || id.includes('motion')) {
            return 'animations';
          }
          
          // Icons - defer
          if (id.includes('react-icons') || id.includes('/icons')) {
            return 'icons';
          }
          
          // MUI - defer
          if (id.includes('@mui') || id.includes('material-ui')) {
            return 'mui';
          }
          
          // Axios
          if (id.includes('axios')) {
            return 'http';
          }
          
          // Langchain - defer
          if (id.includes('langchain') || id.includes('@langchain')) {
            return 'ai';
          }
          
          // Helmet/SEO
          if (id.includes('helmet') || id.includes('seo')) {
            return 'seo';
          }
          
          // All other vendor
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          
          return null;
        },
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
