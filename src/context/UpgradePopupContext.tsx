import React, { createContext, useContext, useState, useCallback } from 'react';
import UpgradePopup from '../components/common/UpgradePopup';
import { useUsage } from './UsageContext';
import { useAuth } from './AuthContext';

interface UpgradePopupState {
  isOpen: boolean;
  feature: string;
  currentUsage: number;
  limit: number;
  userType: string;
}

interface UpgradePopupContextType {
  showUpgradePopup: (feature: string, currentUsage: number, limit: number) => void;
  hideUpgradePopup: () => void;
  isUpgradePopupOpen: boolean;
}

const UpgradePopupContext = createContext<UpgradePopupContextType | undefined>(undefined);

export const useUpgradePopup = () => {
  const context = useContext(UpgradePopupContext);
  if (!context) {
    throw new Error('useUpgradePopup must be used within an UpgradePopupProvider');
  }
  return context;
};

interface UpgradePopupProviderProps {
  children: React.ReactNode;
}

export const UpgradePopupProvider: React.FC<UpgradePopupProviderProps> = ({ children }) => {
  const { currentUser } = useAuth();
  const [popupState, setPopupState] = useState<UpgradePopupState>({
    isOpen: false,
    feature: '',
    currentUsage: 0,
    limit: 0,
    userType: 'freemium'
  });

  const showUpgradePopup = useCallback((feature: string, currentUsage: number, limit: number) => {
    // Get user type from localStorage or default to freemium
    const userType = currentUser?.uid ? 
      localStorage.getItem(`userType_${currentUser.uid}`) || 'freemium' : 
      'freemium';

    console.log(`[UpgradePopup] 🚫 Showing upgrade popup for ${feature}: ${currentUsage}/${limit}`);
    
    setPopupState({
      isOpen: true,
      feature,
      currentUsage,
      limit,
      userType
    });
  }, [currentUser?.uid]);

  const hideUpgradePopup = useCallback(() => {
    console.log(`[UpgradePopup] ✖️ Hiding upgrade popup`);
    setPopupState(prev => ({
      ...prev,
      isOpen: false
    }));
  }, []);

  const value: UpgradePopupContextType = {
    showUpgradePopup,
    hideUpgradePopup,
    isUpgradePopupOpen: popupState.isOpen
  };

  return (
    <UpgradePopupContext.Provider value={value}>
      {children}
      <UpgradePopup
        isOpen={popupState.isOpen}
        onClose={hideUpgradePopup}
        feature={popupState.feature}
        currentUsage={popupState.currentUsage}
        limit={popupState.limit}
        userType={popupState.userType}
      />
    </UpgradePopupContext.Provider>
  );
}; 