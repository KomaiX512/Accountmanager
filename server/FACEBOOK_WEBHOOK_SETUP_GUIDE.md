# Facebook Webhook Setup Guide

## Overview
This guide explains how to properly set up Facebook webhooks for receiving DM and comment notifications in the modular server.

## Issues Identified

### 1. Personal Account Limitations
**Problem**: Personal Facebook accounts have very limited API access due to Facebook's privacy policies.

**Limitations for Personal Accounts**:
- ❌ No webhook support for DMs and comments
- ❌ Limited automated posting capabilities  
- ❌ No insights or analytics data
- ❌ Restricted API access for messaging

**Solution**: Convert to Facebook Business Page or use Business Account.

### 2. Missing Webhook Verification Endpoint
**Problem**: The modular server was missing a dedicated Facebook webhook verification endpoint.

**Solution**: Added `/webhook/facebook` and `/api/webhook/facebook` endpoints.

## Webhook Endpoints Available

### Verification Endpoints
- `GET /webhook/facebook` - Webhook verification
- `GET /api/webhook/facebook` - Webhook verification (API route)

### Event Receiving Endpoints  
- `POST /webhook/facebook` - Receive webhook events
- `POST /api/webhook/facebook` - Receive webhook events (API route)
- `POST /facebook/callback` - Legacy callback endpoint
- `POST /api/facebook/callback` - Legacy callback endpoint (API route)

## Facebook App Configuration

### 1. Webhook URL Configuration
Set your webhook URL to: `https://www.sentientm.com/webhook/facebook`

### 2. Verify Token
Use the verify token: `myFacebookWebhook2025`

### 3. Required Subscriptions
Subscribe to these events:
- `messages` - For Direct Messages
- `messaging_postbacks` - For message postbacks
- `feed` - For page feed events
- `comments` - For post comments

### 4. Page Access Token
Ensure your Facebook app has:
- `pages_manage_posts` - For posting
- `pages_read_engagement` - For reading engagement
- `pages_show_list` - For page listing
- `pages_manage_metadata` - For page management

## Testing Webhook Setup

### 1. Test Webhook Verification
```bash
curl "https://www.sentientm.com/webhook/facebook?hub.mode=subscribe&hub.verify_token=myFacebookWebhook2025&hub.challenge=test_challenge"
```

Expected response: `test_challenge`

### 2. Test Webhook Events
Send a test webhook event to verify DM processing:

```json
{
  "object": "page",
  "entry": [
    {
      "id": "YOUR_PAGE_ID",
      "time": 1234567890,
      "messaging": [
        {
          "sender": {
            "id": "SENDER_ID"
          },
          "recipient": {
            "id": "YOUR_PAGE_ID"
          },
          "timestamp": 1234567890,
          "message": {
            "mid": "message_id",
            "text": "Test message"
          }
        }
      ]
    }
  ]
}
```

## Debugging Steps

### 1. Check Server Logs
Look for these log messages:
- `[WEBHOOK_VERIFIED for Facebook]` - Webhook verification successful
- `[WEBHOOK ➜ Facebook payload received at webhook]` - Event received
- `[Storing Facebook DM event with User ID]` - DM stored successfully

### 2. Verify Token Storage
Check if Facebook tokens are properly stored in R2:
- `FacebookTokens/{pageId}/token.json`
- `FacebookConnection/{userId}/connection.json`

### 3. Test API Access
Use the debug endpoint: `GET /facebook-debug/{userId}`

## Common Issues and Solutions

### Issue 1: "Personal Account" Message
**Cause**: Connected a personal Facebook account instead of a business page.

**Solution**: 
1. Convert personal account to Facebook Page
2. Or create a new Facebook Business Page
3. Reconnect using the business page

### Issue 2: No Webhook Events Received
**Causes**:
- Webhook URL not configured in Facebook App
- Wrong verify token
- Page not subscribed to required events
- Personal account (no webhook support)

**Solutions**:
1. Verify webhook URL in Facebook App settings
2. Check verify token matches: `myFacebookWebhook2025`
3. Subscribe to required events in Facebook App
4. Use business page instead of personal account

### Issue 3: Events Received But Not Stored
**Causes**:
- No matching token found for page ID
- Token storage issues
- R2 bucket access problems

**Solutions**:
1. Check token storage in R2 bucket
2. Verify page ID matches stored token
3. Check server logs for storage errors

## Business Page vs Personal Account

### Business Page (Recommended)
- ✅ Full webhook support
- ✅ Automated posting
- ✅ Insights and analytics
- ✅ DM and comment notifications
- ✅ API access for messaging

### Personal Account (Limited)
- ❌ No webhook support
- ❌ Limited posting capabilities
- ❌ No insights data
- ❌ Restricted API access

## Migration from Personal to Business Page

1. **Create Facebook Business Page**:
   - Go to facebook.com/pages/create
   - Choose "Business or Brand"
   - Complete setup

2. **Connect Business Page**:
   - Disconnect personal account
   - Connect business page instead
   - Verify webhook events work

3. **Test Functionality**:
   - Send test DM to business page
   - Check if webhook receives event
   - Verify DM appears in dashboard

## Server Configuration

The modular server now includes:
- Dedicated Facebook webhook endpoints
- Improved error handling
- Better logging for debugging
- Enhanced personal account detection
- Clear user guidance for limitations

## Monitoring

Monitor these log patterns:
- `WEBHOOK_VERIFIED` - Successful verification
- `WEBHOOK ➜ Facebook payload` - Event received
- `Storing Facebook DM` - DM stored
- `No matching Facebook token` - Token lookup failed
- `Personal Account` - Limited functionality detected 