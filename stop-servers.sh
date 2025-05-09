#!/bin/bash

echo "Stopping all AccountManager servers..."

# Kill processes on specific ports
kill_port() {
  local port=$1
  local pids=$(lsof -ti:$port 2>/dev/null)
  
  if [ -n "$pids" ]; then
    echo "Stopping server on port $port (PID: $pids)..."
    kill -9 $pids 2>/dev/null
    echo "✓ Server on port $port stopped."
  else
    echo "No server running on port $port."
  fi
}

# Stop servers on standard ports
kill_port 3000
kill_port 3001
kill_port 3002

# Also try to kill servers by name (for screen sessions)
if command -v screen &>/dev/null; then
  echo "Checking for screen sessions..."
  for session in main_server rag_server image_server; do
    if screen -list | grep -q $session; then
      echo "Stopping screen session: $session"
      screen -S $session -X quit
    fi
  done
fi

echo "All servers stopped." 