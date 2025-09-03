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
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if PWA is supported
    const checkPWASupport = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isIOSStandalone = (window.navigator as any).standalone === true;
      const hasServiceWorker = 'serviceWorker' in navigator;
      const hasManifest = document.querySelector('link[rel="manifest"]') !== null;
      
      console.log('PWA Support Check:', {
        isStandalone,
        isIOSStandalone,
        hasServiceWorker,
        hasManifest,
        protocol: window.location.protocol
      });

      if (isStandalone || isIOSStandalone) {
        setIsInstalled(true);
        return;
      }

      // Show button if PWA is supported (even without beforeinstallprompt)
      if (hasServiceWorker && hasManifest && window.location.protocol === 'https:') {
        setIsSupported(true);
        setShowInstallButton(true);
      } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        // Show for development/testing
        setIsSupported(true);
        setShowInstallButton(true);
      }
    };

    // Initial check
    checkPWASupport();

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('PWA: Install prompt available');
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };

    // Listen for custom events from PWA registration script
    const handlePWAInstallPrompt = (e: CustomEvent) => {
      console.log('PWA: Custom install prompt event received');
      setDeferredPrompt(e.detail.deferredPrompt);
      setShowInstallButton(true);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      console.log('PWA: App was installed successfully');
      setShowInstallButton(false);
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    // Listen for custom installed event
    const handlePWAInstalled = () => {
      console.log('PWA: Custom installed event received');
      setShowInstallButton(false);
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-install-prompt', handlePWAInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-installed', handlePWAInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-install-prompt', handlePWAInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-installed', handlePWAInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    try {
      // Try to use the global PWA installer first
      if ((window as any).PWAInstaller) {
        const installer = (window as any).PWAInstaller;
        const globalPrompt = installer.getDeferredPrompt();
        
        if (globalPrompt) {
          console.log('PWA: Using global installer for direct installation');
          const outcome = await installer.installPWA();
          if (outcome === 'accepted') {
            console.log('PWA: Installation successful');
            setShowInstallButton(false);
            setIsInstalled(true);
          }
          return;
        }
      }
      
      // Fallback to local deferred prompt
      if (deferredPrompt) {
        console.log('PWA: Using local deferred prompt for direct installation');
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
      } else {
        // No install prompt available - show platform-specific instructions
        console.log('PWA: No install prompt available, showing instructions');
        
        if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
          alert('To install this app on iOS:\n\n1. Tap the Share button (square with arrow up)\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add" to confirm');
        } else if (navigator.userAgent.includes('Android')) {
          alert('To install this app on Android:\n\n1. Tap the menu button (three dots)\n2. Select "Add to Home screen" or "Install app"\n3. Tap "Add" to confirm');
        } else {
          alert('To install this app:\n\n1. Look for the "Add to Home Screen" option in your browser menu\n2. Or use the browser\'s install button if available\n3. The app will be added to your home screen');
        }
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

  // Always show button for testing (remove this condition to make it conditional)
  // if (!showInstallButton && !isSupported && !forceShow) {
  //   return null;
  // }

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
