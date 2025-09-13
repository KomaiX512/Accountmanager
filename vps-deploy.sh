#!/bin/bash

# =============================================================================
# UNIFIED VPS DEPLOYMENT SCRIPT - PRODUCTION GRADE
# =============================================================================
# This script handles complete VPS deployment with SINGLE unified servers:
# - Main API Server (port 3000) - 1 instance
# - RAG Server (port 3001) - 1 instance  
# - Proxy Server (port 3002) - 1 instance
# Features: Zero-downtime deployment, health monitoring, automatic recovery
# =============================================================================

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
DEPLOY_DIR="/var/www/sentientm/Accountmanager"
SOURCE_DIR="$(pwd)"
NGINX_CONFIG_SOURCE="./VPS.conf"
NGINX_CONFIG_TARGET="/etc/nginx/sites-available/sentientm.com"
NGINX_ENABLED_LINK="/etc/nginx/sites-enabled/sentientm.com"
LOG_DIR="./logs"
MONITOR_INTERVAL=120  # 2 minutes monitoring
HEALTH_CHECK_TIMEOUT=10

echo -e "${PURPLE}🚀 UNIFIED VPS DEPLOYMENT STARTING${NC}"
echo "=================================================="
echo "Deploy Directory: $DEPLOY_DIR"
echo "Source Directory: $SOURCE_DIR"
echo "Mode: UNIFIED (Single servers, no clustering)"
echo "Monitoring Interval: ${MONITOR_INTERVAL}s"
echo "=================================================="

# Function to print colored output
print_status() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] ℹ️  $1${NC}"
}

