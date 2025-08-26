#!/bin/bash

# Make sure the script is executable
chmod +x server-monitor.js

# Create necessary directories
mkdir -p public
mkdir -p logs
mkdir -p image_cache
mkdir -p ready_post/instagram/narsissist

# Create placeholder image for narsissist if it doesn't exist
if [ ! -f ready_post/instagram/narsissist/image_1749203937329.jpg ]; then
  echo "Creating placeholder image for narsissist..."
  convert -size 512x512 xc:lightblue -gravity center -pointsize 20 -annotate 0 "Narsissist Image Placeholder" ready_post/instagram/narsissist/image_1749203937329.jpg || {
    # If imagemagick convert is not available, create blank file
    echo "ImageMagick not available, creating empty placeholder file"
    touch ready_post/instagram/narsissist/image_1749203937329.jpg
  }
fi

# Remove any legacy placeholder assets to avoid accidental usage
rm -f public/placeholder.jpg public/placeholder.svg 2>/dev/null || true

# Kill any existing node processes for this server
echo "Checking for existing server processes..."
pkill -f "node server.js" || echo "No existing server processes found."
pkill -f "node server-monitor.js" || echo "No existing monitor processes found."

# Wait for processes to terminate
sleep 2

# Create logs directory if it doesn't exist
mkdir -p logs

# Start the server with the monitor
echo "Starting server monitor..."
nohup node server-monitor.js >> logs/monitor.log 2>&1 &
echo "Server monitor started with PID $!"

# Save the PID for later reference
echo $! > .monitor.pid

echo "To view logs:"
echo "  tail -f logs/monitor.log"
echo "  tail -f logs/server-uptime.log"
echo "  tail -f logs/server-crash.log"

# Wait a moment for the server to start
sleep 3

# Check if the server is running
if pgrep -f "node server.js" > /dev/null; then
    echo "Server is running."
else
    echo "Warning: Server may not have started properly. Check logs."
fi 