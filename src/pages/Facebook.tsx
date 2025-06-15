import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FB_EntryUsernames from '../components/facebook/FB_EntryUsernames';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';

const Facebook: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user has already completed Facebook setup
    const checkFacebookStatus = async () => {
      if (!currentUser?.uid) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await axios.get(`/api/user-facebook-status/${currentUser.uid}`);
        
        if (response.data.hasEnteredFacebookUsername) {
          // User has already entered username, redirect to dashboard
          const savedUsername = response.data.facebook_username;
          const savedCompetitors = response.data.competitors || [];
          const savedAccountType = response.data.accountType || 'branding';
          
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
      } catch (error) {
        console.error('Error checking Facebook status:', error);
        setIsLoading(false);
      }
    };

    checkFacebookStatus();
  }, [currentUser, navigate]);

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
        />
      </AnimatePresence>
    </div>
  );
};

export default Facebook;