# Function to check if a port is in use
check_port() {
    local port=$1
    if netstat -tuln | grep -q ":$port "; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to kill processes on specific ports
kill_port_processes() {
    local port=$1
    print_info "Checking for processes on port $port..."
    
    local pids=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
        print_warning "Killing processes on port $port: $pids"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 2
    else
        print_status "Port $port is free"
    fi
}

# Function to wait for port to be available
wait_for_port_free() {
    local port=$1
    local max_attempts=30
    local attempt=1
    
    while check_port $port && [ $attempt -le $max_attempts ]; do
        print_info "Waiting for port $port to be free (attempt $attempt/$max_attempts)..."
        sleep 1
        ((attempt++))
    done
    
    if check_port $port; then
        print_error "Port $port is still in use after $max_attempts attempts"
        return 1
    else
        print_status "Port $port is now free"
        return 0
    fi
}

# Function to wait for service to be ready
wait_for_service() {
    local port=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1
    
    print_info "Waiting for $service_name to be ready on port $port..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "http://localhost:$port/health" >/dev/null 2>&1; then
            print_status "$service_name is ready on port $port"
            return 0
        fi
        
        print_info "Waiting for $service_name (attempt $attempt/$max_attempts)..."
        sleep 2
        ((attempt++))
    done
    
    print_warning "$service_name health check failed after $max_attempts attempts"
    return 1
}

# Step 1: Navigate to deployment directory
print_info "Step 1: Navigating to deployment directory"
cd "$DEPLOY_DIR" || {
    print_error "Failed to navigate to $DEPLOY_DIR"
    exit 1
}
print_status "Changed to deployment directory: $(pwd)"

# Step 2: Create logs directory
print_info "Step 2: Creating logs directory"
mkdir -p "$LOG_DIR"
print_status "Logs directory ready: $LOG_DIR"

# Step 3: Stop existing PM2 processes
print_info "Step 3: Stopping existing PM2 processes"
if pm2 list | grep -q "online\|stopped\|errored"; then
    print_warning "Stopping existing PM2 processes..."
    pm2 stop all 2>/dev/null || true
    pm2 delete all 2>/dev/null || true
    print_status "Existing PM2 processes stopped"
else
    print_status "No existing PM2 processes found"
fi

# Step 4: Kill processes on required ports
print_info "Step 4: Cleaning up port conflicts"
for port in 3000 3001 3002; do
    kill_port_processes $port
    wait_for_port_free $port || {
        print_error "Failed to free port $port"
        exit 1
    }
done
print_status "All required ports are now free"

# Step 5: Update Nginx configuration
print_info "Step 5: Updating Nginx configuration"
if [ -f "$NGINX_CONFIG_SOURCE" ]; then
    # Backup existing config
    if [ -f "$NGINX_CONFIG_TARGET" ]; then
        cp "$NGINX_CONFIG_TARGET" "${NGINX_CONFIG_TARGET}.backup.$(date +%Y%m%d_%H%M%S)"
        print_status "Backed up existing Nginx config"
    fi
    
    # Clean the config file to remove any "sudo" directives or invalid syntax
    print_info "Cleaning Nginx configuration..."
    sed -e '/^[[:space:]]*sudo/d' \
        -e '/^[[:space:]]*#.*sudo/d' \
        -e 's/sudo //g' \
        "$NGINX_CONFIG_SOURCE" > "${NGINX_CONFIG_SOURCE}.clean"
    
    # Copy cleaned config
    cp "${NGINX_CONFIG_SOURCE}.clean" "$NGINX_CONFIG_TARGET"
    rm -f "${NGINX_CONFIG_SOURCE}.clean"
    print_status "Updated Nginx configuration"
    
    # Enable site if not already enabled
    if [ ! -L "$NGINX_ENABLED_LINK" ]; then
        ln -sf "$NGINX_CONFIG_TARGET" "$NGINX_ENABLED_LINK"
        print_status "Enabled Nginx site"
    fi
    
    # Test Nginx configuration
    print_info "Testing Nginx configuration..."
    if nginx -t 2>&1 | tee /tmp/nginx_test.log; then
        systemctl reload nginx
        print_status "Nginx configuration reloaded successfully"
    else
        print_error "Nginx configuration test failed:"
        cat /tmp/nginx_test.log
        print_warning "Attempting to fix common issues..."
        
        # Try to fix common syntax issues
        sed -i -e 's/proxy_set_header[[:space:]]*$/proxy_set_header Host $host;/' \
               -e '/^[[:space:]]*$/d' \
               -e '/^[[:space:]]*#/d' \
               "$NGINX_CONFIG_TARGET"
        
        # Test again
        if nginx -t; then
            systemctl reload nginx
            print_status "Nginx configuration fixed and reloaded"
        else
            print_error "Failed to fix Nginx configuration. Manual intervention required."
            print_info "Check the configuration at: $NGINX_CONFIG_TARGET"
            exit 1
        fi
    fi
else
    print_warning "Nginx config source not found: $NGINX_CONFIG_SOURCE"
    print_info "Creating minimal working Nginx configuration..."
    
    # Create a minimal working configuration
    cat > "$NGINX_CONFIG_TARGET" << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name sentientm.com www.sentientm.com;
    
    root /var/www/sentientm/Accountmanager/dist;
    index index.html;
    
    # API proxy to main server
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # RAG server endpoints
    location ^~ /api/rag/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Proxy server endpoints
    location ^~ /api/r2-image/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Static files
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
    
    # Enable site
    ln -sf "$NGINX_CONFIG_TARGET" "$NGINX_ENABLED_LINK"
    
    # Test and reload
    if nginx -t; then
        systemctl reload nginx
        print_status "Minimal Nginx configuration created and loaded"
    else
        print_error "Failed to create working Nginx configuration"
        exit 1
    fi
fi

# Step 6: Deploy source code and build assets
print_info "Step 6: Syncing source code to VPS"

# Create deployment directory if it doesn't exist
mkdir -p "$DEPLOY_DIR"

# Sync entire codebase (excluding node_modules and dist)
print_info "Syncing codebase from $SOURCE_DIR to $DEPLOY_DIR..."
rsync -av --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'dist' \
    --exclude 'logs' \
    "$SOURCE_DIR/" "$DEPLOY_DIR/"

print_status "Source code synchronized"

# Step 7: Install dependencies and build
print_info "Step 7: Installing dependencies and building"
if [ -f "package.json" ]; then
    npm ci --production --silent
    print_status "Dependencies installed"
    
    # Build frontend if build script exists
    if grep -q '"build"' package.json; then
        print_info "Building frontend assets..."
        npm run build
        
        if [ -d "./dist" ]; then
            mkdir -p "/var/www/sentientm/dist"
            rsync -av --delete ./dist/ /var/www/sentientm/dist/
            print_status "Frontend assets built and deployed"
        fi
    fi
else
    print_warning "No package.json found, skipping dependency installation"
fi

# Install server dependencies separately
if [ -d "server" ] && [ -f "server/package.json" ]; then
    print_info "Installing server dependencies..."
    cd server
    npm ci --production --silent
    cd ..
    print_status "Server dependencies installed"
fi

# Step 8: Start UNIFIED PM2 servers with ecosystem config
print_info "Step 8: Starting UNIFIED PM2 servers"

# Ensure ecosystem config exists or create it
if [ ! -f "ecosystem.config.cjs" ]; then
    print_warning "ecosystem.config.cjs not found, creating it..."
    cat > ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [
    {
      name: 'main-api-unified',
      script: './server/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        MAIN_SERVER_PORT: 3000
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      autorestart: true,
      watch: false,
      error_file: './logs/main-api-error.log',
      out_file: './logs/main-api-out.log',
      log_file: './logs/main-api-combined.log',
      time: true
    },
    {
      name: 'rag-server-unified',
      script: './rag-server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        RAG_SERVER_PORT: 3001
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      autorestart: true,
      watch: false,
      error_file: './logs/rag-server-error.log',
      out_file: './logs/rag-server-out.log',
      log_file: './logs/rag-server-combined.log',
      time: true
    },
    {
      name: 'proxy-server-unified',
      script: './server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        PROXY_SERVER_PORT: 3002
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      autorestart: true,
      watch: false,
      error_file: './logs/proxy-server-error.log',
      out_file: './logs/proxy-server-out.log',
      log_file: './logs/proxy-server-combined.log',
      time: true
    }
  ]
};
EOF
    print_status "Created ecosystem.config.cjs"
