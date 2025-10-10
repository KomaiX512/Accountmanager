#!/bin/bash

# AI Manager Setup Script for Sentient Marketing
# This script helps you set up the AI Manager chatbot system

set -e

echo "=========================================="
echo "🤖 AI Manager Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}➜${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if .env file exists
if [ ! -f ".env" ] && [ ! -f ".env.local" ]; then
    print_warning ".env file not found. Creating from .env.example..."
    if [ -f ".env.example" ]; then
        cp .env.example .env.local
        print_success "Created .env.local from .env.example"
    else
        print_error ".env.example not found!"
        exit 1
    fi
fi

# Check if Gemini API key is configured
ENV_FILE=".env.local"
if [ ! -f "$ENV_FILE" ]; then
    ENV_FILE=".env"
fi

if grep -q "VITE_GEMINI_API_KEY=your_gemini_api_key_here" "$ENV_FILE" 2>/dev/null || \
   ! grep -q "VITE_GEMINI_API_KEY" "$ENV_FILE" 2>/dev/null; then
    echo ""
    print_warning "Gemini API Key not configured!"
    echo ""
    echo "To get your Gemini API key:"
    echo "1. Visit: https://makersuite.google.com/app/apikey"
    echo "2. Click 'Create API Key'"
    echo "3. Copy the key"
    echo ""
    read -p "Enter your Gemini API key (or press Enter to skip): " GEMINI_KEY
    
    if [ ! -z "$GEMINI_KEY" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/VITE_GEMINI_API_KEY=.*/VITE_GEMINI_API_KEY=$GEMINI_KEY/" "$ENV_FILE"
        else
            # Linux
            sed -i "s/VITE_GEMINI_API_KEY=.*/VITE_GEMINI_API_KEY=$GEMINI_KEY/" "$ENV_FILE"
        fi
        print_success "Gemini API key configured!"
    else
        print_warning "Skipped API key configuration. You'll need to add it manually to $ENV_FILE"
    fi
fi

echo ""
print_step "Installing dependencies..."

# Check if node_modules exists
if [ ! -d "node_modules" ] || [ ! -f "node_modules/@google/generative-ai/package.json" ]; then
    npm install
    print_success "Dependencies installed"
else
    print_success "Dependencies already installed"
fi

echo ""
print_step "Checking AI Manager files..."

# Check if AI Manager files exist
AI_MANAGER_FILES=(
    "src/services/AIManager/operationRegistry.ts"
    "src/services/AIManager/geminiService.ts"
    "src/services/AIManager/operationExecutor.ts"
    "src/components/AIManager/AIManagerChat.tsx"
    "src/components/AIManager/AIManagerChat.css"
)

ALL_FILES_EXIST=true
for file in "${AI_MANAGER_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_success "$file exists"
    else
        print_error "$file not found!"
        ALL_FILES_EXIST=false
    fi
done

if [ "$ALL_FILES_EXIST" = true ]; then
    echo ""
    print_success "All AI Manager files are in place!"
else
    echo ""
    print_error "Some AI Manager files are missing. Please check the installation."
    exit 1
fi

echo ""
print_step "Checking backend configuration..."

# Check if backend endpoint is configured
if grep -q "app.get('/api/config/gemini-key'" "server/server.js" 2>/dev/null; then
    print_success "Backend endpoint configured"
else
    print_warning "Backend endpoint not found in server/server.js"
    echo "Please ensure the /api/config/gemini-key endpoint is added"
fi

echo ""
print_step "Checking App.tsx integration..."

# Check if AI Manager is integrated in App.tsx
if grep -q "AIManagerChat" "src/App.tsx" 2>/dev/null; then
    print_success "AI Manager integrated in App.tsx"
else
    print_warning "AI Manager not found in App.tsx"
    echo "Please ensure AIManagerChat component is imported and used"
fi

echo ""
echo "=========================================="
echo "🎉 Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. ${GREEN}Start Development Server:${NC}"
echo "   npm run dev"
echo ""
echo "2. ${GREEN}Open Browser:${NC}"
echo "   http://localhost:5173"
echo ""
echo "3. ${GREEN}Login and Test AI Manager:${NC}"
echo "   - Click the floating AI Manager button (bottom right)"
echo "   - Try: \"Create a post about AI trends\""
echo "   - Try: \"Go to Instagram dashboard\""
echo "   - Try: \"Schedule a post for 3 PM\""
echo ""
echo "4. ${GREEN}Deploy to VPS (Production):${NC}"
echo "   ssh root@209.74.66.135"
echo "   export GEMINI_API_KEY=\"your_key_here\""
echo "   cd /var/www/sentientm"
echo "   ./update-bulletproof.sh"
echo ""
echo "📚 Documentation: AI_MANAGER_README.md"
echo ""
print_success "Happy coding! 🚀"
