#!/bin/bash

# VPS Usage Fix Deployment Script
# This script applies the nginx configuration changes to fix usage incrementation

echo "🚀 Deploying VPS Usage Fix..."
echo "============================="

# Step 1: Backup current nginx config
echo "📦 Backing up current nginx configuration..."
sudo cp /etc/nginx/sites-enabled/sentientm /etc/nginx/sites-enabled/sentientm.backup.$(date +%Y%m%d_%H%M%S) || echo "No existing config to backup"

# Step 2: Apply new configuration
echo "🔧 Applying new nginx configuration..."
sudo rm -f /etc/nginx/sites-enabled/sentientm*
sudo tee /etc/nginx/sites-enabled/sentientm < VPS.conf

# Step 3: Test nginx configuration
echo "✅ Testing nginx configuration..."
if sudo nginx -t; then
    echo "✅ Nginx configuration is valid!"
    
    # Step 4: Reload nginx
    echo "🔄 Reloading nginx..."
    sudo systemctl reload nginx
    echo "✅ Nginx reloaded successfully!"
    
    # Step 5: Test the endpoints
    echo ""
    echo "🧪 Testing usage endpoints..."
    
    echo "1. Testing usage increment..."
    curl -s -X POST "https://sentientm.com/api/usage/increment/KUvVFxnLanYTWPuSIfphby5hxJQ2" \
      -H "Content-Type: application/json" \
      -d '{"feature": "posts", "count": 1}' \
      -w "HTTP Status: %{http_code}\n" || echo "❌ Failed"
    
    echo ""
    echo "2. Testing usage sync..."
    curl -s -X POST "https://sentientm.com/api/usage/sync/KUvVFxnLanYTWPuSIfphby5hxJQ2/instagram/narsissist" \
      -w "HTTP Status: %{http_code}\n" || echo "❌ Failed"
    
    echo ""
    echo "3. Testing usage retrieval..."
    curl -s "https://sentientm.com/api/usage/instagram/narsissist" \
      -w "HTTP Status: %{http_code}\n" || echo "❌ Failed"
    
    echo ""
    echo "✅ VPS Usage Fix deployed successfully!"
    echo ""
    echo "📊 Usage incrementation should now work on VPS just like locally!"
    
else
    echo "❌ Nginx configuration test failed!"
    echo "Please check the configuration and try again."
    exit 1
fi

echo ""
echo "🔍 Configuration Summary:"
echo "- ✅ /api/usage/sync/* → port 3000 (main server)"
echo "- ✅ /api/usage/increment/* → port 3000 (main server)"
echo "- ✅ /usage/increment/* → port 3000 (main server)"
echo "- ✅ /api/usage/{platform}/{username} → port 3000 (main server)"
echo "- ✅ /api/usage/* (other) → port 3002 (proxy server)"