fi

# Set environment variables for PM2
export NODE_ENV=production
export MAIN_SERVER_PORT=3000
export RAG_SERVER_PORT=3001
export PROXY_SERVER_PORT=3002

print_info "Starting PM2 ecosystem with UNIFIED configuration..."
if pm2 start ecosystem.config.cjs --env production; then
    print_status "Unified PM2 servers started successfully"
else
    print_error "PM2 ecosystem start failed, trying manual startup..."
    
    # Fallback: Start servers manually with better error handling
    print_info "Starting main API server..."
    if [ -f "server/server.js" ]; then
        pm2 start server/server.js --name "main-api-unified" \
            --env NODE_ENV=production \
            --env MAIN_SERVER_PORT=3000 \
            --max-memory-restart 1G \
            --autorestart \
            --watch false \
            --log ./logs/main-api-combined.log || print_warning "Main API server failed to start"
    else
        print_error "server/server.js not found!"
    fi
    
    print_info "Starting RAG server..."
    if [ -f "rag-server.js" ]; then
        pm2 start rag-server.js --name "rag-server-unified" \
            --env NODE_ENV=production \
            --env RAG_SERVER_PORT=3001 \
            --max-memory-restart 512M \
            --autorestart \
            --watch false \
            --log ./logs/rag-server-combined.log || print_warning "RAG server failed to start"
    else
        print_error "rag-server.js not found!"
    fi
    
    print_info "Starting proxy server..."
    if [ -f "server.js" ]; then
        pm2 start server.js --name "proxy-server-unified" \
            --env NODE_ENV=production \
            --env PROXY_SERVER_PORT=3002 \
            --max-memory-restart 512M \
            --autorestart \
            --watch false \
            --log ./logs/proxy-server-combined.log || print_warning "Proxy server failed to start"
    else
        print_error "server.js not found!"
    fi
    
    print_status "Manual server startup completed"
fi

