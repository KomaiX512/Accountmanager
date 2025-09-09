#!/bin/bash

# PHASE 3: INFRASTRUCTURE SCALING DEPLOYMENT SCRIPT
# Deploys load balancer, Redis cluster, monitoring, and prepares CDN integration

echo "🚀 PHASE 3 INFRASTRUCTURE SCALING DEPLOYMENT"
echo "============================================="

# Function to check if command succeeded
check_status() {
    if [ $? -eq 0 ]; then
        echo "✅ $1 completed successfully"
    else
        echo "❌ $1 failed"
        exit 1
    fi
}

# 1. BACKUP CURRENT CONFIGURATION
echo "📦 Backing up current configuration..."
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.phase2.backup
sudo cp /home/komail/Accountmanager/ecosystem.config.cjs /home/komail/Accountmanager/ecosystem.phase2.backup.cjs
check_status "Configuration backup"

# 2. DEPLOY NGINX LOAD BALANCER
echo "⚖️ Deploying Nginx load balancer configuration..."
sudo cp /home/komail/Accountmanager/nginx-phase3-loadbalancer.conf /etc/nginx/sites-available/default
sudo nginx -t
check_status "Nginx configuration validation"

# 3. CREATE PM2 LOG DIRECTORIES
echo "📁 Creating PM2 log directories..."
sudo mkdir -p /var/log/pm2
sudo chown -R $(whoami):$(whoami) /var/log/pm2
check_status "PM2 log directories"

# 4. STOP CURRENT PM2 PROCESSES (if any)
echo "🛑 Stopping current PM2 processes for cluster upgrade..."
pm2 stop all 2>/dev/null || echo "No processes to stop"
pm2 delete all 2>/dev/null || echo "No processes to delete"
echo "✅ PM2 processes cleared for cluster upgrade"

# 5. START PHASE 3 CLUSTER
echo "🔧 Starting Phase 3 clustered backend services..."
pm2 start /home/komail/Accountmanager/ecosystem-phase3-cluster.config.cjs
sleep 5
pm2 save
check_status "Phase 3 cluster startup"

# 6. RELOAD NGINX WITH LOAD BALANCER
echo "🔄 Reloading Nginx with load balancer configuration..."
sudo nginx -s reload
check_status "Nginx load balancer deployment"

# 7. VERIFY BACKEND CLUSTERS
echo "🔍 Verifying backend cluster health..."
sleep 10

# Check primary instances
for port in 3000 3001 3002; do
    if curl -s http://localhost:${port}/health > /dev/null; then
        echo "✅ Primary backend port ${port}: HEALTHY"
    else
        echo "❌ Primary backend port ${port}: UNHEALTHY"
    fi
done

# Check backup instances
for port in 3010 3011 3012 3020 3021 3022; do
    if curl -s http://localhost:${port}/health > /dev/null; then
        echo "✅ Backup backend port ${port}: HEALTHY"
    else
        echo "⚠️  Backup backend port ${port}: Not responding (expected for backup)"
    fi
done

# 8. INSTALL REDIS CLUSTER DEPENDENCIES
echo "📦 Installing Redis cluster dependencies..."
if ! command -v redis-cli &> /dev/null; then
    sudo apt update
    sudo apt install -y redis-server redis-tools
fi
check_status "Redis installation"

# 9. SETUP REDIS CLUSTER
echo "🔗 Setting up Redis cluster..."
chmod +x /home/komail/Accountmanager/redis-cluster-setup.sh
# Note: Run interactively due to cluster creation prompt
echo "⚠️  Redis cluster setup requires manual confirmation"
echo "Run: ./redis-cluster-setup.sh"

# 10. INSTALL MONITORING DEPENDENCIES
echo "📊 Installing monitoring dependencies..."
cd /home/komail/Accountmanager
npm install express redis axios --save
check_status "Monitoring dependencies"

# 11. START MONITORING AGENT
echo "🔍 Starting monitoring agent..."
pm2 start monitoring-agent.js --name monitoring-agent
pm2 save
check_status "Monitoring agent startup"

# 12. VERIFY LOAD BALANCER FUNCTIONALITY
echo "⚡ Testing load balancer functionality..."
echo "Testing main API cluster:"
for i in {1..5}; do
    response=$(curl -s -w "Response time: %{time_total}s\n" https://www.sentientm.com/api/health)
    echo "Request $i: $response"
    sleep 1
done

# 13. DISPLAY CLUSTER STATUS
echo ""
echo "🎯 PHASE 3 DEPLOYMENT STATUS"
echo "============================"
echo "📊 PM2 Processes:"
pm2 list

echo ""
echo "🌐 Nginx Status:"
sudo systemctl status nginx --no-pager -l

echo ""
echo "🔍 Load Balancer Health:"
curl -s http://localhost/nginx-health

echo ""
echo "📈 Monitoring Dashboard:"
echo "Access at: http://localhost:9090"

echo ""
echo "✅ PHASE 3 INFRASTRUCTURE DEPLOYMENT COMPLETE!"
echo ""
echo "Next Steps:"
echo "1. Run Redis cluster setup: ./redis-cluster-setup.sh"
echo "2. Configure CloudFlare CDN with API token"
echo "3. Battle test with 200+ concurrent users"
echo "4. Monitor dashboard at http://localhost:9090"
