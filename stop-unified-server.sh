#!/bin/bash

# Stop Unified Server Script
# This script stops all services started by the unified server

PROJECT_DIR="/home/komail/Accountmanager"
cd "$PROJECT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🛑 Stopping Unified Server Stack${NC}"
echo "=================================="

# Function to check if a port is in use
is_port_in_use() {
  lsof -i :"$1" &>/dev/null
}

# Function to kill process on port
kill_port() {
  local port="$1"
  local name="$2"
  
  if is_port_in_use "$port"; then
    echo -e "${YELLOW}Stopping $name on port $port...${NC}"
    kill $(lsof -t -i:"$port") 2>/dev/null || true
    sleep 1
    
    if is_port_in_use "$port"; then
      echo -e "${RED}Force killing $name on port $port...${NC}"
      kill -9 $(lsof -t -i:"$port") 2>/dev/null || true
      sleep 1
    fi
    
    if ! is_port_in_use "$port"; then
      echo -e "${GREEN}✅ $name stopped${NC}"
    else
      echo -e "${RED}❌ Failed to stop $name${NC}"
    fi
  else
    echo -e "${GREEN}✅ $name was not running${NC}"
  fi
}

# Stop services
echo -e "${YELLOW}Stopping all services...${NC}"
kill_port 8080 "Reverse Proxy"
kill_port 5173 "Frontend (Vite)"
kill_port 3001 "RAG Server"
kill_port 3002 "Main Server"

# Clean up PID files
echo -e "\n${YELLOW}Cleaning up PID files...${NC}"
rm -f main-server.pid rag-server.pid frontend.pid reverse-proxy.pid 2>/dev/null

# Clean up ngrok processes if any
pkill -f ngrok 2>/dev/null && echo -e "${GREEN}✅ Stopped ngrok processes${NC}" || echo -e "${YELLOW}No ngrok processes found${NC}"

echo -e "\n${GREEN}🎉 All services stopped successfully!${NC}"
echo -e "${BLUE}Log files are preserved for review:${NC}"
echo "   • main-server-unified.log"
echo "   • rag-server-unified.log"
echo "   • frontend-unified.log"
echo "   • reverse-proxy-unified.log" 