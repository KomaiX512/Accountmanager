# 🔥 BRUTAL PLATFORM ACQUISITION TEST - 20 SCENARIOS

## **TESTING INSTRUCTIONS**

Open frontend: `npm run dev` → http://localhost:5173  
Open AI Manager chat  
Monitor backend: `pm2 logs main-api-unified --lines 100`

---

## **TEST SUITE: PLATFORM ACQUISITION VALIDATION**

### **GROUP 1: Already Acquired Detection (4 tests)**

**Test 1: Instagram (Already Acquired)**
```
USER: "Acquire Instagram for me"
EXPECTED: ❌ Instagram is already acquired as @u2023460. To re-acquire, you must first reset it in Settings, then try again.
VALIDATION: 
  ✅ Detects existing acquisition
  ✅ Shows current username
  ✅ Tells user how to fix (reset in Settings)
  ❌ FAIL IF: Proceeds with acquisition or hallucin ates
```

**Test 2: Twitter (Already Acquired)**
```
USER: "Connect my Twitter account"
EXPECTED: ❌ Twitter is already acquired as @muhammad_muti. To re-acquire, you must first reset it in Settings, then try again.
VALIDATION:
  ✅ Same behavior as Instagram
  ❌ FAIL IF: Allows re-acquisition
```

**Test 3: Check Status Before Acquiring**
```
USER: "Is Instagram already connected?"
EXPECTED: ✅ Instagram is connected (@u2023460)
THEN: "Acquire Instagram"
EXPECTED: ❌ Already acquired message
VALIDATION:
  ✅ Status check works
  ✅ Acquisition blocked after confirmation
```

**Test 4: All Platforms Status**
```
USER: "What platforms do I have?"
EXPECTED: Lists Instagram (✅ @u2023460), Twitter (✅ @muhammad_muti), Facebook (✅), LinkedIn (✅)
THEN: "Acquire Twitter"
EXPECTED: ❌ Already acquired
VALIDATION:
  ✅ Shows all 4 platforms with status
  ✅ Blocks acquisition of any acquired platform
```

---

### **GROUP 2: Missing Requirements - Instagram/Twitter (6 tests)**

**Test 5: Instagram - No Username**
```
USER: "Acquire Instagram"
EXPECTED: ❌ Username is required for instagram. Please provide your instagram username.
VALIDATION:
  ✅ Asks for username
  ❌ FAIL IF: Proceeds without username
```

**Test 6: Instagram - No Competitors**
```
USER: "Acquire Instagram with username testuser123"
EXPECTED: ❌ Instagram requires 3 competitors.
REQUIREMENTS:
- Username: testuser123 ✅
- Competitors: 0/3 ❌
Please provide 3 competitor usernames.
VALIDATION:
  ✅ Shows progress checklist
  ✅ Specifies exactly what's missing
  ❌ FAIL IF: Generic error or proceeds
```

**Test 7: Instagram - Only 2 Competitors**
```
USER: "Acquire Instagram username: myaccount, competitors: nike, adidas"
EXPECTED: ❌ Instagram requires 3 competitors.
REQUIREMENTS:
- Username: myaccount ✅
- Competitors: 2/3 ❌
Please provide 3 competitor usernames.
VALIDATION:
  ✅ Counts competitors correctly
  ✅ Tells exactly how many more needed
```

**Test 8: Twitter - Complete Requirements**
```
USER: "Acquire Twitter username: mytwitter, competitors: elonmusk, jack, naval"
EXPECTED: 
  IF NOT ALREADY ACQUIRED: ✅ Processing started for @mytwitter
  IF ALREADY ACQUIRED: ❌ Already acquired as @muhammad_muti
VALIDATION:
  ✅ Accepts valid input
  ✅ OR correctly detects existing acquisition
  ❌ FAIL IF: Hallucination or silent failure
```

**Test 9: Twitter - Invalid Platform Name**
```
USER: "Acquire tiktok with username myaccount"
EXPECTED: ❌ Unknown platform: tiktok
Supported platforms: instagram, twitter, facebook, linkedin
VALIDATION:
  ✅ Rejects unsupported platform
  ✅ Lists valid options
```

**Test 10: Empty/Whitespace Username**
```
USER: "Acquire Instagram username: '   ', competitors: a, b, c"
EXPECTED: ❌ Username is required for instagram.
VALIDATION:
  ✅ Validates non-empty username
  ❌ FAIL IF: Accepts whitespace
```

---

### **GROUP 3: Missing Requirements - Facebook/LinkedIn (6 tests)**

**Test 11: Facebook - No Profile URL**
```
USER: "Acquire Facebook username: mybusiness"
EXPECTED: ❌ Facebook requires a profile URL.
REQUIREMENTS:
- Username: mybusiness ✅
- Profile URL: ❌ MISSING
- 3 Competitors with URLs: 0/3
Please provide your facebook profile URL.
VALIDATION:
  ✅ Specific to Facebook requirements
  ✅ Shows checklist format
  ❌ FAIL IF: Doesn't mention URL requirement
```

**Test 12: Facebook - Invalid URL Format**
```
USER: "Acquire Facebook username: mybiz, profileURL: facebook.com/mybiz"
EXPECTED: ❌ Invalid profile URL format.
Expected: https://www.facebook.com/...
Received: facebook.com/mybiz
Please provide a complete URL starting with https://
VALIDATION:
  ✅ Validates URL format
  ✅ Shows example
  ❌ FAIL IF: Accepts incomplete URL
```

