#!/bin/bash

# 🚀 VPS DEPLOYMENT COMMANDS
# Copy and paste these commands on your VPS

echo "🚀 VPS DEPLOYMENT SETUP"
echo "======================"
echo ""
echo "📋 Run these commands on your VPS:"
echo ""
echo "# 1. Navigate to project directory"
echo "cd /var/www/sentientm/Accountmanager"
echo ""
echo "# 2. Create the deployment script directly on VPS"
echo 'cat > vps-deploy.sh << '"'"'EOF'"'"''
echo '#!/bin/bash'
echo 'set -e'
echo 'echo "🚀 VPS DEPLOYMENT STARTING..."'
echo 'cd /var/www/sentientm/Accountmanager'
echo ''
echo '# Add ES module support to package.json'
echo 'if ! grep -q "\"type\": \"module\"" package.json; then'
echo '    sed -i "3i\\  \"type\": \"module\"," package.json'
echo '    echo "✅ Added ES module support"'
echo 'fi'
echo ''
echo '# Create logs directory'
echo 'mkdir -p logs'
echo ''
echo '# Stop existing processes'
echo 'pm2 stop all 2>/dev/null || true'
echo 'pm2 delete all 2>/dev/null || true'
echo 'fuser -k 3000/tcp 2>/dev/null || true'
echo 'fuser -k 3001/tcp 2>/dev/null || true'
echo 'fuser -k 3002/tcp 2>/dev/null || true'
echo 'sleep 5'
echo ''
echo '# Start servers'
echo 'echo "🚀 Starting servers..."'
echo 'pm2 start server/server.js --name "main" --env NODE_ENV=production,MAIN_SERVER_PORT=3000,HOST=0.0.0.0'
echo 'pm2 start rag-server.js --name "rag" --node-args="--experimental-specifier-resolution=node" --env NODE_ENV=production,RAG_SERVER_PORT=3001,HOST=0.0.0.0'
echo 'pm2 start server.js --name "proxy" --env NODE_ENV=production,PROXY_SERVER_PORT=3002,HOST=0.0.0.0'
echo ''
echo '# Setup auto-start'
echo 'pm2 startup systemd -u root --hp /root 2>/dev/null || true'
echo 'pm2 save'
echo ''
echo 'sleep 10'
echo 'pm2 status'
echo 'echo "🎉 VPS DEPLOYMENT COMPLETE!"'
echo 'EOF'
echo ""
echo "# 3. Make script executable and run"
echo "chmod +x vps-deploy.sh"
echo "./vps-deploy.sh"
echo ""
echo "# 4. Check status"
echo "pm2 status"
echo "curl http://localhost:3000/health"
echo "curl http://localhost:3001/health"  
echo "curl http://localhost:3002/health"
echo ""
echo "✅ Copy and paste the above commands in your VPS terminal!"
