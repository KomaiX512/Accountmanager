import { useState } from 'react';
import { useUsage } from '../context/UsageContext';

type FeatureType = 'posts' | 'discussions' | 'aiReplies' | 'campaigns';

export const useUpgradeHandler = () => {
  const { isFeatureBlocked, usage, getUserLimits } = useUsage();
  const [showUpgradePopup, setShowUpgradePopup] = useState(false);
  const [blockedFeature, setBlockedFeature] = useState<FeatureType | null>(null);

  const limits = getUserLimits();

  const checkFeatureAccess = (feature: FeatureType): { allowed: boolean; reason?: string } => {
    if (isFeatureBlocked(feature)) {
      return {
        allowed: false,
        reason: `You've reached your ${feature} limit. Upgrade to continue using this feature.`
      };
    }
    return { allowed: true };
  };

  const handleFeatureAttempt = (feature: FeatureType): boolean => {
    const access = checkFeatureAccess(feature);
    if (!access.allowed) {
      setBlockedFeature(feature);
      setShowUpgradePopup(true);
      return false;
    }
    return true;
  };

  const closeUpgradePopup = () => {
    setShowUpgradePopup(false);
    setBlockedFeature(null);
  };

  return {
    showUpgradePopup,
    blockedFeature,
    handleFeatureAttempt,
    closeUpgradePopup,
    checkFeatureAccess,
    isFeatureBlocked,
    currentUsage: blockedFeature ? {
      used: usage[blockedFeature],
      limit: limits[blockedFeature] === -1 ? 'unlimited' as const : limits[blockedFeature]
    } : { used: 0, limit: 0 }
  };
};

export default useUpgradeHandler; 