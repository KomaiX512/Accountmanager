import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import FB_EntryUsernames from '../components/facebook/FB_EntryUsernames';
import { useAuth } from '../context/AuthContext';
import { useAcquiredPlatforms } from '../context/AcquiredPlatformsContext';
import axios from 'axios';
import { AnimatePresence } from 'framer-motion';

const Facebook: React.FC = () => {
  const { currentUser } = useAuth();
  const { markPlatformAsAcquired } = useAcquiredPlatforms();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [hasChecked, setHasChecked] = useState(false);

  // Get platformId from navigation state (instead of markPlatformAccessed function)
  const platformId = location.state?.platformId;

  // ✅ CROSS-DEVICE SYNC FIX: Real-time localStorage monitoring for Facebook access
  useEffect(() => {
    if (!currentUser?.uid) {
      setIsLoading(false);
      return;
    }

    let intervalId: NodeJS.Timeout;
    let isChecking = false;

    // ✅ ENHANCED: Real-time cross-device sync check
    const checkFacebookStatusRealTime = async () => {
      if (isChecking) return; // Prevent concurrent checks
      isChecking = true;

      try {
        // ✅ CRITICAL FIX: Check localStorage first for immediate cross-device sync
        const hasAccessedInStorage = localStorage.getItem(`facebook_accessed_${currentUser.uid}`) === 'true';
        
        console.log(`[Facebook] 🔍 Real-time check: localStorage hasAccessed=${hasAccessedInStorage}`);
        
        if (hasAccessedInStorage) {
          // User has already accessed, try to get saved data from localStorage
          // ✅ CRITICAL FIX: Dashboard username should remain unchanged for routing
          const savedUsername = localStorage.getItem(`facebook_username_${currentUser.uid}`);
          const savedAccountType = localStorage.getItem(`facebook_account_type_${currentUser.uid}`) as 'branding' | 'non-branding' || 'branding';
          const savedCompetitors = JSON.parse(localStorage.getItem(`facebook_competitors_${currentUser.uid}`) || '[]');
          
          if (savedUsername) {
            console.log(`[Facebook] ✅ CROSS-DEVICE SYNC SUCCESS: Navigating to dashboard with saved data`, {
              username: savedUsername,
              accountType: savedAccountType,
              competitors: savedCompetitors
            });
            
            clearInterval(intervalId); // Stop checking once we navigate
            
            if (savedAccountType === 'branding') {
              navigate('/facebook-dashboard', { 
                state: { 
                  accountHolder: savedUsername, 
                  competitors: savedCompetitors,
                  accountType: 'branding',
                  platform: 'facebook'
                },
                replace: true 
              });
            } else {
              navigate('/facebook-non-branding-dashboard', { 
                state: { 
                  accountHolder: savedUsername,
                  competitors: savedCompetitors,
                  accountType: 'non-branding',
                  platform: 'facebook'
                },
                replace: true
              });
            }
            return;
          }
        }
        
        // ✅ BACKEND FALLBACK: If not in localStorage, check backend API
        if (!hasChecked) {
          try {
            console.log(`[Facebook] 🔍 Checking backend API for user ${currentUser.uid}`);
            const response = await axios.get(`/api/user-facebook-status/${currentUser.uid}`);
            
            if (response.data.hasEnteredFacebookUsername) {
              // User has already entered username, redirect to dashboard
              const savedUsername = response.data.facebook_username;
              const savedCompetitors = response.data.competitors || [];
              const savedAccountType = response.data.accountType || 'branding';
              
              // ✅ CRITICAL FIX: Immediately sync to localStorage for cross-device sync
              localStorage.setItem(`facebook_accessed_${currentUser.uid}`, 'true');
              // ✅ CRITICAL FIX: Keep dashboard username unchanged for routing
              localStorage.setItem(`facebook_username_${currentUser.uid}`, savedUsername);
              localStorage.setItem(`facebook_account_type_${currentUser.uid}`, savedAccountType);
              localStorage.setItem(`facebook_competitors_${currentUser.uid}`, JSON.stringify(savedCompetitors));
              
              console.log(`[Facebook] ✅ BACKEND SYNC: Data synced to localStorage for cross-device access`);
              
              clearInterval(intervalId); // Stop checking once we navigate
              
              if (savedAccountType === 'branding') {
                navigate('/facebook-dashboard', { 
                  state: { 
                    accountHolder: savedUsername, 
                    competitors: savedCompetitors,
                    accountType: 'branding',
                    platform: 'facebook'
                  },
                  replace: true 
                });
              } else {
                navigate('/facebook-non-branding-dashboard', { 
                  state: { 
                    accountHolder: savedUsername,
                    competitors: savedCompetitors,
                    accountType: 'non-branding',
                    platform: 'facebook'
                  },
                  replace: true
                });
              }
              return;
            } else {
              // No Facebook setup found, allow user to complete it
              setIsLoading(false);
              setHasChecked(true);
            }
          } catch (error) {
            console.error('Error checking Facebook status:', error);
            // If backend fails, just show the form
            setIsLoading(false);
            setHasChecked(true);
          }
        } else {
          // Already checked backend, just wait for localStorage updates
          setIsLoading(false);
        }
      } finally {
        isChecking = false;
      }
    };

    // ✅ STORAGE EVENT LISTENER: Listen for localStorage changes from other tabs/devices
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === `facebook_accessed_${currentUser.uid}` && event.newValue === 'true') {
        console.log(`[Facebook] 🚀 STORAGE EVENT: Facebook access detected from another tab/device!`);
        checkFacebookStatusRealTime();
      }
    };

    // ✅ IMMEDIATE CHECK: Check immediately on mount
    checkFacebookStatusRealTime();
    
    // ✅ REAL-TIME POLLING: Check every 2 seconds for cross-device sync
    // This ensures Device B and C pick up changes from Device A quickly
    intervalId = setInterval(checkFacebookStatusRealTime, 2000);

    // ✅ LISTEN FOR STORAGE EVENTS: Immediate response to localStorage changes
    window.addEventListener('storage', handleStorageChange);

    // Cleanup interval and storage listener on unmount
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [currentUser?.uid, navigate]); // Include navigate in dependencies

  const handleSubmitSuccess = (username: string, competitors: string[], accountType: 'branding' | 'non-branding') => {
    // ✅ Immediately mark Facebook as claimed on backend for global cross-device sync
    if (currentUser?.uid) {
      try {
        // Persist claimed status to user-status endpoint (source used by routes/guards)
        axios.post(`/api/user-facebook-status/${currentUser.uid}`, {
          facebook_username: username
        }).then(() => {
          // Mirror to localStorage for instant consistency on this device
          try {
            localStorage.setItem(`facebook_accessed_${currentUser.uid}`, 'true');
            // ✅ CRITICAL FIX: Keep dashboard username for routing, never overwrite with connected username
            localStorage.setItem(`facebook_username_${currentUser.uid}`, username);
            localStorage.setItem(`facebook_account_type_${currentUser.uid}`, accountType);
            localStorage.setItem(`facebook_competitors_${currentUser.uid}`, JSON.stringify(competitors || []));
          } catch {}
        }).catch(() => {});
      } catch {}
    }

    if (accountType === 'branding') {
      navigate('/facebook-dashboard', { 
        state: { 
          accountHolder: username, 
          competitors: competitors,
          accountType: 'branding',
          platform: 'facebook'
        },
        replace: true
      });
    } else {
      navigate('/facebook-non-branding-dashboard', { 
        state: { 
          accountHolder: username,
          competitors: competitors,
          accountType: 'non-branding',
          platform: 'facebook'
        },
        replace: true
      });
    }
  };

  if (isLoading) {
    // ✅ NO BLOCKING LOADING SCREEN - Show content immediately while checking status in background
    // This prevents the frustrating loading screen during navigation and enables cross-device sync
    return (
      <div className="facebook-page">
        <AnimatePresence mode="wait">
          <FB_EntryUsernames
            key="entry"
            onSubmitSuccess={handleSubmitSuccess}
            redirectIfCompleted={false}
            markPlatformAccessed={(id) => markPlatformAsAcquired(id)}
          />
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="facebook-page">
      <AnimatePresence mode="wait">
        <FB_EntryUsernames
          key="entry"
          onSubmitSuccess={handleSubmitSuccess}
          redirectIfCompleted={false}
          markPlatformAccessed={(id) => markPlatformAsAcquired(id)}
        />
      </AnimatePresence>
    </div>
  );
};

export default Facebook;
