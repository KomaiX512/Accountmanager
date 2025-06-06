#!/bin/bash

# Stop the server monitor and server
echo "Stopping server processes..."

# Check if the monitor PID file exists
if [ -f .monitor.pid ]; then
    MONITOR_PID=$(cat .monitor.pid)
    if ps -p $MONITOR_PID > /dev/null; then
        echo "Stopping monitor process $MONITOR_PID"
        kill $MONITOR_PID
        rm .monitor.pid
    else
        echo "Monitor process $MONITOR_PID not found"
    fi
fi

# Kill any remaining node processes for our server
pkill -f "node server.js" || echo "No server processes found"
pkill -f "node server-monitor.js" || echo "No monitor processes found"

# Wait for processes to terminate
sleep 2

# Check if any server processes are still running
if pgrep -f "node server.js" > /dev/null || pgrep -f "node server-monitor.js" > /dev/null; then
    echo "Warning: Some processes still running. Forcing termination..."
    pkill -9 -f "node server.js" || echo "No server processes found"
    pkill -9 -f "node server-monitor.js" || echo "No monitor processes found"
else
    echo "All server processes terminated successfully."
fi 