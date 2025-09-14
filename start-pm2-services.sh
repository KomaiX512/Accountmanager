#!/bin/bash
# Manual PM2 startup commands for VPS

# Navigate to the deployment directory
cd /var/www/sentientm/Accountmanager

# Start Main API Server (Port 3000)
pm2 start server/server.js --name "main-api-unified" \
  --env NODE_ENV=production \
  --env MAIN_SERVER_PORT=3000 \
  --max-memory-restart 1G \
  --autorestart \
  --watch false \
  --log ./logs/main-api-combined.log

# Start RAG Server (Port 3001)
pm2 start rag-server.js --name "rag-server-unified" \
  --env NODE_ENV=production \
  --env RAG_SERVER_PORT=3001 \
  --max-memory-restart 512M \
  --autorestart \
  --watch false \
  --log ./logs/rag-server-combined.log

# Start Proxy Server (Port 3002)
pm2 start server.js --name "proxy-server-unified" \
  --env NODE_ENV=production \
  --env PROXY_SERVER_PORT=3002 \
  --max-memory-restart 512M \
  --autorestart \
  --watch false \
  --log ./logs/proxy-server-combined.log

# Save PM2 configuration
pm2 save

# Show PM2 status
echo "PM2 Services Status:"
pm2 list

echo "Health Check Commands:"
echo "curl http://127.0.0.1:3000/health"
echo "curl http://127.0.0.1:3001/health" 
echo "curl http://127.0.0.1:3002/health"
