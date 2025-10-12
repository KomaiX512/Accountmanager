# 🧠 SENTIENT AI MANAGER - MODEL CONTEXT PROTOCOL

## **Core Architecture for Billions of Users**

### **1. User Identity Resolution**
```
EVERY user has:
  - userId: Firebase Authentication UID (unique identifier)
  - realName: Firebase displayName (e.g., "Komail Hassan")  
  - platforms: Map<platform, username>

NEVER hardcode:
  - userIds
  - usernames
  - file paths
```

### **2. Platform-Username Mapping (Dynamic)**
```
For EACH platform, the user has a DIFFERENT username:
  
R2 Structure:
  UserInstagramStatus/{userId}/status.json
    → { hasEnteredInstagramUsername: true, instagram_username: "u2023460" }
  
  UserTwitterStatus/{userId}/status.json
    → { hasEnteredTwitterUsername: true, twitter_username: "muhammad_muti" }
  
  UserFacebookStatus/{userId}/status.json
    → { hasEnteredFacebookUsername: true, facebook_username: "AutoPulseGlobalTrading" }
  
  UserLinkedInStatus/{userId}/status.json
    → { hasEnteredLinkedInUsername: true, linkedin_username: "devenp" }
```

### **3. File Retrieval Protocol**

**When user asks a query:**
1. Identify which PLATFORM the query is about
2. Get userId from Firebase Auth
3. Fetch platform-specific username from R2: `UserPlatformStatus/{userId}/status.json`
4. Construct file path based on query type:

#### **File Path Patterns:**

**Profile Data:**
```
Local Cache: /data/cache/{platform}_{username}_profile.json
R2 Bucket:   tasks/profiles/{platform}/{username}/profile.json

Example: /data/cache/instagram_u2023460_profile.json
```

**Competitor Data:**
```
Local Cache: /data/cache/{platform}_{competitor_username}_profile.json
R2 Bucket:   tasks/profiles/{platform}/{competitor_username}/profile.json

Example: /data/cache/instagram_maccosmetics_profile.json
```

**News Data:**
```
R2 Bucket: tasks/news_for_you/{platform}/{username}/news_{timestamp}_{username}.json

Example: tasks/news_for_you/instagram/u2023460/news_1728734400_u2023460.json
```

**Analytics Data:**
```
Derived from Profile: {platform}_{username}_profile.json
Fields: followersCount, followingCount, posts[], engagementRate
```

**Strategies:**
```
R2 Bucket: tasks/recommendations/{platform}/{username}/strategies.json

Example: tasks/recommendations/instagram/u2023460/strategies.json
```

### **4. Query Intent Recognition**

**Gemini AI MUST identify:**

| User Query | Intent | Platform | Data Source | File Path |
|-----------|--------|----------|-------------|-----------|
| "Show my Instagram analytics" | analytics | instagram | profile | `instagram_u2023460_profile.json` |
| "Analyze Instagram competitors" | competitor_analysis | instagram | competitor profiles | `instagram_maccosmetics_profile.json`, etc. |
| "Give me trending news" | news_summary | instagram | news | `news_for_you/instagram/u2023460/*.json` |
| "Show Twitter stats" | analytics | twitter | profile | `twitter_muhammad_muti_profile.json` |
| "Create post about news" | post_creation | [infer from context] | news + strategies | Multiple sources |

### **5. Operation Execution Protocol**

**Step-by-Step for ANY Query:**

```typescript
async function executeQuery(userQuery: string, userId: string, userRealName: string) {
  // Step 1: Parse intent with Gemini
  const intent = await gemini.parseIntent(userQuery);
  // → { operation: "analytics", platform: "instagram", params: {} }
  
  // Step 2: Get platform-specific username from R2
  const username = await getUsernameForPlatform(userId, intent.platform);
  // → "u2023460"
  
  // Step 3: Construct file paths
  const filePath = constructFilePath(intent.operation, intent.platform, username);
  // → "/data/cache/instagram_u2023460_profile.json"
  
  // Step 4: Retrieve file (try local cache first, then R2)
  const fileData = await retrieveFile(filePath);
  
  // Step 5: Send to Gemini for analysis
  const analysis = await gemini.analyze({
    userQuery,
    userData: fileData,
    username,
    platform: intent.platform,
    realName: userRealName
  });
  
  // Step 6: Return to user
  return analysis;
}
```

### **6. Hallucination Prevention**

**NEVER return:**
- Generic responses like "I don't have access"
- Made-up numbers or statistics
- Responses without citing actual data

**ALWAYS return:**
- Exact data from files
- References to file sources
- Clear errors if data unavailable

