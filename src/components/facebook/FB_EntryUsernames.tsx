import React, { useState, ChangeEvent, useEffect, useCallback } from 'react';
import axios from 'axios';
import './FB_EntryUsernames.css';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ProcessingLoadingState from '../common/ProcessingLoadingState';
import { useProcessing } from '../../context/ProcessingContext';

interface FB_EntryUsernamesProps {
  onSubmitSuccess: (username: string, competitors: string[], accountType: 'branding' | 'non-branding') => void;
  redirectIfCompleted?: boolean;
  markPlatformAccessed?: (platformId: string) => void;
  onComplete?: () => void;
}

const FB_EntryUsernames: React.FC<FB_EntryUsernamesProps> = ({ 
  onSubmitSuccess, 
  redirectIfCompleted = true,
  markPlatformAccessed,
  onComplete
}) => {
  const [username, setUsername] = useState<string>('');
  const [accountType, setAccountType] = useState<'branding' | 'non-branding'>('branding');
  const [postingStyle, setPostingStyle] = useState<string>('');
  const [competitors, setCompetitors] = useState<string[]>(['', '', '']);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'info' | 'success' | 'error'>('info');
  
  const [isCheckingUsername, setIsCheckingUsername] = useState<boolean>(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameMessage, setUsernameMessage] = useState<string>('');
  const [usernameValid, setUsernameValid] = useState<boolean>(true);
  const [usernameTouched, setUsernameTouched] = useState<boolean>(false);
  
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { startProcessing, processingState } = useProcessing();

  const apiUrl = '/api/save-account-info';
const statusApiUrl = '/api/user-facebook-status';
const usernameCheckUrl = '/api/check-username-availability';

  // Facebook username validation (letters, numbers, periods only - no underscores for Facebook)
  const facebookUsernameRegex = /^[a-zA-Z0-9.]+$/;

  // Check for existing processing state on mount
  useEffect(() => {
    if (processingState.isProcessing && processingState.platform === 'facebook') {
      setIsProcessing(true);
      setIsInitializing(false);
    }
  }, [processingState]);

  useEffect(() => {
    const checkUserStatus = async () => {
      if (!currentUser || !currentUser.uid) {
        console.error('No authenticated user found');
        setIsInitializing(false);
        return;
      }
      
      try {
        const response = await axios.get(`${statusApiUrl}/${currentUser.uid}`);
        
        if (response.data.hasEnteredFacebookUsername && redirectIfCompleted) {
          const savedUsername = response.data.facebook_username;
          const savedCompetitors = response.data.competitors || [];
          const savedAccountType = response.data.accountType || 'branding';
          
          onSubmitSuccess(savedUsername, savedCompetitors, savedAccountType as 'branding' | 'non-branding');
          
          if (savedAccountType === 'branding') {
            navigate('/facebook-dashboard', { 
              state: { 
                accountHolder: savedUsername, 
                competitors: savedCompetitors,
                accountType: 'branding',
                platform: 'facebook'
              } 
            });
          } else {
            navigate('/facebook-non-branding-dashboard', { 
              state: { 
                accountHolder: savedUsername,
                competitors: savedCompetitors,
                accountType: 'non-branding',
                platform: 'facebook'
              } 
            });
          }
        } else {
          setIsInitializing(false);
        }
      } catch (error) {
        console.error('Error checking user Facebook status:', error);
        setIsInitializing(false);
      }
    };
    
    checkUserStatus();
  }, [currentUser, navigate, onSubmitSuccess, redirectIfCompleted]);

  const checkUsernameAvailability = useCallback(
    async (value: string) => {
      if (!value.trim()) {
        setUsernameAvailable(null);
        setUsernameMessage('');
        return;
      }

      if (!facebookUsernameRegex.test(value)) {
        setUsernameValid(false);
        setUsernameMessage('Username can only contain letters, numbers, and periods');
        setUsernameAvailable(null);
        return;
      }

      setUsernameValid(true);
      setIsCheckingUsername(true);

      try {
        const response = await axios.get(`${usernameCheckUrl}/${value}?platform=facebook`);
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

  useEffect(() => {
    if (!usernameTouched || !username.trim()) return;

    const handler = setTimeout(() => {
      checkUsernameAvailability(username);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [username, checkUsernameAvailability, usernameTouched]);

  const handleUsernameChange = (e: ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setUsername(inputValue);
    
    // Reset validation states when user types
    setUsernameValid(true);
    setUsernameAvailable(null);
    setUsernameMessage('');
    
    if (!usernameTouched) {
      setUsernameTouched(true);
    }
  };

  const validateCompetitorUsername = (value: string): boolean => {
    return value.trim() === '' || facebookUsernameRegex.test(value);
  };

  const handleCompetitorChange = (index: number, value: string) => {
    const newCompetitors = [...competitors];
    newCompetitors[index] = value;
    setCompetitors(newCompetitors);
  };

  const isValidForSubmission = (): boolean => {
    // Check basic required fields
    if (!username.trim() || !accountType || !postingStyle.trim()) return false;
    
    // Check username format validity (not availability)
    if (username.trim() && !facebookUsernameRegex.test(username.trim())) return false;
    
    // Check competitors
    if (competitors.length < 3) return false;
    if (!competitors.slice(0, 3).every(comp => comp.trim() !== '')) return false;
    if (!competitors.every(validateCompetitorUsername)) return false;
    
    return true;
  };

  const validationErrors = (): string[] => {
    const errors: string[] = [];
    
    // Username validation
    if (!username.trim()) {
      errors.push('Username is required');
    } else if (!facebookUsernameRegex.test(username.trim())) {
      errors.push('Username format is invalid (only letters, numbers, and periods allowed)');
    }
    
    // Account type validation
    if (!accountType) {
      errors.push('Account type is required');
    }
    
    // Posting style validation
    if (!postingStyle.trim()) {
      errors.push('Posting style is required');
    }
    
    // Competitor validation
    if (competitors.length < 3) {
      errors.push('At least 3 competitors are required');
    } else {
      competitors.forEach((comp, index) => {
        if (index < 3 && !comp.trim()) {
          errors.push(`Competitor ${index + 1} username is required`);
        } else if (comp.trim() && !validateCompetitorUsername(comp)) {
          errors.push(`Competitor ${index + 1} username format is invalid`);
        }
      });
    }
    
    return errors;
  };

  const addCompetitor = () => {
    setCompetitors([...competitors, '']);
  };

  const removeCompetitor = (index: number) => {
    if (competitors.length > 3) {
      const newCompetitors = competitors.filter((_, i) => i !== index);
      setCompetitors(newCompetitors);
    }
  };

  const resetForm = () => {
    setUsername('');
    setAccountType('branding');
    setPostingStyle('');
    setCompetitors(['', '', '']);
    setMessage('');
    setUsernameAvailable(null);
    setUsernameMessage('');
    setUsernameTouched(false);
  };

  const showMessage = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  };

  const handleStartProcessing = (username: string) => {
    startProcessing('facebook', username, 15); // 15 minutes duration
    setIsProcessing(true);
    setIsInitializing(false);
  };

  const handleProcessingComplete = () => {
    setIsProcessing(false);
    if (onComplete) {
      onComplete();
    }
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
      const apiUrl = `/api/save-account-info`;
      const statusApiUrl = `/api/user-status`;

      const finalCompetitors = competitors.filter(comp => comp.trim() !== '');

      const payload = {
        username: username.trim(),
        accountType,
        competitors: finalCompetitors,
        postingStyle: postingStyle.trim() || 'General posting style',
        platform: 'facebook'
      };

      // Save to account info API
      const response = await axios.post(apiUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      if (response.status === 200) {
        // Now save the user's Facebook username entry state
        await axios.post(`/api/user-facebook-status/${currentUser.uid}`, {
          facebook_username: username.trim(),
          accountType,
          competitors: competitors.map(comp => comp.trim())
        });
        
        showMessage('Submission successful', 'success');
        
        // Start the processing phase
        handleStartProcessing(username);
      }
    } catch (error: any) {
      console.error('Error submitting Facebook data:', error);
      const errorMessage = error.response?.data?.error || 'Failed to save Facebook account information. Please try again.';
      showMessage(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="fb-entry-container loading">
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

  if (isProcessing) {
    return (
      <ProcessingLoadingState
        onComplete={handleProcessingComplete}
      />
    );
  }

  return (
    <motion.div
      className="fb-entry-container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
    >
      <div className="fb-entry-wrapper">
        <div className="fb-entry-header">
          <h1>Setup Your Facebook Account</h1>
          <p>Enter your Facebook username and competitors to get started with AI-powered social media management</p>
        </div>

        <form className="fb-entry-form" onSubmit={(e) => { e.preventDefault(); submitData(); }}>
          <div className="form-section">
            <h2>Account Information</h2>
            
            <div className="form-group">
              <label htmlFor="facebook-username">Your Facebook Username *</label>
              <input
                type="text"
                id="facebook-username"
                value={username}
                onChange={handleUsernameChange}
                placeholder="e.g., yourpage or your.profile.name"
                className={`form-input ${usernameTouched && !usernameValid ? 'error' : ''} ${usernameAvailable === true ? 'success' : ''} ${usernameAvailable === false ? 'error' : ''}`}
                disabled={isLoading}
              />
              {isCheckingUsername && <div className="username-check-indicator">Checking availability...</div>}
              {usernameMessage && (
                <div className={`username-message ${usernameAvailable === true ? 'success' : 'error'}`}>
                  {usernameMessage}
                </div>
              )}
              <small>Enter your Facebook page name or profile username</small>
            </div>

            <div className="form-group">
              <label htmlFor="account-type">Account Type *</label>
              <select
                id="account-type"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as 'branding' | 'non-branding')}
                className="form-select"
                disabled={isLoading}
              >
                <option value="branding">Branding Account</option>
                <option value="non-branding">Non-Branding Account</option>
              </select>
              <small>
                Branding: Business/brand promotion | Non-Branding: Personal content focus
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="posting-style">Posting Style *</label>
              <textarea
                id="posting-style"
                value={postingStyle}
                onChange={(e) => setPostingStyle(e.target.value)}
                placeholder="Describe your typical posting style, tone, and content approach..."
                className="form-textarea"
                rows={4}
                disabled={isLoading}
              />
              <small>Help our AI understand your voice and content style</small>
            </div>
          </div>

          <div className="form-section">
            <h2>Competitor Analysis</h2>
            <p>Add Facebook pages/profiles you want to analyze and compete with</p>
            
            {competitors.map((competitor, index) => (
              <div key={index} className="form-group competitor-group">
                <div className="competitor-input-wrapper">
                  <label htmlFor={`competitor-${index}`}>
                    Competitor {index + 1} {index < 3 ? '*' : ''}
                  </label>
                  <input
                    type="text"
                    id={`competitor-${index}`}
                    value={competitor}
                    onChange={(e) => handleCompetitorChange(index, e.target.value)}
                    placeholder="e.g., competitor.page"
                    className={`form-input ${competitor.trim() && !validateCompetitorUsername(competitor) ? 'error' : ''}`}
                    disabled={isLoading}
                  />
                  {index >= 3 && (
                    <button
                      type="button"
                      onClick={() => removeCompetitor(index)}
                      className="remove-competitor"
                      disabled={isLoading}
                    >
                      Remove
                    </button>
                  )}
                </div>
                {competitor.trim() && !validateCompetitorUsername(competitor) && (
                  <div className="error-message">Invalid Facebook username format</div>
                )}
              </div>
            ))}
            
            {competitors.length < 10 && (
              <button
                type="button"
                onClick={addCompetitor}
                className="add-competitor"
                disabled={isLoading}
              >
                + Add Another Competitor
              </button>
            )}
          </div>

          {message && (
            <motion.div
              className={`message ${messageType}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              {message}
            </motion.div>
          )}

          <div className="form-actions">
            <button
              type="button"
              onClick={resetForm}
              className="reset-button"
              disabled={isLoading}
            >
              Reset Form
            </button>
            <button
              type="submit"
              className="submit-button"
              disabled={isLoading || !isValidForSubmission()}
            >
              {isLoading ? (
                <>
                  <div className="button-spinner"></div>
                  Setting up...
                </>
              ) : (
                'Setup Facebook Account'
              )}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
};

export default FB_EntryUsernames; 