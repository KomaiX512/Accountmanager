#!/bin/bash

set -e

# Colors for prettier output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Store PIDs in a file for cleanup
PID_FILE=".server_pids"
touch $PID_FILE

# Cleanup function
cleanup() {
    echo -e "\n${RED}Shutting down all servers...${NC}"
    if [ -f "$PID_FILE" ]; then
        while read -r pid; do
            if ps -p $pid > /dev/null; then
                echo "Killing process $pid"
                kill -15 $pid 2>/dev/null || kill -9 $pid 2>/dev3
            fi
        done < "$PID_FILE"
        rm "$PID_FILE"
    fi
    
    # Additional cleanup for any remaining processes
    pkill -f 'node.*server.js' || true
    exit 0
}

# Set up trap for cleanup
trap cleanup SIGINT SIGTERM

echo -e "${GREEN}Starting Instagram Account Manager Servers...${NC}"
echo -e "${GREEN}Press Ctrl+C to stop all servers${NC}"

# Ports to check
PORTS=(3000 3001 3002)

# Check if ports are free
for port in "${PORTS[@]}"; do
  if lsof -i ":$port" >/dev/null 2>&1; then
    echo -e "${RED}Error: Port $port is already in use. Please free it first.${NC}"
    exit 1
  fi
done

# Check if the data directory exists, create if not
if [ ! -d "./data" ]; then
  echo -e "${BLUE}Creating data directory...${NC}"
  mkdir -p ./data/conversations
fi

# Start servers in the background and save their PIDs
node rag-server.js &
RAG_PID=$!
echo $RAG_PID >> $PID_FILE
sleep 2

node server.js &
PROXY_PID=$!
echo $PROXY_PID >> $PID_FILE
sleep 2

cd server && node server.js &
MAIN_PID=$!
echo $MAIN_PID >> $PID_FILE
cd ..

# Check if all servers are running
sleep 5
echo "Checking server status..."

# Check RAG server
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ RAG server running on port 3001"
else
    echo "❌ RAG server not responding on port 3001"
fi

# Check proxy server
if curl -s http://localhost:3002/health > /dev/null; then
    echo "✅ Proxy server running on port 3002"
else
    echo "❌ Proxy server not responding on port 3002"
fi

# Check main server
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ Main server running on port 3000"
else
    echo "❌ Main server not responding on port 3000"
fi

echo ""
echo "Usage Instructions:"
echo "1. Access the app at http://localhost:3000"
echo "2. Chat with RAG in Discussion Mode for conversational assistance"
echo "3. Use Post Mode to generate Instagram posts with images"
echo "   - Post Mode will create captions, hashtags, and images"
echo "   - Generated posts will appear in the PostCooked module"
echo ""
echo "All servers are now running. Press Ctrl+C to stop all servers."

# Wait for all background processes
wait 