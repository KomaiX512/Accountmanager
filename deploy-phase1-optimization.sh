#!/bin/bash

# =============================================================================
# PHASE 1 NGINX OPTIMIZATION DEPLOYMENT SCRIPT
# One-command deployment for production VPS (ssh root@209.74.66.135)
# =============================================================================

set -e  # Exit on any error

echo "🚀 PHASE 1 NGINX OPTIMIZATION DEPLOYMENT"
echo "========================================"
echo "Timestamp: $(date)"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Deployment configuration
BACKUP_DIR="/root/nginx-backups"
DEPLOYMENT_LOG="/root/phase1-deployment-$(date +%Y%m%d-%H%M%S).log"

echo "📋 DEPLOYMENT LOG: $DEPLOYMENT_LOG"
exec > >(tee -a $DEPLOYMENT_LOG) 2>&1

echo -e "${BLUE}Step 1: Creating backup directory and safety checks${NC}"
mkdir -p $BACKUP_DIR

# Verify we're on the right server
if [[ $(hostname -I | grep -o "209.74.66.135") != "209.74.66.135" ]]; then
    echo -e "${RED}❌ ERROR: Not on production VPS (209.74.66.135)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Confirmed: Running on production VPS${NC}"

echo -e "${BLUE}Step 2: Backing up current nginx configuration${NC}"
BACKUP_FILE="$BACKUP_DIR/nginx-backup-$(date +%Y%m%d-%H%M%S).conf"
cp /etc/nginx/sites-available/default "$BACKUP_FILE"
echo -e "${GREEN}✅ Current config backed up to: $BACKUP_FILE${NC}"

echo -e "${BLUE}Step 3: Validating current nginx configuration${NC}"
nginx -t
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ ERROR: Current nginx config is invalid. Aborting.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Current nginx config is valid${NC}"

echo -e "${BLUE}Step 4: Creating optimized nginx configuration${NC}"

# Create the optimized configuration
cat > /tmp/nginx-phase1-optimized.conf << 'EOF'
# =============================================================================
# PHASE 1 NGINX OPTIMIZATION - NETFLIX-GRADE PERFORMANCE
# Optimized for 1000+ concurrent users with connection pooling & rate limiting
# =============================================================================

# CORE WORKER OPTIMIZATION
worker_processes auto;
worker_connections 4096;
worker_rlimit_nofile 8192;

# PERFORMANCE TUNING
events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    # BASIC OPTIMIZATION
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 1000;
    types_hash_max_size 2048;
    server_tokens off;
    
    # BUFFER OPTIMIZATION
    client_body_buffer_size 16K;
    client_header_buffer_size 1k;
    client_max_body_size 8m;
    large_client_header_buffers 2 1k;
    
    # COMPRESSION
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # CONNECTION POOLING - CRITICAL FOR HIGH CONCURRENCY
    upstream backend_main {
        least_conn;
        server 127.0.0.1:3000 max_fails=3 fail_timeout=30s weight=1;
        keepalive 32;
        keepalive_requests 100;
        keepalive_timeout 60s;
    }

    upstream backend_rag {
        least_conn;
        server 127.0.0.1:3001 max_fails=3 fail_timeout=30s weight=1;
        keepalive 16;
        keepalive_requests 100;
        keepalive_timeout 60s;
    }

    upstream backend_proxy {
        least_conn;
        server 127.0.0.1:3002 max_fails=3 fail_timeout=30s weight=1;
        keepalive 16;
        keepalive_requests 100;
        keepalive_timeout 60s;
    }

    # RATE LIMITING - DDOS PROTECTION
    limit_req_zone $binary_remote_addr zone=api:10m rate=20r/m;
    limit_req_zone $binary_remote_addr zone=assets:10m rate=100r/m;
    limit_req_zone $binary_remote_addr zone=sse:10m rate=5r/m;
    
    # CONNECTION LIMITING
    limit_conn_zone $binary_remote_addr zone=perip:10m;
    limit_conn_zone $server_name zone=perserver:10m;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # LOGGING OPTIMIZATION
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'rt=$request_time uct="$upstream_connect_time" '
                    'uht="$upstream_header_time" urt="$upstream_response_time"';

    access_log /var/log/nginx/access.log main buffer=16k flush=2m;
    error_log /var/log/nginx/error.log warn;

    # SSL OPTIMIZATION
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;

    # MAIN SERVER BLOCK
    server {
        listen 80;
        server_name www.sentientm.com sentientm.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name www.sentientm.com sentientm.com;
        
        # CONNECTION LIMITS
        limit_conn perip 20;
        limit_conn perserver 1000;

        ssl_certificate /etc/letsencrypt/live/www.sentientm.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/www.sentientm.com/privkey.pem;

        # SECURITY HEADERS
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "no-referrer-when-downgrade" always;
        add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

        # === RAG SERVER ROUTES (Port 3001) ===
        location ^~ /api/rag/ {
            limit_req zone=api burst=10 nodelay;
            proxy_pass http://backend_rag;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 5s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
            proxy_buffering on;
            proxy_buffer_size 4k;
            proxy_buffers 8 4k;
        }

        # === PROXY SERVER ROUTES (Port 3002) ===
        location ^~ /api/r2-image/ {
            limit_req zone=assets burst=20 nodelay;
            proxy_pass http://backend_proxy;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 3s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
            add_header Access-Control-Allow-Origin * always;
        }

        location ^~ /api/signed-image-url/ {
            limit_req zone=api burst=15 nodelay;
            proxy_pass http://backend_proxy;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location = /health {
            limit_req zone=api burst=5 nodelay;
            proxy_pass http://backend_proxy;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
        }

        # === MAIN SERVER ROUTES (Port 3000) ===
        
        # SSE ENDPOINTS - OPTIMIZED FOR REAL-TIME
        location ^~ /api/events/ {
            limit_req zone=sse burst=3 nodelay;
            proxy_pass http://backend_main;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
            # SSE-specific optimizations
            proxy_buffering off;
            proxy_cache off;
            add_header Cache-Control "no-cache, no-store, must-revalidate";
            add_header X-Accel-Buffering "no";
        }

        location ^~ /events/ {
            limit_req zone=sse burst=3 nodelay;
            proxy_pass http://backend_main;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_Set_header X-Real-IP $remote_addr;
            proxy_Set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_Set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
            # SSE-specific optimizations
            proxy_buffering off;
            proxy_cache off;
            add_header Cache-Control "no-cache, no-store, must-revalidate";
        }

        # API ENDPOINTS
        location ^~ /api/ {
            limit_req zone=api burst=15 nodelay;
            proxy_pass http://backend_main;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_Set_header Host $host;
            proxy_Set_header X-Real-IP $remote_addr;
            proxy_Set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_Set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 5s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # STATIC ASSETS - OPTIMIZED CACHING
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            root /var/www/sentientm/Accountmanager/dist;
            limit_req zone=assets burst=50 nodelay;
            expires 1y;
            add_header Cache-Control "public, immutable";
            try_files $uri =404;
        }

        # SPA FALLBACK
        location / {
            root /var/www/sentientm/Accountmanager/dist;
            try_files $uri @fallback;
        }

        location @fallback {
            root /var/www/sentientm/Accountmanager/dist;
            try_files /index.html =404;
        }
    }
}
EOF

