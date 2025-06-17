const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8080; // Single port for everything

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Proxy configuration for different services
const proxyOptions = {
  changeOrigin: true,
  timeout: 30000,
  proxyTimeout: 30000,
  onError: (err, req, res) => {
    console.error('Proxy Error:', err.message);
    res.status(500).json({ error: 'Proxy Error', message: err.message });
  },
  onProxyRes: (proxyRes, req, res) => {
    // Handle CORS headers from proxied responses
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
  }
};

// API Routes - Route to appropriate backend services
app.use('/api/rag', createProxyMiddleware({
  ...proxyOptions,
  target: 'http://localhost:3001',
  pathRewrite: {
    '^/api/rag': ''
  }
}));

app.use('/api/image', createProxyMiddleware({
  ...proxyOptions,
  target: 'http://localhost:3002',
  pathRewrite: {
    '^/api/image': ''
  }
}));

// Main server routes (webhooks, main API) - server.js runs on 3000
app.use('/api', createProxyMiddleware({
  ...proxyOptions,
  target: 'http://localhost:3000',
  pathRewrite: {
    '^/api': ''
  }
}));

// SSE events route
app.use('/events', createProxyMiddleware({
  ...proxyOptions,
  target: 'http://localhost:3000',
  ws: true
}));

// Webhook routes (keep these direct to main server)
app.use('/webhook', createProxyMiddleware({
  ...proxyOptions,
  target: 'http://localhost:3000'
}));

app.use('/facebook', createProxyMiddleware({
  ...proxyOptions,
  target: 'http://localhost:3000'
}));

app.use('/twitter', createProxyMiddleware({
  ...proxyOptions,
  target: 'http://localhost:3000'
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    proxy: 'reverse-proxy running',
    port: PORT
  });
});

// Serve static files from dist directory if built
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  console.log('Serving built frontend from dist/');
  app.use(express.static(distPath));
  
  // Handle client-side routing - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/webhook') && !req.path.startsWith('/events')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
} else {
  console.log('No dist folder found. Proxying to Vite dev server on port 5173');
  
  // Proxy to Vite dev server for frontend
  app.use('/', createProxyMiddleware({
    ...proxyOptions,
    target: 'http://localhost:5173',
    ws: true // Support for Vite HMR
  }));
}

// Start the proxy server
app.listen(PORT, () => {
  console.log(`🚀 Reverse Proxy Server running on port ${PORT}`);
  console.log(`📡 Access your application at: http://localhost:${PORT}`);
  console.log('');
  console.log('🔀 Proxy Routes:');
  console.log('   Frontend: / -> localhost:5173 (or dist/ if built)');
  console.log('   Main API: /api/* -> localhost:3002');
  console.log('   RAG API: /api/rag/* -> localhost:3001');
  console.log('   Image API: /api/image/* -> localhost:3002');
  console.log('   Webhooks: /webhook/* -> localhost:3002');
  console.log('   Events: /events/* -> localhost:3002');
  console.log('');
  console.log('💡 Run ngrok on this port to expose everything through one URL');
  console.log(`   Command: ngrok http ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down reverse proxy server...');
  process.exit(0);
}); 