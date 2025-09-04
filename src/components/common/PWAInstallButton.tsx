import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import './PWAInstallButton.css';

interface PWAInstallButtonProps {
  className?: string;
  forceShow?: boolean; // For testing purposes
}

const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ className = '', forceShow = false }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if PWA is already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    
    if (isStandalone || isIOSStandalone) {
      setIsInstalled(true);
      return;
    }

    // Always show button for PWA-capable browsers
    setShowInstallButton(true);

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('PWA: Browser install prompt available');
      e.preventDefault();
      setDeferredPrompt(e);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      console.log('PWA: App was installed successfully');
      setShowInstallButton(false);
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    try {
      // First try the deferred prompt from browser
      if (deferredPrompt) {
        console.log('PWA: Using browser install prompt');
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
          console.log('PWA: User accepted the install prompt');
          setShowInstallButton(false);
          setIsInstalled(true);
        } else {
          console.log('PWA: User dismissed the install prompt');
        }
        
        setDeferredPrompt(null);
        return;
      }

      // Fallback: Try global PWA installer
      if ((window as any).PWAInstaller) {
        try {
          console.log('PWA: Trying global PWA installer');
          const installer = (window as any).PWAInstaller;
          const globalPrompt = installer.getDeferredPrompt();
          
          if (globalPrompt) {
            const outcome = await installer.installPWA();
            if (outcome === 'accepted') {
              console.log('PWA: Installation successful via global installer');
              setShowInstallButton(false);
              setIsInstalled(true);
            }
            return;
          }
        } catch (globalError) {
          console.log('PWA: Global installer failed:', globalError);
        }
      }

      // Final fallback: Manual instructions
      console.log('PWA: No automatic install available, showing manual instructions');
      
      if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
        alert('To install this app on iOS:\n\n1. Tap the Share button (square with arrow up)\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add" to confirm');
      } else if (navigator.userAgent.includes('Android')) {
        alert('To install this app on Android:\n\n1. Tap the menu button (three dots)\n2. Select "Add to Home screen" or "Install app"\n3. Tap "Add" to confirm');
      } else {
        alert('To install this app:\n\n1. Look for the "Add to Home Screen" option in your browser menu\n2. Or use the browser\'s install button if available\n3. The app will be added to your home screen');
      }
    } catch (error) {
      console.error('PWA: Error during installation:', error);
      alert('Installation failed. Please try using your browser\'s menu to "Add to Home Screen".');
    }
  };

  // Don't show if already installed
  if (isInstalled) {
    return null;
  }

  // Show button if forced or if PWA is supported
  if (!showInstallButton && !forceShow) {
    return null;
  }

  return (
    <motion.button
      className={`pwa-install-button ${className}`}
      onClick={handleInstallClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.2 }}
      title="Install App"
    >
      <svg 
        width="100%" 
        height="100%" 
        viewBox="0 0 24 24" 
        fill="currentColor"
        className="pwa-install-icon"
      >
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
      </svg>
      <span className="pwa-install-text">Install</span>
    </motion.button>
  );
};

export default PWAInstallButton;
