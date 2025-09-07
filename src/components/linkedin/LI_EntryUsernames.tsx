import React, { useState, ChangeEvent, useEffect, useCallback } from 'react';
import axios from 'axios';
import './LI_EntryUsernames.css'; // Use LinkedIn-specific CSS
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import ProcessingLoadingState from '../common/ProcessingLoadingState';
import { useProcessing } from '../../context/ProcessingContext';

interface LI_EntryUsernamesProps {
  markPlatformAccessed?: (platformId: string) => void; // Function to mark platform as accessed/claimed
  onComplete?: () => void;
}

const LI_EntryUsernames: React.FC<LI_EntryUsernamesProps> = ({ 
  markPlatformAccessed,
  onComplete
}) => {
  const [username, setUsername] = useState<string>('');
  const [accountType, setAccountType] = useState<'professional' | 'personal' | ''>('professional');
  const [professionalFocus, setProfessionalFocus] = useState<string>('');
  const [industryConnections, setIndustryConnections] = useState<string[]>(['', '', '']);
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
  
  const { currentUser } = useAuth();
  const { startProcessing, processingState } = useProcessing();

  // LinkedIn-specific endpoints
  const usernameCheckUrl = '/api/check-username-availability';

  // LinkedIn username validation regex (alphanumeric, hyphens, and underscores)
  const linkedinUsernameRegex = /^[a-zA-Z0-9-_]+$/;

  // Initialize component
  useEffect(() => {
    // Only check for active processing state, not completed state
    // The dashboards will handle redirecting completed users
    setIsInitializing(false);
  }, []);

  // Check for existing processing state on mount
  useEffect(() => {
    if (processingState.isProcessing && processingState.platform === 'linkedin') {
      setIsProcessing(true);
      setIsInitializing(false);
      
      // Restore username from processing state or localStorage
      if (processingState.username) {
        setUsername(processingState.username);
      } else {
        // Fallback to localStorage
        try {
          const processingInfo = localStorage.getItem('linkedin_processing_info');
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
      if (!linkedinUsernameRegex.test(value)) {
        setUsernameValid(false);
        setUsernameMessage('Username can only contain letters, numbers, hyphens, and underscores');
        setUsernameAvailable(null);
        return;
      }

      setUsernameValid(true);
      setIsCheckingUsername(true);

      try {
        const response = await axios.get(`${usernameCheckUrl}/${value}?platform=linkedin`);
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
    // Allow alphanumeric, hyphens, and underscores only
    const inputValue = e.target.value;
    setUsername(inputValue);
    
    if (!usernameTouched) {
      setUsernameTouched(true);
    }
  };

  // Function to validate industry connection usernames
  const validateConnectionUsername = (value: string): boolean => {
    return value.trim() === '' || linkedinUsernameRegex.test(value);
  };

  // Updated industry connection change handler
  const handleConnectionChange = (index: number, value: string) => {
    const newConnections = [...industryConnections];
    newConnections[index] = value;
    setIndustryConnections(newConnections);
  };

  const isValidForSubmission = (): boolean => {
    if (!username.trim() || !accountType || !professionalFocus.trim()) return false;
    if (!usernameValid) return false;
    
    // Require industry connections for both account types
    return industryConnections.length >= 3 && 
           industryConnections.slice(0, 3).every(conn => conn.trim() !== '') &&
           industryConnections.every(validateConnectionUsername);
  };

  const validationErrors = (): string[] => {
    const errors: string[] = [];
    if (!username.trim()) errors.push('Username is required');
    else if (!usernameValid) errors.push('Username format is invalid');
    
    if (!accountType) errors.push('Account type is required');
    if (!professionalFocus.trim()) errors.push('Professional focus is required');
    
    // Require industry connections for both account types
    if (industryConnections.length < 3) errors.push('At least 3 industry connections are required');
    industryConnections.forEach((conn, index) => {
      if (index < 3 && !conn.trim()) {
        errors.push(`Industry connection ${index + 1} username is required`);
      } else if (conn.trim() && !validateConnectionUsername(conn)) {
        errors.push(`Industry connection ${index + 1} username format is invalid`);
      }
    });
    
    return errors;
  };

  const addConnection = () => {
    setIndustryConnections([...industryConnections, '']);
  };

  const removeConnection = (index: number) => {
    if (industryConnections.length > 3) {
      setIndustryConnections(industryConnections.filter((_, i) => i !== index));
    }
  };

  const resetForm = () => {
    setUsername('');
    setAccountType('professional');
    setProfessionalFocus('');
    setIndustryConnections(['', '', '']);
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
      markPlatformAccessed('linkedin');
    } else if (currentUser?.uid) {
      // Fallback: set localStorage flag directly
      localStorage.setItem(`linkedin_accessed_${currentUser.uid}`, 'true');
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
    const finalConnections = industryConnections.filter(conn => conn.trim() !== '');
    const dataToConfirm = {
      username: username.trim(),
      accountType,
      competitors: finalConnections, // Keep as 'competitors' for backend compatibility
      postingStyle: professionalFocus.trim() || 'General professional focus', // Keep as 'postingStyle' for backend compatibility
      platform: 'linkedin'
    };
    
    setConfirmationData(dataToConfirm);
    setShowConfirmation(true);
  };

  const handleConfirmedSubmission = async () => {
    if (!confirmationData || !currentUser?.uid) return;
    
    setIsLoading(true);
    setShowConfirmation(false);

    try {
      // Save to account info API
      const response = await axios.post('/api/save-account-info', confirmationData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      if (response.status === 200) {
        // Now save the user's LinkedIn username entry state
        await axios.post(`/api/user-linkedin-status/${currentUser.uid}`, {
          linkedin_username: confirmationData.username,
          accountType: confirmationData.accountType,
          competitors: confirmationData.competitors
        });
        
        // Save to localStorage immediately for future use
        localStorage.setItem(`linkedin_accessed_${currentUser.uid}`, 'true');
        localStorage.setItem(`linkedin_username_${currentUser.uid}`, confirmationData.username);
        localStorage.setItem(`linkedin_account_type_${currentUser.uid}`, confirmationData.accountType);
        localStorage.setItem(`linkedin_competitors_${currentUser.uid}`, JSON.stringify(confirmationData.competitors));
        
        showMessage('Submission successful', 'success');
        
        // Start the processing phase using unified ProcessingContext
        startProcessing('linkedin', confirmationData.username, 15); // 15 minutes duration
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
        className="linkedin-entry-container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.5 }}
      >
        <div className="linkedin-entry-wrapper">
          <div className="linkedin-entry-header">
            <h1>Setup Your LinkedIn Account</h1>
            <div className="importance-notice">
              <div className="importance-icon">⚠️</div>
              <p><strong>Critical Setup:</strong> This information initiates a 15-minute AI analysis process. Please ensure all details are accurate before submission.</p>
            </div>
          </div>

          <form className="linkedin-entry-form" onSubmit={(e) => { e.preventDefault(); submitData(); }}>
            <div className="form-section">
              <h2>Account Information</h2>
              
              <div className="form-group">
                <label htmlFor="linkedin-username">
                  Your LinkedIn Username * 
                  <span className="critical-field">CRITICAL</span>
                </label>
                <input
                  type="text"
                  id="linkedin-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g., john-doe-123 (from your LinkedIn URL)"
                  className="form-input"
                  disabled={isLoading}
                />
                <div className="username-counter">
                  Characters: {username.length} / 100
                  {username.length > 80 && (
                    <span className="counter-warning"> (Username getting long)</span>
                  )}
                </div>
                <div className="field-description">
                  <p><strong>LinkedIn Username:</strong> This is the unique identifier from your LinkedIn profile URL (linkedin.com/in/your-username).</p>
                  <ul>
                    <li>✓ Must be a valid LinkedIn username</li>
                    <li>✓ Can contain letters, numbers, hyphens, and underscores</li>
                    <li>✓ Used for AI analysis and industry research</li>
                    <li>✓ This will be used for 15 minutes of AI processing</li>
                  </ul>
                  <div className="format-example">
                    <strong>Examples:</strong> "john-doe", "jane-smith-123", "professional_name"
                  </div>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h2>Account Type</h2>
              <div className="account-type-selection">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="accountType"
                    value="professional"
                    checked={accountType === 'professional'}
                    onChange={(e) => setAccountType(e.target.value as 'professional' | 'personal')}
                    disabled={isLoading}
                  />
                  <span className="radio-text">
                    <strong>Professional Account</strong>
                    <span className="radio-description">Business networking, career-focused, thought leadership</span>
                  </span>
                </label>
                
                <label className="radio-label">
                  <input
                    type="radio"
                    name="accountType"
                    value="personal"
                    checked={accountType === 'personal'}
                    onChange={(e) => setAccountType(e.target.value as 'professional' | 'personal')}
                    disabled={isLoading}
                  />
                  <span className="radio-text">
                    <strong>Personal Account</strong>
                    <span className="radio-description">Personal branding, casual networking, individual expression</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="form-section">
              <h2>Professional Focus</h2>
              <div className="form-group">
                <label htmlFor="professional-focus">Professional Focus *</label>
                <textarea
                  id="professional-focus"
                  value={professionalFocus}
                  onChange={(e) => setProfessionalFocus(e.target.value)}
                  placeholder="Describe your professional focus, industry expertise, and content approach..."
                  className="form-textarea"
                  rows={4}
                  disabled={isLoading}
                />
                <div className="field-description">
                  <p><strong>AI Training Data:</strong> This helps our AI understand your professional voice and create content that matches your expertise.</p>
                  <p><em>Examples:</em> "Technology leadership and innovation insights" or "Marketing strategy and digital transformation"</p>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h2>Industry Connections</h2>
              <div className="competitors-section">
                <div className="competitors-header">
                  <h3>Add Industry Professionals</h3>
                  <p>Add up to 5 industry professionals or companies for AI-powered analysis and insights</p>
                </div>
                
                {industryConnections.map((connection, index) => (
                  <div key={index} className="competitor-input-group">
                    <input
                      type="text"
                      value={connection}
                      onChange={(e) => handleConnectionChange(index, e.target.value)}
                      placeholder={`Industry connection ${index + 1} username`}
                      className="form-input"
                      disabled={isLoading}
                    />
                    {industryConnections.length > 3 && (
                      <button
                        type="button"
                        onClick={() => removeConnection(index)}
                        className="remove-competitor-btn"
                        disabled={isLoading}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                
                {industryConnections.length < 5 && (
                  <button
                    type="button"
                    onClick={addConnection}
                    className="add-competitor-btn"
                    disabled={isLoading}
                  >
                    + Add Industry Connection
                  </button>
                )}
                
                <div className="field-description">
                  <p><strong>Industry Analysis:</strong> These professionals help our AI understand your industry landscape and create relevant content.</p>
                  <p><em>Examples:</em> Thought leaders, competitors, industry influencers, or companies in your field</p>
                </div>
              </div>
            </div>

            {message && (
              <div className={`message ${messageType}`}>
                {message}
              </div>
            )}

            <div className="form-actions">
              <button
                type="submit"
                className="submit-btn"
                disabled={isLoading || !isValidForSubmission()}
              >
                {isLoading ? 'Processing...' : 'Start LinkedIn Analysis'}
              </button>
              
              <button
                type="button"
                onClick={resetForm}
                className="reset-btn"
                disabled={isLoading}
              >
                Reset Form
              </button>
            </div>

            {validationErrors().length > 0 && (
              <div className="validation-errors">
                <h4>Please fix the following errors:</h4>
                <ul>
                  {validationErrors().map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </form>
        </div>
      </motion.div>
    );
  }

  // Show processing screen if currently processing
  if (isProcessing) {
    return (
      <ProcessingLoadingState 
        platform="linkedin"
        username={username}
        onComplete={handleProcessingComplete}
      />
    );
  }

  return (
    <motion.div
      className="linkedin-entry-container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
    >
      <div className="linkedin-entry-wrapper">
        <div className="linkedin-entry-header">
          <h1>Setup Your LinkedIn Account</h1>
          <div className="importance-notice">
            <div className="importance-icon">⚠️</div>
            <p><strong>Critical Setup:</strong> This information initiates a 15-minute AI analysis process. Please ensure all details are accurate before submission.</p>
          </div>
        </div>

        <form className="linkedin-entry-form" onSubmit={(e) => { e.preventDefault(); submitData(); }}>
          <div className="form-section">
            <h2>Account Information</h2>
            
            <div className="form-group">
              <label htmlFor="linkedin-username">
                Your LinkedIn Username * 
                <span className="critical-field">CRITICAL</span>
              </label>
              <input
                type="text"
                id="linkedin-username"
                value={username}
                onChange={handleUsernameChange}
                placeholder="e.g., john-doe-123 (from your LinkedIn URL)"
                className={`form-input ${usernameTouched && !usernameValid ? 'invalid' : ''} ${usernameTouched && usernameAvailable === true ? 'valid' : ''} ${usernameTouched && usernameAvailable === false ? 'invalid' : ''}`}
                disabled={isLoading}
              />
              
              {usernameTouched && (
                <div className="username-validation">
                  {isCheckingUsername && <span className="checking">Checking availability...</span>}
                  {!isCheckingUsername && usernameMessage && (
                    <span className={usernameAvailable === true ? 'valid' : 'invalid'}>
                      {usernameMessage}
                    </span>
                  )}
                </div>
              )}
              
              <div className="username-counter">
                Characters: {username.length} / 100
                {username.length > 80 && (
                  <span className="counter-warning"> (Username getting long)</span>
                )}
              </div>
              <div className="field-description">
                <p><strong>LinkedIn Username:</strong> This is the unique identifier from your LinkedIn profile URL (linkedin.com/in/your-username).</p>
                <ul>
                  <li>✓ Must be a valid LinkedIn username</li>
                  <li>✓ Can contain letters, numbers, hyphens, and underscores</li>
                  <li>✓ Used for AI analysis and industry research</li>
                  <li>✓ This will be used for 15 minutes of AI processing</li>
                </ul>
                <div className="format-example">
                  <strong>Examples:</strong> "john-doe", "jane-smith-123", "professional_name"
                </div>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h2>Account Type</h2>
            <div className="account-type-selection">
              <label className="radio-label">
                <input
                  type="radio"
                  name="accountType"
                  value="professional"
                  checked={accountType === 'professional'}
                  onChange={(e) => setAccountType(e.target.value as 'professional' | 'personal')}
                  disabled={isLoading}
                />
                <span className="radio-text">
                  <strong>Professional Account</strong>
                  <span className="radio-description">Business networking, career-focused, thought leadership</span>
                </span>
              </label>
              
              <label className="radio-label">
                <input
                  type="radio"
                  name="accountType"
                  value="personal"
                  checked={accountType === 'personal'}
                  onChange={(e) => setAccountType(e.target.value as 'professional' | 'personal')}
                  disabled={isLoading}
                />
                <span className="radio-text">
                  <strong>Personal Account</strong>
                  <span className="radio-description">Personal branding, casual networking, individual expression</span>
                </span>
              </label>
            </div>
          </div>

          <div className="form-section">
            <h2>Professional Focus</h2>
            <div className="form-group">
              <label htmlFor="professional-focus">Professional Focus *</label>
              <textarea
                id="professional-focus"
                value={professionalFocus}
                onChange={(e) => setProfessionalFocus(e.target.value)}
                placeholder="Describe your professional focus, industry expertise, and content approach..."
                className="form-textarea"
                rows={4}
                disabled={isLoading}
              />
              <div className="field-description">
                <p><strong>AI Training Data:</strong> This helps our AI understand your professional voice and create content that matches your expertise.</p>
                <p><em>Examples:</em> "Technology leadership and innovation insights" or "Marketing strategy and digital transformation"</p>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h2>Industry Connections</h2>
            <div className="competitors-section">
              <div className="competitors-header">
                <h3>Add Industry Professionals</h3>
                <p>Add up to 5 industry professionals or companies for AI-powered analysis and insights</p>
              </div>
              
              {industryConnections.map((connection, index) => (
                <div key={index} className="competitor-input-group">
                  <input
                    type="text"
                    value={connection}
                    onChange={(e) => handleConnectionChange(index, e.target.value)}
                    placeholder={`Industry connection ${index + 1} username`}
                    className={`form-input ${connection.trim() && !validateConnectionUsername(connection) ? 'invalid' : ''}`}
                    disabled={isLoading}
                  />
                  {industryConnections.length > 3 && (
                    <button
                      type="button"
                      onClick={() => removeConnection(index)}
                      className="remove-competitor-btn"
                      disabled={isLoading}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              
              {industryConnections.length < 5 && (
                <button
                  type="button"
                  onClick={addConnection}
                  className="add-competitor-btn"
                  disabled={isLoading}
                >
                  + Add Industry Connection
                </button>
              )}
              
              <div className="field-description">
                <p><strong>Industry Analysis:</strong> These professionals help our AI understand your industry landscape and create relevant content.</p>
                <p><em>Examples:</em> Thought leaders, competitors, industry influencers, or companies in your field</p>
              </div>
            </div>
          </div>

          {message && (
            <div className={`message ${messageType}`}>
              {message}
            </div>
          )}

          <div className="form-actions">
            <button
              type="submit"
              className="submit-btn"
              disabled={isLoading || !isValidForSubmission()}
            >
              {isLoading ? 'Processing...' : 'Start LinkedIn Analysis'}
            </button>
            
            <button
              type="button"
              onClick={resetForm}
              className="reset-btn"
              disabled={isLoading}
            >
              Reset Form
            </button>
          </div>

          {validationErrors().length > 0 && (
            <div className="validation-errors">
              <h4>Please fix the following errors:</h4>
              <ul>
                {validationErrors().map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && confirmationData && (
        <div className="modal-overlay">
          <div className="confirmation-modal">
            <h3>Confirm Your LinkedIn Setup</h3>
            <div className="confirmation-details">
              <p><strong>Username:</strong> {confirmationData.username}</p>
              <p><strong>Account Type:</strong> {confirmationData.accountType === 'professional' ? 'Professional Account' : 'Personal Account'}</p>
              <p><strong>Professional Focus:</strong> {confirmationData.postingStyle}</p>
              <p><strong>Industry Connections:</strong></p>
              <ul>
                {confirmationData.competitors.map((connection: string, index: number) => (
                  <li key={index}>{connection}</li>
                ))}
              </ul>
            </div>
            <div className="confirmation-warning">
              <p><strong>⚠️ Important:</strong> This will start a 15-minute AI analysis process. Make sure all information is correct.</p>
            </div>
            <div className="confirmation-actions">
              <button 
                onClick={handleConfirmedSubmission}
                className="confirm-btn"
                disabled={isLoading}
              >
                {isLoading ? 'Starting Analysis...' : 'Confirm & Start Analysis'}
              </button>
              <button 
                onClick={() => setShowConfirmation(false)}
                className="cancel-btn"
                disabled={isLoading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default LI_EntryUsernames;
