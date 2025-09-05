# VPS Usage Increment Fix

## 🐛 Problem Identified

The usage increment functionality works locally but fails on VPS due to **missing nginx routing configuration**.

## 🔍 Root Cause Analysis

### Missing Endpoints in VPS Configuration

1. **❌ Missing `/api/usage/sync/` endpoint**
   - Your application uses this endpoint for manual usage synchronization
   - Route: `POST /api/usage/sync/:firebaseUID/:platform/:username`
   - Was completely missing from nginx config

2. **⚠️ Incorrect routing order**
   - Nginx processes location blocks in specific order
   - More specific routes must come before general ones
   - `/api/usage/increment/` was correctly routed to port 3000
   - But `/api/usage/sync/` requests were falling through to `/api/usage/` (port 3002)

### How This Affects Usage Tracking

```
Local (Working):
┌─────────────────────┐    ┌──────────────────┐
│ Frontend Request    │───▶│ server.js:3000   │
│ /api/usage/increment│    │ ✅ Direct access │
└─────────────────────┘    └──────────────────┘

VPS (Before Fix):
┌─────────────────────┐    ┌─────────────┐    ┌─────────────────┐
│ Frontend Request    │───▶│ nginx       │───▶│ Wrong server or │
│ /api/usage/sync     │    │ 🚫 No route │    │ 502 error       │
└─────────────────────┘    └─────────────┘    └─────────────────┘

VPS (After Fix):
┌─────────────────────┐    ┌─────────────┐    ┌──────────────────┐
│ Frontend Request    │───▶│ nginx       │───▶│ server.js:3000   │
│ /api/usage/sync     │    │ ✅ Routes   │    │ ✅ Correct!      │
└─────────────────────┘    └─────────────┘    └──────────────────┘
```

## ✅ Applied Fixes

### 1. Added Missing `/api/usage/sync/` Route
```nginx
location ^~ /api/usage/sync/ {
    proxy_pass http://127.0.0.1:3000;
    # ... proxy headers
}
```

### 2. Corrected Route Priority Order
```nginx
# Most specific first ✅
location ^~ /api/usage/sync/       { proxy_pass → port 3000 }
location ^~ /api/usage/increment/  { proxy_pass → port 3000 }
location ^~ /usage/increment/      { proxy_pass → port 3000 }
location ^~ /api/usage/           { proxy_pass → port 3002 }
location ^~ /usage/               { proxy_pass → port 3000 }
```

### 3. Added Non-API Alternative Routes
```nginx
location ^~ /usage/increment/ {
    proxy_pass http://127.0.0.1:3000;
    # Supports both /api/usage/increment and /usage/increment patterns
}
```

## 🧪 Testing

### Use the Test Script
```bash
./test-vps-usage.sh
```

### Manual Testing Commands
```bash
# Test 1: UID-based increment (should work now)
curl -X POST "https://sentientm.com/api/usage/increment/KUvVFxnLanYTWPuSIfphby5hxJQ2" \
  -H "Content-Type: application/json" \
  -d '{"feature": "postGeneration", "count": 1}'

# Test 2: Usage sync (NEW - this was broken before)
curl -X POST "https://sentientm.com/api/usage/sync/KUvVFxnLanYTWPuSIfphby5hxJQ2/instagram/narsissist"

# Test 3: Platform-based increment
curl -X POST "https://sentientm.com/api/usage/increment/instagram/narsissist" \
  -H "Content-Type: application/json" \
  -d '{"feature": "aiReply", "count": 1}'
```

## 🚀 Deployment Steps

1. **Apply the configuration**:
   ```bash
   sudo cp VPS.conf /tmp/sentientm-nginx.conf
   sudo nginx -t
   sudo systemctl reload nginx
   ```

2. **Verify servers are running**:
   ```bash
   # Check main server (port 3000) is running
   curl http://localhost:3000/health || echo "Main server down"
   
   # Check proxy server (port 3002) is running  
   curl http://localhost:3002/health || echo "Proxy server down"
   ```

3. **Test the fix**:
   ```bash
   ./test-vps-usage.sh
   ```

## 📊 Expected Results

After applying these fixes:

- ✅ Usage increment requests will reach the correct server (port 3000)
- ✅ Usage sync requests will work (was completely broken before)  
- ✅ Both `/api/usage/increment/` and `/usage/increment/` patterns will work
- ✅ General usage queries will still go to proxy server (port 3002)
- ✅ Usage tracking will work the same as locally

## 🔍 Verification

Check if usage is being incremented by:

1. Making a request to increment usage
2. Checking the usage stats immediately after:
   ```bash
   curl "https://sentientm.com/api/usage/instagram/narsissist"
   ```
3. Values should increase after increment requests

The fix ensures proper routing of usage-related requests to the correct backend servers, matching the behavior that works locally.
