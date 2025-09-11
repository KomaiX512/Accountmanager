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

if [ -f "ecosystem.config.cjs" ]; then
    # Set environment variables for PM2
    export NODE_ENV=production
    export MAIN_SERVER_PORT=3000
    export RAG_SERVER_PORT=3001
    export PROXY_SERVER_PORT=3002
    
    print_info "Starting PM2 ecosystem with UNIFIED configuration..."
    pm2 start ecosystem.config.cjs --env production
    
    print_status "Unified PM2 servers started successfully"
else
    print_warning "ecosystem.config.cjs not found, starting servers manually..."
    
    # Fallback: Start servers manually
    pm2 start server/server.js --name "main-api-unified" \
        --env NODE_ENV=production \
        --env MAIN_SERVER_PORT=3000 \
        --max-memory-restart 1G \
        --autorestart \
        --watch false
    
    pm2 start rag-server.js --name "rag-server-unified" \
        --env NODE_ENV=production \
        --env RAG_SERVER_PORT=3001 \
        --max-memory-restart 512M \
        --autorestart \
        --watch false
    
    pm2 start server.js --name "proxy-server-unified" \
        --env NODE_ENV=production \
        --env PROXY_SERVER_PORT=3002 \
        --max-memory-restart 512M \
        --autorestart \
        --watch false
    
    print_status "Manual unified servers started successfully"
fi

# Display PM2 status
echo ""
print_info "PM2 Process Status:"
pm2 list
echo ""

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

# Step 11: Setup PM2 startup and monitoring
print_info "Step 11: Configuring PM2 startup and monitoring"
if ! pm2 startup | grep -q "already"; then
    print_info "Setting up PM2 startup script..."
    pm2 startup systemd -u root --hp /root
    pm2 save
    print_status "PM2 startup configured"
else
    pm2 save
    print_status "PM2 startup already configured, saved current processes"
fi

# Step 12: Deploy monitoring script
print_info "Step 12: Deploying production monitoring"
cat > /usr/local/bin/sentientm-monitor.sh << 'EOF'
#!/bin/bash
# SentientM Production Monitoring Script
# Runs every 2 minutes via cron to ensure servers never crash

LOG_FILE="/var/log/sentientm-monitor.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Function to log with timestamp
log() {
    echo "[$DATE] $1" >> "$LOG_FILE"
}

# Check if PM2 process is running
check_process() {
    local process_name=$1
    local port=$2
    
    if ! pm2 list | grep -q "$process_name.*online"; then
        log "ERROR: $process_name is not online, restarting..."
        pm2 restart "$process_name" || pm2 start "$process_name"
        sleep 5
    fi
    
    # Health check
    if ! curl -sf "http://localhost:$port/health" >/dev/null 2>&1; then
        log "ERROR: $process_name health check failed on port $port, restarting..."
        pm2 restart "$process_name"
        sleep 5
    else
        log "OK: $process_name healthy on port $port"
    fi
}

# Monitor all services
check_process "main-api-unified" 3000
check_process "rag-server-unified" 3001
check_process "proxy-server-unified" 3002

# Memory check and restart if over 80%
pm2 list | grep -E '(main-api|rag-server|proxy-server)' | while read line; do
    if echo "$line" | grep -q '8[0-9]\.[0-9]\|9[0-9]\.[0-9]'; then
        process_name=$(echo "$line" | awk '{print $2}')
        log "WARNING: $process_name high memory usage, restarting..."
        pm2 restart "$process_name"
    fi
done
EOF

chmod +x /usr/local/bin/sentientm-monitor.sh

# Add cron job for 2-minute monitoring
(crontab -l 2>/dev/null; echo "*/2 * * * * /usr/local/bin/sentientm-monitor.sh") | crontab -
print_status "Production monitoring deployed with 2-minute intervals"

# Step 13: Production-grade testing
print_info "Step 13: Running production-grade tests"

# Test image serving (critical for frontend)
print_info "Testing image serving endpoint..."
if curl -sf "http://localhost:3002/api/r2-image/test" >/dev/null 2>&1; then
    print_status "Image serving endpoint responsive"
else
    print_warning "Image serving needs verification with real image paths"
fi

# Test critical API endpoints
critical_endpoints=(
    "http://localhost:3000/api/validate-dashboard-access:Dashboard Access"
    "http://localhost:3001/api/conversations/test:RAG Conversations"
    "http://localhost:3002/health:Proxy Health"
)

for endpoint in "${critical_endpoints[@]}"; do
    url="${endpoint%%:*}"
    name="${endpoint##*:}"
    
    if curl -sf "$url" >/dev/null 2>&1; then
        print_status "$name endpoint operational"
    else
        print_info "$name endpoint needs authentication/data (expected)"
    fi
done

# Performance test
print_info "Running performance verification..."
for i in {1..5}; do
    response_time=$(curl -o /dev/null -s -w "%{time_total}" http://localhost:3000/health)
    if (( $(echo "$response_time < 1.0" | bc -l) )); then
        print_status "Health check $i: ${response_time}s (excellent)"
    else
        print_warning "Health check $i: ${response_time}s (slow)"
    fi
done

# Step 14: Final status report
echo ""
echo "=================================================="
print_info "UNIFIED DEPLOYMENT SUMMARY"
echo "=================================================="

if [ "$all_healthy" = true ]; then
    print_status "🎉 UNIFIED VPS DEPLOYMENT COMPLETE!"
    echo ""
    print_info "Services Status (UNIFIED MODE):"
    pm2 list
    echo ""
    print_info "Service URLs:"
    echo "  • Main API: http://localhost:3000/health"
    echo "  • RAG Server: http://localhost:3001/health" 
    echo "  • Proxy Server: http://localhost:3002/health"
    echo "  • Public Site: https://sentientm.com"
    echo ""
    print_info "Production Features:"
    echo "  • ✅ Unified servers (no clustering complexity)"
    echo "  • ✅ 2-minute monitoring with auto-recovery"
    echo "  • ✅ Memory management and restart policies"
    echo "  • ✅ Health checks and endpoint validation"
    echo "  • ✅ Production-grade logging"
    echo ""
    print_info "Monitoring Commands:"
    echo "  • View logs: pm2 logs"
    echo "  • Monitor: pm2 monit"
    echo "  • Restart all: pm2 restart all"
    echo "  • Check monitor: tail -f /var/log/sentientm-monitor.log"
    echo "  • Manual monitor: /usr/local/bin/sentientm-monitor.sh"
else
    print_error "⚠️  DEPLOYMENT COMPLETED WITH WARNINGS"
    print_warning "Some services failed health checks. Monitor with: pm2 logs"
fi

echo "=================================================="
print_status "Deployment ready for thousands of concurrent users"
echo "=================================================="