**Example Good Response:**
```
"Based on your Instagram profile (@u2023460), you have 4 followers and 24 posts. 
Your top competitor maccosmetics has 25M followers. 
Source: instagram_u2023460_profile.json, instagram_maccosmetics_profile.json"
```

**Example Bad Response (Hallucination):**
```
"Your Instagram is doing well! You should post more often."  ← NO DATA CITED!
```

### **7. Error Handling Protocol**

**If file doesn't exist:**
```
❌ BAD: Return generic "I can't help with that"
✅ GOOD: Return "Your Instagram profile data is not cached yet. Please visit the Instagram dashboard to sync your data."
```

**If platform not connected:**
```
❌ BAD: Proceed anyway and hallucinate
✅ GOOD: Return "Facebook is not connected. Connect it in Settings to enable AI analysis."
```

**If R2 request fails:**
```
❌ BAD: Silently fail and return empty response
✅ GOOD: Return "Unable to retrieve data from cloud storage. Error: [specific error]"
```

### **8. Scalability Design**

**For 1 billion users:**

**Memory:** Each user has their OWN file structure
```
User A (userId: abc123):
  - instagram_userA_profile.json
  - twitter_userA_profile.json

User B (userId: def456):
  - instagram_userB_profile.json  
  - twitter_userB_profile.json
```

**No Cross-Contamination:** User A's query NEVER touches User B's files

**Caching Strategy:**
- Local cache: 24-hour TTL
- R2 data: Real-time source of truth
- Backend cache: 30-second TTL for status checks

### **9. Context Injection for Gemini**

**Every message to Gemini includes:**
```typescript
const systemContext = `
USER IDENTITY:
- Real Name: ${userRealName}  
- User ID: ${userId}
- Connected Platforms: ${platformsWithUsernames}

AVAILABLE DATA:
- Instagram (@${instagramUsername}): Profile, Competitors, News
- Twitter (@${twitterUsername}): Profile, News  
- Facebook: Not connected
- LinkedIn: Not connected

CRITICAL INSTRUCTIONS:
1. ALWAYS address user by their real name "${userRealName}"
2. Use platform-specific usernames for data retrieval
3. NEVER hallucinate data - cite file sources
4. If data unavailable, explain which file is missing

USER QUERY: "${userQuery}"
`;
```

### **10. Production Checklist**

Before deploying:
- [ ] All hardcoded paths removed
- [ ] Dynamic username resolution tested
- [ ] File retrieval works for any userId
- [ ] Error messages are user-friendly
- [ ] Hallucination detection in place
- [ ] Performance: <2s response time
- [ ] Logging: Every file operation logged
- [ ] Monitoring: Track operation success rates

---

## **Implementation in Backend**

See: `/server/ai-manager-operations.js`

**Key Functions:**
- `getUsernameForPlatform(userId, platform)` - R2 lookup
- `readCachedProfile(platform, username)` - Local file read
- `readNewsFromR2(platform, username)` - R2 bucket scan
- `analyzeCompetitors(userId, platform, competitors)` - Multi-file analysis

**All functions:**
1. Accept userId as parameter (never hardcoded)
2. Fetch username dynamically
3. Construct paths based on parameters
4. Return errors clearly
5. Log every step

---

## **Frontend Integration**

See: `/src/services/AIManager/contextService.ts`

**Context Gathering:**
```typescript
async getUserContext(userId: string, realName: string) {
  // Fetch all platform statuses from backend R2
  const platforms = await this.getPlatformInfo(userId);
  
  return {
    userId,
    realName,
    platforms: [
      { name: 'instagram', username: 'u2023460', connected: true },
      { name: 'twitter', username: 'muhammad_muti', connected: true },
      { name: 'facebook', username: null, connected: false },
      { name: 'linkedin', username: null, connected: false }
    ]
  };
}
```

**Never use:**
- localStorage for username resolution
- Hardcoded usernames
- Assumptions about platform connection

**Always use:**
- Backend R2 status APIs
- Firebase Auth for userId/realName
- Dynamic context refresh on each query

---

## **Testing Protocol**

**Test with:**
- Different userIds
- Different platform combinations
- Missing data scenarios
- Network failures
- Cache misses

**NEVER test with:**
- Hardcoded test data
- Single user scenario only
- Optimistic path only

**Use:**
- `BRUTAL_AI_MANAGER_TEST.cjs` - Comprehensive testing
- Real user data from production
- Error injection to test resilience

---

**THIS IS THE FOUNDATION FOR A TRULY SENTIENT AI MANAGER**

**It works for:**
- 1 user
- 1 million users  
- 1 billion users

**Because it's:**
- Dynamic
- Scalable
- Never hardcoded
- Self-documenting
- Error-resilient
