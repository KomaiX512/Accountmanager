#!/bin/bash

echo "🚀 Starting Account Manager - VPS Production Environment"
echo "========================================================="

# Create logs directory if it doesn't exist
mkdir -p logs

# Stop any existing processes
echo "🔄 Stopping existing PM2 processes..."
pm2 delete all > /dev/null 2>&1

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install --production
fi

# Build the project
echo "🔧 Building project..."
npm run build

# Start all services using the production ecosystem config
echo "🚀 Starting all services with PM2..."
pm2 start ecosystem.config.js --env production

# Wait a moment for services to start
sleep 5

# Check status
echo ""
echo "📊 Service Status:"
pm2 status

echo ""
echo "🔍 Health Checks:"

# Check each service
services=("3000:Main Server" "3001:RAG Server" "3002:Proxy Server")

for service in "${services[@]}"; do
    port="${service%%:*}"
    name="${service#*:}"
    
    if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
        echo "✅ $name (Port $port): OK"
    else
        echo "❌ $name (Port $port): Not responding"
    fi
done

# Save PM2 process list
pm2 save

# Enable PM2 to start on system boot (for VPS)
echo ""
echo "🔧 Configuring PM2 for system startup..."
pm2 startup | tail -1 > startup_command.sh
chmod +x startup_command.sh
echo "Run the following as root/sudo: cat startup_command.sh"

echo ""
echo "==============================================="
echo "🎯 Production Services:"
echo "   Main Server:    http://your-vps-ip:3000"
echo "   RAG Server:     http://your-vps-ip:3001"
echo "   Proxy Server:   http://your-vps-ip:3002"
echo "   Frontend:       Built and served by main server"
echo "==============================================="
echo ""
echo "📋 Management Commands:"
echo "   Check status:   pm2 status"
echo "   View logs:      pm2 logs"
echo "   Restart all:    pm2 restart all"
echo "   Stop all:       pm2 stop all"
echo "   Monitor:        pm2 monit"
echo ""