**Test 13: Facebook - URL OK, No Competitors**
```
USER: "Acquire Facebook username: mybiz, profileURL: https://facebook.com/mybiz"
EXPECTED: ❌ Facebook requires 3 competitor profiles with URLs.
REQUIREMENTS:
- Username: mybiz ✅
- Profile URL: https://facebook.com/mybiz ✅
- Competitors: 0/3 ❌
Please provide 3 competitor profile URLs.
VALIDATION:
  ✅ Progressive validation (URL passed, now needs competitors)
```

**Test 14: LinkedIn - Competitor Without URL**
```
USER: "Acquire LinkedIn username: john, profileURL: https://linkedin.com/in/john, competitors: [{name: 'comp1'}, {name: 'comp2', url: 'https://...'}, {name: 'comp3'}]"
EXPECTED: ❌ Competitor 1 is missing a URL.
All competitors for linkedin must have profile URLs.
VALIDATION:
  ✅ Validates each competitor
  ✅ Identifies which one is missing URL
  ❌ FAIL IF: Accepts competitors without URLs
```

**Test 15: LinkedIn - Complete Valid Request**
```
USER: "Acquire LinkedIn username: john, profileURL: https://linkedin.com/in/john, competitors: [{name: 'comp1', url: 'https://...'}, {name: 'comp2', url: 'https://...'}, {name: 'comp3', url: 'https://...'}]"
EXPECTED:
  IF NOT ACQUIRED: ✅ Processing started for @john
  IF ALREADY ACQUIRED: ❌ Already acquired as @devenp
VALIDATION:
  ✅ Accepts complete valid input
  ✅ OR detects existing acquisition
```

**Test 16: Facebook - Mixed Requirements**
```
USER: "Acquire Facebook"
THEN: "username: mybiz"
THEN: "profileURL: https://facebook.com/mybiz"
THEN: "competitors: nike, adidas, puma"
EXPECTED: Step-by-step collection OR single validation error listing all missing items
VALIDATION:
  ✅ AI collects missing info
  ✅ OR shows complete requirements upfront
```

---

### **GROUP 4: News Summary (Network Error Fix) (4 tests)**

**Test 17: Twitter News (Previously Failed)**
```
USER: "What's trending on Twitter today?"
EXPECTED: ✅ Real news headlines from R2 bucket
Response time: <60 seconds
VALIDATION:
  ✅ Returns actual news (not hallucination)
  ✅ No "Network Error"
  ✅ Uses correct username (@muhammad_muti)
  ❌ FAIL IF: Network error, timeout, or generic response
```

**Test 18: Instagram News**
```
USER: "Give me trending Instagram news"
EXPECTED: ✅ News summary for Instagram
VALIDATION:
  ✅ Uses @u2023460
  ✅ Real data from R2
  ❌ FAIL IF: Network error
```

**Test 19: Facebook News**
```
USER: "What's trending on Facebook?"
EXPECTED: ✅ News for @AutoPulseGlobalTrading
VALIDATION:
  ✅ Platform-specific news
  ❌ FAIL IF: Uses wrong username
```

**Test 20: Unconnected Platform News**
```
USER: "Show me TikTok trending news"
EXPECTED: ❌ TikTok is not connected. Connect it first to see trending news.
VALIDATION:
  ✅ Graceful error
  ❌ FAIL IF: Hallucinated TikTok news
```

---

## **BACKEND MONITORING CHECKLIST**

During each test, monitor logs for:

```bash
pm2 logs main-api-unified --lines 100
```

**✅ GOOD SIGNS:**
```
🔍 Checking if instagram is already acquired for user KomaiX512...
✅ All requirements met. Acquiring instagram as @testuser...
📰 [NewsSummary] Using AGENTIC BACKEND for twitter/@muhammad_muti...
✅ Retrieved username: @muhammad_muti for twitter
```

**❌ RED FLAGS:**
```
❌ Failed to fetch news: Network Error
❌ Creating post for undefined
❌ Profile file not found
connect ECONNREFUSED
Request timeout
```

---

## **PASS CRITERIA**

| Category | Pass Rate | Grade |
|----------|-----------|-------|
| Already Acquired Detection | 4/4 (100%) | A+ |
| Missing Requirements (Inst/Twit) | 5/6 (83%+) | A |
| Missing Requirements (FB/LinkedIn) | 5/6 (83%+) | A |
| News Summary | 4/4 (100%) | A+ |
| **OVERALL** | **16/20 (80%+)** | **A** |

**PRODUCTION READY:** ≥80% with 0 hallucinations  
**NEEDS WORK:** 60-79%  
**NOT READY:** <60%

---

## **WHAT TO LOOK FOR**

### **✅ CORRECT BEHAVIOR:**
- Detects already-acquired platforms
- Shows specific requirements per platform
- Validates inputs before submission
- Uses platform-specific usernames
- Returns real data from backend
- Clear error messages

### **❌ FAILURES:**
- Allows re-acquisition without reset
- Generic "can't help" responses
- Hallucinated data
- Network errors
- Timeouts
- Wrong usernames for platform

---

## **QUICK TEST COMMAND**

Run all 20 tests manually in AI Manager chat, record results:

```
[  ] Test 1-4: Already Acquired
[  ] Test 5-10: Instagram/Twitter Requirements
[  ] Test 11-16: Facebook/LinkedIn Requirements  
[  ] Test 17-20: News Summary

Pass Rate: __/20 (__%)
Grade: ___
Hallucinations: ___
```

**Status:** READY FOR TESTING ✅
