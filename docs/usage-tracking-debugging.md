# Usage Tracking Debugging System

## Overview

The Usage Tracking Debugging System is a comprehensive tool designed to identify and resolve issues with feature usage counting in the Account Manager application. It provides real-time monitoring, battle testing, and detailed debugging capabilities.

## Problem Statement

The system was experiencing inconsistent usage tracking where:
- Feature usage counts were being tracked but then resetting
- Usage counts were becoming disconnected from actual feature usage
- The four main features (Posts, Discussions, AI Replies, Campaigns) were not consistently counting

## Components

### 1. UsageTracker Component (`src/components/common/UsageTracker.tsx`)

The main debugging interface that provides:
- Real-time usage monitoring
- Backend connection status
- Battle testing system
- Debug console
- Individual feature testing

### 2. useTrackingDebugger Hook (`src/hooks/useTrackingDebugger.ts`)

A comprehensive debugging hook that:
- Records all tracking events
- Provides detailed statistics
- Enables comprehensive testing
- Exports debugging data

### 3. Enhanced UsageContext (`src/context/UsageContext.tsx`)

Improved context with:
- Better error handling
- Optimistic updates
- Cross-tab synchronization
- Backend consistency checks

## Battle Testing System

### What is Battle Testing?

Battle testing is an automated system that tests each feature tracking mechanism to identify exactly where usage counting is failing. It:

1. **Records initial state** - Captures usage counts before testing
2. **Executes tracking** - Calls the actual tracking functions
3. **Monitors changes** - Watches for usage count updates
4. **Validates results** - Compares expected vs actual counts
5. **Reports issues** - Provides detailed failure analysis

### How to Use Battle Testing

#### 1. Access the Battle Testing Interface

```tsx
// In any component that uses UsageTracker
import UsageTracker from '../common/UsageTracker';

// The component will show a "Battle Test System" button
```

#### 2. Start Comprehensive Testing

Click the **"Start Battle Test Suite"** button to run tests on all features:
- Posts tracking
- Discussions tracking  
- AI Replies tracking
- Campaigns tracking

#### 3. Monitor Results

The system will show:
- **Current test status** - Which feature is being tested
- **Test results** - Pass/fail status for each feature
- **Detailed metrics** - Before/after counts and timing
- **Error information** - Specific failure reasons

#### 4. Analyze Failures

If a test fails, you'll see:
- Expected count vs actual count
- Error messages from tracking functions
- Timing information
- Platform and action details

## Debug Console

### Real-Time Monitoring

The debug console provides:
- **Live logs** - All tracking events in real-time
- **Backend status** - Connection health monitoring
- **Cross-tab updates** - Usage synchronization across browser tabs
- **Storage changes** - LocalStorage usage tracking

### Debug Controls

- **Test Backend Connection** - Verify API connectivity
- **Force Refresh Usage** - Manually sync with backend
- **Clear Logs** - Reset debug output
- **Real-time Toggle** - Enable/disable live monitoring

## Individual Feature Testing

### Test Specific Features

You can test individual features without running the full suite:

1. **Posts Test** - Tests post creation tracking
2. **Discussions Test** - Tests discussion engagement tracking
3. **AI Replies Test** - Tests AI response generation tracking
4. **Campaigns Test** - Tests campaign management tracking

### Test Parameters

Each test uses realistic parameters:
- **Posts**: `{ immediate: true, type: 'test' }`
- **Discussions**: `{ messageCount: 1, type: 'chat' }`
- **AI Replies**: `{ type: 'dm', mode: 'instant' }`
- **Campaigns**: `{ action: 'goal_set' }`

## Common Issues and Solutions

### Issue 1: Usage Counts Reset

**Symptoms**: Usage counts increase then immediately reset to previous values

**Possible Causes**:
- Race condition between optimistic updates and backend calls
- Auto-refresh conflicts with manual updates
- Multiple tracking calls for the same action

**Solutions**:
- Check for duplicate tracking calls
- Verify backend endpoint consistency
- Monitor auto-refresh timing

### Issue 2: Backend Disconnection

**Symptoms**: Usage counts only update locally, not persisting to backend

**Possible Causes**:
- Network connectivity issues
- Backend service down
- API endpoint errors

