import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import IG_EntryUsernames from '../components/instagram/IG_EntryUsernames';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';

const Instagram: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user has already completed Instagram setup
    const checkInstagramStatus = async () => {
      if (!currentUser?.uid) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await axios.get(`/api/user-instagram-status/${currentUser.uid}`);
        
        if (response.data.hasEnteredInstagramUsername) {
          // User has already entered username, redirect to dashboard
          const savedUsername = response.data.instagram_username;
          const savedCompetitors = response.data.competitors || [];
          const savedAccountType = response.data.accountType || 'branding';
          
          if (savedAccountType === 'branding') {
            navigate('/dashboard', { 
              state: { 
                accountHolder: savedUsername, 
                competitors: savedCompetitors,
                accountType: 'branding'
              },
              replace: true 
            });
          } else {
            navigate('/non-branding-dashboard', { 
              state: { 
                accountHolder: savedUsername,
                competitors: savedCompetitors,
                accountType: 'non-branding' 
              },
              replace: true
            });
          }
        } else {
          // No Instagram setup found, allow user to complete it
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error checking Instagram status:', error);
        setIsLoading(false);
      }
    };

    checkInstagramStatus();
  }, [currentUser, navigate]);

  const handleSubmitSuccess = (username: string, competitors: string[], accountType: 'branding' | 'non-branding') => {
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
  };

  if (isLoading) {
    return (
      <div className="instagram-page loading">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="loading-container"
        >
          <div className="spinner"></div>
          <p>Loading your Instagram account...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="instagram-page">
      <AnimatePresence mode="wait">
        <IG_EntryUsernames
          key="entry"
          onSubmitSuccess={handleSubmitSuccess}
          redirectIfCompleted={false}
          onComplete={() => {}}
        />
      </AnimatePresence>
    </div>
  );
};

export default Instagram;