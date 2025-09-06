#!/bin/bash

echo "🚀 DEPLOYING TO VPS - ASSET SERVING FIX"
echo "========================================"

# Configuration
VPS_USER="root"
VPS_HOST="your-vps-ip"
VPS_WEB_ROOT="/var/www/sentientm/Accountmanager"
NGINX_CONFIG="/etc/nginx/sites-enabled/sentientm"

echo "📋 Step 1: Testing nginx configuration..."
if sudo nginx -t; then
    echo "✅ Nginx configuration is valid"
else
    echo "❌ Nginx configuration has errors"
    exit 1
fi

echo "📋 Step 2: Backing up current VPS configuration..."
sudo cp $NGINX_CONFIG ${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)

echo "📋 Step 3: Updating VPS configuration..."
sudo cp VPS.conf $NGINX_CONFIG

echo "📋 Step 4: Testing updated nginx configuration..."
if sudo nginx -t; then
    echo "✅ Updated nginx configuration is valid"
else
    echo "❌ Updated nginx configuration has errors - restoring backup"
    sudo cp ${NGINX_CONFIG}.backup.* $NGINX_CONFIG
    exit 1
fi

echo "📋 Step 5: Backing up current web files..."
sudo cp -r $VPS_WEB_ROOT/dist ${VPS_WEB_ROOT}/dist.backup.$(date +%Y%m%d_%H%M%S)

echo "📋 Step 6: Deploying latest build files..."
sudo cp -r dist/* $VPS_WEB_ROOT/dist/

echo "📋 Step 7: Deploying fixed ga-cookie-fix.js..."
sudo cp public/ga-cookie-fix.js $VPS_WEB_ROOT/dist/

echo "📋 Step 8: Setting proper permissions..."
sudo chown -R www-data:www-data $VPS_WEB_ROOT/dist/
sudo chmod -R 755 $VPS_WEB_ROOT/dist/

echo "📋 Step 9: Reloading nginx..."
sudo systemctl reload nginx

echo "📋 Step 10: Testing asset accessibility..."
echo "Testing main page..."
curl -I https://sentientm.com/ 2>/dev/null | head -3

echo "Testing CSS file..."
curl -I https://sentientm.com/assets/index-C573772T.css 2>/dev/null | head -3

echo "Testing JS file..."
curl -I https://sentientm.com/assets/index-A0Ly_dQ9.js 2>/dev/null | head -3

echo "Testing manifest..."
curl -I https://sentientm.com/manifest.json 2>/dev/null | head -3

echo ""
echo "✅ DEPLOYMENT COMPLETED!"
echo "🔍 Check the browser console for any remaining errors"
echo "📊 Monitor nginx logs: sudo tail -f /var/log/nginx/sentientm.error.log"
echo "🔄 If issues persist, restart nginx: sudo systemctl restart nginx"
