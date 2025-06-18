#!/bin/bash

# 🚀 Enhanced RAG Setup Script with ChromaDB
# This script sets up the ChromaDB vector database for enhanced RAG quality

echo "🚀 Setting up Enhanced RAG with ChromaDB Vector Database"
echo "========================================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are available"

# Install Node.js dependencies
echo ""
echo "📦 Installing Node.js dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install Node.js dependencies"
    exit 1
fi

echo "✅ Node.js dependencies installed successfully"

# Start ChromaDB using Docker Compose
echo ""
echo "🐳 Starting ChromaDB server..."
docker-compose -f docker-compose.chromadb.yml up -d

if [ $? -ne 0 ]; then
    echo "❌ Failed to start ChromaDB server"
    exit 1
fi

echo "✅ ChromaDB server started successfully"

# Wait for ChromaDB to be ready
echo ""
echo "⏳ Waiting for ChromaDB to be ready..."
sleep 10

# Test ChromaDB connection
max_attempts=30
attempt=1

while [ $attempt -le $max_attempts ]; do
    if curl -s http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; then
        echo "✅ ChromaDB is ready and responding"
        break
    else
        echo "⏳ Attempt $attempt/$max_attempts - ChromaDB not ready yet..."
        sleep 2
        ((attempt++))
    fi
done

if [ $attempt -gt $max_attempts ]; then
    echo "❌ ChromaDB failed to start properly"
    echo "📋 Checking ChromaDB logs:"
    docker-compose -f docker-compose.chromadb.yml logs chromadb
    exit 1
fi

# Create necessary directories
echo ""
echo "📁 Creating necessary directories..."
mkdir -p data/vector_fallback
mkdir -p data/cache
mkdir -p data/conversations
mkdir -p test-results

echo "✅ Directories created successfully"

# Start the RAG server
echo ""
echo "🚀 Starting Enhanced RAG Server..."
echo "📋 The server will start with ChromaDB integration enabled"
echo "🔍 Vector search capabilities will be automatically activated"
echo ""
echo "🎯 Ready to test with fentybeauty Instagram account!"
echo ""
echo "📚 Available endpoints:"
echo "  • POST /api/discussion - Enhanced RAG discussions"
echo "  • POST /admin/test-chromadb - Test ChromaDB connection"
echo "  • GET /admin/chromadb-stats - ChromaDB statistics"
echo "  • POST /admin/reindex-profile - Force reindex profile data"
echo "  • POST /admin/test-semantic-search - Test semantic search"
echo ""
echo "🧪 To run battle tests:"
echo "  node test-enhanced-rag.js"
echo ""
echo "🔧 To stop ChromaDB:"
echo "  docker-compose -f docker-compose.chromadb.yml down"
echo ""

# Start the RAG server
node rag-server.js 