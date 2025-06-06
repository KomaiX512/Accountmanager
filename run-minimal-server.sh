#!/bin/bash

# Kill any existing node processes for the image server
echo "Checking for existing server processes..."
pkill -f "node server.js" || echo "No existing server.js processes found."
pkill -f "node server-direct-fix.js" || echo "No existing direct-fix processes found."

# Wait for processes to terminate
sleep 2

# Create necessary directories
mkdir -p public
mkdir -p ready_post/instagram/narsissist

# Create placeholder image for narsissist if it doesn't exist
if [ ! -f ready_post/instagram/narsissist/image_1749203937329.jpg ]; then
  echo "Creating placeholder image for narsissist..."
  # Try using ImageMagick
  convert -size 512x512 xc:lightblue -gravity center -pointsize 20 -annotate 0 "Narsissist Image Placeholder" ready_post/instagram/narsissist/image_1749203937329.jpg 2>/dev/null || {
    # If imagemagick convert is not available, create an SVG
    echo "ImageMagick not available, creating SVG placeholder"
    echo '<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#add8e6"/><text x="50%" y="50%" font-family="Arial" font-size="20" text-anchor="middle" fill="#000000">Narsissist Image Placeholder</text></svg>' > ready_post/instagram/narsissist/placeholder.svg
    
    # Try to create a symlink
    ln -sf placeholder.svg ready_post/instagram/narsissist/image_1749203937329.jpg || {
      # If symlink fails, just copy the file
      cp ready_post/instagram/narsissist/placeholder.svg ready_post/instagram/narsissist/image_1749203937329.jpg
    }
  }
fi

# Create a general placeholder image if it doesn't exist
if [ ! -f public/placeholder.jpg ]; then
  echo "Creating general placeholder image..."
  # Try using ImageMagick
  convert -size 512x512 xc:lightgray -gravity center -pointsize 20 -annotate 0 "Placeholder Image" public/placeholder.jpg 2>/dev/null || {
    # If imagemagick convert is not available, create an SVG
    echo "ImageMagick not available, creating SVG placeholder"
    echo '<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#cccccc"/><text x="50%" y="50%" font-family="Arial" font-size="20" text-anchor="middle" fill="#333333">Placeholder Image</text></svg>' > public/placeholder.svg
    
    # Try to create a symlink
    ln -sf placeholder.svg public/placeholder.jpg || {
      # If symlink fails, just copy the file
      cp public/placeholder.svg public/placeholder.jpg
    }
  }
fi

# Start the server directly
echo "Starting minimal image proxy server..."
node server-direct-fix.js 