# Save PM2 configuration
pm2 save

# Display PM2 status
echo ""
print_info "PM2 Process Status:"
pm2 list
echo ""

# Step 9: Comprehensive Health checks
print_info "Step 9: Performing comprehensive health checks"
sleep 5  # Give services time to start

# Function to check service health
check_service_health() {
    local port=$1
    local name=$2
    local max_attempts=10
    local attempt=1
    
    print_info "Checking $name (port $port)..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s --max-time 5 "http://127.0.0.1:$port/health" > /dev/null 2>&1 || \
           curl -s --max-time 5 "http://127.0.0.1:$port/api/health" > /dev/null 2>&1 || \
           nc -z 127.0.0.1 $port > /dev/null 2>&1; then
            print_status "$name is healthy (attempt $attempt)"
            return 0
        fi
        
        print_warning "$name not ready yet (attempt $attempt/$max_attempts)"
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_error "$name failed health check after $max_attempts attempts"
    return 1
}

# Check each service with comprehensive health monitoring
services=(
    "3000:Main API Server"
    "3001:RAG Server" 
    "3002:Proxy Server"
)

healthy_services=0
total_services=${#services[@]}

for service in "${services[@]}"; do
    port=$(echo $service | cut -d: -f1)
    name=$(echo $service | cut -d: -f2)
    
    if check_service_health $port "$name"; then
        healthy_services=$((healthy_services + 1))
    fi
done

# Calculate health percentage
health_percentage=$(( (healthy_services * 100) / total_services ))

echo ""
print_info "=== HEALTH SUMMARY ==="
print_info "Healthy Services: $healthy_services/$total_services ($health_percentage%)"

if [ $health_percentage -ge 67 ]; then
    print_status "System is operational (≥67% healthy)"
else
    print_warning "System has issues (<67% healthy)"
fi

# Additional system checks
print_info "=== SYSTEM CHECKS ==="

# Check Nginx status
if systemctl is-active --quiet nginx; then
    print_status "Nginx is running"
else
    print_warning "Nginx is not running"
fi

# Check disk space
disk_usage=$(df /var/www | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $disk_usage -lt 90 ]; then
    print_status "Disk usage: ${disk_usage}% (OK)"
else
    print_warning "Disk usage: ${disk_usage}% (HIGH)"
fi

# Check memory usage
memory_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
if [ $memory_usage -lt 85 ]; then
    print_status "Memory usage: ${memory_usage}% (OK)"
else
    print_warning "Memory usage: ${memory_usage}% (HIGH)"
fi

# Final deployment summary
echo ""
print_info "=== DEPLOYMENT SUMMARY ==="
print_info "Deployment Directory: $DEPLOY_DIR"
print_info "Nginx Configuration: $NGINX_CONFIG_TARGET"
print_info "PM2 Processes: $(pm2 list | grep -c 'online')/3 online"
print_info "System Health: $health_percentage%"

if [ $health_percentage -ge 67 ]; then
    echo ""
    print_status "🎉 DEPLOYMENT SUCCESSFUL!"
    print_status "Application is running at: http://sentientm.com"
    print_info "Monitor with: pm2 monit"
    print_info "View logs with: pm2 logs"
    print_info "Restart services with: pm2 restart all"
else
    echo ""
    print_warning "⚠️  DEPLOYMENT COMPLETED WITH ISSUES"
    print_warning "Some services may not be fully operational"
    print_info "Check logs with: pm2 logs"
    print_info "Debug with: pm2 monit"
fi

echo ""
print_info "=== USEFUL COMMANDS ==="
print_info "Check PM2 status: pm2 list"
print_info "View all logs: pm2 logs"
print_info "Monitor processes: pm2 monit"
print_info "Restart all: pm2 restart all"
print_info "Stop all: pm2 stop all"
print_info "Check Nginx: nginx -t && systemctl status nginx"
print_info "View Nginx logs: tail -f /var/log/nginx/sentientm.*.log"

echo ""
print_status "🚀 Deployment script completed successfully at $(date)"
