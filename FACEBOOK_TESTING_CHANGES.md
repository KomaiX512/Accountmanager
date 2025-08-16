# Facebook Testing Changes - RunStatus Debug Mode

Changed Facebook processing timer from 20 minutes to 1 minute for rapid testing and added comprehensive RunStatus checking with detailed logging.

## Key Changes Made

### 1. Facebook Timer Reduction (20min → 1min)

**File:** `src/components/common/ProcessingLoadingState.tsx`
- Changed Facebook `initialMinutes` from 20 to 1
- Updated documentation comments
- This allows 20x faster testing cycles

### 2. Enhanced RunStatus Checking (Timer Expiry Only)

**File:** `src/pages/Processing.tsx`
- RunStatus checking happens **ONLY** when timer expires (no wasteful periodic checking)
- Added comprehensive logging at every critical stage
- Added detailed username tracking and validation
- Enhanced `finalizeAndNavigate` function with step-by-step logging

### 3. Enhanced UI RunStatus Monitor

**File:** `src/components/common/ProcessingLoadingState.tsx`
- Added RunStatus monitor panel for Facebook (testing mode)
- Shows real-time information:
  - Platform and username being checked
  - Expected R2 path (RunStatus/facebook/username/status.json)  
  - Checking frequency (once when timer expires)
  - Timer mode (1 minute testing vs 20 minute production)

**File:** `src/components/common/ProcessingLoadingState.css`
- Added styles for RunStatus monitor panel
- Clean, readable display of debugging information

## Expected Behavior Changes

### Before (20 minutes, minimal logging):
```
🔥 Timer started for facebook - 20 minutes
... (20 minutes of silence) ...
🔍 Timer expired, checking RunStatus
✅ RunStatus found OR ⏳ Extending by 5 minutes
```

### After (1 minute with enhanced logging):
```
🔥 Timer started for facebook - 1 minute
� TIMER_INTERVAL: Checking timer validity for facebook
� TIMER_VALID: Timer is valid for facebook, continuing
... (timer runs) ...
� TIMER_INVALID: Timer invalid for facebook, reason: expired
🔍 STARTING RUNSTATUS CHECK: facebook/testuser
🔍 RUNSTATUS DEBUG INFO:
  - Platform: facebook
  - Username: testuser
  - API endpoint: [BACKEND_URL]/api/runstatus/facebook/testuser
  - Expected R2 path: RunStatus/facebook/testuser/status.json
🔍 RUNSTATUS RESPONSE: 200 {exists: true, status: "completed"}
🎉 RUNSTATUS SUCCESS: Data found for facebook/testuser, completing processing!
🎯 FINALIZE: Starting finalization for platform facebook
🎯 FINALIZE: Navigating to dashboard path: /facebook-dashboard
```

## Files Modified

1. **ProcessingLoadingState.tsx** - Timer reduction and UI monitor
2. **ProcessingLoadingState.css** - RunStatus monitor styles  
3. **Processing.tsx** - Enhanced logging (timer expiry only)

## Testing Instructions

1. **Start Facebook processing** with any username
2. **Wait 1 minute** for timer to expire
3. **Observe the UI** showing RunStatus monitoring info
4. **Check console logs** for detailed flow information
5. **Scenarios to test:**
   - Data available when timer expires: Completes and navigates to dashboard
   - Data not available when timer expires: Extends by 5 minutes and repeats

## Log Categories

- Look for 🔍 (RunStatus), 🎯 (Completion), 🔥 (Timer) emoji prefixes
- All critical decision points now have detailed logging
- Username preservation and source tracking included

## Reverting Changes

To restore 20-minute timer for production:
1. Change `initialMinutes: 1` back to `initialMinutes: 20` in ProcessingLoadingState.tsx
2. Update documentation comment from "1 minute" back to "20 minutes"
3. Consider keeping the enhanced logging for better debugging
