export default {
  apps: [
    {
      name: 'sentientm-main-server',
      script: './server/server.js',
      cwd: '/home/komail/Accountmanager',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        MAIN_SERVER_PORT: 3000,
        HOST: '0.0.0.0'
      },
      env_production: {
        NODE_ENV: 'production',
        MAIN_SERVER_PORT: 3000,
        HOST: '0.0.0.0'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 5000,
      log_file: './logs/main-server-combined.log',
      out_file: './logs/main-server-out.log',
      error_file: './logs/main-server-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true,
      env_file: '.env.production'
    },
    {
      name: 'sentientm-rag-server',
      script: './rag-server.js',
      cwd: '/home/komail/Accountmanager',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        RAG_SERVER_PORT: 3001,
        HOST: '0.0.0.0',
        PATH: '/home/komail/.local/bin:/usr/local/bin:/usr/bin:/bin',
        PYTHONPATH: '/usr/lib/python3/dist-packages'
      },
      env_production: {
        NODE_ENV: 'production',
        RAG_SERVER_PORT: 3001,
        HOST: '0.0.0.0',
        PATH: '/home/komail/.local/bin:/usr/local/bin:/usr/bin:/bin',
        PYTHONPATH: '/usr/lib/python3/dist-packages'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 5000,
      log_file: './logs/rag-server-combined.log',
      out_file: './logs/rag-server-out.log',
      error_file: './logs/rag-server-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true,
      env_file: '.env.production'
    },
    {
      name: 'sentientm-proxy-server',
      script: './server.js',
      cwd: '/home/komail/Accountmanager',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PROXY_SERVER_PORT: 3002,
        HOST: '0.0.0.0'
      },
      env_production: {
        NODE_ENV: 'production',
        PROXY_SERVER_PORT: 3002,
        HOST: '0.0.0.0'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 5000,
      log_file: './logs/proxy-server-combined.log',
      out_file: './logs/proxy-server-out.log',
      error_file: './logs/proxy-server-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true,
      env_file: '.env.production'
    }
  ],
  deploy: {
    production: {
      user: 'sentuhgk',
      host: '66.29.141.183',
      ref: 'origin/master',
      repo: 'https://github.com/komaix512/accountmanager.git',
      path: '/var/www/sentientm/Accountmanager',
      'post-deploy': 'npm install --production && npm run build && pm2 reload ecosystem.config.js --env production && pm2 save',
      'pre-setup': 'mkdir -p /var/www/sentientm/Accountmanager/logs'
    }
  }
};