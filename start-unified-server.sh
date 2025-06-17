#!/bin/bash

# Unified Server Startup Script
# This script starts all services and the reverse proxy for single URL hosting

PROJECT_DIR="/home/komail/Accountmanager"
cd "$PROJECT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Unified Server Stack${NC}"
echo "======================================"

# Function to check if a port is in use
is_port_in_use() {
  lsof -i :"$1" &>/dev/null
}

# Function to kill process on port
kill_port() {
  if is_port_in_use "$1"; then
    echo -e "${YELLOW}Stopping process on port $1...${NC}"
    kill $(lsof -t -i:"$1") 2>/dev/null || true
    sleep 1
  fi
}

# Clean up existing processes
echo -e "${YELLOW}Cleaning up existing processes...${NC}"
kill_port 3000  # Main server (server.js)
kill_port 3001  # RAG server
kill_port 5173  # Vite dev server
kill_port 8080  # Reverse proxy

sleep 2

# Function to start service in background
start_service() {
  local name="$1"
  local command="$2"
  local port="$3"
  local log_file="$4"
  
  echo -e "${BLUE}Starting $name...${NC}"
  eval "$command" > "$log_file" 2>&1 &
  local pid=$!
  echo $pid > "${name,,}.pid"
  
  # Wait a bit and check if service started
  sleep 2
  if is_port_in_use "$port"; then
    echo -e "${GREEN}✅ $name running on port $port (PID: $pid)${NC}"
  else
    echo -e "${RED}❌ $name failed to start on port $port${NC}"
    echo "Check $log_file for errors"
  fi
}

# Start services in order
start_service "RAG Server" "node rag-server.js" 3001 "rag-server-unified.log"
start_service "Main Server" "cd server && node server.js" 3000 "main-server-unified.log"
start_service "Image Server" "node server.js" 3002 "server-unified.log"
start_service "Frontend" "npm run dev" 5173 "frontend-unified.log"

echo ""
echo "✅ All services started successfully!"
echo ""
echo "📊 Access your application at:"
echo "   Frontend:     http://localhost:5173"
echo "   Health Check: http://localhost:3002/health"
echo ""
echo "📝 Monitor logs:"
echo "   tail -f rag-server-unified.log"
echo "   tail -f main-server-unified.log"
echo "   tail -f server-unified.log"
echo "   tail -f frontend-unified.log"

echo -e "\n${BLUE}🛑 To stop all services, run:${NC}"
echo "   ./stop-unified-server.sh" 