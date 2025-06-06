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

# Create a general placeholder image
echo "Creating general placeholder image..."
convert -size 512x512 xc:lightgray -gravity center -pointsize 20 -annotate 0 "Placeholder Image" public/placeholder.jpg 2>/dev/null || {
  # If imagemagick is not available, create a simple HTML placeholder
  echo "ImageMagick not available, creating simple placeholder file"
  echo '<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#cccccc"/><text x="50%" y="50%" font-family="Arial" font-size="20" text-anchor="middle" fill="#333333">Placeholder Image</text></svg>' > public/placeholder.svg
  echo "Creating symlink from SVG to JPG"
  ln -sf placeholder.svg public/placeholder.jpg
}

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