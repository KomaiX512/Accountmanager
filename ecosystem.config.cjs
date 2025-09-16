// UNIFIED ECOSYSTEM CONFIG - PRODUCTION GRADE
// Single instance servers for maximum stability and resource control
module.exports = {
  apps: [
    {
      name: 'main-api-unified',
      script: 'server/server.js',
      instances: 1,  // UNIFIED: Single instance
      exec_mode: 'fork',  // Fork mode for better stability
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_memory_restart: '1G',  // Higher limit for main server
      restart_delay: 5000,  // 5 second delay before restart
      max_restarts: 10,     // Limit restarts to prevent crash loops
      min_uptime: '10s',    // Minimum uptime before considering stable
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        MAIN_SERVER_PORT: 3000,
        SERVER_TYPE: 'main',
        REDIS_URL: 'redis://127.0.0.1:6379',
        VPS_MODE: 'true'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        MAIN_SERVER_PORT: 3000,
        SERVER_TYPE: 'main',
        REDIS_URL: 'redis://127.0.0.1:6379',
        VPS_MODE: 'true'
      },
      out_file: './logs/main-api.out.log',
      error_file: './logs/main-api.err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'rag-server-unified',
      script: 'rag-server.js',
      instances: 1,  // UNIFIED: Single instance
      exec_mode: 'fork',  // Fork mode for better stability
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_memory_restart: '512M',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        RAG_SERVER_PORT: 3001,
        SERVER_TYPE: 'rag',
        REDIS_URL: 'redis://127.0.0.1:6379/1',
        VPS_MODE: 'true'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        RAG_SERVER_PORT: 3001,
        SERVER_TYPE: 'rag',
        REDIS_URL: 'redis://127.0.0.1:6379/1',
        VPS_MODE: 'true'
      },
      out_file: './logs/rag-server.out.log',
      error_file: './logs/rag-server.err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'proxy-server-unified',
      script: 'server.js',
      instances: 1,  // UNIFIED: Single instance
      exec_mode: 'fork',  // Fork mode for better stability
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_memory_restart: '512M',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        PROXY_SERVER_PORT: 3002,
        SERVER_TYPE: 'proxy',
        REDIS_URL: 'redis://127.0.0.1:6379/2',
        VPS_MODE: 'true'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002,
        PROXY_SERVER_PORT: 3002,
        SERVER_TYPE: 'proxy',
        REDIS_URL: 'redis://127.0.0.1:6379/2',
        VPS_MODE: 'true'
      },
      out_file: './logs/proxy-server.out.log',
      error_file: './logs/proxy-server.err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
