#!/bin/bash

# =============================================================================
# DEPLOY UPDATE SCRIPT TO VPS
# =============================================================================
# This script copies the update-website.sh to VPS and makes it executable
# Run this from your local machine
# =============================================================================

set -e

VPS_HOST="root@209.74.66.135"
VPS_DIR="/var/www/sentientm/Accountmanager"
LOCAL_SCRIPT="./update-website.sh"

echo "🚀 Deploying update script to VPS..."

# Copy the update script to VPS
echo "📁 Copying update-website.sh to VPS..."
scp "$LOCAL_SCRIPT" "$VPS_HOST:$VPS_DIR/"

# Make it executable on VPS
echo "🔧 Making script executable on VPS..."
ssh "$VPS_HOST" "chmod +x $VPS_DIR/update-website.sh"

echo "✅ Update script deployed successfully!"
echo ""
echo "📋 SAFE UPDATE WORKFLOW:"
echo "1. SSH into VPS: ssh $VPS_HOST"
echo "2. Navigate to: cd $VPS_DIR"
echo "3. Run update: ./update-website.sh"
echo ""
echo "🔄 The update script will:"
echo "   • Backup current state"
echo "   • Git pull latest changes"
echo "   • Install dependencies"
echo "   • Build frontend"
echo "   • Restart PM2 services"
echo "   • Health check all services"
echo "   • Auto-rollback if anything fails"
echo ""
echo "🎯 Ready to use!"
