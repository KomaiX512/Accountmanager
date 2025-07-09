#!/bin/bash

# CI/CD Setup Script for SentientM Account Manager
# This script prepares the VPS for automated deployments with symlink-based switching

set -e

echo "🚀 Setting up CI/CD environment for SentientM Account Manager..."

# Configuration
VPS_HOST="209.74.66.135"
VPS_USER="root"
DEPLOY_BASE="/var/www/sentientm"
PRODUCTION_PATH="$DEPLOY_BASE/Accountmanager"
STAGING_PATH="$DEPLOY_BASE/Accountmanager-staging"
CURRENT_PATH="$DEPLOY_BASE/Accountmanager-current"
BACKUP_PATH="$DEPLOY_BASE/Accountmanager-backup"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "This script must be run as root"
    exit 1
fi

print_status "Starting CI/CD environment setup..."

# Update system packages
print_status "Updating system packages..."
apt update && apt upgrade -y

# Install required packages
print_status "Installing required packages..."
apt install -y curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release

# Install Node.js 18.x
print_status "Installing Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Install PM2 globally
print_status "Installing PM2..."
npm install -g pm2

# Install nginx
print_status "Installing nginx..."
apt install -y nginx

# Create deployment directories
print_status "Creating deployment directories..."
mkdir -p "$PRODUCTION_PATH"
mkdir -p "$STAGING_PATH"
mkdir -p "$CURRENT_PATH"
mkdir -p "$BACKUP_PATH"
mkdir -p "$DEPLOY_BASE/logs"

# Set proper permissions
print_status "Setting directory permissions..."
chown -R $VPS_USER:$VPS_USER "$DEPLOY_BASE"
chmod -R 755 "$DEPLOY_BASE"

# Create logs directories
mkdir -p "$PRODUCTION_PATH/logs"
mkdir -p "$STAGING_PATH/logs"

# Setup nginx configuration with domain-based routing
print_status "Setting up nginx configuration with domain-based routing..."

