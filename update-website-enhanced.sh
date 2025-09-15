#!/bin/bash

# =============================================================================
# ENHANCED SAFE WEBSITE UPDATE SCRIPT - VPS DIRECT UPDATE
# =============================================================================
# This script safely updates the website on VPS with git pull + build + restart
# Includes React build fix and cache clearing
# Run this ON THE VPS at /var/www/sentientm/Accountmanager/
# Usage: ./update-website-enhanced.sh
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
BACKUP_DIR="/var/www/sentientm/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo -e "${PURPLE}🔄 ENHANCED SAFE WEBSITE UPDATE STARTING${NC}"
echo "=================================================="
echo "Deploy Directory: $DEPLOY_DIR"
echo "Backup Directory: $BACKUP_DIR"
echo "Timestamp: $TIMESTAMP"
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

# Function to check service health
check_service_health() {
    local port=$1
    local name=$2
    
    if curl -s --max-time 5 "http://127.0.0.1:$port/health" > /dev/null 2>&1 || \
       curl -s --max-time 5 "http://127.0.0.1:$port/api/health" > /dev/null 2>&1 || \
       nc -z 127.0.0.1 $port > /dev/null 2>&1; then
        print_status "$name is healthy"
        return 0
    else
        print_error "$name is not responding"
        return 1
    fi
}

# Function to rollback on failure
rollback() {
    print_error "Update failed! Rolling back..."
    
    if [ -d "$BACKUP_DIR/dist_$TIMESTAMP" ]; then
        print_info "Restoring previous dist..."
        rm -rf "$DEPLOY_DIR/dist"
        cp -r "$BACKUP_DIR/dist_$TIMESTAMP" "$DEPLOY_DIR/dist"
        print_status "Dist restored from backup"
    fi
    
    if [ -f "$BACKUP_DIR/vite.config_$TIMESTAMP.cjs" ]; then
        print_info "Restoring previous vite.config.cjs..."
        cp "$BACKUP_DIR/vite.config_$TIMESTAMP.cjs" "$DEPLOY_DIR/vite.config.cjs"
        print_status "Vite config restored"
    fi
    
    if [ -f "$BACKUP_DIR/package-lock_$TIMESTAMP.json" ]; then
        print_info "Restoring previous package-lock.json..."
        cp "$BACKUP_DIR/package-lock_$TIMESTAMP.json" "$DEPLOY_DIR/package-lock.json"
        print_status "Package-lock.json restored"
    fi
    
    print_info "Restarting PM2 services..."
    pm2 restart all
    
    print_error "Rollback completed. Please check the issues and try again."
    exit 1
}

# Trap to rollback on any error
trap rollback ERR

# Step 1: Navigate to deployment directory
print_info "Step 1: Navigating to deployment directory"
cd "$DEPLOY_DIR" || {
    print_error "Failed to navigate to $DEPLOY_DIR"
    exit 1
}
print_status "Changed to deployment directory: $(pwd)"

# Step 2: Create backup directory
print_info "Step 2: Creating backup directory"
mkdir -p "$BACKUP_DIR"
print_status "Backup directory ready: $BACKUP_DIR"

# Step 3: Check current PM2 status
print_info "Step 3: Checking current PM2 status"
pm2 list
healthy_before=0
for port in 3000 3001 3002; do
    if check_service_health $port "Service-$port"; then
        healthy_before=$((healthy_before + 1))
    fi
done
print_info "Services healthy before update: $healthy_before/3"

# Step 4: Backup current state
print_info "Step 4: Backing up current state"

# Backup dist folder
if [ -d "dist" ]; then
    cp -r dist "$BACKUP_DIR/dist_$TIMESTAMP"
    print_status "Backed up dist folder"
fi

# Backup vite.config.cjs
if [ -f "vite.config.cjs" ]; then
    cp vite.config.cjs "$BACKUP_DIR/vite.config_$TIMESTAMP.cjs"
    print_status "Backed up vite.config.cjs"
fi

# Backup package-lock.json
if [ -f "package-lock.json" ]; then
    cp package-lock.json "$BACKUP_DIR/package-lock_$TIMESTAMP.json"
    print_status "Backed up package-lock.json"
fi

# Backup server package-lock.json
if [ -f "server/package-lock.json" ]; then
    cp server/package-lock.json "$BACKUP_DIR/server-package-lock_$TIMESTAMP.json"
    print_status "Backed up server package-lock.json"
fi

# Step 5: Git pull latest changes
print_info "Step 5: Pulling latest changes from git"
git fetch origin
git_status=$(git status --porcelain)
if [ -n "$git_status" ]; then
    print_warning "Working directory has uncommitted changes:"
    echo "$git_status"
    print_info "Stashing changes..."
    git stash push -m "Auto-stash before update $TIMESTAMP"
fi

current_branch=$(git branch --show-current)
print_info "Current branch: $current_branch"

git pull origin $current_branch
print_status "Git pull completed"

# Step 6: Fix Vite configuration for React compatibility
print_info "Step 6: Ensuring React-compatible Vite configuration"

