#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🌍 Getting your worldwide accessible URL...${NC}"
echo "==========================================="

# Check if ngrok is running on port 8080
if pgrep -f "ngrok http 8080" > /dev/null; then
    echo -e "${GREEN}✅ Ngrok is running for port 8080${NC}"
    
    # Try to get the public URL
    sleep 2
    PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o 'https://[^"]*\.ngrok-free\.app' | head -1)
    
    if [ ! -z "$PUBLIC_URL" ]; then
        echo -e "${GREEN}🎉 Your website is now available worldwide at:${NC}"
        echo -e "${BLUE}$PUBLIC_URL${NC}"
        echo ""
        echo -e "${GREEN}✨ What you can do now:${NC}"
        echo "   • Visit $PUBLIC_URL to access your website"
        echo "   • Share this URL with anyone in the world"
        echo "   • All your APIs work through: $PUBLIC_URL/api/*"
        echo "   • Webhooks work through: $PUBLIC_URL/webhook/*"
        echo ""
        echo -e "${BLUE}📋 Update your API dashboards with:${NC}"
        echo "   • Graph API Webhook URL: $PUBLIC_URL/webhook/facebook"
        echo "   • X Developer API Webhook URL: $PUBLIC_URL/webhook/twitter"
        echo ""
        echo -e "${GREEN}🔧 Local Services Status:${NC}"
        echo "   • Frontend: http://localhost:5173 (served via proxy)"
        echo "   • Main Server: http://localhost:3002 (served via proxy)"
        echo "   • RAG Server: http://localhost:3001 (served via proxy)"
        echo "   • Reverse Proxy: http://localhost:8080 (forwarded to ngrok)"
    else
        echo "⏳ Ngrok is starting up... please wait a moment and try again"
        echo "You can also check the ngrok web interface at: http://localhost:4040"
    fi
else
    echo "❌ Ngrok is not running on port 8080"
    echo "Run: ngrok http 8080"
fi

echo ""
echo -e "${BLUE}💡 Pro Tips:${NC}"
echo "   • Keep this terminal running to maintain the connection"
echo "   • The ngrok URL changes each time you restart (unless you have a paid plan)"
echo "   • Monitor your services with: tail -f *-unified.log" 