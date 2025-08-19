import React, { useState, ChangeEvent, useEffect, useCallback } from 'react';
import axios from 'axios';
import '../facebook/FB_EntryUsernames.css'; // Use Facebook CSS for proper modal centering
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ProcessingLoadingState from '../common/ProcessingLoadingState';
import { useProcessing } from '../../context/ProcessingContext';

interface TW_EntryUsernamesProps {
  onSubmitSuccess: (username: string, competitors: string[], accountType: 'branding' | 'non-branding') => void;
  redirectIfCompleted?: boolean;
  markPlatformAccessed?: (platformId: string) => void; // Function to mark platform as accessed/claimed
  onComplete?: () => void;
}

const TW_EntryUsernames: React.FC<TW_EntryUsernamesProps> = ({ 
  onSubmitSuccess, 
  redirectIfCompleted = true,
  markPlatformAccessed,
  onComplete
}) => {
  const [username, setUsername] = useState<string>('');
  const [accountType, setAccountType] = useState<'branding' | 'non-branding' | ''>('branding');
  const [postingStyle, setPostingStyle] = useState<string>('');
  const [competitors, setCompetitors] = useState<string[]>(['', '', '']);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'info' | 'success' | 'error'>('info');
  
  // New state variables for username validation
  const [isCheckingUsername, setIsCheckingUsername] = useState<boolean>(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameMessage, setUsernameMessage] = useState<string>('');
  const [usernameValid, setUsernameValid] = useState<boolean>(true);
  const [usernameTouched, setUsernameTouched] = useState<boolean>(false);
  
  // New state for pre-submission confirmation
  const [showConfirmation, setShowConfirmation] = useState<boolean>(false);
  const [confirmationData, setConfirmationData] = useState<any>(null);
  
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { startProcessing, processingState } = useProcessing();

  // Twitter-specific endpoints
  const apiUrl = '/api/save-account-info';
const statusApiUrl = '/api/user-twitter-status';
const usernameCheckUrl = '/api/check-username-availability';

  // Twitter username validation regex (alphanumeric and underscores only)
  const twitterUsernameRegex = /^[a-zA-Z0-9_]+$/;

  // Initialize component
  useEffect(() => {
    // Only check for active processing state, not completed state
    // The dashboards will handle redirecting completed users
    setIsInitializing(false);
  }, []);

  // Check for existing processing state on mount
  useEffect(() => {
    if (processingState.isProcessing && processingState.platform === 'twitter') {
      setIsProcessing(true);
      setIsInitializing(false);
      
      // Restore username from processing state or localStorage
      if (processingState.username) {
        setUsername(processingState.username);
          } else {
        // Fallback to localStorage
      try {
          const processingInfo = localStorage.getItem('twitter_processing_info');
          if (processingInfo) {
            const info = JSON.parse(processingInfo);
            if (info.username) {
              setUsername(info.username);
            }
          }
        } catch (error) {
          console.error('Error reading username from localStorage:', error);
              } 
      }
          } else {
      // No active processing, show the form
          setIsInitializing(false);
        }
  }, [processingState]);

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
    setAccountType('branding');
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

  const handleProcessingComplete = () => {
    // Reset local processing state
    setIsProcessing(false);
    
    // Mark platform as accessed after processing is complete
    if (markPlatformAccessed) {
      markPlatformAccessed('twitter');
    } else if (currentUser?.uid) {
      // Fallback: set localStorage flag directly
      localStorage.setItem(`twitter_accessed_${currentUser.uid}`, 'true');
    }
    
    // Call the onComplete callback
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

    // Show confirmation dialog before proceeding
    const finalCompetitors = competitors.filter(comp => comp.trim() !== '');
    const dataToConfirm = {
      username: username.trim(),
      accountType,
      competitors: finalCompetitors,
      postingStyle: postingStyle.trim() || 'General posting style',
      platform: 'twitter'
    };
    
    setConfirmationData(dataToConfirm);
    setShowConfirmation(true);
  };

  const handleConfirmedSubmission = async () => {
    if (!confirmationData || !currentUser?.uid) return;
    
    setIsLoading(true);
    setShowConfirmation(false);

    try {
      const apiUrl = `/api/save-account-info`;
      const statusApiUrl = `/api/user-status`;

      // Save to account info API
      const response = await axios.post(apiUrl, confirmationData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      if (response.status === 200) {
        // Now save the user's Twitter username entry state
        await axios.post(`/api/user-twitter-status/${currentUser.uid}`, {
          twitter_username: confirmationData.username,
          accountType: confirmationData.accountType,
          competitors: confirmationData.competitors
        });
        
        // Save to localStorage immediately for future use
        localStorage.setItem(`twitter_accessed_${currentUser.uid}`, 'true');
        localStorage.setItem(`twitter_username_${currentUser.uid}`, confirmationData.username);
        localStorage.setItem(`twitter_account_type_${currentUser.uid}`, confirmationData.accountType);
        localStorage.setItem(`twitter_competitors_${currentUser.uid}`, JSON.stringify(confirmationData.competitors));
        
        showMessage('Submission successful', 'success');
        
        // Start the processing phase using unified ProcessingContext
        startProcessing('twitter', confirmationData.username, 15); // 15 minutes duration
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
    // ✅ NO BLOCKING LOADING SCREEN - Show content immediately while checking processing state in background
    // This prevents the frustrating loading screen during navigation
    return (
      <motion.div
        className="twitter-entry-container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.5 }}
      >
        <div className="twitter-entry-wrapper">
          <div className="twitter-entry-header">
            <h1>Setup Your Twitter Account</h1>
            <div className="importance-notice">
              <div className="importance-icon">⚠️</div>
              <p><strong>Critical Setup:</strong> This information initiates a 15-minute AI analysis process. Please ensure all details are accurate before submission.</p>
            </div>
          </div>

          <form className="twitter-entry-form" onSubmit={(e) => { e.preventDefault(); submitData(); }}>
            <div className="form-section">
              <h2>Account Information</h2>
              
              <div className="form-group">
                <label htmlFor="twitter-username">
                  Your Twitter Username * 
                  <span className="critical-field">CRITICAL</span>
                </label>
                <input
                  type="text"
                  id="twitter-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g., YourBrandName (no @ symbol)"
                  className="form-input"
                  disabled={isLoading}
                />
                <div className="username-counter">
                  Characters: {username.length} / 15
                  {username.length > 12 && (
                    <span className="counter-warning"> (Username getting long)</span>
                  )}
                </div>
                <div className="field-description">
                  <p><strong>Twitter Username:</strong> This is your Twitter handle without the @ symbol.</p>
                  <ul>
                    <li>✓ Must be a valid Twitter username</li>
                    <li>✓ No spaces or special characters (except underscores)</li>
                    <li>✓ Used for AI analysis and competitor research</li>
                    <li>✓ This will be used for 15 minutes of AI processing</li>
                  </ul>
                  <div className="format-example">
                    <strong>Examples:</strong> "YourBrandName", "YourName", "Brand_123"
                  </div>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h2>Competitor Analysis</h2>
              <div className="competitors-section">
                <div className="competitors-header">
                  <h3>Add Your Competitors</h3>
                  <p>Add up to 5 competitors for AI-powered analysis and insights</p>
                </div>
                
                {competitors.map((competitor, index) => (
                  <div key={index} className="competitor-input-group">
                    <input
                      type="text"
                      value={competitor}
                      onChange={(e) => handleCompetitorChange(index, e.target.value)}
                      placeholder={`Competitor ${index + 1} username`}
                      className="form-input"
                      disabled={isLoading}
                    />
                    {competitors.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCompetitor(index)}
                        className="remove-competitor-btn"
                        disabled={isLoading}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                
                {competitors.length < 5 && (
                  <button
                    type="button"
                    onClick={addCompetitor}
                    className="add-competitor-btn"
                    disabled={isLoading}
                  >
                    + Add Competitor
                  </button>
                )}
              </div>
            </div>

            <div className="form-section">
              <h2>Account Type</h2>
              <div className="account-type-selection">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="accountType"
                    value="branding"
                    checked={accountType === 'branding'}
                    onChange={(e) => setAccountType(e.target.value as 'branding' | 'non-branding')}
                    disabled={isLoading}
                  />
                  <span className="radio-text">
                    <strong>Branding Account</strong>
                    <span className="radio-description">Business, brand, or public figure account</span>
                  </span>
                </label>
                
                <label className="radio-label">
                  <input
                    type="radio"
                    name="accountType"
                    value="non-branding"
                    checked={accountType === 'non-branding'}
                    onChange={(e) => setAccountType(e.target.value as 'branding' | 'non-branding')}
                    disabled={isLoading}
                  />
                  <span className="radio-text">
                    <strong>Non-Branding Account</strong>
                    <span className="radio-description">Personal, private, or non-business account</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="submit-btn"
                disabled={isLoading || !isValidForSubmission()}
              >
                {isLoading ? (
                  <>
                    <span className="spinner"></span>
                    Setting Up Your Account...
                  </>
                ) : (
                  'Start Twitter Setup'
                )}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    );
  }

  if (isProcessing) {
    return (
      <ProcessingLoadingState
        platform="twitter"
        username={username}
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
          <h1>Setup Your Twitter Account</h1>
          <div className="importance-notice">
            <div className="importance-icon">⚠️</div>
            <p><strong>Critical Setup:</strong> This information initiates a 15-minute AI analysis process. Please ensure all details are accurate before submission.</p>
          </div>
        </div>

        <form className="fb-entry-form" onSubmit={(e) => { e.preventDefault(); submitData(); }}>
          <div className="form-section">
            <h2>Account Information</h2>
            
            <div className="form-group">
              <label htmlFor="twitter-username">
                Your Twitter Username * 
                <span className="critical-field">CRITICAL</span>
              </label>
              <input
                type="text"
                id="twitter-username"
                value={username}
                onChange={handleUsernameChange}
                placeholder="e.g., YourBrandName (no @ symbol)"
                className="form-input"
                disabled={isLoading}
              />
              <div className="username-counter">
                Characters: {username.length} / 15
                {username.length > 12 && (
                  <span className="counter-warning"> (Username getting long)</span>
                )}
              </div>
              <div className="field-description">
                <p><strong>Twitter Username:</strong> This is your Twitter handle without the @ symbol.</p>
                <ul>
                  <li>✓ Must be a valid Twitter username</li>
                  <li>✓ No spaces or special characters (except underscores)</li>
                  <li>✓ Used for AI analysis and competitor research</li>
                  <li>✓ This will be used for 15 minutes of AI processing</li>
                </ul>
                <div className="format-example">
                  <strong>Examples:</strong> "YourBrandName", "YourName", "Brand_123"
                </div>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h2>Competitor Analysis</h2>
            <div className="section-description">
              <p><strong>Strategic Intelligence:</strong> These competitors will be analyzed to understand market trends, content strategies, and engagement patterns.</p>
            </div>
            
            <div className="competitors-container">
              {competitors.map((competitor, index) => (
                <div key={index} className="competitor-input-group">
                  <div className="competitor-header">
                    <label className="competitor-label">
                      Competitor {index + 1} {index < 3 ? '*' : ''}
                      {index < 3 && <span className="required-badge">Required</span>}
                    </label>
                    {index < 3 && (
                      <div className="competitor-hint">
                        Choose a Twitter account that represents your target market or content niche
                      </div>
                    )}
                  </div>
                  
                  <div className="competitor-input-wrapper">
                    <input
                      value={competitor}
                      onChange={(e) => handleCompetitorChange(index, e.target.value)}
                      type="text"
                      placeholder={`Enter competitor ${index + 1} (without @)`}
                      className={`competitor-input ${competitor && !validateCompetitorUsername(competitor) ? 'invalid-input' : ''}`}
                      disabled={isLoading}
                    />
                    {competitors.length > 3 && (
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
                  
                  {competitor && !validateCompetitorUsername(competitor) && (
                    <div className="error-message">
                      Invalid competitor username format
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {competitors.length < 5 && (
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

          <div className="form-section">
            <h2>Account Type</h2>
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
              <div className="field-description">
                <p><strong>Account Type Impact:</strong></p>
                <ul>
                  <li><strong>Branding:</strong> Business promotion, product marketing, brand awareness</li>
                  <li><strong>Non-Branding:</strong> Personal content, lifestyle, entertainment focus</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h2>Posting Style</h2>
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
              <div className="field-description">
                <p><strong>AI Training Data:</strong> This helps our AI understand your voice and create content that matches your style.</p>
                <p><em>Examples:</em> "Professional and informative with occasional humor" or "Casual and relatable lifestyle content"</p>
              </div>
            </div>
          </div>

          {validationErrors().length > 0 && (
            <div className="validation-errors">
              <ul>
                {validationErrors().map((error, index) => (
                  <li key={index} className="error-message">{error}</li>
                ))}
              </ul>
            </div>
          )}

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
                'Review & Submit Setup'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Pre-submission Confirmation Modal */}
      {showConfirmation && confirmationData && (
        <motion.div
          className="confirmation-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="confirmation-modal"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
          >
            <div className="confirmation-header">
              <h3>🔍 Final Review Required</h3>
              <p><strong>Please verify your information before starting the 15-minute AI analysis:</strong></p>
            </div>
            
            <div className="confirmation-content">
              <div className="confirmation-section">
                <h4>📝 Your Information</h4>
                <div className="confirmation-item">
                  <strong>Username:</strong> {confirmationData.username}
                  <div className="critical-warning">⚠️ This is critical - check spelling carefully!</div>
                </div>
                <div className="confirmation-item">
                  <strong>Account Type:</strong> {confirmationData.accountType}
                </div>
                <div className="confirmation-item">
                  <strong>Posting Style:</strong> {confirmationData.postingStyle}
                </div>
              </div>
              
              <div className="confirmation-section">
                <h4>🎯 Competitors ({confirmationData.competitors.length})</h4>
                {confirmationData.competitors.map((comp: string, index: number) => (
                  <div key={index} className="confirmation-item">
                    <strong>Competitor {index + 1}:</strong> {comp}
                  </div>
                ))}
              </div>
              
              <div className="confirmation-warning">
                <p><strong>⚠️ Important:</strong> Once submitted, this will initiate a 15-minute AI analysis process. Make sure all information is correct!</p>
              </div>
            </div>
            
            <div className="confirmation-actions">
              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                className="cancel-button"
              >
                Go Back & Edit
              </button>
              <button
                type="button"
                onClick={handleConfirmedSubmission}
                className="confirm-button"
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : '✅ Confirm & Start Analysis'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default TW_EntryUsernames; 