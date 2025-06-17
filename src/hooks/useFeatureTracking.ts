import { useCallback } from 'react';
import { useUsage } from '../context/UsageContext';

type FeatureType = 'posts' | 'discussions' | 'aiReplies' | 'campaigns';

interface UseFeatureTrackingReturn {
  // Core tracking functions for actual feature usage
  trackPost: (platform: string, action?: string) => Promise<void>;
  trackDiscussion: (platform: string, action?: string) => Promise<void>;
  trackAIReply: (platform: string, action?: string) => Promise<void>;
  trackCampaign: (platform: string, action?: string) => Promise<void>;
  
  // Access control functions
  isFeatureBlocked: (feature: FeatureType) => boolean;
  getUsageCount: (feature: FeatureType) => number;
  getUserLimits: () => { posts: number; discussions: number; aiReplies: number; campaigns: number };
  
  // Real-time tracking integration helpers
  trackRealPostCreation: (platform: string, postData: { scheduled?: boolean; immediate?: boolean; type?: string }) => Promise<boolean>;
  trackRealDiscussion: (platform: string, discussionData: { messageCount?: number; type?: 'chat' | 'dm_reply' | 'comment_reply' }) => Promise<boolean>;
  trackRealAIReply: (platform: string, replyData: { type?: 'dm' | 'comment' | 'auto'; mode?: 'instant' | 'scheduled' | 'auto' }) => Promise<boolean>;
  trackRealCampaign: (platform: string, campaignData: { action?: 'goal_set' | 'campaign_started' | 'campaign_stopped' }) => Promise<boolean>;
  
  // Pre-action checking
  canUseFeature: (feature: FeatureType) => { allowed: boolean; reason?: string };
}

