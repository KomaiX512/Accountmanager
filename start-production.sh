#!/bin/bash

# Production startup script for Account Manager
# This script ensures clean startup without port conflicts

set -e  # Exit on any error

echo "🚀 Starting Account Manager in Production Mode..."
echo "=================================================="

# Create logs directory if it doesn't exist
mkdir -p logs

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to kill processes on port
kill_port_process() {
    local port=$1
    echo "🔍 Checking port $port..."
    
    if check_port $port; then
        echo "⚠️  Port $port is in use. Cleaning up..."
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
        sleep 2
        
        if check_port $port; then
            echo "❌ Failed to free port $port. Manual intervention required."
            exit 1
        else
            echo "✅ Port $port cleaned up successfully"
        fi
    else
        echo "✅ Port $port is available"
    fi
}

# Clean up ports
echo "🧹 Cleaning up ports..."
kill_port_process 3001  # RAG server
kill_port_process 3002  # Main server
kill_port_process 5173  # Vite dev server (if running)

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Stop any existing PM2 processes
echo "🛑 Stopping existing PM2 processes..."
pm2 stop ecosystem.config.js 2>/dev/null || true
pm2 delete ecosystem.config.js 2>/dev/null || true

# Wait a moment
sleep 3

# Start with PM2
echo "🚀 Starting servers with PM2..."
pm2 start ecosystem.config.js --env production

# Show status
echo "📊 Process Status:"
pm2 status

# Show logs
echo "📝 Recent logs:"
pm2 logs --lines 10

echo "=================================================="
echo "✅ Account Manager started successfully!"
echo "🌐 Main Server: http://localhost:3002"
echo "🤖 RAG Server: http://localhost:3001"
echo "📊 PM2 Dashboard: pm2 monit"
echo "📝 View logs: pm2 logs"
echo "🛑 Stop servers: pm2 stop ecosystem.config.js"
echo "==================================================" 