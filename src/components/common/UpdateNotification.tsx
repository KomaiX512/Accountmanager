import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const UpdateNotification: React.FC = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    // Check for service worker updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SW_UPDATE_AVAILABLE') {
          setShowUpdate(true);
        }
      });

      // Check for updates on mount
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration) {
          registration.addEventListener('updatefound', () => {
            setShowUpdate(true);
          });
        }
      });
    }
  }, []);

  const handleUpdate = async () => {
    setIsUpdating(true);
    
    try {
      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }

      // Unregister and re-register service worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(registration => registration.unregister())
        );
      }

      // Reload the page
      window.location.reload();
    } catch (error) {
      console.error('Update failed:', error);
      setIsUpdating(false);
    }
  };

  const handleDismiss = () => {
    setShowUpdate(false);
  };

  if (!showUpdate) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        className="update-notification"
        style={{
          position: 'fixed',
          top: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10000,
          background: 'rgba(0, 255, 204, 0.95)',
          color: '#1a1a32',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0, 255, 204, 0.3)',
          border: '1px solid rgba(0, 255, 204, 0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '14px',
          fontWeight: '600',
          maxWidth: '400px',
          backdropFilter: 'blur(10px)'
        }}
      >
        <div style={{ fontSize: '16px' }}>🔄</div>
        <div style={{ flex: 1 }}>
          New version available! Click to update.
        </div>
        <button
          onClick={handleUpdate}
          disabled={isUpdating}
          style={{
            background: isUpdating ? '#ccc' : '#1a1a32',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: isUpdating ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          {isUpdating ? 'Updating...' : 'Update'}
        </button>
        <button
          onClick={handleDismiss}
          style={{
            background: 'transparent',
            color: '#1a1a32',
            border: 'none',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '0',
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ×
        </button>
      </motion.div>
    </AnimatePresence>
  );
};

export default UpdateNotification;
