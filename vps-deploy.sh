#!/bin/bash

# =============================================================================
# VPS DEPLOYMENT SCRIPT WITH PM2 CLUSTER MANAGEMENT
# =============================================================================
# This script handles complete VPS deployment with PM2 clustering for:
# - Main API Server (port 3000) - 3 instances
# - RAG Server (port 3001) - 1 instance  
# - Proxy Server (port 3002) - 2 instances
# =============================================================================

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOY_DIR="/var/www/sentientm/Accountmanager"
NGINX_CONFIG_SOURCE="./VPS.conf"
NGINX_CONFIG_TARGET="/etc/nginx/sites-available/sentientm.com"
NGINX_ENABLED_LINK="/etc/nginx/sites-enabled/sentientm.com"
LOG_DIR="./logs"

# PM2 Configuration
export MAIN_INSTANCES=3
export RAG_INSTANCES=1
export PROXY_INSTANCES=2

echo -e "${BLUE}🚀 VPS DEPLOYMENT STARTING${NC}"
echo "=================================================="
echo "Deploy Directory: $DEPLOY_DIR"
echo "Main API Instances: $MAIN_INSTANCES"
echo "RAG Server Instances: $RAG_INSTANCES" 
echo "Proxy Server Instances: $PROXY_INSTANCES"
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
    
    # Copy new config
    cp "$NGINX_CONFIG_SOURCE" "$NGINX_CONFIG_TARGET"
    print_status "Updated Nginx configuration"
    
    # Enable site if not already enabled
    if [ ! -L "$NGINX_ENABLED_LINK" ]; then
        ln -sf "$NGINX_CONFIG_TARGET" "$NGINX_ENABLED_LINK"
        print_status "Enabled Nginx site"
    fi
    
    # Test and reload Nginx
    if nginx -t; then
        systemctl reload nginx
        print_status "Nginx configuration reloaded successfully"
    else
        print_error "Nginx configuration test failed"
        exit 1
    fi
else
    print_warning "Nginx config source not found: $NGINX_CONFIG_SOURCE"
fi

# Step 6: Deploy static assets (if dist directory exists)
print_info "Step 6: Deploying static assets"
if [ -d "./dist" ]; then
    rsync -av --delete ./dist/ /var/www/sentientm/Accountmanager/dist/
    print_status "Static assets deployed"
else
    print_warning "No dist directory found, skipping static asset deployment"
fi

# Step 7: Install/Update dependencies
print_info "Step 7: Installing dependencies"
if [ -f "package.json" ]; then
    npm ci --production --silent
    print_status "Dependencies installed"
else
    print_warning "No package.json found, skipping dependency installation"
fi

# Step 8: Start PM2 cluster with ecosystem config
print_info "Step 8: Starting PM2 cluster"
if [ -f "ecosystem.config.cjs" ]; then
    # Set environment variables for PM2
    export NODE_ENV=production
    export MAIN_SERVER_PORT=3000
    export RAG_SERVER_PORT=3001
    export PROXY_SERVER_PORT=3002
    
    print_info "Starting PM2 ecosystem with cluster configuration..."
    pm2 start ecosystem.config.cjs --env production
    
    print_status "PM2 cluster started successfully"
    
    # Display PM2 status
    echo ""
    print_info "PM2 Process Status:"
    pm2 list
    echo ""
else
    print_error "ecosystem.config.cjs not found"
    exit 1
fi

# Step 9: Health checks
print_info "Step 9: Performing health checks"
sleep 5  # Give services time to start

# Check each service
services=(
    "3000:Main API Server"
    "3001:RAG Server" 
    "3002:Proxy Server"
)

all_healthy=true
for service in "${services[@]}"; do
    port="${service%%:*}"
    name="${service##*:}"
    
    if wait_for_service "$port" "$name"; then
        print_status "$name health check passed"
    else
        print_error "$name health check failed"
        all_healthy=false
    fi
done

# Step 10: Test key endpoints
print_info "Step 10: Testing key endpoints"
test_endpoints=(
    "http://localhost:3000/health:Main API"
    "http://localhost:3001/health:RAG Server"
    "http://localhost:3002/health:Proxy Server"
)

for endpoint in "${test_endpoints[@]}"; do
    url="${endpoint%%:*}"
    name="${endpoint##*:}"
    
    if curl -s -f "$url" >/dev/null; then
        print_status "$name endpoint test passed"
    else
        print_warning "$name endpoint test failed"
    fi
done

# Step 11: Setup PM2 startup (if not already configured)
print_info "Step 11: Configuring PM2 startup"
if ! pm2 startup | grep -q "already"; then
    print_info "Setting up PM2 startup script..."
    pm2 startup systemd -u root --hp /root
    pm2 save
    print_status "PM2 startup configured"
else
    pm2 save
    print_status "PM2 startup already configured, saved current processes"
fi

# Step 12: Final status report
echo ""
echo "=================================================="
print_info "DEPLOYMENT SUMMARY"
echo "=================================================="

if [ "$all_healthy" = true ]; then
    print_status "🎉 VPS DEPLOYMENT COMPLETE!"
    echo ""
    print_info "Services Status:"
    pm2 list
    echo ""
    print_info "Service URLs:"
    echo "  • Main API: http://localhost:3000/health"
    echo "  • RAG Server: http://localhost:3001/health" 
    echo "  • Proxy Server: http://localhost:3002/health"
    echo "  • Public Site: https://sentientm.com"
    echo ""
    print_info "Useful Commands:"
    echo "  • View logs: pm2 logs"
    echo "  • Monitor: pm2 monit"
    echo "  • Restart: pm2 restart ecosystem.config.cjs"
    echo "  • Stop: pm2 stop all"
    echo ""
else
    print_error "⚠️  DEPLOYMENT COMPLETED WITH WARNINGS"
    print_warning "Some services failed health checks. Check logs with: pm2 logs"
fi

echo "=================================================="
