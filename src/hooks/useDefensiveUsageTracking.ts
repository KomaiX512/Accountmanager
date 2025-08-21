import { useCallback } from 'react';
import { useUsage } from '../context/UsageContext';

/**
 * Defensive usage tracking hook that never throws errors or affects functionality
 * Use this hook to track usage without risking breaking existing features
 */
export const useDefensiveUsageTracking = () => {
  const { 
    trackFeatureUsage, 
    currentPlatform, 
    currentUsername 
  } = useUsage();

  // Defensive increment - DISABLED to prevent automatic counting
  const safeIncrementUsage = useCallback(async (
    feature: 'posts' | 'discussions' | 'aiReplies' | 'campaigns' | 'views' | 'resets',
    count: number = 1
  ) => {
    console.log(`[DefensiveUsageTracking] ❌ DISABLED: ${feature} increment blocked - only counts on image generation`);
    console.log(`[DefensiveUsageTracking] ℹ️ Requested increment: ${count} for ${currentPlatform}`);
    // ❌ REMOVED: await incrementUsage(feature, currentPlatform, count);
  }, [currentPlatform]);

  // Defensive feature tracking - never throws errors
  const safeTrackFeature = useCallback(async (
    feature: 'posts' | 'discussions' | 'aiReplies' | 'campaigns' | 'views' | 'resets',
    action: string,
    count: number = 1
  ) => {
    try {
      console.log(`[DefensiveUsageTracking] 🛡️ Safe track ${feature} -> ${action} (${count})`);
      await trackFeatureUsage(feature, currentPlatform || 'unknown', action, count);
    } catch (error) {
      console.warn(`[DefensiveUsageTracking] ⚠️ ${feature} tracking failed, but continuing:`, error);
      // Never throw - just log and continue
    }
  }, [trackFeatureUsage, currentPlatform]);

  // Track real post creation (for actual user actions)
  const trackRealPostCreation = useCallback(async (
    _platform: string,
    metadata: { scheduled?: boolean; immediate?: boolean; type?: string }
  ) => {
    try {
      console.log(`[DefensiveUsageTracking] ❌ DISABLED: Post tracking removed - only counts on image generation`);
      
      // ❌ REMOVED: Automatic post usage tracking
      // await safeIncrementUsage('posts');
      
      // Track additional metadata
      const action = metadata.scheduled ? 'scheduled_post' : 
                    metadata.immediate ? 'immediate_post' : 
                    'manual_post';
      const type = metadata.type || 'unknown';
      
      await safeTrackFeature('posts', `${action}_${type}`);
      
      console.log(`[DefensiveUsageTracking] ✅ Real post creation tracked successfully`);
      return true;
    } catch (error) {
      console.warn(`[DefensiveUsageTracking] ⚠️ Real post creation tracking failed:`, error);
      // Never throw - just log and continue
      return false;
    }
  }, [safeTrackFeature]);

  // Track real discussion creation
  const trackRealDiscussion = useCallback(async (
    platform: string,
    metadata: { messageCount?: number; type?: string }
  ) => {
    try {
      console.log(`[DefensiveUsageTracking] 💬 Tracking real discussion on ${platform}`, metadata);
      
      // Track the actual discussion creation
      await safeIncrementUsage('discussions');
      
      // Track additional metadata
      const type = metadata.type || 'unknown';
      const count = metadata.messageCount || 1;
      
      await safeTrackFeature('discussions', `${type}_discussion`, count);
      
      console.log(`[DefensiveUsageTracking] ✅ Real discussion tracked successfully`);
      return true;
    } catch (error) {
      console.warn(`[DefensiveUsageTracking] ⚠️ Real discussion tracking failed:`, error);
      // Never throw - just log and continue
      return false;
    }
  }, [safeIncrementUsage, safeTrackFeature]);

  // Track real AI reply
  const trackRealAIReply = useCallback(async (
    platform: string,
    metadata: { type?: string; mode?: string }
  ) => {
    try {
      console.log(`[DefensiveUsageTracking] 🤖 Tracking real AI reply on ${platform}`, metadata);
      
      // Track the actual AI reply
      await safeIncrementUsage('aiReplies');
      
      // Track additional metadata
      const type = metadata.type || 'unknown';
      const mode = metadata.mode || 'standard';
      
      await safeTrackFeature('aiReplies', `${mode}_${type}`);
      
      console.log(`[DefensiveUsageTracking] ✅ Real AI reply tracked successfully`);
      return true;
    } catch (error) {
      console.warn(`[DefensiveUsageTracking] ⚠️ Real AI reply tracking failed:`, error);
      // Never throw - just log and continue
      return false;
    }
  }, [safeIncrementUsage, safeTrackFeature]);

  // Track real campaign
  const trackRealCampaign = useCallback(async (
    platform: string,
    metadata: { action?: string }
  ) => {
    try {
      console.log(`[DefensiveUsageTracking] 🎯 Tracking real campaign on ${platform}`, metadata);
      
      // Track the actual campaign
      await safeIncrementUsage('campaigns');
      
      // Track additional metadata
      const action = metadata.action || 'unknown_action';
      
      await safeTrackFeature('campaigns', action);
      
      console.log(`[DefensiveUsageTracking] ✅ Real campaign tracked successfully`);
      return true;
    } catch (error) {
      console.warn(`[DefensiveUsageTracking] ⚠️ Real campaign tracking failed:`, error);
      // Never throw - just log and continue
      return false;
    }
  }, [safeIncrementUsage, safeTrackFeature]);

  // Check if platform and username are available
  const isTrackingAvailable = !!(currentPlatform && currentUsername);

  return {
    // Core tracking functions
    safeIncrementUsage,
    safeTrackFeature,
    
    // Convenience tracking functions
    trackRealPostCreation,
    trackRealDiscussion,
    trackRealAIReply,
    trackRealCampaign,
    
    // State
    isTrackingAvailable,
    currentPlatform,
    currentUsername
  };
};

export default useDefensiveUsageTracking;
