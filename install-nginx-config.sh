#!/bin/bash

# Script to install the ultimate nginx configuration for sentientm.com
echo "=========================================="
echo "INSTALLING ULTIMATE NGINX CONFIGURATION"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Backup existing configuration
echo -e "${BLUE}Backing up existing nginx configuration...${NC}"
if [ -f "/etc/nginx/sites-available/sentientm-alt" ]; then
    sudo cp /etc/nginx/sites-available/sentientm-alt /etc/nginx/sites-available/sentientm-alt.backup.$(date +%Y%m%d_%H%M%S)
    echo -e "${GREEN}✓ Backup created${NC}"
else
    echo -e "${YELLOW}⚠ No existing sentientm-alt configuration to backup${NC}"
fi

# Copy new configuration
echo -e "${BLUE}Installing new nginx configuration...${NC}"
sudo cp nginx-sentientm-ultimate.conf /etc/nginx/sites-available/sentientm-alt
sudo chown root:root /etc/nginx/sites-available/sentientm-alt
sudo chmod 644 /etc/nginx/sites-available/sentientm-alt

# Disable conflicting configurations
echo -e "${BLUE}Disabling conflicting nginx configurations...${NC}"
if [ -L "/etc/nginx/sites-enabled/sentientm" ]; then
    sudo rm /etc/nginx/sites-enabled/sentientm
    echo -e "${GREEN}✓ Disabled original sentientm configuration${NC}"
fi

# Enable new configuration
echo -e "${BLUE}Enabling new nginx configuration...${NC}"
if [ ! -L "/etc/nginx/sites-enabled/sentientm-alt" ]; then
    sudo ln -s /etc/nginx/sites-available/sentientm-alt /etc/nginx/sites-enabled/
    echo -e "${GREEN}✓ Enabled sentientm-alt configuration${NC}"
fi

# Test nginx configuration
echo -e "${BLUE}Testing nginx configuration...${NC}"
if sudo nginx -t; then
    echo -e "${GREEN}✓ Nginx configuration is valid${NC}"
else
    echo -e "${RED}✗ Nginx configuration has errors${NC}"
    exit 1
fi

# Reload nginx
echo -e "${BLUE}Reloading nginx...${NC}"
if sudo systemctl reload nginx; then
    echo -e "${GREEN}✓ Nginx reloaded successfully${NC}"
else
    echo -e "${RED}✗ Failed to reload nginx${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}NGINX CONFIGURATION INSTALLED SUCCESSFULLY!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo -e "${BLUE}Configuration details:${NC}"
echo -e "  • Port: 8080 (HTTP)"
echo -e "  • RAG Server: Port 3001"
echo -e "  • Proxy Server: Port 3002"
echo -e "  • Main Server: Port 3000"
echo -e "  • Frontend: /home/komail/Accountmanager/dist"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Test endpoints with: ./test-all-endpoints.sh"
echo -e "  2. Check nginx status: sudo systemctl status nginx"
echo -e "  3. View logs: sudo tail -f /var/log/nginx/access.log"
echo "" 