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
                kill -15 $pid 2>/dev/null || kill -9 $pid 2>/dev/null
            fi
        done < "$PID_FILE"
        rm "$PID_FILE"
    fi
    
    # Additional cleanup for any remaining processes
    pkill -f 'node.*server.js' || true
    # Force kill any lingering listeners on our ports
    PORTS=(3000 3001 3002)
    for port in "${PORTS[@]}"; do
        kill -9 $(lsof -tiTCP:$port -sTCP:LISTEN) 2>/dev/null || true
    done
    # Stop ChromaDB Docker container if running
    if command -v docker &>/dev/null && docker ps --format '{{.Names}}' | grep -q '^accountmanager_chromadb$'; then
        echo "Stopping ChromaDB docker container"
        docker stop accountmanager_chromadb >/dev/null 2>&1 || true
    fi
    exit 0
}

# Set up trap for cleanup
trap cleanup SIGINT SIGTERM

echo -e "${GREEN}Starting Account Manager Servers (Instagram, Twitter, Facebook, LinkedIn)...${NC}"
echo -e "${GREEN}Press Ctrl+C to stop all servers${NC}"

# Ports to check for our JS servers
PORTS=(3000 3001 3002)

# ----------------------------------------
# ChromaDB SETUP
# ----------------------------------------
# Automatically pick a free host port for ChromaDB (preferring 8000-8010)
CHROMA_START_PORT=8000
CHROMA_PORT=$CHROMA_START_PORT
for ((p=CHROMA_START_PORT; p<=8010; p++)); do
  if ! lsof -iTCP:${p} -sTCP:LISTEN >/dev/null 2>&1; then
    CHROMA_PORT=$p
    break
  fi
done

# Export so the Node process can pick it up (see chromadb-service.js)
export CHROMA_DB_PORT_HOST=$CHROMA_PORT
export CHROMA_DB_PORT=$CHROMA_PORT

# -----------------------------
# Try Docker first
# -----------------------------
CHROMA_STARTED=false

if command -v docker-compose &>/dev/null && command -v docker &>/dev/null; then
  # Check if we have permission to access the daemon
  if docker info >/dev/null 2>&1; then
    if ! docker ps --format '{{.Names}}' | grep -q '^accountmanager_chromadb$'; then
      echo -e "${BLUE}Starting ChromaDB (Docker) on host port $CHROMA_PORT ...${NC}"
      # Temporarily disable 'exit on error'
      set +e
      docker-compose -f docker-compose.chromadb.yml up -d
      DOCKER_EXIT=$?
      set -e
      if [ $DOCKER_EXIT -eq 0 ]; then
        CHROMA_STARTED=true
      else
        echo -e "${YELLOW}Docker failed to start ChromaDB (exit $DOCKER_EXIT). Falling back to Python CLI.${NC}"
      fi
    else
      echo -e "${BLUE}ChromaDB container already running${NC}"
      CHROMA_STARTED=true
    fi
  else
    echo -e "${YELLOW}Docker daemon not accessible by current user. Falling back to Python CLI.${NC}"
  fi
else
  echo -e "${YELLOW}docker-compose or docker not installed. Will use Python CLI fallback.${NC}"
fi

if [ "$CHROMA_STARTED" = false ]; then
  # -----------------------------
  # Python CLI fallback – always works without sudo
  # -----------------------------
  echo -e "${BLUE}Ensuring Python package 'chromadb' is installed...${NC}"
  python3 -m pip install --user --quiet 'chromadb>=0.6.3' 'uvicorn[standard]' || {
    echo -e "${RED}Failed to install chromadb Python package${NC}"; exit 1; }

  echo -e "${BLUE}Starting ChromaDB (Python CLI) on host port $CHROMA_PORT ...${NC}"
  # Start in background via nohup to capture pid
  DATA_DIR="./data/chroma"
  mkdir -p "$DATA_DIR"
  # chroma CLI lives in ~/.local/bin or venv
  if command -v chroma &>/dev/null; then
    chroma run --host 0.0.0.0 --port "$CHROMA_PORT" --path "$DATA_DIR" &
  else
    # Use module invocation if binary not on path
    python3 -m chromadb.cli.run --host 0.0.0.0 --port "$CHROMA_PORT" --path "$DATA_DIR" &
  fi
  CHROMA_PID=$!
  echo $CHROMA_PID >> $PID_FILE
  CHROMA_STARTED=true
fi

# Give ChromaDB a moment to boot (docker or CLI)
sleep 7

# Pre-emptively kill anything LISTENING on our ports (ignores old CLOSE_WAIT sockets)
for port in "${PORTS[@]}"; do
  LISTEN_PID=$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null || true)
  if [ ! -z "$LISTEN_PID" ]; then
      echo -e "${BLUE}Killing process $LISTEN_PID listening on port $port${NC}"
      kill -9 $LISTEN_PID 2>/dev/null || true
      sleep 1
  fi
done

# Verify ports are free (LISTEN sockets only)
for port in "${PORTS[@]}"; do
  if lsof -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then
    echo -e "${RED}Error: Port $port is already LISTENING. Please free it first.${NC}"
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
echo "3. Use Post Mode to generate posts for Instagram, Twitter, Facebook, or LinkedIn (images where supported)"
echo "   - Post Mode will create captions, hashtags, and images"
echo "   - Generated posts will appear in the PostCooked module"
echo ""
echo "All servers are now running. Press Ctrl+C to stop all servers."

# Wait for all background processes
wait