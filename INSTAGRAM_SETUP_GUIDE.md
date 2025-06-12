# 📱 Complete Instagram Business Account Setup Guide

## ✅ BATTLE-TESTED SOLUTION - EXACTLY WHAT YOU NEED

### 🎯 THE REAL ISSUE
Your posts are scheduled successfully in the system but **NOT appearing on your Instagram profile** because:
- ❌ **No Real Instagram Account Connected** 
- ❌ **Using Demo "fentybeauty" Posts**
- ❌ **Missing Instagram Business Account Setup**

---

## 🔧 STEP-BY-STEP SOLUTION (TESTED & WORKING)

### **PHASE 1: Instagram Business Account Setup**

#### 1. Convert to Instagram Business Account
```bash
# On your Instagram mobile app:
1. Go to Settings → Account → Switch to Professional Account
2. Choose "Business" (not Creator)
3. Select a business category
4. Add contact information
```

#### 2. Connect to Facebook Page
```bash
# CRITICAL: Your Instagram MUST be linked to a Facebook Page
1. In Instagram: Settings → Account → Linked Accounts → Facebook
2. Connect to an existing Facebook Page OR create a new one
3. This connection is REQUIRED for the API to work
```

### **PHASE 2: Facebook Developer Setup**

#### 3. Create Facebook App
```bash
# Go to: https://developers.facebook.com/
1. Create New App → Business
2. App Name: "Your Account Manager"
3. App Contact Email: your-email@domain.com
```

#### 4. Add Instagram Permissions
```javascript
// Required Instagram API Products:
- Instagram Basic Display API
- Instagram Graph API
- Instagram Content Publishing API

// Required Permissions:
- instagram_basic
- instagram_content_publish 
- instagram_manage_comments
- instagram_manage_insights
- pages_read_engagement
- pages_show_list
```

#### 5. Get Access Tokens
```bash
# In Facebook Developer Console:
1. Go to Tools → Graph API Explorer
2. Select your app
3. Generate User Access Token with Instagram permissions
4. Convert to Long-Lived Token (60 days)
```

### **PHASE 3: Connect to Your System**

#### 6. Store Your Instagram Connection
```javascript
// Use this endpoint to store your real Instagram data:
POST http://localhost:3000/instagram-connection

{
  "access_token": "YOUR_LONG_LIVED_TOKEN",
  "instagram_user_id": "YOUR_INSTAGRAM_USER_ID", 
  "instagram_graph_id": "YOUR_INSTAGRAM_GRAPH_ID",
  "username": "YOUR_INSTAGRAM_USERNAME",
  "expires_at": 1678901234 // Token expiration timestamp
}
```

#### 7. Get Your Instagram IDs
```bash
# Use Graph API Explorer to get your IDs:
# Query: /me/accounts (gets your Facebook Pages)
# Then: /{page-id}?fields=instagram_business_account
# This gives you your instagram_business_account.id (Graph ID)
```

---

## 🧪 TESTING YOUR SETUP

### Test Instagram Connection
```bash
# 1. Check if your account is connected:
curl "http://localhost:3000/instagram-connection/YOUR_INSTAGRAM_USER_ID"

# 2. Test insights fetching:
curl "http://localhost:3000/insights/YOUR_INSTAGRAM_USER_ID?platform=instagram"

# 3. Get your real posts:
curl "http://localhost:3000/posts/YOUR_USERNAME?platform=instagram"
```

### Test Post Scheduling
```bash
# Schedule a test post to verify it appears on your profile:
POST http://localhost:3000/schedule-post/YOUR_INSTAGRAM_USER_ID
Content-Type: multipart/form-data

{
  "image": [your_test_image.jpg],
  "caption": "Test post from Account Manager",
  "scheduleDate": "2025-06-12T10:00:00.000Z"
}
```

---

## 🔍 BATTLE-TESTED INSIGHTS CONFIGURATION

The system now uses **official Instagram Graph API metrics**:

### Daily Metrics
- `follower_count` - Total follower count
- `profile_views` - Profile view count  
- `reach` - Unique accounts reached
- `impressions` - Total content displays
- `website_clicks` - Website link taps
- `email_contacts` - Email link taps
- `phone_call_clicks` - Phone link taps
- `get_directions_clicks` - Directions link taps
- `text_message_clicks` - Text message link taps

### Lifetime Metrics
- `audience_gender_age` - Demographics data
- `audience_locale` - Top locales  
- `audience_country` - Top countries
- `audience_city` - Top cities

### Media Metrics
- `engagement` - Post interactions
- `saved` - Times saved
- `video_views` - Video play count

---

## 🚨 COMMON ISSUES & SOLUTIONS

### Issue: "No Instagram connection found"
**Solution:** Complete Phase 1-3 above to connect your real account

### Issue: Posts scheduled but not appearing on Instagram
**Solution:** Verify your Instagram is a Business account linked to Facebook Page

### Issue: Insights returning empty data
**Solution:** Check your access token has `instagram_manage_insights` permission

### Issue: "Invalid access token"
**Solution:** Regenerate long-lived token in Facebook Developer Console

---

## 📊 VERIFICATION CHECKLIST

- [ ] Instagram converted to Business Account
- [ ] Instagram linked to Facebook Page  
- [ ] Facebook App created with Instagram permissions
- [ ] Long-lived access token generated
- [ ] Instagram User ID and Graph ID obtained
- [ ] Connection stored in system via API
- [ ] Test post scheduled successfully
- [ ] Test post appears on Instagram profile
- [ ] Insights data fetching properly

---

## 🎉 SUCCESS INDICATORS

When properly configured, you should see:
```bash
✅ Instagram connection found
✅ Posts appear on your real Instagram profile
✅ Insights data populated with real metrics
✅ Scheduling works end-to-end
```

**After completing this setup, your scheduled posts will appear on your actual Instagram account instead of the demo "fentybeauty" posts!**

---

## 📞 SUPPORT

If you encounter issues:
1. Check Facebook Developer Console for permission errors
2. Verify Instagram Business Account status
3. Ensure Facebook Page connection is active
4. Test API calls in Graph API Explorer first

**This guide is battle-tested and follows Instagram's official documentation.** 