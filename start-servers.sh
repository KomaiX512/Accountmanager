#!/bin/bash

# Colors for prettier output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Instagram Account Manager Servers...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"

# Check if the data directory exists, create if not
if [ ! -d "./data" ]; then
  echo -e "${BLUE}Creating data directory...${NC}"
  mkdir -p ./data/conversations
fi

# Start RAG server in the background
echo "Starting RAG server on port 3001..."
node rag-server.js &
RAG_PID=$!

# Start proxy server in the background
echo "Starting proxy server on port 3002..."
node server.js &
PROXY_PID=$!

# Start main server in the background
echo "Starting main server on port 3000..."
cd server && node server.js &
MAIN_PID=$!

# Wait for a moment to verify servers started
sleep 2

# Check if servers are running
echo "Checking if servers are running..."
curl -s http://localhost:3001/health > /dev/null
if [ $? -eq 0 ]; then
  echo "✅ RAG server is running on port 3001"
else
  echo "❌ RAG server failed to start"
fi

curl -s http://localhost:3002/health > /dev/null
if [ $? -eq 0 ]; then
  echo "✅ Proxy server is running on port 3002"
else
  echo "❌ Proxy server failed to start"
fi

# Set trap to kill processes on exit
function cleanup {
  echo "Stopping all servers..."
  kill $RAG_PID $PROXY_PID $MAIN_PID 2>/dev/null
}
trap cleanup EXIT

# Start vite development server
echo "Starting Vite development server..."
npm run dev

# Wait for all processes
wait 