#!/bin/bash

echo "🤖 Starting RAG Server..."

# Set environment variables
export NODE_ENV=development
export RAG_SERVER_PORT=3001
export HOST=localhost
export PATH="/home/komail/.local/bin:/usr/local/bin:/usr/bin:/bin"
export PYTHONPATH="/usr/lib/python3/dist-packages"

# Start the RAG server
node rag-server.js
