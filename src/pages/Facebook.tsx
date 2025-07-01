import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import FB_EntryUsernames from '../components/facebook/FB_EntryUsernames';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';

const Facebook: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [hasChecked, setHasChecked] = useState(false);

  // Get platformId from navigation state (instead of markPlatformAccessed function)
  const platformId = location.state?.platformId;

  // Create a markPlatformAccessed function that uses localStorage
  const markPlatformAccessed = (platformId: string) => {
    if (currentUser?.uid) {
      localStorage.setItem(`${platformId}_accessed_${currentUser.uid}`, 'true');
    }
  };

  useEffect(() => {
    // Prevent multiple API calls
    if (hasChecked || !currentUser?.uid) {
      setIsLoading(false);
      return;
    }

    // Check if user has already completed Facebook setup
    const checkFacebookStatus = async () => {
      // First check localStorage as primary source of truth
      const hasAccessed = localStorage.getItem(`facebook_accessed_${currentUser.uid}`) === 'true';
      
      if (hasAccessed) {
        // User has already accessed, try to get saved data from localStorage
        const savedUsername = localStorage.getItem(`facebook_username_${currentUser.uid}`);
        const savedAccountType = localStorage.getItem(`facebook_account_type_${currentUser.uid}`) as 'branding' | 'non-branding' || 'branding';
        const savedCompetitors = JSON.parse(localStorage.getItem(`facebook_competitors_${currentUser.uid}`) || '[]');
        
        if (savedUsername) {
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
      
      // If not in localStorage, try backend API as fallback
      try {
        const response = await axios.get(`/api/user-facebook-status/${currentUser.uid}`);
        
        if (response.data.hasEnteredFacebookUsername) {
          // User has already entered username, redirect to dashboard
          const savedUsername = response.data.facebook_username;
          const savedCompetitors = response.data.competitors || [];
          const savedAccountType = response.data.accountType || 'branding';
          
          // Save to localStorage for future use
          localStorage.setItem(`facebook_accessed_${currentUser.uid}`, 'true');
          localStorage.setItem(`facebook_username_${currentUser.uid}`, savedUsername);
          localStorage.setItem(`facebook_account_type_${currentUser.uid}`, savedAccountType);
          localStorage.setItem(`facebook_competitors_${currentUser.uid}`, JSON.stringify(savedCompetitors));
          
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
        } else {
          // No Facebook setup found, allow user to complete it
          setIsLoading(false);
        }
        setHasChecked(true);
      } catch (error) {
        console.error('Error checking Facebook status:', error);
        // If backend fails, just show the form
        setIsLoading(false);
        setHasChecked(true);
      }
    };

    checkFacebookStatus();
  }, [currentUser?.uid, hasChecked]); // Removed navigate from dependencies

  const handleSubmitSuccess = (username: string, competitors: string[], accountType: 'branding' | 'non-branding') => {
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
    return (
      <div className="facebook-page loading">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="loading-container"
        >
          <div className="spinner"></div>
          <p>Loading your Facebook account...</p>
        </motion.div>
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
          markPlatformAccessed={markPlatformAccessed}
        />
      </AnimatePresence>
    </div>
  );
};

export default Facebook;
