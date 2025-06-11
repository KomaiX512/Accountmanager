import React, { useState, ChangeEvent, useEffect, useCallback } from 'react';
import axios from 'axios';
import '../instagram/IG_EntryUsernames.css'; // Reuse the same styles
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface TW_EntryUsernamesProps {
  onSubmitSuccess: (username: string, competitors: string[], accountType: 'branding' | 'non-branding') => void;
  redirectIfCompleted?: boolean;
  markPlatformAccessed?: (platformId: string) => void; // Function to mark platform as accessed/claimed
}

const TW_EntryUsernames: React.FC<TW_EntryUsernamesProps> = ({ 
  onSubmitSuccess, 
  redirectIfCompleted = true,
  markPlatformAccessed 
}) => {
  const [username, setUsername] = useState<string>('');
  const [accountType, setAccountType] = useState<'branding' | 'non-branding' | ''>('');
  const [postingStyle, setPostingStyle] = useState<string>('');
  const [competitors, setCompetitors] = useState<string[]>(['', '', '']);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'info' | 'success' | 'error'>('info');
  
  // New state variables for username validation
  const [isCheckingUsername, setIsCheckingUsername] = useState<boolean>(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameMessage, setUsernameMessage] = useState<string>('');
  const [usernameValid, setUsernameValid] = useState<boolean>(true);
  const [usernameTouched, setUsernameTouched] = useState<boolean>(false);
  
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // Twitter-specific endpoints
  const apiUrl = 'http://localhost:3000/save-account-info';
  const statusApiUrl = 'http://localhost:3000/user-twitter-status';
  const usernameCheckUrl = 'http://localhost:3000/check-username-availability';

  // Twitter username validation regex (alphanumeric and underscores only)
  const twitterUsernameRegex = /^[a-zA-Z0-9_]+$/;

  // Check if user has already entered Twitter username
  useEffect(() => {
    // Only check status if we're allowed to redirect on completion
    // This prevents double-checking when parent component (Twitter.tsx) is already handling it
    if (!redirectIfCompleted) {
      setIsInitializing(false);
      return;
    }

    const checkUserStatus = async () => {
      if (!currentUser || !currentUser.uid) {
        console.error('No authenticated user found');
        setIsInitializing(false);
        return;
      }
      
      try {
        const response = await axios.get(`${statusApiUrl}/${currentUser.uid}`);
        
        if (response.data.hasEnteredTwitterUsername && redirectIfCompleted) {
          // User has already entered username, redirect to dashboard
          const savedUsername = response.data.twitter_username;
          const savedCompetitors = response.data.competitors || [];
          const savedAccountType = response.data.accountType || 'branding';
          
          onSubmitSuccess(savedUsername, savedCompetitors, savedAccountType as 'branding' | 'non-branding');
          
          if (savedAccountType === 'branding') {
            navigate('/twitter-dashboard', { 
              state: { 
                accountHolder: savedUsername, 
                competitors: savedCompetitors,
                accountType: 'branding',
                platform: 'twitter'
              } 
            });
          } else {
            navigate('/twitter-non-branding-dashboard', { 
              state: { 
                accountHolder: savedUsername,
                accountType: 'non-branding',
                platform: 'twitter'
              } 
            });
          }
        } else {
          setIsInitializing(false);
        }
      } catch (error) {
        console.error('Error checking user Twitter status:', error);
        setIsInitializing(false);
        // Don't retry on error to prevent infinite loop
      }
    };
    
    // Only run once on mount when conditions are met
    checkUserStatus();
  }, [currentUser?.uid, redirectIfCompleted]); // Removed navigate and onSubmitSuccess to prevent excessive re-runs

  // Debounced username validation
  const checkUsernameAvailability = useCallback(
    async (value: string) => {
      if (!value.trim()) {
        setUsernameAvailable(null);
        setUsernameMessage('');
        return;
      }

      // Validate username format first
      if (!twitterUsernameRegex.test(value)) {
        setUsernameValid(false);
        setUsernameMessage('Username can only contain letters, numbers, and underscores');
        setUsernameAvailable(null);
        return;
      }

      setUsernameValid(true);
      setIsCheckingUsername(true);

      try {
        const response = await axios.get(`${usernameCheckUrl}/${value}?platform=twitter`);
        setUsernameAvailable(response.data.available);
        setUsernameMessage(response.data.message);
      } catch (error) {
        console.error('Error checking username availability:', error);
        setUsernameAvailable(null);
        setUsernameMessage('Unable to check username availability');
      } finally {
        setIsCheckingUsername(false);
      }
    },
    [usernameCheckUrl]
  );

  // Implement debouncing for username validation
  useEffect(() => {
    if (!usernameTouched || !username.trim()) return;

    const handler = setTimeout(() => {
      checkUsernameAvailability(username);
    }, 500); // 500ms delay

    return () => {
      clearTimeout(handler);
    };
  }, [username, checkUsernameAvailability, usernameTouched]);

  // Updated username change handler
  const handleUsernameChange = (e: ChangeEvent<HTMLInputElement>) => {
    // Allow alphanumeric and underscores only
    const inputValue = e.target.value;
    setUsername(inputValue);
    
    if (!usernameTouched) {
      setUsernameTouched(true);
    }
  };

  // Function to validate competitor usernames
  const validateCompetitorUsername = (value: string): boolean => {
    return value.trim() === '' || twitterUsernameRegex.test(value);
  };

  // Updated competitor change handler
  const handleCompetitorChange = (index: number, value: string) => {
    const newCompetitors = [...competitors];
    newCompetitors[index] = value;
    setCompetitors(newCompetitors);
  };

  const isValidForSubmission = (): boolean => {
    if (!username.trim() || !accountType || !postingStyle.trim()) return false;
    if (!usernameValid) return false;
    
    // Now require competitors for both account types
    return competitors.length >= 3 && 
           competitors.slice(0, 3).every(comp => comp.trim() !== '') &&
           competitors.every(validateCompetitorUsername);
  };

  const validationErrors = (): string[] => {
    const errors: string[] = [];
    if (!username.trim()) errors.push('Username is required');
    else if (!usernameValid) errors.push('Username format is invalid');
    
    if (!accountType) errors.push('Account type is required');
    if (!postingStyle.trim()) errors.push('Posting style is required');
    
    // Require competitors for both account types
    if (competitors.length < 3) errors.push('At least 3 competitors are required');
    competitors.forEach((comp, index) => {
      if (index < 3 && !comp.trim()) {
        errors.push(`Competitor ${index + 1} username is required`);
      } else if (comp.trim() && !validateCompetitorUsername(comp)) {
        errors.push(`Competitor ${index + 1} username format is invalid`);
      }
    });
    
    return errors;
  };

  const addCompetitor = () => {
    setCompetitors([...competitors, '']);
  };

  const removeCompetitor = (index: number) => {
    if (competitors.length > 3) {
      setCompetitors(competitors.filter((_, i) => i !== index));
    }
  };

  const resetForm = () => {
    setUsername('');
    setAccountType('');
    setPostingStyle('');
    setCompetitors(['', '', '']);
    setUsernameAvailable(null);
    setUsernameMessage('');
    setUsernameTouched(false);
  };

  const showMessage = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  };

  const submitData = async () => {
    if (!isValidForSubmission()) {
      showMessage('Please fill in all required fields correctly', 'error');
      return;
    }

    if (!currentUser || !currentUser.uid) {
      showMessage('You must be logged in to continue', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        username: username.trim(),
        accountType,
        postingStyle: postingStyle.trim(),
        competitors: competitors.map(comp => comp.trim()), // Always include competitors
        platform: 'twitter'
      };

      // Save to account info API with platform parameter
      const response = await axios.post(`${apiUrl}?platform=twitter`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      if (response.status === 200) {
        // Now save the user's Twitter username entry state
        await axios.post(`${statusApiUrl}/${currentUser.uid}`, {
          twitter_username: username.trim(),
          accountType,
          competitors: competitors.map(comp => comp.trim())
        });
        
        // Check if this was a pending platform to be marked as acquired
        if (currentUser?.uid) {
          const pendingKey = `mark_twitter_pending_${currentUser.uid}`;
          if (localStorage.getItem(pendingKey)) {
            // Clear the pending flag
            localStorage.removeItem(pendingKey);
            // Mark as acquired
            localStorage.setItem(`twitter_accessed_${currentUser.uid}`, 'true');
            // Save account type for routing purposes
            localStorage.setItem(`twitter_account_type_${currentUser.uid}`, accountType);
          }
        }

        // Store username for notification counting in main dashboard
        localStorage.setItem(`twitter_username_${currentUser.uid}`, username.trim());

        // Mark Twitter as acquired after successful submission
        if (markPlatformAccessed) {
          markPlatformAccessed('twitter');
        } else {
          // Fallback if function not provided - update localStorage directly
          if (currentUser?.uid) {
            localStorage.setItem(`twitter_accessed_${currentUser.uid}`, 'true');
            // Save account type for routing purposes
            localStorage.setItem(`twitter_account_type_${currentUser.uid}`, accountType);
          }
        }

        showMessage('Submission successful', 'success');
        resetForm();
        setTimeout(() => {
          onSubmitSuccess(
            username,
            payload.competitors, // Always pass competitors
            accountType as 'branding' | 'non-branding'
          );
          
          if (accountType === 'branding') {
            navigate('/twitter-dashboard', { 
              state: { 
                accountHolder: username, 
                competitors: payload.competitors,
                accountType: 'branding',
                platform: 'twitter'
              } 
            });
          } else {
            navigate('/twitter-non-branding-dashboard', { 
              state: { 
                accountHolder: username,
                competitors: payload.competitors, // Always pass competitors
                accountType: 'non-branding',
                platform: 'twitter'
              } 
            });
          }
        }, 1000);
      }
    } catch (error: any) {
      console.error('Error submitting data:', error);
      const errorMessage =
        error.response?.data?.message || error.response?.data?.error || 'Server error occurred';
      showMessage(`Error: ${errorMessage}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="dashboard-container">
        <div className="card loading">
          <h1 className="title">Loading...</h1>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="dashboard-container"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <motion.div
        className="card"
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="title">Twitter Setup</h1>

        <div className="section">
          <h2 className="subtitle">Username</h2>
          <motion.div className="input-group" whileHover={{ x: 5 }}>
            <input
              value={username}
              onChange={handleUsernameChange}
              type="text"
              placeholder="Enter your Twitter username (without @)"
              className={!usernameValid ? 'invalid-input' : ''}
            />
          </motion.div>
          {usernameTouched && username.trim() && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`username-status ${
                isCheckingUsername
                  ? 'status-checking'
                  : !usernameValid
                  ? 'status-invalid'
                  : usernameAvailable
                  ? 'status-available'
                  : 'status-taken'
              }`}
            >
              {isCheckingUsername
                ? 'Checking...'
                : !usernameValid
                ? 'Use only letters, numbers, and underscores'
                : usernameAvailable
                ? 'Username is available!'
                : 'You can go ahead but this is already taken'}
            </motion.div>
          )}
        </div>

        <div className="section">
          <h2 className="subtitle">Account Type</h2>
          <div className="radio-group">
            <label className="radio-label">
              <input
                type="radio"
                value="branding"
                checked={accountType === 'branding'}
                onChange={() => setAccountType('branding')}
              />
              Branding
            </label>
            <label className="radio-label">
              <input
                type="radio"
                value="non-branding"
                checked={accountType === 'non-branding'}
                onChange={() => setAccountType('non-branding')}
              />
              Non-Branding
            </label>
          </div>
        </div>

        <div className="section">
          <h2 className="subtitle">Posting Style</h2>
          <motion.div className="input-group" whileHover={{ x: 5 }}>
            <input
              type="text"
              value={postingStyle}
              onChange={(e) => setPostingStyle(e.target.value)}
              placeholder="Describe your posting style (e.g., casual, professional, informative)"
            />
          </motion.div>
        </div>

        <div className="section">
          <h2 className="subtitle">Competitors (at least 3 required)</h2>
          {competitors.map((competitor, index) => (
            <motion.div
              key={index}
              className="input-group competitor-input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.1 }}
            >
              <input
                value={competitor}
                onChange={(e) => handleCompetitorChange(index, e.target.value)}
                type="text"
                placeholder={`Enter competitor ${index + 1} (without @)`}
                className={competitor && !validateCompetitorUsername(competitor) ? 'invalid-input' : ''}
              />
              {competitors.length > 3 && (
                <motion.button
                  className="remove-btn"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => removeCompetitor(index)}
                >
                  ×
                </motion.button>
              )}
              {competitor && !validateCompetitorUsername(competitor) && (
                <div className="validation-error">
                  Invalid competitor username format
                </div>
              )}
            </motion.div>
          ))}
          <motion.button
            className="add-btn"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={addCompetitor}
          >
            Add Competitor
          </motion.button>
        </div>

        {validationErrors().length > 0 && (
          <motion.div
            className="validation-errors"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <ul>
              {validationErrors().map((error, index) => (
                <li key={index} className="error-message">{error}</li>
              ))}
            </ul>
          </motion.div>
        )}

        <div className="section submit-section">
          <motion.button
            className="submit-btn"
            whileHover={{ scale: 1.05, boxShadow: '0 0 25px rgba(0, 255, 204, 0.7)' }}
            whileTap={{ scale: 0.95 }}
            onClick={submitData}
            disabled={isLoading || validationErrors().length > 0}
          >
            {isLoading ? (
              <div className="spinner"></div>
            ) : (
              <span>Submit</span>
            )}
          </motion.button>
        </div>

        {message && (
          <motion.div
            className={`message ${messageType}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {message}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default TW_EntryUsernames; 