**Solutions**:
- Check backend status indicator
- Verify API endpoints
- Test backend connection

### Issue 3: Feature Blocking

**Symptoms**: Features are blocked even when usage limits aren't reached

**Possible Causes**:
- Incorrect user type detection
- Wrong limit calculations
- Cache inconsistencies

**Solutions**:
- Verify user type and limits
- Clear user cache
- Check limit enforcement logic

## Debugging Workflow

### Step 1: Initial Assessment

1. Open the UsageTracker component
2. Check backend connection status
3. Review current usage counts
4. Enable real-time monitoring

### Step 2: Run Battle Tests

1. Start comprehensive battle test suite
2. Monitor each feature test
3. Record any failures
4. Note timing and error details

### Step 3: Analyze Results

1. Review battle test results
2. Check debug logs for errors
3. Verify backend consistency
4. Identify failure patterns

### Step 4: Implement Fixes

1. Address identified issues
2. Test individual fixes
3. Re-run battle tests
4. Verify resolution

## Integration with Existing Code

### Using the Debug Hook

```tsx
import useTrackingDebugger from '../hooks/useTrackingDebugger';

const MyComponent = () => {
  const { 
    testTrackingWithDebug, 
    runComprehensiveTests,
    trackingEvents,
    debugStats 
  } = useTrackingDebugger();

  // Test specific feature
  const testPosts = async () => {
    const result = await testTrackingWithDebug('posts', 'my_platform');
    console.log('Test result:', result);
  };

  // Run all tests
  const runTests = async () => {
    const results = await runComprehensiveTests();
    console.log('All test results:', results);
  };

  return (
    <div>
      <button onClick={testPosts}>Test Posts</button>
      <button onClick={runTests}>Run All Tests</button>
      <div>Total Events: {debugStats.totalEvents}</div>
    </div>
  );
};
```

### Adding Debug Logging

```tsx
import { useTrackingDebugger } from '../hooks/useTrackingDebugger';

const MyComponent = () => {
  const { recordTrackingEvent } = useTrackingDebugger();

  const handleFeatureUsage = async () => {
    const beforeCount = currentUsage;
    
    try {
      // Perform feature action
      await performFeatureAction();
      
      // Record successful tracking
      recordTrackingEvent({
        feature: 'posts',
        platform: 'instagram',
        action: 'post_created',
        beforeCount,
        afterCount: currentUsage,
        success: true,
        duration: Date.now() - startTime
      });
    } catch (error) {
      // Record failed tracking
      recordTrackingEvent({
        feature: 'posts',
        platform: 'instagram',
        action: 'post_created',
        beforeCount,
        afterCount: currentUsage,
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      });
    }
  };
};
```

## Best Practices

### 1. Always Test After Changes

- Run battle tests after any tracking logic changes
- Verify both individual features and comprehensive testing
- Check debug logs for new issues

### 2. Monitor Real-Time

- Keep real-time monitoring enabled during development
- Watch for unexpected usage count changes
- Monitor backend connection status

### 3. Use Debug Logging

- Add debug logging to custom tracking implementations
- Record before/after states for debugging
- Include timing and error information

### 4. Regular Maintenance

- Clear debug logs periodically
- Export tracking data for analysis
- Monitor battle test success rates

## Troubleshooting

### Debug Console Not Showing

- Ensure UsageTracker component is imported
- Check for console errors
- Verify component mounting

### Battle Tests Not Running

- Check user authentication
- Verify backend connectivity
- Ensure tracking functions are available

### Inconsistent Results

- Clear browser cache
- Check for multiple tracking calls
- Verify backend data consistency

## Conclusion

The Usage Tracking Debugging System provides comprehensive tools to identify and resolve usage tracking issues. By using the battle testing system, debug console, and monitoring tools, developers can quickly pinpoint where tracking is failing and implement targeted fixes.

The system is designed to be:
- **Non-intrusive** - Doesn't affect normal app functionality
- **Comprehensive** - Tests all tracking mechanisms
- **Real-time** - Provides immediate feedback
- **Detailed** - Gives specific failure information

Use this system regularly to maintain reliable usage tracking across all features.