const useFeatureTracking = (): UseFeatureTrackingReturn => {
  const { trackFeatureUsage, isFeatureBlocked, getUsageForFeature, getUserLimits } = useUsage();

  // Core tracking functions (legacy support)
  const trackPost = useCallback(async (platform: string, action: string = 'post_created') => {
    try {
      await trackFeatureUsage('posts', platform, action);
      console.log(`[FeatureTracking] ✅ Post tracked: ${platform} -> ${action}`);
    } catch (error) {
      console.error(`[FeatureTracking] ❌ Post tracking failed:`, error);
    }
  }, [trackFeatureUsage]);

  const trackDiscussion = useCallback(async (platform: string, action: string = 'discussion_engaged') => {
    try {
      await trackFeatureUsage('discussions', platform, action);
      console.log(`[FeatureTracking] ✅ Discussion tracked: ${platform} -> ${action}`);
    } catch (error) {
      console.error(`[FeatureTracking] ❌ Discussion tracking failed:`, error);
    }
  }, [trackFeatureUsage]);

  const trackAIReply = useCallback(async (platform: string, action: string = 'ai_reply_sent') => {
    try {
      await trackFeatureUsage('aiReplies', platform, action);
      console.log(`[FeatureTracking] ✅ AI Reply tracked: ${platform} -> ${action}`);
    } catch (error) {
      console.error(`[FeatureTracking] ❌ AI Reply tracking failed:`, error);
    }
  }, [trackFeatureUsage]);

  const trackCampaign = useCallback(async (platform: string, action: string = 'campaign_created') => {
    try {
      await trackFeatureUsage('campaigns', platform, action);
      console.log(`[FeatureTracking] ✅ Campaign tracked: ${platform} -> ${action}`);
    } catch (error) {
      console.error(`[FeatureTracking] ❌ Campaign tracking failed:`, error);
    }
  }, [trackFeatureUsage]);

  const getUsageCount = useCallback((feature: FeatureType) => {
    return getUsageForFeature(feature);
  }, [getUsageForFeature]);

  // ✅ CRITICAL FIX: Pre-action checking with immediate upgrade popup
  const canUseFeature = useCallback((feature: FeatureType): { allowed: boolean; reason?: string } => {
    if (isFeatureBlocked(feature)) {
      const limits = getUserLimits();
      const currentUsage = getUsageForFeature(feature);
      
      console.warn(`[FeatureTracking] 🚫 Feature ${feature} blocked: ${currentUsage}/${limits[feature]}`);
      
      return {
        allowed: false,
        reason: feature === 'campaigns' 
          ? 'This is a premium feature. Please upgrade to access campaigns.'
          : `You have reached your ${feature} limit (${currentUsage}/${limits[feature]}). Please upgrade to continue.`
      };
    }
    
    return { allowed: true };
  }, [isFeatureBlocked, getUserLimits, getUsageForFeature]);

  // ✅ REAL-TIME TRACKING: These functions check limits BEFORE executing actions
  const trackRealPostCreation = useCallback(async (
    platform: string, 
    postData: { scheduled?: boolean; immediate?: boolean; type?: string }
  ): Promise<boolean> => {
    try {
      // ✅ PRE-ACTION CHECK: Always check before performing action
      const accessCheck = canUseFeature('posts');
      if (!accessCheck.allowed) {
        console.warn(`[FeatureTracking] 🚫 Post creation blocked for ${platform} - ${accessCheck.reason}`);
        
        // Trigger upgrade popup via custom event
        window.dispatchEvent(new CustomEvent('showUpgradePopup', {
          detail: {
            feature: 'posts',
            reason: accessCheck.reason,
            currentUsage: getUsageForFeature('posts'),
            limit: getUserLimits().posts
          }
        }));
        
        return false;
      }
      
      const action = postData.scheduled ? 'post_scheduled' : 
                     postData.immediate ? 'post_instant' : 'post_created';
      
      await trackFeatureUsage('posts', platform, action);
      console.log(`[FeatureTracking] ✅ Real post tracked: ${platform} -> ${action} (${postData.type || 'standard'})`);
      return true;
    } catch (error) {
      console.error(`[FeatureTracking] ❌ Real post tracking failed:`, error);
      return false;
    }
  }, [trackFeatureUsage, canUseFeature, getUsageForFeature, getUserLimits]);

  const trackRealDiscussion = useCallback(async (
    platform: string, 
    discussionData: { messageCount?: number; type?: 'chat' | 'dm_reply' | 'comment_reply' }
  ): Promise<boolean> => {
    try {
      // ✅ PRE-ACTION CHECK: Always check before performing action
      const accessCheck = canUseFeature('discussions');
      if (!accessCheck.allowed) {
        console.warn(`[FeatureTracking] 🚫 Discussion blocked for ${platform} - ${accessCheck.reason}`);
        
        // Trigger upgrade popup via custom event
        window.dispatchEvent(new CustomEvent('showUpgradePopup', {
          detail: {
            feature: 'discussions',
            reason: accessCheck.reason,
            currentUsage: getUsageForFeature('discussions'),
            limit: getUserLimits().discussions
          }
        }));
        
        return false;
      }
      
      const action = discussionData.type ? `discussion_${discussionData.type}` : 'discussion_engaged';
      const messageInfo = discussionData.messageCount ? ` (${discussionData.messageCount} messages)` : '';
      
      await trackFeatureUsage('discussions', platform, action);
      console.log(`[FeatureTracking] ✅ Real discussion tracked: ${platform} -> ${action}${messageInfo}`);
      return true;
    } catch (error) {
      console.error(`[FeatureTracking] ❌ Real discussion tracking failed:`, error);
      return false;
    }
  }, [trackFeatureUsage, canUseFeature, getUsageForFeature, getUserLimits]);

  const trackRealAIReply = useCallback(async (
    platform: string, 
    replyData: { type?: 'dm' | 'comment' | 'auto'; mode?: 'instant' | 'scheduled' | 'auto' }
  ): Promise<boolean> => {
    try {
      // ✅ PRE-ACTION CHECK: Always check before performing action
      const accessCheck = canUseFeature('aiReplies');
      if (!accessCheck.allowed) {
        console.warn(`[FeatureTracking] 🚫 AI Reply blocked for ${platform} - ${accessCheck.reason}`);
        
        // Trigger upgrade popup via custom event
        window.dispatchEvent(new CustomEvent('showUpgradePopup', {
          detail: {
            feature: 'aiReplies',
            reason: accessCheck.reason,
            currentUsage: getUsageForFeature('aiReplies'),
            limit: getUserLimits().aiReplies
          }
        }));
        
        return false;
      }
      
      const action = `ai_reply_${replyData.type || 'sent'}_${replyData.mode || 'instant'}`;
      
      await trackFeatureUsage('aiReplies', platform, action);
      console.log(`[FeatureTracking] ✅ Real AI reply tracked: ${platform} -> ${action}`);
      return true;
    } catch (error) {
      console.error(`[FeatureTracking] ❌ Real AI reply tracking failed:`, error);
      return false;
    }
  }, [trackFeatureUsage, canUseFeature, getUsageForFeature, getUserLimits]);

  const trackRealCampaign = useCallback(async (
    platform: string, 
    campaignData: { action?: 'goal_set' | 'campaign_started' | 'campaign_stopped' }
  ): Promise<boolean> => {
    try {
      // ✅ PRE-ACTION CHECK: Always check before performing action
      const accessCheck = canUseFeature('campaigns');
      if (!accessCheck.allowed) {
        console.warn(`[FeatureTracking] 🚫 Campaign blocked for ${platform} - ${accessCheck.reason}`);
        
        // Trigger upgrade popup via custom event
        window.dispatchEvent(new CustomEvent('showUpgradePopup', {
          detail: {
            feature: 'campaigns',
            reason: accessCheck.reason,
            currentUsage: getUsageForFeature('campaigns'),
            limit: getUserLimits().campaigns
          }
        }));
        
        return false;
      }
      
      const action = campaignData.action || 'campaign_activity';
      
      await trackFeatureUsage('campaigns', platform, action);
      console.log(`[FeatureTracking] ✅ Real campaign tracked: ${platform} -> ${action}`);
      return true;
    } catch (error) {
      console.error(`[FeatureTracking] ❌ Real campaign tracking failed:`, error);
      return false;
    }
  }, [trackFeatureUsage, canUseFeature, getUsageForFeature, getUserLimits]);

  return {
    // Legacy functions
    trackPost,
    trackDiscussion,
    trackAIReply,
    trackCampaign,
    isFeatureBlocked,
    getUsageCount,
    getUserLimits,
    
    // Real-time tracking functions
    trackRealPostCreation,
    trackRealDiscussion,
    trackRealAIReply,
    trackRealCampaign,
    
    // Pre-action checking
    canUseFeature
  };
};

export default useFeatureTracking; 