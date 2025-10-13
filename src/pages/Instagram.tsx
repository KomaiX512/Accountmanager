import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import IG_EntryUsernames from '../components/instagram/IG_EntryUsernames';
import { useAuth } from '../context/AuthContext';
import { useAcquiredPlatforms } from '../context/AcquiredPlatformsContext';
import axios from 'axios';
import { AnimatePresence } from 'framer-motion';
import { safeNavigate } from '../utils/navigationGuard';
import PlatformSEO from '../components/seo/PlatformSEO';

const Instagram: React.FC = () => {
  const { currentUser } = useAuth();
  const { markPlatformAsAcquired } = useAcquiredPlatforms();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    // Prevent multiple API calls
    if (!currentUser?.uid) {
      setIsLoading(false);
      return;
    }

    // Reset sentinel gating to avoid flicker after reset
    try {
      const sentinelKey = `instagram_reset_pending_${currentUser.uid}`;
      const tsRaw = localStorage.getItem(sentinelKey);
      if (tsRaw) {
        const tsNum = parseInt(tsRaw, 10);
        if (Number.isFinite(tsNum) && Date.now() - tsNum < 20000) {
          setIsLoading(false);
          setHasChecked(true);
          return;
        } else {
          localStorage.removeItem(sentinelKey);
        }
      }
    } catch {}

    if (hasChecked) {
      setIsLoading(false);
      return;
    }

    // Check if user has already completed Instagram setup
    const checkInstagramStatus = async () => {
      // First check localStorage as primary source of truth
      const hasAccessed = localStorage.getItem(`instagram_accessed_${currentUser.uid}`) === 'true';
      
      if (hasAccessed) {
        // User has already accessed, try to get saved data from localStorage
        const savedUsername = localStorage.getItem(`instagram_username_${currentUser.uid}`);
        const savedAccountType = localStorage.getItem(`instagram_account_type_${currentUser.uid}`) as 'branding' | 'non-branding' || 'branding';
        const savedCompetitors = JSON.parse(localStorage.getItem(`instagram_competitors_${currentUser.uid}`) || '[]');
        
        if (savedUsername) {
          try {
            if (savedAccountType === 'branding') {
              window.location.assign('/dashboard');
            } else {
              window.location.assign('/non-branding-dashboard');
            }
          } catch {
            if (savedAccountType === 'branding') {
              safeNavigate(navigate, '/dashboard', { 
                state: { 
                  accountHolder: savedUsername, 
                  competitors: savedCompetitors,
                  accountType: 'branding'
                },
                replace: true 
              }, 5);
            } else {
              safeNavigate(navigate, '/non-branding-dashboard', { 
                state: { 
                  accountHolder: savedUsername,
                  competitors: savedCompetitors,
                  accountType: 'non-branding' 
                },
                replace: true
              }, 5);
            }
          }
          return;
        }
      }
      
      // If not in localStorage, try backend API as fallback
      try {
        const response = await axios.get(`/api/user-instagram-status/${currentUser.uid}`);
        
        if (response.data.hasEnteredInstagramUsername) {
          // User has already entered username, redirect to dashboard
          const savedUsername = response.data.instagram_username;
          const savedCompetitors = response.data.competitors || [];
          const savedAccountType = response.data.accountType || 'branding';
          
          // Save to localStorage for future use
          localStorage.setItem(`instagram_accessed_${currentUser.uid}`, 'true');
          localStorage.setItem(`instagram_username_${currentUser.uid}`, savedUsername);
          localStorage.setItem(`instagram_account_type_${currentUser.uid}`, savedAccountType);
          localStorage.setItem(`instagram_competitors_${currentUser.uid}`, JSON.stringify(savedCompetitors));
          
          if (savedAccountType === 'branding') {
            safeNavigate(navigate, '/dashboard', { 
              state: { 
                accountHolder: savedUsername, 
                competitors: savedCompetitors,
                accountType: 'branding'
              },
              replace: true 
            }, 5);
          } else {
            safeNavigate(navigate, '/non-branding-dashboard', { 
              state: { 
                accountHolder: savedUsername,
                competitors: savedCompetitors,
                accountType: 'non-branding' 
              },
              replace: true
            }, 5);
          }
        } else {
          // No Instagram setup found, allow user to complete it
          setIsLoading(false);
        }
        setHasChecked(true);
      } catch (error) {
        console.error('Error checking Instagram status:', error);
        // If backend fails, just show the form
        setIsLoading(false);
        setHasChecked(true);
      }
    };

    checkInstagramStatus();
  }, [currentUser?.uid, hasChecked]); // Removed navigate from dependencies

  const handleSubmitSuccess = (username: string, competitors: string[], accountType: 'branding' | 'non-branding') => {
    try {
      if (accountType === 'branding') {
        window.location.assign('/dashboard');
      } else {
        window.location.assign('/non-branding-dashboard');
      }
    } catch {
      if (accountType === 'branding') {
        navigate('/dashboard', { 
          state: { 
            accountHolder: username, 
            competitors: competitors,
            accountType: 'branding'
          },
          replace: true
        });
      } else {
        navigate('/non-branding-dashboard', { 
          state: { 
            accountHolder: username,
            competitors: competitors,
            accountType: 'non-branding'
          },
          replace: true
        });
      }
    }
  };

  if (isLoading) {
    // ✅ NO BLOCKING LOADING SCREEN - Show content immediately while checking status in background
    // This prevents the frustrating loading screen during navigation
    return (
      <div className="instagram-page">
        <AnimatePresence mode="wait">
          <IG_EntryUsernames
            key="entry"
            onSubmitSuccess={handleSubmitSuccess}
            redirectIfCompleted={false}
            markPlatformAccessed={(id) => markPlatformAsAcquired(id)}
            onComplete={() => {}}
          />
        </AnimatePresence>
      </div>
    );
  }

  return (
    <>
      <PlatformSEO platform="instagram" />
      <div className="instagram-page">
        <AnimatePresence mode="wait">
          <IG_EntryUsernames
            key="entry"
            onSubmitSuccess={handleSubmitSuccess}
            redirectIfCompleted={false}
            markPlatformAccessed={(id) => markPlatformAsAcquired(id)}
            onComplete={() => {}}
          />
        </AnimatePresence>
      </div>
    </>
  );
};

export default Instagram;