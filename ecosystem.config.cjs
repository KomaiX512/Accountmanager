// UNIFIED ECOSYSTEM CONFIG - PRODUCTION GRADE
// Single instance servers for maximum stability and resource control
module.exports = {
  apps: [
    {
      name: 'main-api-unified',
      script: 'server.js',
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
        MAIN_SERVER_PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        MAIN_SERVER_PORT: 3000
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
        RAG_SERVER_PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        RAG_SERVER_PORT: 3001
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
        PROXY_SERVER_PORT: 3002
      },
      env_production: {
        NODE_ENV: 'production',
        PROXY_SERVER_PORT: 3002
      },
      out_file: './logs/proxy-server.out.log',
      error_file: './logs/proxy-server.err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
