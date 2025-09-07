#!/bin/bash

echo "🔍 Starting Platform Status Instability Debug..."
echo "=============================================="

# Start the development servers in the background
echo "🚀 Starting development servers..."
npm run dev &
DEV_PID=$!

# Wait for servers to start
echo "⏳ Waiting for servers to start (30 seconds)..."
sleep 30

# Run the debug test
echo "🧪 Running platform status debug test..."
npm run test:e2e -- --grep "Platform Status Instability Debug"

# Clean up
echo "🧹 Cleaning up..."
kill $DEV_PID 2>/dev/null || true

echo "✅ Debug complete! Check the console output above for analysis."
echo "📸 Screenshots saved in tests/screenshots/"
