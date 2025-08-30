import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './FB_EntryUsernames.css';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ProcessingLoadingState from '../common/ProcessingLoadingState';
import { useProcessing } from '../../context/ProcessingContext';

interface FB_EntryUsernamesProps {
  onSubmitSuccess: (accountData: any, competitors: any[], accountType: 'branding' | 'non-branding') => void;
  redirectIfCompleted?: boolean;
  markPlatformAccessed?: (platformId: string) => void;
  onComplete?: () => void;
}

interface AccountData {
  name: string;
  url: string;
}

interface CompetitorData {
  name: string;
  url: string;
}

const FB_EntryUsernames: React.FC<FB_EntryUsernamesProps> = ({ 
  onSubmitSuccess, 
  redirectIfCompleted = true,
  markPlatformAccessed,
  onComplete
}) => {
  const [accountData, setAccountData] = useState<AccountData>({ name: '', url: '' });
  const [accountType, setAccountType] = useState<'branding' | 'non-branding'>('branding');
  const [postingStyle, setPostingStyle] = useState<string>('');
  const [competitors, setCompetitors] = useState<CompetitorData[]>([
    { name: '', url: '' },
    { name: '', url: '' },
    { name: '', url: '' }
  ]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'info' | 'success' | 'error'>('info');
  
  // New state for pre-submission confirmation
  const [showConfirmation, setShowConfirmation] = useState<boolean>(false);
  const [confirmationData, setConfirmationData] = useState<any>(null);
  
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { startProcessing, processingState } = useProcessing();

  // const apiUrl = '/api/save-account-info';

  // Facebook URL validation - supports both pages and profiles with IDs
  const facebookUrlRegex = /^https?:\/\/(www\.)?facebook\.com\/([a-zA-Z0-9._%+-]+|profile\.php\?id=\d+)\/?$/;

  // Initialize component
  useEffect(() => {
    setIsInitializing(false);
  }, []);

  useEffect(() => {
    const checkUserStatus = async () => {
      if (!currentUser || !currentUser.uid) {
        console.error('No authenticated user found');
        setIsInitializing(false);
        return;
      }
      
      // First check localStorage as primary source of truth
      const hasAccessed = localStorage.getItem(`facebook_accessed_${currentUser.uid}`) === 'true';
      
      if (hasAccessed && redirectIfCompleted) {
        // User has already accessed, try to get saved data from localStorage or backend
        const savedAccountData = JSON.parse(localStorage.getItem(`facebook_account_data_${currentUser.uid}`) || '{}');
        const savedAccountType = localStorage.getItem(`facebook_account_type_${currentUser.uid}`) as 'branding' | 'non-branding' || 'branding';
        const savedCompetitors = JSON.parse(localStorage.getItem(`facebook_competitors_${currentUser.uid}`) || '[]');
        
        if (savedAccountData.name && savedAccountData.url) {
          onSubmitSuccess(savedAccountData, savedCompetitors, savedAccountType);
          
          if (savedAccountType === 'branding') {
            navigate('/facebook-dashboard', { 
              state: { 
                accountData: savedAccountData, 
                competitors: savedCompetitors,
                accountType: 'branding',
                platform: 'facebook'
              } 
            });
          } else {
            navigate('/facebook-non-branding-dashboard', { 
              state: { 
                accountData: savedAccountData,
                competitors: savedCompetitors,
                accountType: 'non-branding',
                platform: 'facebook'
              } 
            });
          }
          return;
        }
      }
      
      // If not in localStorage, just show the form
      setIsInitializing(false);
    };
    
    checkUserStatus();
  }, [currentUser, navigate, onSubmitSuccess, redirectIfCompleted]);

  const validateFacebookUrl = (url: string): boolean => {
    if (!url.trim()) return true; // Empty is valid (optional field)
    return facebookUrlRegex.test(url.trim());
  };

  const handleAccountDataChange = (field: 'name' | 'url', value: string) => {
    if (field === 'name') {
      // Remove spaces and special characters for username format
      const cleanedValue = value.replace(/\s+/g, '').replace(/[^a-zA-Z0-9._-]/g, '');
      setAccountData(prev => ({
        ...prev,
        [field]: cleanedValue
      }));
    } else {
      setAccountData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleCompetitorChange = (index: number, field: 'name' | 'url', value: string) => {
    const newCompetitors = [...competitors];
    if (field === 'name') {
      // Remove spaces and special characters for username format
      const cleanedValue = value.replace(/\s+/g, '').replace(/[^a-zA-Z0-9._-]/g, '');
      newCompetitors[index] = {
        ...newCompetitors[index],
        [field]: cleanedValue
      };
    } else {
      newCompetitors[index] = {
        ...newCompetitors[index],
        [field]: value
      };
    }
    setCompetitors(newCompetitors);
  };

  const isValidForSubmission = (): boolean => {
    // Check basic required fields
    if (!accountData.name.trim() || !accountData.url.trim() || !accountType || !postingStyle.trim()) return false;
    
    // Check account name format (must be username format - no spaces, only valid characters)
    const usernameRegex = /^[a-zA-Z0-9._-]+$/;
    if (!usernameRegex.test(accountData.name.trim())) return false;
    
    // Check URL format validity
    if (!validateFacebookUrl(accountData.url)) return false;
    
    // Check competitors (first 3 are required)
    if (competitors.length < 3) return false;
    if (!competitors.slice(0, 3).every(comp => comp.name.trim() !== '' && comp.url.trim() !== '')) return false;
    
    // Check competitor name format (must be username format - no spaces, only valid characters)
    if (!competitors.slice(0, 3).every(comp => usernameRegex.test(comp.name.trim()))) return false;
    
    if (!competitors.every(comp => !comp.url.trim() || validateFacebookUrl(comp.url))) return false;
    
    return true;
  };

  // validationErrors helper removed (unused)

  const addCompetitor = () => {
    setCompetitors([...competitors, { name: '', url: '' }]);
  };

  const removeCompetitor = (index: number) => {
    if (competitors.length > 3) {
      const newCompetitors = competitors.filter((_, i) => i !== index);
      setCompetitors(newCompetitors);
    }
  };

  const resetForm = () => {
    setAccountData({ name: '', url: '' });
    setAccountType('branding');
    setPostingStyle('');
    setCompetitors([
      { name: '', url: '' },
      { name: '', url: '' },
      { name: '', url: '' }
    ]);
    setMessage('');
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
      markPlatformAccessed('facebook');
    } else if (currentUser?.uid) {
      // Fallback: set localStorage flag directly
      localStorage.setItem(`facebook_accessed_${currentUser.uid}`, 'true');
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
        // New format for enhanced functionality
        accountData: {
          name: accountData.name.trim(),
          url: accountData.url.trim()
        },
        // Backward compatibility - maintain old format for API
        username: accountData.name.trim(),
        accountType,
        competitors: finalCompetitors.map(comp => comp.name), // Send competitor names as strings for backward compatibility
        // Include full competitor data for confirmation modal display
        competitor_data: finalCompetitors,
        postingStyle: postingStyle.trim() || 'General posting style',
        platform: 'facebook'
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

      // Log the data being sent for debugging
      console.log('Submitting Facebook data:', confirmationData);

      // Save to account info API (send augmented facebook payload including URLs)
      const response = await axios.post(apiUrl, {
        ...confirmationData,
        // Ensure platform stays facebook and payload shape includes full competitor_data
        platform: 'facebook',
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      
      // ✅ CRITICAL FIX: Also save to user-facebook-status endpoint for MainDashboard sync
      await axios.post(`/api/user-facebook-status/${currentUser.uid}`, {
        facebook_username: confirmationData.accountData.name
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      
      console.log(`[FB_EntryUsernames] ✅ Facebook status persisted to backend for user ${currentUser.uid}`);

      if (response.status === 200) {
        console.log('Account info saved successfully to R2!');
        
        // Save to localStorage immediately for future use
        localStorage.setItem(`facebook_accessed_${currentUser.uid}`, 'true');
        localStorage.setItem(
          `facebook_account_data_${currentUser.uid}`,
          JSON.stringify(confirmationData.accountData)
        );
        localStorage.setItem(
          `facebook_account_type_${currentUser.uid}`,
          confirmationData.accountType
        );
        // Store competitor names where the app expects them
        try {
          const competitorNames = Array.isArray(confirmationData.competitor_data)
            ? confirmationData.competitor_data
                .map((c: any) => (c && typeof c.name === 'string' ? c.name : ''))
                .filter((n: string) => n && n.trim() !== '')
            : [];
          localStorage.setItem(
            `facebook_competitors_${currentUser.uid}`,
            JSON.stringify(competitorNames)
          );
          // Preserve full competitor objects for FB-specific flows
          localStorage.setItem(
            `facebook_competitor_data_${currentUser.uid}`,
            JSON.stringify(confirmationData.competitor_data)
          );
        } catch {}
        // ✅ CRITICAL FIX: Dashboard username remains unchanged for routing
        // This is the original dashboard username entered by user, never overwrite with connected page name
        localStorage.setItem(
          `facebook_username_${currentUser.uid}`,
          confirmationData.accountData.name
        );
        
        console.log(`[FB_EntryUsernames] ✅ COMPLETE: Account info + status both saved to backend`);
        showMessage('Submission successful', 'success');
        
        // Start the processing phase using unified ProcessingContext
        startProcessing('facebook', confirmationData.accountData.name, 2); // 2 minutes duration (reduced from 20)
      }
    } catch (error: any) {
      console.error('Error submitting Facebook data:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      const errorMessage = error.response?.data?.error || 'Failed to save Facebook account information. Please try again.';
      showMessage(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Check for existing processing state on mount
  useEffect(() => {
    if (processingState.isProcessing && processingState.platform === 'facebook') {
      setIsProcessing(true);
      setIsInitializing(false);
      
              // Restore account data from processing state or localStorage
        if (processingState.username) {
          setAccountData(prev => ({ ...prev, name: processingState.username || '' }));
        } else {
          // Fallback to localStorage
          try {
            const processingInfo = localStorage.getItem('facebook_processing_info');
            if (processingInfo) {
              const info = JSON.parse(processingInfo);
              if (info.accountData) {
                setAccountData(info.accountData);
              }
            }
          } catch (error) {
            console.error('Error reading account data from localStorage:', error);
          }
        }
    } else {
      // No active processing, show the form
      setIsInitializing(false);
    }
  }, [processingState]);

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
        platform="facebook"
        username={accountData.name}
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
                      <div className="importance-notice">
              <div className="importance-icon">⚠️</div>
              <p><strong>Critical Setup:</strong> This information initiates a 2-minute AI analysis process. Please ensure all details are accurate before submission.</p>
            </div>
        </div>

        <form className="fb-entry-form" onSubmit={(e) => { e.preventDefault(); submitData(); }}>
          <div className="form-section">
            <h2>Account Information</h2>
            
            <div className="form-group">
              <label htmlFor="facebook-account-name">
                Your Facebook Account Name * 
                <span className="critical-field">CRITICAL</span>
              </label>
              <input
                type="text"
                id="facebook-account-name"
                value={accountData.name}
                onChange={(e) => handleAccountDataChange('name', e.target.value)}
                placeholder="e.g., YourBrandName (no spaces allowed)"
                className="form-input"
                disabled={isLoading}
              />
              {accountData.name.includes(' ') && (
                <div className="format-warning">
                  ⚠️ Spaces detected and automatically removed for username format
                </div>
              )}
              <div className="username-counter">
                Characters: {accountData.name.length} / 50
                {accountData.name.length > 30 && (
                  <span className="counter-warning"> (Username getting long)</span>
                )}
              </div>
              <div className="field-description">
                <p><strong>Account Name:</strong> This is the display name that will be mapped to your Facebook URL for AI analysis.</p>
                <ul>
                  <li>✓ Must be a single word (no spaces allowed)</li>
                  <li>✓ Only letters, numbers, dots, underscores, and hyphens allowed</li>
                  <li>✓ Spaces will be automatically removed</li>
                  <li>✓ This name will be mapped to your Facebook URL</li>
                  <li>✓ Used for 2 minutes of AI processing</li>
                </ul>
                <div className="format-example">
                  <strong>Examples:</strong> "YourBrandName", "YourName", "Brand_123", "Company-Name"
                </div>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="facebook-account-url">
                Your Facebook Page/Profile URL * 
                <span className="critical-field">CRITICAL</span>
              </label>
              <input
                type="url"
                id="facebook-account-url"
                value={accountData.url}
                onChange={(e) => handleAccountDataChange('url', e.target.value)}
                placeholder="https://facebook.com/yourpage or https://facebook.com/yourprofile"
                className={`form-input ${accountData.url && !validateFacebookUrl(accountData.url) ? 'error' : ''}`}
                disabled={isLoading}
              />
              {accountData.url && !validateFacebookUrl(accountData.url) && (
                <div className="error-message">Please enter a valid Facebook URL (e.g., https://facebook.com/yourpage or https://facebook.com/profile.php?id=123456789)</div>
              )}
                              <div className="field-description">
                  <p><strong>Facebook URL:</strong> This is the actual Facebook page or profile URL that will be scraped for AI analysis.</p>
                  <ul>
                    <li>✓ Must be a valid Facebook page or profile URL</li>
                    <li>✓ Format: https://facebook.com/yourpage or https://facebook.com/profile.php?id=123456789</li>
                    <li>✓ Profile must not be locked/private</li>
                    <li>✓ This URL will be scraped for 2 minutes</li>
                  </ul>
                </div>
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
              <div className="field-description">
                <p><strong>Account Type Impact:</strong></p>
                <ul>
                  <li><strong>Branding:</strong> Business promotion, product marketing, brand awareness</li>
                  <li><strong>Non-Branding:</strong> Personal content, lifestyle, entertainment focus</li>
                </ul>
              </div>
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
              <div className="field-description">
                <p><strong>AI Training Data:</strong> This helps our AI understand your voice and create content that matches your style.</p>
                <p><em>Examples:</em> "Professional and informative with occasional humor" or "Casual and relatable lifestyle content"</p>
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
                    <label className="competitor-label">
                      Competitor {index + 1} {index < 3 ? '*' : ''}
                      {index < 3 && <span className="required-badge">Required</span>}
                    </label>
                    {index < 3 && (
                      <div className="competitor-hint">
                        Choose a Facebook page that represents your target market or content niche
                      </div>
                    )}
                  </div>
                  
                  <div className="competitor-input-wrapper">
                    <div className="competitor-name-input">
                      <label htmlFor={`competitor-name-${index}`}>Name</label>
                      <input
                        type="text"
                        id={`competitor-name-${index}`}
                        value={competitor.name}
                        onChange={(e) => handleCompetitorChange(index, 'name', e.target.value)}
                        placeholder="CompetitorName (no spaces)"
                        className="competitor-input"
                        disabled={isLoading}
                      />
                      {competitor.name.includes(' ') && (
                        <div className="format-warning">
                          ⚠️ Spaces removed for username format
                        </div>
                      )}
                      <div className="username-counter">
                        Characters: {competitor.name.length} / 50
                        {competitor.name.length > 30 && (
                          <span className="counter-warning"> (Username getting long)</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="competitor-url-input">
                      <label htmlFor={`competitor-url-${index}`}>URL</label>
                      <input
                        type="url"
                        id={`competitor-url-${index}`}
                        value={competitor.url}
                        onChange={(e) => handleCompetitorChange(index, 'url', e.target.value)}
                        placeholder="https://facebook.com/competitor"
                        className={`competitor-input ${competitor.url && !validateFacebookUrl(competitor.url) ? 'error' : ''}`}
                        disabled={isLoading}
                      />
                    </div>
                    
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
                  
                                     {competitor.url && !validateFacebookUrl(competitor.url) && (
                     <div className="error-message">Invalid Facebook URL format (e.g., https://facebook.com/competitor or https://facebook.com/profile.php?id=123456789)</div>
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
                              <p><strong>Please verify your information before starting the 2-minute AI analysis:</strong></p>
            </div>
            
            <div className="confirmation-content">
              <div className="confirmation-section">
                <h4>📝 Your Account Information</h4>
                <div className="confirmation-item">
                  <strong>Account Name:</strong> {confirmationData.accountData.name}
                  <div className="critical-warning">⚠️ This name will be mapped to your Facebook URL!</div>
                  {confirmationData.accountData.name !== accountData.name && (
                    <div className="format-notice">✅ Spaces removed for username format</div>
                  )}
                </div>
                <div className="confirmation-item">
                  <strong>Facebook URL:</strong> {confirmationData.accountData.url}
                  <div className="critical-warning">⚠️ This URL will be scraped for 2 minutes!</div>
                </div>
                <div className="confirmation-item">
                  <strong>Account Type:</strong> {confirmationData.accountType}
                </div>
                <div className="confirmation-item">
                  <strong>Posting Style:</strong> {confirmationData.postingStyle}
                </div>
              </div>
              
              <div className="confirmation-section">
                <h4>🎯 Competitors ({confirmationData.competitor_data.length})</h4>
                {confirmationData.competitor_data.map((comp: any, index: number) => (
                  <div key={index} className="confirmation-item">
                    <strong>Competitor {index + 1}:</strong>
                    <div>Name: {comp.name}</div>
                    <div>URL: {comp.url}</div>
                    {comp.name !== competitors[index]?.name && (
                      <div className="format-notice">✅ Spaces removed for username format</div>
                    )}
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

export default FB_EntryUsernames; 