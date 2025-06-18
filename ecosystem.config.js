export default {
  apps: [
    {
      name: 'account-manager-main',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3002
      },
      // Auto restart configuration
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      
      // Error handling
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Advanced features
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true,
      
      // Health monitoring
      health_check_http: 'http://localhost:3002/health',
      health_check_grace_period: 3000
    },
    {
      name: 'account-manager-rag',
      script: 'rag-server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      // Auto restart configuration
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      
      // Error handling
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      
      // Logging
      log_file: './logs/rag-combined.log',
      out_file: './logs/rag-out.log',
      error_file: './logs/rag-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Advanced features
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true
    }
  ],
  
  deploy: {
    production: {
      user: 'ubuntu',
      host: ['your-server-ip'],
      ref: 'origin/main',
      repo: 'your-git-repo',
      path: '/var/www/account-manager',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt update && apt install git -y'
    }
  }
}; 