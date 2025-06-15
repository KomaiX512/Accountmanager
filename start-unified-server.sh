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

# Start backend services
echo -e "\n${BLUE}Starting Backend Services...${NC}"
start_service "Main-Server" "cd server && node server.js" 3000 "main-server-unified.log"
start_service "RAG-Server" "node rag-server.js" 3001 "rag-server-unified.log"

# Start frontend (Vite dev server)
echo -e "\n${BLUE}Starting Frontend...${NC}"
start_service "Frontend" "npm run dev" 5173 "frontend-unified.log"

# Wait for all services to be fully ready
echo -e "\n${YELLOW}Waiting for all services to be ready...${NC}"
sleep 3

# Start reverse proxy
echo -e "\n${BLUE}Starting Reverse Proxy...${NC}"
start_service "Reverse-Proxy" "node reverse-proxy.cjs" 8080 "reverse-proxy-unified.log"

# Final status check
echo -e "\n${BLUE}Service Status Check:${NC}"
echo "========================"

services=("3000:Main Server" "3001:RAG Server" "5173:Frontend" "8080:Reverse Proxy")
all_running=true

for service in "${services[@]}"; do
  port="${service%%:*}"
  name="${service#*:}"
  
  if is_port_in_use "$port"; then
    echo -e "${GREEN}✅ $name - Port $port - Running${NC}"
  else
    echo -e "${RED}❌ $name - Port $port - Not Running${NC}"
    all_running=false
  fi
done

if [ "$all_running" = true ]; then
  echo -e "\n${GREEN}🎉 All services are running successfully!${NC}"
  echo -e "\n${BLUE}📡 Your unified application is available at:${NC}"
  echo -e "${GREEN}   Local: http://localhost:8080${NC}"
  echo -e "\n${YELLOW}🌍 To make it available worldwide, run:${NC}"
  echo -e "${GREEN}   ngrok http 8080${NC}"
  echo -e "\n${BLUE}💡 The reverse proxy handles:${NC}"
  echo "   • Frontend: / (from port 5173)"
  echo "   • API: /api/* (to port 3000)"
  echo "   • RAG: /api/rag/* (to port 3001)"
  echo "   • Webhooks: /webhook/* (to port 3000)"
  echo "   • Events: /events/* (to port 3000)"
else
  echo -e "\n${RED}❌ Some services failed to start. Check the log files for details.${NC}"
fi

echo -e "\n${BLUE}📊 Monitor logs with:${NC}"
echo "   tail -f main-server-unified.log"
echo "   tail -f rag-server-unified.log"
echo "   tail -f frontend-unified.log"
echo "   tail -f reverse-proxy-unified.log"

echo -e "\n${BLUE}🛑 To stop all services, run:${NC}"
echo "   ./stop-unified-server.sh" 