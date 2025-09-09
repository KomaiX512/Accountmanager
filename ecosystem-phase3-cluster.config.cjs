// PHASE 3: PM2 ECOSYSTEM CLUSTER CONFIGURATION
// Multi-instance Node.js services for load balancing

module.exports = {
  apps: [
    // MAIN API CLUSTER (3 instances)
    {
      name: 'main-api-primary',
      script: 'server/server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        CLUSTER_ID: 'primary',
        REDIS_URL: 'redis://localhost:6379/0'
      },
      error_file: '/var/log/pm2/main-api-primary-error.log',
      out_file: '/var/log/pm2/main-api-primary-out.log',
      log_file: '/var/log/pm2/main-api-primary.log',
      max_memory_restart: '1G',
      node_args: '--max_old_space_size=1024'
    },
    {
      name: 'main-api-backup1',
      script: 'server/server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3010,
        CLUSTER_ID: 'backup1',
        REDIS_URL: 'redis://localhost:6379/0'
      },
      error_file: '/var/log/pm2/main-api-backup1-error.log',
      out_file: '/var/log/pm2/main-api-backup1-out.log',
      log_file: '/var/log/pm2/main-api-backup1.log',
      max_memory_restart: '1G',
      node_args: '--max_old_space_size=1024'
    },
    {
      name: 'main-api-backup2',
      script: 'server/server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3020,
        CLUSTER_ID: 'backup2',
        REDIS_URL: 'redis://localhost:6379/0'
      },
      error_file: '/var/log/pm2/main-api-backup2-error.log',
      out_file: '/var/log/pm2/main-api-backup2-out.log',
      log_file: '/var/log/pm2/main-api-backup2.log',
      max_memory_restart: '1G',
      node_args: '--max_old_space_size=1024'
    },

    // RAG SERVER CLUSTER (3 instances)
    {
      name: 'rag-server-primary',
      script: 'rag-server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        CLUSTER_ID: 'rag-primary',
        REDIS_URL: 'redis://localhost:6379/1'
      },
      error_file: '/var/log/pm2/rag-primary-error.log',
      out_file: '/var/log/pm2/rag-primary-out.log',
      log_file: '/var/log/pm2/rag-primary.log',
      max_memory_restart: '2G',
      node_args: '--max_old_space_size=2048'
    },
    {
      name: 'rag-server-backup1',
      script: 'rag-server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3011,
        CLUSTER_ID: 'rag-backup1',
        REDIS_URL: 'redis://localhost:6379/1'
      },
      error_file: '/var/log/pm2/rag-backup1-error.log',
      out_file: '/var/log/pm2/rag-backup1-out.log',
      log_file: '/var/log/pm2/rag-backup1.log',
      max_memory_restart: '2G',
      node_args: '--max_old_space_size=2048'
    },
    {
      name: 'rag-server-backup2',
      script: 'rag-server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3021,
        CLUSTER_ID: 'rag-backup2',
        REDIS_URL: 'redis://localhost:6379/1'
      },
      error_file: '/var/log/pm2/rag-backup2-error.log',
      out_file: '/var/log/pm2/rag-backup2-out.log',
      log_file: '/var/log/pm2/rag-backup2.log',
      max_memory_restart: '2G',
      node_args: '--max_old_space_size=2048'
    },

    // PROXY SERVER CLUSTER (3 instances)
    {
      name: 'proxy-server-primary',
      script: 'server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        CLUSTER_ID: 'proxy-primary',
        REDIS_URL: 'redis://localhost:6379/2'
      },
      error_file: '/var/log/pm2/proxy-primary-error.log',
      out_file: '/var/log/pm2/proxy-primary-out.log',
      log_file: '/var/log/pm2/proxy-primary.log',
      max_memory_restart: '1G',
      node_args: '--max_old_space_size=1024'
    },
    {
      name: 'proxy-server-backup1',
      script: 'server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3012,
        CLUSTER_ID: 'proxy-backup1',
        REDIS_URL: 'redis://localhost:6379/2'
      },
      error_file: '/var/log/pm2/proxy-backup1-error.log',
      out_file: '/var/log/pm2/proxy-backup1-out.log',
      log_file: '/var/log/pm2/proxy-backup1.log',
      max_memory_restart: '1G',
      node_args: '--max_old_space_size=1024'
    },
    {
      name: 'proxy-server-backup2',
      script: 'server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3022,
        CLUSTER_ID: 'proxy-backup2',
        REDIS_URL: 'redis://localhost:6379/2'
      },
      error_file: '/var/log/pm2/proxy-backup2-error.log',
      out_file: '/var/log/pm2/proxy-backup2-out.log',
      log_file: '/var/log/pm2/proxy-backup2.log',
      max_memory_restart: '1G',
      node_args: '--max_old_space_size=1024'
    },

    // MONITORING AGENT
    {
      name: 'monitoring-agent',
      script: 'monitoring-agent.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        MONITOR_PORT: 9090,
        REDIS_URL: 'redis://localhost:6379/3'
      },
      error_file: '/var/log/pm2/monitoring-error.log',
      out_file: '/var/log/pm2/monitoring-out.log',
      log_file: '/var/log/pm2/monitoring.log'
    }
  ]
};
