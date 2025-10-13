import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TW_EntryUsernames from '../components/twitter/TW_EntryUsernames';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { AnimatePresence } from 'framer-motion';
import PlatformSEO from '../components/seo/PlatformSEO';

const Twitter: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [hasChecked, setHasChecked] = useState(false);

  // Get platformId from navigation state (unused)

  // Create a markPlatformAccessed function that uses localStorage
  const markPlatformAccessed = (platformId: string) => {
    if (currentUser?.uid) {
      localStorage.setItem(`${platformId}_accessed_${currentUser.uid}`, 'true');
    }
  };

  useEffect(() => {
    // Prevent multiple API calls
    if (!currentUser?.uid) {
      setIsLoading(false);
      return;
    }

    // Reset sentinel gating to avoid flicker after reset
    try {
      const sentinelKey = `twitter_reset_pending_${currentUser.uid}`;
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

    // Check if user has already completed Twitter setup
    const checkTwitterStatus = async () => {
      // First check localStorage as primary source of truth
      const hasAccessed = localStorage.getItem(`twitter_accessed_${currentUser.uid}`) === 'true';
      
      if (hasAccessed) {
        // User has already accessed, try to get saved data from localStorage
        const savedUsername = localStorage.getItem(`twitter_username_${currentUser.uid}`);
        const savedAccountType = localStorage.getItem(`twitter_account_type_${currentUser.uid}`) as 'branding' | 'non-branding' || 'branding';
        const savedCompetitors = JSON.parse(localStorage.getItem(`twitter_competitors_${currentUser.uid}`) || '[]');
        
        if (savedUsername) {
          try {
            if (savedAccountType === 'branding') {
              window.location.assign('/twitter-dashboard');
            } else {
              window.location.assign('/twitter-non-branding-dashboard');
            }
          } catch {
            if (savedAccountType === 'branding') {
              navigate('/twitter-dashboard', { 
                state: { 
                  accountHolder: savedUsername, 
                  competitors: savedCompetitors,
                  accountType: 'branding',
                  platform: 'twitter'
                },
                replace: true 
              });
            } else {
              navigate('/twitter-non-branding-dashboard', { 
                state: { 
                  accountHolder: savedUsername,
                  competitors: savedCompetitors,
                  accountType: 'non-branding',
                  platform: 'twitter'
                },
                replace: true
              });
            }
          }
          return;
        }
      }
      
      // If not in localStorage, try backend API as fallback
      try {
        const response = await axios.get(`/api/user-twitter-status/${currentUser.uid}`);
        
        if (response.data.hasEnteredTwitterUsername) {
          // User has already entered username, redirect to dashboard
          const savedUsername = response.data.twitter_username;
          const savedCompetitors = response.data.competitors || [];
          const savedAccountType = response.data.accountType || 'branding';
          
          // Save to localStorage for future use
          localStorage.setItem(`twitter_accessed_${currentUser.uid}`, 'true');
          localStorage.setItem(`twitter_username_${currentUser.uid}`, savedUsername);
          localStorage.setItem(`twitter_account_type_${currentUser.uid}`, savedAccountType);
          localStorage.setItem(`twitter_competitors_${currentUser.uid}`, JSON.stringify(savedCompetitors));
          
          if (savedAccountType === 'branding') {
            navigate('/twitter-dashboard', { 
              state: { 
                accountHolder: savedUsername, 
                competitors: savedCompetitors,
                accountType: 'branding',
                platform: 'twitter'
              },
              replace: true 
            });
          } else {
            navigate('/twitter-non-branding-dashboard', { 
              state: { 
                accountHolder: savedUsername,
                competitors: savedCompetitors,
                accountType: 'non-branding',
                platform: 'twitter'
              },
              replace: true
            });
          }
        } else {
          // No Twitter setup found, allow user to complete it
          setIsLoading(false);
        }
        setHasChecked(true);
      } catch (error) {
        console.error('Error checking Twitter status:', error);
        // If backend fails, just show the form
        setIsLoading(false);
        setHasChecked(true);
      }
    };

    checkTwitterStatus();
  }, [currentUser?.uid, hasChecked]); // Removed navigate from dependencies

  const handleSubmitSuccess = (username: string, competitors: string[], accountType: 'branding' | 'non-branding') => {
    try {
      if (accountType === 'branding') {
        window.location.assign('/twitter-dashboard');
      } else {
        window.location.assign('/twitter-non-branding-dashboard');
      }
    } catch {
      if (accountType === 'branding') {
        navigate('/twitter-dashboard', { 
          state: { 
            accountHolder: username, 
            competitors: competitors,
            accountType: 'branding',
            platform: 'twitter'
          },
          replace: true
        });
      } else {
        navigate('/twitter-non-branding-dashboard', { 
          state: { 
            accountHolder: username,
            competitors: competitors,
            accountType: 'non-branding',
            platform: 'twitter'
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
      <div className="twitter-page">
        <AnimatePresence mode="wait">
          <TW_EntryUsernames
            key="entry"
            onSubmitSuccess={handleSubmitSuccess}
            redirectIfCompleted={false}
            markPlatformAccessed={markPlatformAccessed}
          />
        </AnimatePresence>
      </div>
    );
  }

  return (
    <>
      <PlatformSEO platform="twitter" />
      <div className="twitter-page">
        <AnimatePresence mode="wait">
          <TW_EntryUsernames
            key="entry"
            onSubmitSuccess={handleSubmitSuccess}
            redirectIfCompleted={false}
            markPlatformAccessed={markPlatformAccessed}
          />
        </AnimatePresence>
      </div>
    </>
  );
};

export default Twitter;
