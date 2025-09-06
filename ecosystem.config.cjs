module.exports = {
  apps: [
    {
      name: 'main-api',
      script: 'server/server.js',
      instances: parseInt(process.env.MAIN_INSTANCES || '3', 10),
      exec_mode: 'cluster',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_memory_restart: '512M',
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
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'rag-server',
      script: 'rag-server.js',
      instances: parseInt(process.env.RAG_INSTANCES || '1', 10),
      exec_mode: 'cluster',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_memory_restart: '512M',
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
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'proxy-server',
      script: 'server.js',
      instances: parseInt(process.env.PROXY_INSTANCES || '2', 10),
      exec_mode: 'cluster',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_memory_restart: '512M',
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
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
