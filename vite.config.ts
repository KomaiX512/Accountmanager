import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/events': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        ws: true, // Support WebSocket-like connections (SSE)
      },
    },
  },
});