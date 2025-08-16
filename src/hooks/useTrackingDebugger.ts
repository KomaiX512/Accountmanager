import { useState, useEffect, useCallback } from 'react';
import useFeatureTracking from '../hooks/useFeatureTracking';
import { useUsage } from '../context/UsageContext';
import { useAuth } from '../context/AuthContext';

interface TrackingEvent {
  id: string;
  timestamp: string;
  feature: string;
  platform: string;
  action: string;
  beforeCount: number;
  afterCount: number;
  success: boolean;
  error?: string;
  duration: number;
}

interface DebugStats {
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  averageDuration: number;
  lastEventTime: string;
  featureBreakdown: Record<string, { count: number; success: number; failure: number }>;
}

export const useTrackingDebugger = () => {
  const { currentUser } = useAuth();
  const { usage, refreshUsage } = useUsage();
  const { trackRealPostCreation, trackRealDiscussion, trackRealAIReply, trackRealCampaign } = useFeatureTracking();
  
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
  const [isDebugging, setIsDebugging] = useState(false);
  const [debugStats, setDebugStats] = useState<DebugStats>({
    totalEvents: 0,
    successfulEvents: 0,
    failedEvents: 0,
    averageDuration: 0,
    lastEventTime: '',
    featureBreakdown: {}
  });

  // Monitor usage changes to detect tracking events
  useEffect(() => {
    if (!isDebugging) return;

    const handleUsageChange = (event: CustomEvent) => {
      if (event.detail.userId === currentUser?.uid) {
        console.log('[TrackingDebugger] Usage change detected:', event.detail);
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key?.includes(`usage_${currentUser?.uid}`) && event.newValue) {
        console.log('[TrackingDebugger] Storage change detected:', event.key, event.newValue);
      }
    };

    window.addEventListener('usageUpdated', handleUsageChange as EventListener);
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('usageUpdated', handleUsageChange as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [currentUser?.uid, isDebugging]);

  // Calculate debug stats
  useEffect(() => {
    if (trackingEvents.length === 0) return;

    const stats: DebugStats = {
      totalEvents: trackingEvents.length,
      successfulEvents: trackingEvents.filter(e => e.success).length,
      failedEvents: trackingEvents.filter(e => !e.success).length,
      averageDuration: trackingEvents.reduce((sum, e) => sum + e.duration, 0) / trackingEvents.length,
      lastEventTime: trackingEvents[0]?.timestamp || '',
      featureBreakdown: {}
    };

    // Calculate feature breakdown
    trackingEvents.forEach(event => {
      if (!stats.featureBreakdown[event.feature]) {
        stats.featureBreakdown[event.feature] = { count: 0, success: 0, failure: 0 };
      }
      stats.featureBreakdown[event.feature].count++;
      if (event.success) {
        stats.featureBreakdown[event.feature].success++;
      } else {
        stats.featureBreakdown[event.feature].failure++;
      }
    });

    setDebugStats(stats);
  }, [trackingEvents]);

  // Record a tracking event
  const recordTrackingEvent = useCallback((event: Omit<TrackingEvent, 'id' | 'timestamp'>) => {
    const newEvent: TrackingEvent = {
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };

    setTrackingEvents(prev => [newEvent, ...prev.slice(0, 99)]); // Keep last 100 events
    console.log('[TrackingDebugger] Event recorded:', newEvent);
  }, []);

  // Test tracking with detailed monitoring
  const testTrackingWithDebug = useCallback(async (
    feature: 'posts' | 'discussions' | 'aiReplies' | 'campaigns',
    platform: string = 'debug_test'
  ) => {
    if (!currentUser?.uid) {
      console.warn('[TrackingDebugger] No current user for tracking test');
      return;
    }

    const startTime = Date.now();
    const beforeCount = usage[feature];
    
    console.log(`[TrackingDebugger] 🚀 Starting ${feature} tracking test...`);
    console.log(`[TrackingDebugger] 📊 Before: ${feature} = ${beforeCount}`);

    let success = false;
    let error: string | undefined;
    let afterCount = beforeCount;

    try {
      // Perform the tracking
      switch (feature) {
        case 'posts':
          success = await trackRealPostCreation(platform, { immediate: true, type: 'debug_test' });
          break;
        case 'discussions':
          success = await trackRealDiscussion(platform, { messageCount: 1, type: 'chat' });
          break;
        case 'aiReplies':
          success = await trackRealAIReply(platform, { type: 'dm', mode: 'instant' });
          break;
        case 'campaigns':
          success = await trackRealCampaign(platform, { action: 'goal_set' });
          break;
      }

      // Wait for state update
      await new Promise(resolve => setTimeout(resolve, 1000));
      await refreshUsage();
      
      // Get updated count
      await new Promise(resolve => setTimeout(resolve, 500));
      afterCount = usage[feature];

      console.log(`[TrackingDebugger] 📊 After: ${feature} = ${afterCount}`);
      
      if (success && afterCount === beforeCount + 1) {
        console.log(`[TrackingDebugger] ✅ Tracking test PASSED for ${feature}`);
      } else {
        console.log(`[TrackingDebugger] ❌ Tracking test FAILED for ${feature}`);
        error = `Expected count ${beforeCount + 1}, got ${afterCount}`;
        success = false;
      }

    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      success = false;
      console.error(`[TrackingDebugger] ❌ Error during ${feature} tracking test:`, err);
    }

    const duration = Date.now() - startTime;

    // Record the event
    recordTrackingEvent({
      feature,
      platform,
      action: `${feature}_debug_test`,
      beforeCount,
      afterCount,
      success,
      error,
      duration
    });

    return { success, beforeCount, afterCount, duration, error };
  }, [currentUser?.uid, usage, trackRealPostCreation, trackRealDiscussion, trackRealAIReply, trackRealCampaign, refreshUsage, recordTrackingEvent]);

  // Run comprehensive tracking tests
  const runComprehensiveTests = useCallback(async () => {
    if (!currentUser?.uid) return;

    console.log('[TrackingDebugger] 🚀 Starting comprehensive tracking tests...');
    
    const features: ('posts' | 'discussions' | 'aiReplies' | 'campaigns')[] = ['posts', 'discussions', 'aiReplies', 'campaigns'];
    const results = [];

    for (const feature of features) {
      console.log(`[TrackingDebugger] Testing ${feature}...`);
      const result = await testTrackingWithDebug(feature, 'comprehensive_test');
      results.push(result);
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('[TrackingDebugger] 🏁 Comprehensive tests completed:', results);
    return results;
  }, [currentUser?.uid, testTrackingWithDebug]);

  // Clear all tracking events
  const clearTrackingEvents = useCallback(() => {
    setTrackingEvents([]);
    console.log('[TrackingDebugger] All tracking events cleared');
  }, []);

  // Export tracking data
  const exportTrackingData = useCallback(() => {
    const data = {
      userId: currentUser?.uid,
      exportTime: new Date().toISOString(),
      events: trackingEvents,
      stats: debugStats,
      currentUsage: usage
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tracking-debug-${currentUser?.uid}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('[TrackingDebugger] Tracking data exported');
  }, [currentUser?.uid, trackingEvents, debugStats, usage]);

  // Toggle debugging mode
  const toggleDebugging = useCallback(() => {
    setIsDebugging(prev => !prev);
    console.log(`[TrackingDebugger] Debugging ${!isDebugging ? 'enabled' : 'disabled'}`);
  }, [isDebugging]);

  return {
    // State
    trackingEvents,
    debugStats,
    isDebugging,
    
    // Actions
    testTrackingWithDebug,
    runComprehensiveTests,
    clearTrackingEvents,
    exportTrackingData,
    toggleDebugging,
    
    // Utilities
    recordTrackingEvent
  };
};

export default useTrackingDebugger;
