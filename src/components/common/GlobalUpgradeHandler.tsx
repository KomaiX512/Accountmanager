import React, { useState, useEffect } from 'react';
import AccessControlPopup from './AccessControlPopup';

interface UpgradeEvent {
  feature: string;
  reason: string;
  currentUsage: number;
  limit: number;
}

const GlobalUpgradeHandler: React.FC = () => {
  const [showUpgradePopup, setShowUpgradePopup] = useState(false);
  const [upgradeData, setUpgradeData] = useState<UpgradeEvent | null>(null);

  useEffect(() => {
    const handleUpgradeEvent = (event: CustomEvent<UpgradeEvent>) => {
      console.log('[GlobalUpgradeHandler] 🚫 Showing upgrade popup:', event.detail);
      setUpgradeData(event.detail);
      setShowUpgradePopup(true);
    };

    // Listen for upgrade popup events from the tracking system
    window.addEventListener('showUpgradePopup', handleUpgradeEvent as EventListener);

    return () => {
      window.removeEventListener('showUpgradePopup', handleUpgradeEvent as EventListener);
    };
  }, []);

  const handleClose = () => {
    setShowUpgradePopup(false);
    setUpgradeData(null);
  };

  if (!upgradeData) return null;

  return (
    <AccessControlPopup
      isOpen={showUpgradePopup}
      onClose={handleClose}
      feature={upgradeData.feature}
      reason={upgradeData.reason}
      limitReached={true}
      upgradeRequired={upgradeData.feature === 'campaigns'}
      redirectToPricing={true}
      currentUsage={{
        used: upgradeData.currentUsage,
        limit: upgradeData.limit === -1 ? 'unlimited' : upgradeData.limit
      }}
    />
  );
};

export default GlobalUpgradeHandler; 