import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TW_EntryUsernames from '../components/twitter/TW_EntryUsernames';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';

const Twitter: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user has already completed Twitter setup
    const checkTwitterStatus = async () => {
      if (!currentUser?.uid) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await axios.get(`/api/user-twitter-status/${currentUser.uid}`);
        
        if (response.data.hasEnteredTwitterUsername) {
          // User has already entered username, redirect to dashboard
          const savedUsername = response.data.twitter_username;
          const savedCompetitors = response.data.competitors || [];
          const savedAccountType = response.data.accountType || 'branding';
          
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
      } catch (error) {
        console.error('Error checking Twitter status:', error);
        setIsLoading(false);
      }
    };

    checkTwitterStatus();
  }, [currentUser, navigate]);

  const handleSubmitSuccess = (username: string, competitors: string[], accountType: 'branding' | 'non-branding') => {
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
  };

  if (isLoading) {
    return (
      <div className="twitter-page loading">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="loading-container"
        >
          <div className="spinner"></div>
          <p>Loading your Twitter account...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="twitter-page">
      <AnimatePresence mode="wait">
        <TW_EntryUsernames
          key="entry"
          onSubmitSuccess={handleSubmitSuccess}
          redirectIfCompleted={false}
        />
      </AnimatePresence>
    </div>
  );
};

export default Twitter;
