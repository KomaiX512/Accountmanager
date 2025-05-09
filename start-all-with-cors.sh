#!/bin/bash

echo "Starting all servers with enhanced CORS handling..."

# Set environment variable for CORS awareness
export ENHANCED_CORS="true"

# Start the RAG server
echo "Starting RAG server on port 3001..."
node rag-server.js &
RAG_PID=$!

# Wait for RAG server to start
sleep 3
if curl -s http://localhost:3001/health > /dev/null; then
  echo "✅ RAG server running on port 3001"
else
  echo "❌ RAG server failed to start on port 3001"
  echo "Shutting down..."
  kill $RAG_PID 2>/dev/null
  exit 1
fi

# Start the proxy server
echo "Starting proxy server on port 3002..."
node server.js &
PROXY_PID=$!

# Wait for proxy server to start
sleep 3
if curl -s http://localhost:3002/health > /dev/null; then
  echo "✅ Proxy server running on port 3002"
else
  echo "❌ Proxy server failed to start on port 3002"
  echo "Shutting down..."
  kill $RAG_PID $PROXY_PID 2>/dev/null
  exit 1
fi

# Start the main server
echo "Starting main server on port 3000..."
cd server && node server.js &
MAIN_PID=$!

# Wait for main server to start
sleep 3
cd ..
if curl -s http://localhost:3000/health > /dev/null; then
  echo "✅ Main server running on port 3000"
else
  echo "❌ Main server failed to start on port 3000"
  echo "Shutting down..."
  kill $RAG_PID $PROXY_PID $MAIN_PID 2>/dev/null
  exit 1
fi

echo "All servers are running with enhanced CORS handling"
echo "Now testing the instant AI reply endpoint..."

# Test the endpoint
node /tmp/test_rag_service.js

echo "Press Ctrl+C to stop all servers"

# Handle stopping servers on exit
trap "echo 'Stopping all servers...'; kill $RAG_PID $PROXY_PID $MAIN_PID 2>/dev/null" EXIT INT TERM

# Keep script running
wait 