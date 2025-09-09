import React, { createContext, useContext, ReactNode } from 'react';

type Platform = 'instagram' | 'twitter' | 'facebook' | 'linkedin';

interface PlatformContextType {
  platform: Platform;
  accountHolder: string;
}

const PlatformContext = createContext<PlatformContextType | null>(null);

interface PlatformProviderProps {
  platform: Platform;
  accountHolder: string;
  children: ReactNode;
}

export const PlatformProvider: React.FC<PlatformProviderProps> = ({ 
  platform, 
  accountHolder, 
  children 
}) => {
  return (
    <PlatformContext.Provider value={{ platform, accountHolder }}>
      {children}
    </PlatformContext.Provider>
  );
};

export const usePlatformContext = () => {
  const context = useContext(PlatformContext);
  if (!context) {
    throw new Error('usePlatformContext must be used within a PlatformProvider');
  }
  return context;
};

// Hook to validate if a request is for the current platform
export const useValidatePlatformRequest = (requestPlatform?: string) => {
  const { platform } = usePlatformContext();
  
  if (requestPlatform && requestPlatform !== platform) {
    console.error(`[Platform Validation] Cross-platform request detected! Current: ${platform}, Request: ${requestPlatform}`);
    return false;
  }
  
  return true;
};
