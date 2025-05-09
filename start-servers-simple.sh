#!/bin/bash

# Start all servers without the complexity that might be causing issues

# Start the RAG server
echo "Starting RAG server..."
node rag-server.js &
RAG_PID=$!

# Small delay
sleep 2

# Start the proxy server
echo "Starting proxy server..."
node server.js &
PROXY_PID=$!

# Small delay
sleep 2

# Start the main server
echo "Starting main server..."
cd server && node server.js &
MAIN_PID=$!

echo "All servers should be starting now..."
echo "Press Ctrl+C to stop all servers"

# Wait for user to press Ctrl+C
wait 