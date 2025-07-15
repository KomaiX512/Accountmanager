import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Fix for "process is not defined" error
    'process.env': {
      REACT_APP_API_URL: '/api',
          NODE_ENV: process.env.NODE_ENV
        },
  },
  server: {
    port: 5173,
    host: '0.0.0.0', // Allow external connections
    // Optimize file watching to prevent EMFILE errors
    watch: {
      usePolling: false,
      interval: 1000,
      // Exclude unnecessary directories from watching
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        '**/logs/**',
        '**/temp-images/**',
        '**/image_cache/**',
        '**/local_storage/**',
        '**/test-output/**',
        '**/test_data/**',
        '**/*.log',
        '**/*.pid',
        '**/chroma.log',
        '**/server.log',
        '**/frontend.log',
        '**/backend.log',
        '**/rag-server.log',
        '**/main-server.log'
      ]
    },
    proxy: {
      // RAG server endpoints (port 3001) - MUST come before general /api rule
      '/api/rag/post-generator': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace('/api/rag', '/api'),
      },
      '/api/rag/discussion': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace('/api/rag', '/api'),
      },
      '/api/rag/conversations': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace('/api/rag', '/api'),
      },
      // Direct discussion endpoint (also needs to go to RAG server)
      '/api/discussion': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // Direct conversations endpoint (also needs to go to RAG server)
      '/api/conversations': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // Direct post-generator endpoint (also needs to go to RAG server)
      '/api/post-generator': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/rag/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace('/api/rag', ''),
      },
      // Image endpoints (port 3000) - MUST come before general /api rule  
      '/api/r2-image': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      // User endpoints (port 3000) - Main server contains user management
      '/api/user': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/api/access-check': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/api/usage': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        // Preserve /api prefix so backend route '/api/user/:userId/usage' matches
        // No rewrite here
      },
      '/api/instant-reply': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/rag-instant-reply': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/rag-instant-reply': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      // Connection status endpoints (port 3000) - Main server contains these endpoints
      '/api/user-instagram-status': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        // Preserve /api prefix so backend route '/api/user-instagram-status/:userId' matches
        // No rewrite here
      },
      '/api/user-facebook-status': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        // Preserve /api prefix so backend route '/api/user-facebook-status/:userId' matches
        // No rewrite here
      },
      '/api/user-twitter-status': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        // Preserve /api prefix so backend route '/api/user-twitter-status/:userId' matches
        // No rewrite here
      },
      '/api/instagram-connection': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        // Preserve /api prefix so backend route '/api/instagram-connection/:userId' matches
        // No rewrite here
      },
      '/api/twitter-connection': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        // Preserve /api prefix so backend route '/api/twitter-connection/:userId' matches
        // No rewrite here
      },
      '/api/facebook-connection': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        // Preserve /api prefix so backend route '/api/facebook-connection/:userId' matches
        // No rewrite here
      },
      // Post-now endpoint (port 3000) - critical for PostNow functionality
      '/api/post-instagram-now': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        // Preserve /api prefix so backend route '/api/post-instagram-now' matches
        // No rewrite here
      },
      // Schedule-post endpoint (port 3000) - critical for scheduling functionality
      '/api/schedule-post': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        // Preserve /api prefix so backend route '/api/schedule-post' matches
        // No rewrite here
      },
      // Account info endpoints (port 3000)
      '/api/save-account-info': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/retrieve-account-info': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // All other /api endpoints go to main server (port 3000) - strip /api prefix
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Events endpoints (port 3000)
      '/events': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        ws: true, // Support WebSocket-like connections (SSE)
      },
      '/events-list': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      // Direct pass-through endpoints
      '/retrieve-strategies': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/retrieve-engagement-strategies': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/retrieve': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/posts': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/images': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/profit-analysis': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/ai-replies': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/fix-image': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      // Twitter OAuth endpoints (port 3000)
      '/twitter/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/twitter/callback': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/api/twitter/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/api/twitter/callback': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
    hmr: {
      // Using the same port as the Vite server
      clientPort: 5173,
      host: 'localhost'
    },
    // Allow ngrok domain
    strictPort: true,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.ngrok-free.app',
      '.ngrok.io'
    ]
  },
  // Optimize build and development performance
  optimizeDeps: {
    include: ['react', 'react-dom']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React libraries
          'react-vendor': ['react', 'react-dom'],
          
          // UI libraries
          'mui-vendor': ['@mui/material', '@mui/icons-material', '@mui/x-date-pickers'],
          
          // Utility libraries
          'utility-vendor': ['axios', 'date-fns', 'framer-motion'],
          
          // Chart and visualization
          'chart-vendor': ['chart.js', 'react-chartjs-2'],
          
          // Image and canvas libraries
          'canvas-vendor': ['konva', 'react-konva'],
          
          // Form and date libraries
          'form-vendor': ['react-hook-form', 'react-datepicker'],
          
          // Icon libraries
          'icon-vendor': ['react-icons'],
          
          // Three.js
          'three-vendor': ['three']
        }
      }
    },
    // Increase chunk size warning limit to 1MB
    chunkSizeWarningLimit: 1000,
    // Optimize for production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    // Enable source maps for debugging if needed
    sourcemap: false
  },
  // Reduce file system operations
  clearScreen: false,
  logLevel: 'warn'
});