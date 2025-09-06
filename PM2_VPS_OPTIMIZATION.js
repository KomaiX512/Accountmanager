// PM2 Ecosystem Configuration for 4 vCPU / 6GB RAM VPS
// Optimized for high concurrency and performance

module.exports = {
  apps: [
    {
      name: 'main-api',
      script: 'server.js',
      instances: 3, // Leave 1 CPU for NGINX + system
      exec_mode: 'cluster',
      max_memory_restart: '1200M', // Prevent memory leaks
      node_args: '--max-old-space-size=1024',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      // Performance monitoring
      min_uptime: '10s',
      max_restarts: 10,
      // Log management
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/main-api-error.log',
      out_file: './logs/main-api-out.log',
      log_file: './logs/main-api-combined.log'
    },
    {
      name: 'rag-server',
      script: 'rag-server.js',
      instances: 1, // RAG is CPU intensive, single instance
      exec_mode: 'fork',
      max_memory_restart: '1500M',
      node_args: '--max-old-space-size=1400',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      min_uptime: '10s',
      max_restarts: 5,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/rag-error.log',
      out_file: './logs/rag-out.log',
      log_file: './logs/rag-combined.log'
    },
    {
      name: 'proxy-server',
      script: 'server/apiconfig.cjs',
      instances: 1, // Lightweight proxy, single instance
      exec_mode: 'fork',  
      max_memory_restart: '800M',
      node_args: '--max-old-space-size=768',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      min_uptime: '10s',
      max_restarts: 10,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/proxy-error.log',
      out_file: './logs/proxy-out.log', 
      log_file: './logs/proxy-combined.log'
    }
  ]
};
