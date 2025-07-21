#!/bin/bash

echo "🚀 Starting Account Manager - Local Development Environment"
echo "============================================================"

# Create logs directory if it doesn't exist
mkdir -p logs

# Function to check if port is in use
check_port() {
    if lsof -i :$1 > /dev/null 2>&1; then
        echo "⚠️  Port $1 is already in use"
        return 1
    else
        echo "✅ Port $1 is available"
        return 0
    fi
}

# Function to start a server and check if it's responding
start_server() {
    local name=$1
    local port=$2
    local script=$3
    local env_vars=$4
    
    echo "Starting $name on port $port..."
    
    if check_port $port; then
        # Start the server in background with PM2
        pm2 start "$script" --name "$name" --env="$env_vars" --log "./logs/$name.log" --time
        sleep 3
        
        # Check if server is responding
        if curl -s "http://localhost:$port/health" > /dev/null 2>&1; then
            echo "✅ $name is running and responding on port $port"
        else
            echo "⚠️  $name started but not responding on health endpoint"
        fi
    fi
}

echo ""
echo "🔄 Stopping any existing PM2 processes..."
pm2 delete all > /dev/null 2>&1

echo ""
echo "🚀 Starting backend services..."

# Start Main Server (Port 3000)
pm2 start "./server/server.js" --name "main-server-dev" --env NODE_ENV=development,MAIN_SERVER_PORT=3000,HOST=localhost --log "./logs/main-server.log" --time

# Start Proxy Server (Port 3002)  
pm2 start "./server.js" --name "proxy-server-dev" --env NODE_ENV=development,PROXY_SERVER_PORT=3002,HOST=localhost --log "./logs/proxy-server.log" --time

echo ""
echo "🤖 Starting RAG Server manually (Port 3001)..."
echo "Note: RAG server needs to run separately due to ES module requirements"

echo ""
echo "🌐 Starting Frontend Development Server (Port 5173)..."
echo "Running: npm run dev:frontend"

echo ""
echo "==============================================="
echo "🎯 Your services are starting up:"
echo "   Main Server:    http://localhost:3000"
echo "   RAG Server:     http://localhost:3001 (run manually)"
echo "   Proxy Server:   http://localhost:3002"
echo "   Frontend:       http://localhost:5173"
echo "==============================================="
echo ""
echo "📋 To check status: pm2 status"
echo "📋 To view logs: pm2 logs"
echo "📋 To stop all: pm2 delete all"
echo ""
echo "🤖 To start RAG server manually, run:"
echo "   NODE_ENV=development RAG_SERVER_PORT=3001 node rag-server.js"
echo ""
echo "🌐 To start frontend, run:"
echo "   npm run dev:frontend"
