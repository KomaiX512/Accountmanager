import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0', // Allow external connections
    proxy: {
      // User connection and status endpoints (port 3000) - strip /api prefix
      '/api/user-instagram-status': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/user-twitter-status': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/user-facebook-status': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/instagram-connection': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/twitter-connection': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/facebook-connection': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Events endpoints (port 3000) - no /api prefix needed
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
      // Image endpoints (port 3002) - MUST come before general /api rule
      '/api/r2-image': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/fix-image': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      // User endpoints (port 3002) - keep /api prefix
      '/api/user': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/api/access-check': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/api/usage': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/api/insights': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/profit-analysis': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/ai-replies': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/api/rag-instant-reply': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
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
      '/api/rag/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace('/api/rag', ''),
      },
      // All other /api endpoints go to main server (port 3000) - strip /api prefix
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Image and file endpoints (port 3002)
      '/retrieve': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/posts': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/images': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
    },
    hmr: {
      clientPort: 443 // Force HMR through HTTPS
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
});