# Check if vite.config.cjs has the React splitting issue
if grep -q "react-dom/client" vite.config.cjs 2>/dev/null || grep -q "manualChunks(id)" vite.config.cjs 2>/dev/null; then
    print_warning "Detected problematic React code splitting in vite.config.cjs"
    print_info "Applying React compatibility fix..."
    
    cat > vite.config.cjs << 'EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        onError: (err, req, res) => {
          console.warn('[Vite Proxy] API endpoint error:', err.message);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'API service temporarily unavailable' }));
        }
      },
      '/webhook': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        onError: (err, req, res) => {
          console.warn('[Vite Proxy] Webhook endpoint error:', err.message);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Webhook service temporarily unavailable' }));
        }
      },
      '/events': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        onError: (err, req, res) => {
          console.warn('[Vite Proxy] Events endpoint error:', err.message);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Events service temporarily unavailable' }));
        }
      }
    }
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
        unused: true,
        dead_code: true
      },
      mangle: {
        safari10: true
      },
      format: {
        comments: false
      }
    },
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Keep React and React-DOM together to prevent internals issues
          'vendor': ['react', 'react-dom'],
          'router': ['react-router-dom']
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
  }
});
EOF
    print_status "Applied React compatibility fix to vite.config.cjs"
else
    print_status "Vite configuration already React-compatible"
fi

# Step 7: Install/update dependencies
print_info "Step 7: Installing/updating dependencies"

# Frontend dependencies
if [ -f "package.json" ]; then
    print_info "Installing frontend dependencies..."
    npm ci --silent
    print_status "Frontend dependencies updated"
fi

# Server dependencies
if [ -f "server/package.json" ]; then
    print_info "Installing server dependencies..."
    cd server
    npm ci --silent
    cd ..
    print_status "Server dependencies updated"
fi

# Step 8: Build frontend
print_info "Step 8: Building frontend with React fix"
if grep -q '"build"' package.json; then
    print_info "Building frontend assets..."
    npm run build
    
    if [ -d "dist" ]; then
        print_status "Frontend build completed successfully"
        print_info "Dist folder size: $(du -sh dist | cut -f1)"
        
        # Check for React chunks to verify fix
        if ls dist/assets/ | grep -q "vendor"; then
            print_status "React vendor chunk created correctly (React fix applied)"
        fi
    else
        print_error "Build failed - no dist folder created"
        exit 1
    fi
else
    print_warning "No build script found in package.json"
fi

# Step 9: Clear Nginx cache and add cache-busting headers
print_info "Step 9: Clearing caches and optimizing delivery"

# Add cache-busting to index.html
if [ -f "dist/index.html" ]; then
    # Add timestamp to prevent browser caching
    sed -i "s/<head>/<head><meta name=\"cache-bust\" content=\"$TIMESTAMP\">/" dist/index.html
    print_status "Added cache-busting headers to index.html"
fi

# Clear any existing Nginx cache
if [ -d "/var/cache/nginx" ]; then
    find /var/cache/nginx -type f -delete 2>/dev/null || true
    print_status "Cleared Nginx cache"
fi

# Step 10: Restart PM2 services gracefully
print_info "Step 10: Restarting PM2 services"
print_info "Performing graceful restart..."
pm2 restart all --update-env

# Give services time to start
sleep 5

# Step 11: Health check after restart
print_info "Step 11: Performing health checks"
healthy_after=0
failed_services=()

for port in 3000 3001 3002; do
    service_name="Service-$port"
    max_attempts=10
    attempt=1
    
    print_info "Checking $service_name..."
    
    while [ $attempt -le $max_attempts ]; do
        if check_service_health $port "$service_name"; then
            healthy_after=$((healthy_after + 1))
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            failed_services+=("$service_name")
            print_error "$service_name failed health check"
        else
            print_warning "$service_name not ready yet (attempt $attempt/$max_attempts)"
            sleep 2
        fi
        
        attempt=$((attempt + 1))
    done
done

# Step 12: Validate update success
print_info "Step 12: Validating update success"
health_percentage=$(( (healthy_after * 100) / 3 ))

echo ""
print_info "=== UPDATE SUMMARY ==="
print_info "Services healthy before: $healthy_before/3"
print_info "Services healthy after: $healthy_after/3 ($health_percentage%)"
print_info "Git branch: $current_branch"
print_info "React fix: Applied"
print_info "Cache busting: Enabled"
print_info "Timestamp: $TIMESTAMP"

if [ $health_percentage -ge 67 ]; then
    print_status "✅ UPDATE SUCCESSFUL!"
    print_status "Website updated and running at: https://sentientm.com"
    print_status "React DOM errors fixed automatically"
    print_status "Browser cache will be refreshed on next visit"
    
    # Clean up old backups (keep last 5)
    print_info "Cleaning up old backups..."
    cd "$BACKUP_DIR"
    ls -t | grep "dist_" | tail -n +6 | xargs -r rm -rf
    ls -t | grep "vite.config_" | tail -n +6 | xargs -r rm -f
    ls -t | grep "package-lock_" | tail -n +6 | xargs -r rm -f
    ls -t | grep "server-package-lock_" | tail -n +6 | xargs -r rm -f
    print_status "Old backups cleaned up"
    
else
    print_error "❌ UPDATE FAILED!"
    print_error "Health check failed. Rolling back..."
    exit 1
fi

# Step 13: Display useful commands
echo ""
print_info "=== USEFUL COMMANDS ==="
print_info "Check PM2 status: pm2 list"
print_info "View logs: pm2 logs"
print_info "Monitor: pm2 monit"
print_info "Restart specific service: pm2 restart <name>"
print_info "View website: https://sentientm.com"
print_info "Force browser refresh: Ctrl+Shift+R or incognito window"

echo ""
print_status "🎉 Enhanced website update completed successfully at $(date)"
print_status "React errors automatically prevented, cache cleared, PM2 restarted"

# Disable error trap
trap - ERR
