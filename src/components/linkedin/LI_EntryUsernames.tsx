import React, { useState, ChangeEvent, useEffect, useCallback } from 'react';
import axios from 'axios';
import { createPortal } from 'react-dom';
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
  const [profileUrl, setProfileUrl] = useState<string>('');
  const [professionalFocus, setProfessionalFocus] = useState<string>('');
  // Competitors (username + URL) to mirror Facebook format
  const [competitors, setCompetitors] = useState<Array<{ name: string; url: string }>>([
    { name: '', url: '' },
    { name: '', url: '' },
    { name: '', url: '' }
  ]);
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
  const [urlTouched, setUrlTouched] = useState<boolean>(false);
  
  // New state for pre-submission confirmation
  const [showConfirmation, setShowConfirmation] = useState<boolean>(false);
  const [confirmationData, setConfirmationData] = useState<any>(null);
  
  const { currentUser } = useAuth();
  const { startProcessing, processingState } = useProcessing();

  // Lock background scroll when modal is open for proper viewport centering
  useEffect(() => {
    const root = document.documentElement;
    if (showConfirmation) {
      root.classList.add('modal-open');
      document.body.classList.add('modal-open');
    } else {
      root.classList.remove('modal-open');
      document.body.classList.remove('modal-open');
    }
    return () => {
      root.classList.remove('modal-open');
      document.body.classList.remove('modal-open');
    };
  }, [showConfirmation]);

  // LinkedIn-specific endpoints
  const usernameCheckUrl = '/api/check-username-availability';

  // LinkedIn username validation regex (alphanumeric, hyphens, and underscores)
  const linkedinUsernameRegex = /^[a-zA-Z0-9-_]+$/;
  // LinkedIn URL validation (supports profiles and company pages)
  const linkedinUrlRegex = /^https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9._%\-]+(\/|$)/;

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
            if (info.accountData?.url) {
              setProfileUrl(info.accountData.url);
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

  const handleUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
    setProfileUrl(e.target.value);
    if (!urlTouched) setUrlTouched(true);
  };

  const validateLinkedInUrl = (value: string): boolean => {
    if (!value.trim()) return false; // required
    return linkedinUrlRegex.test(value.trim());
  };

  // (removed) validateConnectionUsername was used for old industry connections flow

  // Competitor change handler (name or url)
  const handleCompetitorChange = (
    index: number,
    field: 'name' | 'url',
    value: string
  ) => {
    const newCompetitors = [...competitors];
    if (field === 'name') {
      // Enforce username format like Facebook (no spaces, allowed chars)
      const cleaned = value.replace(/\s+/g, '').replace(/[^a-zA-Z0-9._-]/g, '');
      newCompetitors[index] = { ...newCompetitors[index], name: cleaned };
    } else {
      newCompetitors[index] = { ...newCompetitors[index], url: value };
    }
    setCompetitors(newCompetitors);
  };

  const isValidForSubmission = (): boolean => {
    if (!username.trim() || !accountType || !professionalFocus.trim()) return false;
    if (!profileUrl.trim() || !validateLinkedInUrl(profileUrl)) return false;
    if (!usernameValid) return false;

    // Competitors validation mirrored from Facebook (first 3 required with valid formats)
    if (competitors.length < 3) return false;
    const usernameRegex = /^[a-zA-Z0-9._-]+$/;
    // First 3 must have both fields and valid username
    if (!competitors.slice(0, 3).every(c => c.name.trim() !== '' && c.url.trim() !== '')) return false;
    if (!competitors.slice(0, 3).every(c => usernameRegex.test(c.name.trim()))) return false;
    // All competitor URLs must be valid when provided
    if (!competitors.every(c => !c.url.trim() || validateLinkedInUrl(c.url))) return false;
    return true;
  };

  const validationErrors = (): string[] => {
    const errors: string[] = [];
    if (!username.trim()) errors.push('Username is required');
    else if (!usernameValid) errors.push('Username format is invalid');
    
    if (!accountType) errors.push('Account type is required');
    if (!profileUrl.trim()) errors.push('LinkedIn URL is required');
    else if (!validateLinkedInUrl(profileUrl)) errors.push('LinkedIn URL format is invalid');
    if (!professionalFocus.trim()) errors.push('Professional focus is required');
    
    // Competitors validation
    if (competitors.length < 3) errors.push('At least 3 competitors are required');
    const usernameRegex = /^[a-zA-Z0-9._-]+$/;
    competitors.forEach((c, index) => {
      if (index < 3) {
        if (!c.name.trim()) errors.push(`Competitor ${index + 1} username is required`);
        if (!c.url.trim()) errors.push(`Competitor ${index + 1} URL is required`);
        if (c.name.trim() && !usernameRegex.test(c.name.trim())) {
          errors.push(`Competitor ${index + 1} username format is invalid`);
        }
      }
      if (c.url.trim() && !validateLinkedInUrl(c.url)) {
        errors.push(`Competitor ${index + 1} URL format is invalid`);
      }
    });
    
    return errors;
  };

  const addCompetitor = () => {
    if (competitors.length >= 10) return;
    setCompetitors([...competitors, { name: '', url: '' }]);
  };

  const removeCompetitor = (index: number) => {
    if (competitors.length > 3) {
      setCompetitors(competitors.filter((_, i) => i !== index));
    }
  };

  const resetForm = () => {
    setUsername('');
    setAccountType('professional');
    setProfileUrl('');
    setProfessionalFocus('');
    setCompetitors([
      { name: '', url: '' },
      { name: '', url: '' },
      { name: '', url: '' }
    ]);
    setUsernameAvailable(null);
    setUsernameMessage('');
    setUsernameTouched(false);
    setUrlTouched(false);
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
    const finalCompetitors = competitors.filter(comp => comp.name.trim() !== '' && comp.url.trim() !== '');
    const dataToConfirm = {
      // New structure aligned with Facebook for primary account mapping
      accountData: {
        name: username.trim(),
        url: profileUrl.trim()
      },
      // Backward-compatible fields
      username: username.trim(),
      accountType,
      competitors: finalCompetitors.map(c => c.name), // names only for compatibility
      // Include full competitor data for confirmation modal display
      competitor_data: finalCompetitors,
      postingStyle: professionalFocus.trim() || 'General professional focus',
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
      const response = await axios.post('/api/save-account-info', {
        ...confirmationData,
        platform: 'linkedin',
      }, {
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
        // Preserve full competitor objects for LI-specific flows
        try {
          localStorage.setItem(
            `linkedin_competitor_data_${currentUser.uid}`,
            JSON.stringify(confirmationData.competitor_data || [])
          );
        } catch {}
        // Store accountData like Facebook for consistent structure
        localStorage.setItem(
          `linkedin_account_data_${currentUser.uid}`,
          JSON.stringify(confirmationData.accountData)
        );

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
                  onChange={handleUsernameChange}
                  placeholder="e.g., john-doe-123 (from your LinkedIn URL)"
                  className={`form-input ${usernameTouched && !usernameValid ? 'invalid' : ''}`}
                  disabled={isLoading}
                />
                <div className="username-counter">
                  Characters: {username.length} / 100
                  {username.length > 80 && (
                    <span className="counter-warning"> (Username getting long)</span>
                  )}
                </div>
                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label htmlFor="linkedin-url">
                    Your LinkedIn Profile/Company URL * 
                    <span className="critical-field">CRITICAL</span>
                  </label>
                  <input
                    type="url"
                    id="linkedin-url"
                    value={profileUrl}
                    onChange={handleUrlChange}
                    placeholder="https://linkedin.com/in/your-username or https://linkedin.com/company/your-company"
                    className={`form-input ${urlTouched && (!profileUrl.trim() || !validateLinkedInUrl(profileUrl)) ? 'invalid' : ''}`}
                    disabled={isLoading}
                  />
                  {urlTouched && (!profileUrl.trim() || !validateLinkedInUrl(profileUrl)) && (
                    <div className="error-message">Please enter a valid LinkedIn URL (profile: /in/..., company: /company/...)</div>
                  )}
                </div>
                <div className="field-description">
                  <p><strong>LinkedIn Username:</strong> This is the unique identifier from your LinkedIn profile URL (linkedin.com/in/your-username).</p>
                  <ul>
                    <li>✓ Must be a valid LinkedIn username</li>
                    <li>✓ Can contain letters, numbers, hyphens, and underscores</li>
                    <li>✓ Used for AI analysis and industry research</li>
                    <li>✓ URL will be scraped for 15 minutes of AI processing</li>
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
              <h2>Competitor Analysis</h2>
              <div className="section-description">
                <p><strong>Strategic Intelligence:</strong> These competitors will be analyzed to understand market trends, content strategies, and engagement patterns.</p>
                <div className="competitor-format-notice">
                  <strong>⚠️ Important:</strong> Competitor names must follow username format (no spaces, only letters, numbers, dots, underscores, and hyphens)
                </div>
              </div>

              <div className="competitors-container">
                {competitors.map((competitor, index) => (
                  <div key={index} className="competitor-input-group">
                    <div className="competitor-header">
                      <span>Competitor {index + 1}</span>
                      {competitors.length > 3 && (
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

                    <div className="competitor-input-wrapper">
                      <input
                        type="text"
                        value={competitor.name}
                        onChange={(e) => handleCompetitorChange(index, 'name', e.target.value)}
                        placeholder={`Competitor ${index + 1} username`}
                        className="form-input"
                        disabled={isLoading}
                      />
                      <input
                        type="url"
                        value={competitor.url}
                        onChange={(e) => handleCompetitorChange(index, 'url', e.target.value)}
                        placeholder="https://linkedin.com/in/... or https://linkedin.com/company/..."
                        className={`form-input ${competitor.url && !validateLinkedInUrl(competitor.url) ? 'error' : ''}`}
                        disabled={isLoading}
                      />
                    </div>

                    {competitor.url && !validateLinkedInUrl(competitor.url) && (
                      <div className="error-message">Please enter a valid LinkedIn URL for this competitor.</div>
                    )}
                  </div>
                ))}
              </div>

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
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label htmlFor="linkedin-url">
                  Your LinkedIn Profile/Company URL * 
                  <span className="critical-field">CRITICAL</span>
                </label>
                <input
                  type="url"
                  id="linkedin-url"
                  value={profileUrl}
                  onChange={handleUrlChange}
                  placeholder="https://linkedin.com/in/your-username or https://linkedin.com/company/your-company"
                  className={`form-input ${urlTouched && (!profileUrl.trim() || !validateLinkedInUrl(profileUrl)) ? 'invalid' : ''}`}
                  disabled={isLoading}
                />
                {urlTouched && (!profileUrl.trim() || !validateLinkedInUrl(profileUrl)) && (
                  <div className="error-message">Please enter a valid LinkedIn URL (profile: /in/..., company: /company/...)</div>
                )}
                <div className="field-description">
                  <p><strong>LinkedIn URL:</strong> This is the actual LinkedIn profile or company page URL that will be scraped for AI analysis.</p>
                  <ul>
                    <li>✓ Must be a valid LinkedIn URL</li>
                    <li>✓ Format: https://linkedin.com/in/your-username or https://linkedin.com/company/your-company</li>
                    <li>✓ Profile must not be locked/private</li>
                    <li>✓ This URL will be scraped during processing</li>
                  </ul>
                </div>
              </div>
              <div className="field-description">
                <p><strong>LinkedIn Username:</strong> This is the unique identifier from your LinkedIn profile URL (linkedin.com/in/your-username).</p>
                <ul>
                  <li>✓ Must be a valid LinkedIn username</li>
                  <li>✓ Can contain letters, numbers, hyphens, and underscores</li>
                  <li>✓ Used for AI analysis and industry research</li>
                  <li>✓ URL will be scraped for 15 minutes of AI processing</li>
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
            <h2>Competitor Analysis</h2>
            <div className="section-description">
              <p><strong>Strategic Intelligence:</strong> These competitors will be analyzed to understand market trends, content strategies, and engagement patterns.</p>
              <div className="competitor-format-notice">
                <strong>⚠️ Important:</strong> Competitor names must follow username format (no spaces, only letters, numbers, dots, underscores, and hyphens)
              </div>
            </div>

            <div className="competitors-container">
              {competitors.map((competitor, index) => (
                <div key={index} className="competitor-input-group">
                  <div className="competitor-header">
                    <span>Competitor {index + 1}</span>
                    {competitors.length > 3 && (
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

                  <div className="competitor-input-wrapper">
                    <input
                      type="text"
                      value={competitor.name}
                      onChange={(e) => handleCompetitorChange(index, 'name', e.target.value)}
                      placeholder={`Competitor ${index + 1} username`}
                      className="form-input"
                      disabled={isLoading}
                    />
                    <input
                      type="url"
                      value={competitor.url}
                      onChange={(e) => handleCompetitorChange(index, 'url', e.target.value)}
                      placeholder="https://linkedin.com/in/... or https://linkedin.com/company/..."
                      className={`form-input ${competitor.url && !validateLinkedInUrl(competitor.url) ? 'error' : ''}`}
                      disabled={isLoading}
                    />
                  </div>

                  {competitor.url && !validateLinkedInUrl(competitor.url) && (
                    <div className="error-message">Please enter a valid LinkedIn URL for this competitor.</div>
                  )}
                </div>
              ))}
            </div>

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

      {/* Confirmation Modal (ported to document.body for a true full-screen overlay) */}
      {showConfirmation && confirmationData && createPortal(
        (
          <div className="modal-overlay li-modal-overlay">
            <div className="confirmation-modal">
              <h3>Confirm Your LinkedIn Setup</h3>
              <div className="confirmation-details">
                <p><strong>Username:</strong> {confirmationData.accountData?.name || confirmationData.username}</p>
                <p><strong>URL:</strong> {confirmationData.accountData?.url}</p>
                <p><strong>Account Type:</strong> {confirmationData.accountType === 'professional' ? 'Professional Account' : 'Personal Account'}</p>
                <p><strong>Professional Focus:</strong> {confirmationData.postingStyle}</p>
                <p><strong>Competitors ({confirmationData.competitor_data?.length || 0}):</strong></p>
                <ul>
                  {(confirmationData.competitor_data || []).map((comp: { name: string; url: string }, index: number) => (
                    <li key={index}><strong>{comp.name}</strong> — {comp.url}</li>
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
        ),
        document.body
      )}
    </motion.div>
  );
};

export default LI_EntryUsernames;
