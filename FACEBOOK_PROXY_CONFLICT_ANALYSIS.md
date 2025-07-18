# FACEBOOK NOTIFICATION PROXY CONFLICT FIX

## Problem Analysis

The proxy server (`server.js` on port 3002) has duplicate endpoints that conflict with the main server (`server/server.js` on port 3000), specifically for Facebook notifications and other social media functionality.

### Conflict Details:

**Main Server (port 3000) - Correct Location:**
- `/events-list/:userId` - Facebook/Instagram/Twitter notifications  
- `/api/facebook-connection/:userId` - Facebook authentication
- `/api/user-facebook-status/:userId` - Facebook user status
- Social media authentication endpoints

**Proxy Server (port 3002) - Should NOT have these:**
- Duplicate Facebook status endpoints
- Any notification-related endpoints  
- Social media connection endpoints

### Root Cause:
The proxy server was accidentally including endpoints that belong only to the main server, causing routing conflicts when both servers are running.

### Solution:
Remove all social media/notification endpoints from proxy server, keeping only:
- Image processing (`/proxy-image`, `/r2-images`, etc.)
- Post generation functionality
- Image upload/download functionality

## Files to Fix:
1. `/server.js` (proxy server) - Remove conflicting endpoints
