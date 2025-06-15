#!/bin/bash

echo "🔧 Fixing hardcoded API URLs for reverse proxy..."

# Fix most common API endpoints
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/save-account-info|/api/save-account-info|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/user-instagram-status|/api/user-instagram-status|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/user-twitter-status|/api/user-twitter-status|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/user-facebook-status|/api/user-facebook-status|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/check-username-availability|/api/check-username-availability|g'

# Fix profile and data endpoints  
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/profile-info|/api/profile-info|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/retrieve-account-info|/api/retrieve-account-info|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/retrieve-strategies|/api/retrieve-strategies|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/retrieve-engagement-strategies|/api/retrieve-engagement-strategies|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/retrieve-multiple|/api/retrieve-multiple|g'

# Fix posts and responses
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/posts|/api/posts|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/responses|/api/responses|g'

# Fix social connections
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/instagram-connection|/api/instagram-connection|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/twitter-connection|/api/twitter-connection|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/facebook-connection|/api/facebook-connection|g'

# Fix scheduling endpoints
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/schedule-tweet|/api/schedule-tweet|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/schedule-post|/api/schedule-post|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/post-tweet|/api/post-tweet|g'

# Fix messaging endpoints
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/send-dm-reply|/api/send-dm-reply|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/send-comment-reply|/api/send-comment-reply|g'

# Fix other common endpoints
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/feedback|/api/feedback|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/rules|/api/rules|g'
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/proxy-image|/api/proxy-image|g'

# Fix events endpoints (these don't need /api prefix)
find src -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | xargs sed -i 's|http://localhost:3000/events|/events|g'

echo "✅ API URL fixes applied!"
echo "🔄 Restarting services to apply changes..." 