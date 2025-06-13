import { useAuth } from '../context/AuthContext';
import UserService from '../services/UserService';

export const useUsageTracking = () => {
  const { currentUser } = useAuth();

  const trackUsage = async (feature: 'posts' | 'discussions' | 'aiReplies' | 'campaigns') => {
    if (!currentUser?.uid) {
      console.warn('[UsageTracking] No current user, skipping usage tracking');
      return;
    }

    try {
      await UserService.incrementUsage(currentUser.uid, feature);
      console.log(`[UsageTracking] Successfully tracked ${feature} usage for user ${currentUser.uid}`);
    } catch (error) {
      console.error(`[UsageTracking] Error tracking ${feature} usage:`, error);
      // Don't throw error - usage tracking is not critical for app functionality
    }
  };

  const trackPostCreation = () => trackUsage('posts');
  const trackDiscussion = () => trackUsage('discussions');
  const trackAIReply = () => trackUsage('aiReplies');
  const trackCampaign = () => trackUsage('campaigns');

  return {
    trackPostCreation,
    trackDiscussion,
    trackAIReply,
    trackCampaign,
    trackUsage
  };
};

export default useUsageTracking; 