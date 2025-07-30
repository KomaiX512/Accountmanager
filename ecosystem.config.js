module.exports = {
  apps: [
    {
      name: 'sentientm-main-server-dev',
      script: './server/server.js',
      cwd: '/home/komail/Accountmanager',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        MAIN_SERVER_PORT: 3000,
        HOST: 'localhost'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      min_uptime: '5s',
      max_restarts: 10,
      restart_delay: 2000,
      log_file: './logs/dev-main-server-combined.log',
      out_file: './logs/dev-main-server-out.log',
      error_file: './logs/dev-main-server-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 3000,
      listen_timeout: 8000,
      shutdown_with_message: true,
      env_file: '.env'
    },
    {
      name: 'sentientm-rag-server-dev',
      script: './rag-server.js',
      cwd: '/home/komail/Accountmanager',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--experimental-specifier-resolution=node',
      env: {
        NODE_ENV: 'development',
        RAG_SERVER_PORT: 3001,
        HOST: 'localhost',
        PATH: '/home/komail/.local/bin:/usr/local/bin:/usr/bin:/bin',
        PYTHONPATH: '/usr/lib/python3/dist-packages'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      min_uptime: '5s',
      max_restarts: 10,
      restart_delay: 2000,
      log_file: './logs/dev-rag-server-combined.log',
      out_file: './logs/dev-rag-server-out.log',
      error_file: './logs/dev-rag-server-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 3000,
      listen_timeout: 8000,
      shutdown_with_message: true,
      env_file: '.env'
    },
    {
      name: 'sentientm-proxy-server-dev',
      script: './server.js',
      cwd: '/home/komail/Accountmanager',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PROXY_SERVER_PORT: 3002,
        HOST: 'localhost'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      min_uptime: '5s',
      max_restarts: 10,
      restart_delay: 2000,
      log_file: './logs/dev-proxy-server-combined.log',
      out_file: './logs/dev-proxy-server-out.log',
      error_file: './logs/dev-proxy-server-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 3000,
      listen_timeout: 8000,
      shutdown_with_message: true,
      env_file: '.env'
    }
  ]
};
