#!/bin/bash

# Colors for prettier output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Starting Instagram Account Manager Servers..."
echo "Press Ctrl+C to stop all servers"

# Check if the data directory exists, create if not
if [ ! -d "./data" ]; then
  echo -e "${BLUE}Creating data directory...${NC}"
  mkdir -p ./data/conversations
fi

# Start the RAG server first
echo "Starting RAG server on port 3001..."
node rag-server.js &
RAG_PID=$!

# Small delay to let RAG server initialize
sleep 2

# Start the proxy server second
echo "Starting proxy server on port 3002..."
echo "This server handles: "
echo "  • Discussions API (/rag-discussion/:username)"
echo "  • Post Generation API with images (/rag-post/:username)"
echo "  • Conversations API (/rag-conversations/:username)"

node server.js &
PROXY_PID=$!

# Small delay to let proxy server initialize
sleep 2

# Start the main server last
echo "Starting main server on port 3000..."
cd server && node server.js &
MAIN_PID=$!

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

# Wait for user to press Ctrl+C
wait 