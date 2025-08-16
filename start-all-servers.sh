#!/bin/bash

# Define project directory
PROJECT_DIR="$HOME/Website/AccountManager"
cd "$PROJECT_DIR"

# Function to check if a port is in use
is_port_in_use() {
  lsof -i :"$1" &>/dev/null
}

# Kill any processes running on the server ports if needed
echo "Checking if servers are already running..."
if is_port_in_use 3000; then
  echo "Stopping server on port 3000..."
  kill $(lsof -t -i:3000) 2>/dev/null || true
fi

if is_port_in_use 3001; then
  echo "Stopping RAG server on port 3001..."
  kill $(lsof -t -i:3001) 2>/dev/null || true
fi

if is_port_in_use 3002; then
  echo "Stopping Image server on port 3002..."
  kill $(lsof -t -i:3002) 2>/dev/null || true
fi

if is_port_in_use 5173; then
  echo "Stopping front-end on port 5173..."
  kill $(lsof -t -i:5173) 2>/dev/null || true
fi

# Wait a moment for processes to terminate
sleep 2

# Check if gnome-terminal is available
if command -v gnome-terminal &>/dev/null; then
  echo "Starting servers in separate terminals..."
  
  # Start the main server (port 3000)
  gnome-terminal --tab --title="Main Server" -- bash -c "cd \"$PROJECT_DIR\" && echo 'Starting main server on port 3000...' && node server/server.js; bash"
  
  # Start the RAG server (port 3001)
  gnome-terminal --tab --title="RAG Server" -- bash -c "cd \"$PROJECT_DIR\" && echo 'Starting RAG server on port 3001...' && node rag-server.js; bash"
  
  # Start the image server (port 3002)
  gnome-terminal --tab --title="Image Server" -- bash -c "cd \"$PROJECT_DIR\" && echo 'Starting image server on port 3002...' && node server.js; bash"
  
  # Start the front-end dev server (port 5173)
  gnome-terminal --tab --title="Frontend" -- bash -c "cd \"$PROJECT_DIR\" && echo 'Starting Vite dev server on port 5173...' && npm run frontend; bash"

# Check if xterm is available as fallback
elif command -v xterm &>/dev/null; then
  echo "Starting servers in separate terminals using xterm..."
  
  # Start the main server (port 3000)
  xterm -T "Main Server" -e "cd \"$PROJECT_DIR\" && echo 'Starting main server on port 3000...' && node server/server.js; bash" &
  
  # Start the RAG server (port 3001)
  xterm -T "RAG Server" -e "cd \"$PROJECT_DIR\" && echo 'Starting RAG server on port 3001...' && node rag-server.js; bash" &
  
  # Start the image server (port 3002)
  xterm -T "Image Server" -e "cd \"$PROJECT_DIR\" && echo 'Starting image server on port 3002...' && node server.js; bash" &
  
  # Start the front-end dev server (port 5173)
  xterm -T "Frontend" -e "cd \"$PROJECT_DIR\" && echo 'Starting Vite dev server on port 5173...' && npm run frontend; bash" &

# Use screen as final fallback
else
  echo "Starting servers using screen..."
  
  # Check if screen is installed
  if ! command -v screen &>/dev/null; then
    echo "Please install screen: sudo apt-get install screen"
    exit 1
  fi
  
  # Kill any existing screen sessions
  screen -wipe &>/dev/null
  
  # Start the main server
  screen -dmS main_server bash -c "cd \"$PROJECT_DIR\" && echo 'Starting main server on port 3000...' && node server/server.js; bash"
  
  # Start the RAG server
  screen -dmS rag_server bash -c "cd \"$PROJECT_DIR\" && echo 'Starting RAG server on port 3001...' && node rag-server.js; bash"
  
  # Start the image server
  screen -dmS image_server bash -c "cd \"$PROJECT_DIR\" && echo 'Starting image server on port 3002...' && node server.js; bash"
  
  # Start the front-end dev server
  screen -dmS frontend bash -c "cd \"$PROJECT_DIR\" && echo 'Starting Vite dev server on port 5173...' && npm run frontend; bash"
  
  echo "All servers started in screen sessions."
  echo "Use 'screen -r main_server', 'screen -r rag_server', or 'screen -r image_server' to view each server."
fi

echo "Waiting for servers to start..."
sleep 3

# Verify servers are running
echo "Checking if servers are running..."
if is_port_in_use 3000; then
  echo "✅ Main server running on port 3000"
else
  echo "❌ Main server not running on port 3000"
fi

if is_port_in_use 3001; then
  echo "✅ RAG server running on port 3001"
else
  echo "❌ RAG server not running on port 3001"
fi

if is_port_in_use 3002; then
  echo "✅ Image server running on port 3002"
else
  echo "❌ Image server not running on port 3002"
fi

if is_port_in_use 5173; then
  echo "✅ Front-end running on port 5173"
else
  echo "❌ Front-end not running on port 5173"
fi

echo -e "\nAll servers should now be running."
echo "Open http://localhost:5173 or http://127.0.0.1:5173 in your browser" 