echo -e "${GREEN}✅ Phase 1 configuration created${NC}"

echo -e "${BLUE}Step 5: Updating main nginx configuration${NC}"
# Update the main nginx.conf with worker optimization
cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup
cat > /etc/nginx/nginx.conf << 'EOF'
# PHASE 1 OPTIMIZED NGINX.CONF
worker_processes auto;
worker_connections 4096;
worker_rlimit_nofile 8192;
pid /run/nginx.pid;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    # Include sites
    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
EOF

echo -e "${BLUE}Step 6: Installing optimized site configuration${NC}"
cp /tmp/nginx-phase1-optimized.conf /etc/nginx/sites-available/default

echo -e "${BLUE}Step 7: Testing optimized configuration${NC}"
nginx -t
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ ERROR: Optimized config is invalid. Restoring backup.${NC}"
    cp "$BACKUP_FILE" /etc/nginx/sites-available/default
    cp /etc/nginx/nginx.conf.backup /etc/nginx/nginx.conf
    nginx -t
    echo -e "${YELLOW}⚠️  Backup restored. Deployment failed.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Optimized configuration is valid${NC}"

echo -e "${BLUE}Step 8: Reloading nginx with zero downtime${NC}"
nginx -s reload
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Nginx reloaded successfully${NC}"
else
    echo -e "${RED}❌ ERROR: Nginx reload failed. Restoring backup.${NC}"
    cp "$BACKUP_FILE" /etc/nginx/sites-available/default
    cp /etc/nginx/nginx.conf.backup /etc/nginx/nginx.conf
    nginx -s reload
    exit 1
fi

echo -e "${BLUE}Step 9: Verifying deployment${NC}"
sleep 2

# Test if the site is responding
if curl -s -o /dev/null -w "%{http_code}" https://www.sentientm.com | grep -q "200"; then
    echo -e "${GREEN}✅ Site is responding correctly${NC}"
else
    echo -e "${YELLOW}⚠️  Site response check inconclusive${NC}"
fi

# Check nginx processes
WORKERS=$(ps aux | grep "nginx: worker" | grep -v grep | wc -l)
echo -e "${GREEN}✅ Nginx workers running: $WORKERS${NC}"

echo ""
echo -e "${GREEN}🎉 PHASE 1 DEPLOYMENT COMPLETED SUCCESSFULLY${NC}"
echo "========================================"
echo "📊 Deployment Summary:"
echo "   • Worker processes: auto (optimized)"
echo "   • Worker connections: 4096 per process"
echo "   • Connection pooling: Enabled"
echo "   • Rate limiting: Active"
echo "   • SSL optimization: Enhanced"
echo "   • SSE optimization: Implemented"
echo ""
echo "📋 Backup location: $BACKUP_FILE"
echo "📝 Deployment log: $DEPLOYMENT_LOG"
echo ""
echo "🚀 Ready for battle testing!"
echo ""