# Create nginx configuration for production
cat > /etc/nginx/sites-available/sentientm-production << 'EOF'
server {
    listen 80;
    server_name sentientm.com www.sentientm.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name sentientm.com www.sentientm.com;
    
    # SSL configuration (you'll need to add your SSL certificates)
    # ssl_certificate /path/to/your/certificate.crt;
    # ssl_certificate_key /path/to/your/private.key;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Proxy to current deployment (same port for both staging and production)
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

# Create nginx configuration for staging
cat > /etc/nginx/sites-available/sentientm-staging << 'EOF'
server {
    listen 80;
    server_name staging.sentientm.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name staging.sentientm.com;
    
    # SSL configuration (you'll need to add your SSL certificates)
    # ssl_certificate /path/to/your/staging-certificate.crt;
    # ssl_certificate_key /path/to/your/staging-private.key;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Proxy to current deployment (same port for both staging and production)
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

# Enable nginx sites
print_status "Enabling nginx sites..."
ln -sf /etc/nginx/sites-available/sentientm-production /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/sentientm-staging /etc/nginx/sites-enabled/

# Remove default nginx site
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
print_status "Testing nginx configuration..."
nginx -t

# Start nginx
print_status "Starting nginx..."
systemctl enable nginx
systemctl start nginx

# Setup firewall
print_status "Setting up firewall..."
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Create deployment user (optional, for better security)
print_status "Creating deployment user..."
useradd -m -s /bin/bash deploy || true
usermod -aG sudo deploy
echo "deploy:$(openssl rand -base64 32)" | chpasswd

# Setup SSH key for deployment user
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

# Create PM2 startup script
print_status "Setting up PM2 startup..."
pm2 startup systemd -u $VPS_USER --hp /home/$VPS_USER

# Create deployment scripts
print_status "Creating deployment scripts..."

# Production deployment script
cat > "$DEPLOY_BASE/deploy-production.sh" << 'EOF'
#!/bin/bash
set -e

PRODUCTION_PATH="/var/www/sentientm/Accountmanager"
CURRENT_PATH="/var/www/sentientm/Accountmanager-current"
BACKUP_PATH="/var/www/sentientm/Accountmanager-backup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🚀 Starting production deployment..."

# Create backup
if [ -d "$PRODUCTION_PATH" ]; then
    echo "📦 Creating backup..."
    cp -r "$PRODUCTION_PATH" "$BACKUP_PATH.$TIMESTAMP"
fi

# Stop current processes
echo "🛑 Stopping current processes..."
pm2 stop sentientm-main-server sentientm-rag-server sentientm-proxy-server || true
pm2 delete sentientm-main-server sentientm-rag-server sentientm-proxy-server || true

# Extract deployment
echo "📦 Extracting deployment..."
tar -xzf /tmp/deployment-production.tar.gz -C "$PRODUCTION_PATH"

# Install dependencies
echo "📦 Installing dependencies..."
cd "$PRODUCTION_PATH"
npm ci --production

# Start processes
echo "🚀 Starting processes..."
pm2 start ecosystem.config.js --env production
pm2 save

# Switch symlink to production
echo "🔄 Switching symlink to production..."
ln -sfn "$PRODUCTION_PATH" "$CURRENT_PATH"

echo "✅ Production deployment completed!"
EOF

# Staging deployment script
cat > "$DEPLOY_BASE/deploy-staging.sh" << 'EOF'
#!/bin/bash
set -e

STAGING_PATH="/var/www/sentientm/Accountmanager-staging"
CURRENT_PATH="/var/www/sentientm/Accountmanager-current"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🚀 Starting staging deployment..."

# Create backup
if [ -d "$STAGING_PATH" ]; then
    echo "📦 Creating backup..."
    cp -r "$STAGING_PATH" "$STAGING_PATH.backup.$TIMESTAMP"
fi

# Stop current processes
echo "🛑 Stopping current processes..."
pm2 stop sentientm-main-server sentientm-rag-server sentientm-proxy-server || true
pm2 delete sentientm-main-server sentientm-rag-server sentientm-proxy-server || true

# Extract deployment
echo "📦 Extracting deployment..."
tar -xzf /tmp/deployment-staging.tar.gz -C "$STAGING_PATH"

# Install dependencies
echo "📦 Installing dependencies..."
cd "$STAGING_PATH"
npm ci --production

# Start processes
echo "🚀 Starting processes..."
pm2 start ecosystem.staging.js
pm2 save

# Switch symlink to staging
echo "🔄 Switching symlink to staging..."
ln -sfn "$STAGING_PATH" "$CURRENT_PATH"

echo "✅ Staging deployment completed!"
EOF

# Make scripts executable
chmod +x "$DEPLOY_BASE/deploy-production.sh"
chmod +x "$DEPLOY_BASE/deploy-staging.sh"

# Create health check script
cat > "$DEPLOY_BASE/health-check.sh" << 'EOF'
#!/bin/bash

echo "🏥 Performing health checks..."

# Check services (same ports for both staging and production)
echo "Services:"
curl -f http://localhost:3000/health && echo "✅ Main server (3000)" || echo "❌ Main server (3000)"
curl -f http://localhost:3001/health && echo "✅ RAG server (3001)" || echo "❌ RAG server (3001)"
curl -f http://localhost:3002/health && echo "✅ Proxy server (3002)" || echo "❌ Proxy server (3002)"

# Check current symlink
echo "Current deployment:"
if [ -L "/var/www/sentientm/Accountmanager-current" ]; then
    CURRENT_DEPLOY=$(readlink -f /var/www/sentientm/Accountmanager-current)
    echo "✅ Symlink points to: $CURRENT_DEPLOY"
else
    echo "❌ No symlink found"
fi

# Check PM2 status
echo "PM2 status:"
pm2 status
EOF

chmod +x "$DEPLOY_BASE/health-check.sh"

# Create rollback script
cat > "$DEPLOY_BASE/rollback.sh" << 'EOF'
#!/bin/bash

PRODUCTION_PATH="/var/www/sentientm/Accountmanager"
CURRENT_PATH="/var/www/sentientm/Accountmanager-current"
BACKUP_PATH="/var/www/sentientm/Accountmanager-backup"

echo "🔄 Rolling back to previous deployment..."

# Find the most recent backup
LATEST_BACKUP=$(ls -dt "$BACKUP_PATH".* | head -n 1)

if [ -n "$LATEST_BACKUP" ] && [ -d "$LATEST_BACKUP" ]; then
    echo "📦 Restoring from backup: $LATEST_BACKUP"
    
    # Stop current processes
    pm2 stop sentientm-main-server sentientm-rag-server sentientm-proxy-server || true
    pm2 delete sentientm-main-server sentientm-rag-server sentientm-proxy-server || true
    
    # Remove current deployment
    rm -rf "$PRODUCTION_PATH"
    
    # Restore from backup
    mv "$LATEST_BACKUP" "$PRODUCTION_PATH"
    
    # Start processes
    cd "$PRODUCTION_PATH"
    pm2 start ecosystem.config.js --env production
    pm2 save
    
    # Switch symlink to production
    ln -sfn "$PRODUCTION_PATH" "$CURRENT_PATH"
    
    echo "✅ Rollback completed successfully!"
else
    echo "❌ No backup found for rollback!"
fi
EOF

chmod +x "$DEPLOY_BASE/rollback.sh"

# Create monitoring script
cat > "$DEPLOY_BASE/monitor.sh" << 'EOF'
#!/bin/bash

echo "📊 System Monitoring Report"
echo "=========================="

echo "CPU Usage:"
top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1

echo "Memory Usage:"
free -h | grep Mem | awk '{print $3 "/" $2}'

echo "Disk Usage:"
df -h / | tail -1 | awk '{print $5}'

echo "PM2 Processes:"
pm2 status

echo "Nginx Status:"
systemctl is-active nginx

echo "Active Connections:"
netstat -an | grep :80 | wc -l
netstat -an | grep :443 | wc -l

echo "Current Deployment:"
if [ -L "/var/www/sentientm/Accountmanager-current" ]; then
    CURRENT_DEPLOY=$(readlink -f /var/www/sentientm/Accountmanager-current)
    echo "Symlink points to: $CURRENT_DEPLOY"
else
    echo "No symlink found"
fi
EOF

chmod +x "$DEPLOY_BASE/monitor.sh"

# Setup log rotation
print_status "Setting up log rotation..."
cat > /etc/logrotate.d/sentientm << 'EOF'
/var/www/sentientm/Accountmanager/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        pm2 reloadLogs
    endscript
}

/var/www/sentientm/Accountmanager-staging/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

# Create environment file template
print_status "Creating environment file template..."
cat > "$DEPLOY_BASE/.env.template" << 'EOF'
# Production Environment Configuration
NODE_ENV=production

# Server Ports (same for both staging and production)
MAIN_SERVER_PORT=3000
RAG_SERVER_PORT=3001
PROXY_SERVER_PORT=3002

# Database Configuration
# Add your database configuration here

# AWS/R2 Configuration
# Add your AWS/R2 configuration here

# Social Media API Keys
# Add your social media API keys here

# Email Configuration
# Add your email configuration here
EOF

# Set final permissions
print_status "Setting final permissions..."
chown -R $VPS_USER:$VPS_USER "$DEPLOY_BASE"
chmod -R 755 "$DEPLOY_BASE"

# Create a summary file
cat > "$DEPLOY_BASE/SETUP_SUMMARY.md" << 'EOF'
# SentientM CI/CD Setup Summary

## Deployment Strategy: Symlink-Based Switching

### Directory Structure
- Production: `/var/www/sentientm/Accountmanager`
- Staging: `/var/www/sentientm/Accountmanager-staging`
- Current: `/var/www/sentientm/Accountmanager-current` (symlink)
- Backups: `/var/www/sentientm/Accountmanager-backup`

### Port Configuration (Same for Both Environments)
- Main Server: 3000
- RAG Server: 3001
- Proxy Server: 3002

### Domain-Based Routing
- Production: https://sentientm.com
- Staging: https://staging.sentientm.com
- Both use the same ports, differentiated by domain

### Deployment Process
1. Deploy to staging/production directory
2. Health check the deployment
3. Switch symlink to point to new deployment
4. Restart PM2 processes

### Management Scripts
- `/var/www/sentientm/deploy-production.sh` - Manual production deployment
- `/var/www/sentientm/deploy-staging.sh` - Manual staging deployment
- `/var/www/sentientm/health-check.sh` - Health check all services
- `/var/www/sentientm/rollback.sh` - Rollback to previous deployment
- `/var/www/sentientm/monitor.sh` - System monitoring

### PM2 Commands
- `pm2 status` - Check process status
- `pm2 logs` - View logs
- `pm2 restart all` - Restart all processes
- `pm2 stop all` - Stop all processes

### Nginx Configuration
- Production: `/etc/nginx/sites-available/sentientm-production`
- Staging: `/etc/nginx/sites-available/sentientm-staging`
- Both proxy to localhost:3002 (same port)

### Next Steps
1. Configure SSL certificates for nginx
2. Set up environment variables in .env files
3. Configure GitHub repository secrets:
   - VPS_HOST: 209.74.66.135
   - VPS_USER: root
   - VPS_SSH_KEY: Your SSH private key
   - VPS_PORT: 22 (default)

4. Push to staging branch to test deployment
5. Push to main branch for production deployment
EOF

print_success "CI/CD environment setup completed successfully!"
print_status "Please review the setup summary at: $DEPLOY_BASE/SETUP_SUMMARY.md"
print_status "Next steps:"
print_status "1. Configure SSL certificates"
print_status "2. Set up environment variables"
print_status "3. Configure GitHub repository secrets"
print_status "4. Test deployment with staging branch" 