import React, { useState, ChangeEvent, useEffect, useCallback } from 'react';
import axios from 'axios';
import './IG_EntryUsernames.css';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext'; // Fixed import path
import ProcessingLoadingState from '../common/ProcessingLoadingState';
import { useProcessing } from '../../context/ProcessingContext';

interface IG_EntryUsernamesProps {
  onSubmitSuccess: (username: string, competitors: string[], accountType: 'branding' | 'non-branding') => void;
  redirectIfCompleted?: boolean; // Flag to indicate if we should redirect if user already entered username
  markPlatformAccessed?: (platformId: string) => void; // Function to mark platform as accessed/claimed
  onComplete: () => void;
}

const IG_EntryUsernames: React.FC<IG_EntryUsernamesProps> = ({ 
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
  const { currentUser } = useAuth(); // Get the current user from auth context
  const { processingState, startProcessing } = useProcessing();

  const apiUrl = '/api/save-account-info';
const statusApiUrl = '/api/user-instagram-status';
const usernameCheckUrl = '/api/check-username-availability';

  // Username validation regex (lowercase letters, numbers, underscores, periods only)
  const instagramUsernameRegex = /^[a-z0-9._]+$/;

  // Initialize component
  useEffect(() => {
    // Only check for active processing state, not completed state
    // The dashboards will handle redirecting completed users
        setIsInitializing(false);
  }, []);

  // Check for existing processing state on mount
  useEffect(() => {
    if (processingState.isProcessing && processingState.platform === 'instagram') {
          setIsProcessing(true);
          setIsInitializing(false);
      
      // Restore username from processing state or localStorage
      if (processingState.username) {
        setUsername(processingState.username);
      } else {
        // Fallback to localStorage
        try {
          const processingInfo = localStorage.getItem('instagram_processing_info');
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
      if (!instagramUsernameRegex.test(value)) {
        setUsernameValid(false);
        setUsernameMessage('Username can only contain lowercase letters, numbers, periods, and underscores');
        setUsernameAvailable(null);
        return;
      }

      setUsernameValid(true);
      setIsCheckingUsername(true);

      try {
        const response = await axios.get(`${usernameCheckUrl}/${value}`);
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
    // Convert to lowercase and only allow valid Instagram characters
    const inputValue = e.target.value.toLowerCase();
    setUsername(inputValue);
    
    if (!usernameTouched) {
      setUsernameTouched(true);
    }
  };

  // Function to validate competitor usernames
  const validateCompetitorUsername = (value: string): boolean => {
    return value.trim() === '' || instagramUsernameRegex.test(value);
  };

  // Updated competitor change handler
  const handleCompetitorChange = (index: number, value: string) => {
    // Convert to lowercase for consistency
    const lowercaseValue = value.toLowerCase();
    const newCompetitors = [...competitors];
    newCompetitors[index] = lowercaseValue;
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
      markPlatformAccessed('instagram');
    } else if (currentUser?.uid) {
      // Fallback: set localStorage flag directly
      localStorage.setItem(`instagram_accessed_${currentUser.uid}`, 'true');
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
      platform: 'instagram'
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
        // Now save the user's Instagram username entry state
        await axios.post(`/api/user-instagram-status/${currentUser.uid}`, {
          instagram_username: confirmationData.username,
          accountType: confirmationData.accountType,
          competitors: confirmationData.competitors // Always save competitors
        });
        
        // Save to localStorage immediately for future use
        localStorage.setItem(`instagram_accessed_${currentUser.uid}`, 'true');
        localStorage.setItem(`instagram_username_${currentUser.uid}`, confirmationData.username);
        localStorage.setItem(`instagram_account_type_${currentUser.uid}`, confirmationData.accountType);
        localStorage.setItem(`instagram_competitors_${currentUser.uid}`, JSON.stringify(confirmationData.competitors));
        
        showMessage('Submission successful', 'success');
        
        // Start the processing phase using unified ProcessingContext
        startProcessing('instagram', confirmationData.username, 2); // 2 minutes duration (reduced from 15)
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

  if (isProcessing) {
    return (
      <ProcessingLoadingState
        platform="instagram"
        username={username}
        onComplete={handleProcessingComplete}
      />
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
        <h1 className="title">Instagram Setup</h1>
        
        <div className="importance-notice">
          <div className="importance-icon">⚠️</div>
          <p><strong>Critical Setup:</strong> This information initiates a 2-minute AI analysis process. Please ensure all details are accurate before submission.</p>
        </div>

        <div className="section">
          <h2 className="subtitle">
            Username 
            <span className="critical-field">CRITICAL</span>
          </h2>
          <motion.div className="input-group" whileHover={{ x: 5 }}>
            <input
              value={username}
              onChange={handleUsernameChange}
              type="text"
              placeholder="Enter your Instagram username (lowercase only)"
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
                ? 'Use only lowercase letters, numbers, periods, underscores'
                : usernameAvailable
                ? 'Username is available!'
                : 'You can go ahead but this is already taken'}
            </motion.div>
          )}
          <div className="field-description">
            <p><strong>Why this matters:</strong> Your username is the foundation for all AI-generated content, competitor analysis, and strategic recommendations.</p>
            <ul>
              <li>✓ Must be your exact Instagram username (lowercase only)</li>
              <li>✓ Only lowercase letters, numbers, periods, and underscores</li>
              <li>✓ No spaces or special characters</li>
              <li>✓ This will be used for 2 minutes of AI processing</li>
            </ul>
          </div>
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
          <div className="field-description">
            <p><strong>Account Type Impact:</strong></p>
            <ul>
              <li><strong>Branding:</strong> Business promotion, product marketing, brand awareness</li>
              <li><strong>Non-Branding:</strong> Personal content, lifestyle, entertainment focus</li>
            </ul>
          </div>
        </div>

        <div className="section">
          <h2 className="subtitle">Posting Style</h2>
          <motion.div className="input-group" whileHover={{ x: 5 }}>
            <input
              type="text"
              value={postingStyle}
              onChange={(e) => setPostingStyle(e.target.value)}
              placeholder="Describe your posting style (e.g., casual, professional, lifestyle)"
            />
          </motion.div>
          <div className="field-description">
            <p><strong>AI Training Data:</strong> This helps our AI understand your voice and create content that matches your style.</p>
            <p><em>Examples:</em> "Professional and informative with occasional humor" or "Casual and relatable lifestyle content"</p>
          </div>
        </div>

        <div className="section">
          <h2 className="subtitle">Competitors (at least 3 required)</h2>
          <div className="section-description">
            <p><strong>Strategic Intelligence:</strong> These competitors will be analyzed to understand market trends, content strategies, and engagement patterns.</p>
          </div>
          
          <div className="competitors-container">
            {competitors.map((competitor, index) => (
              <motion.div
                key={index}
                className="competitor-input-group"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="competitor-header">
                  <label className="competitor-label">
                    Competitor {index + 1} {index < 3 ? '*' : ''}
                    {index < 3 && <span className="required-badge">Required</span>}
                  </label>
                  {index < 3 && (
                    <div className="competitor-hint">
                      Choose an Instagram account that represents your target market or content niche
                    </div>
                  )}
                </div>
                
                <div className="competitor-input-wrapper">
                  <input
                    value={competitor}
                    onChange={(e) => handleCompetitorChange(index, e.target.value)}
                    type="text"
                    placeholder={`Enter competitor ${index + 1}`}
                    className={`competitor-input ${competitor && !validateCompetitorUsername(competitor) ? 'invalid-input' : ''}`}
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
                </div>
                
                {competitor && !validateCompetitorUsername(competitor) && (
                  <div className="validation-error">
                    Invalid competitor username format
                  </div>
                )}
              </motion.div>
            ))}
          </div>
          
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
              <span>Review & Submit Setup</span>
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
              <p><strong>Please verify your information before starting the 2-minute AI analysis:</strong></p>
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
                <p><strong>⚠️ Important:</strong> Once submitted, this will initiate a 2-minute AI analysis process. Make sure all information is correct!</p>
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

export default IG_EntryUsernames;