import React, { useState, ChangeEvent, useEffect } from 'react';
import axios from 'axios';
import './IG_EntryUsernames.css';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext'; // Fixed import path

interface IG_EntryUsernamesProps {
  onSubmitSuccess: (username: string) => void;
  redirectIfCompleted?: boolean; // Flag to indicate if we should redirect if user already entered username
}

const IG_EntryUsernames: React.FC<IG_EntryUsernamesProps> = ({ 
  onSubmitSuccess, 
  redirectIfCompleted = true 
}) => {
  const [username, setUsername] = useState<string>('');
  const [accountType, setAccountType] = useState<'branding' | 'non-branding' | ''>('');
  const [postingStyle, setPostingStyle] = useState<string>('');
  const [competitors, setCompetitors] = useState<string[]>(['', '', '']);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'info' | 'success' | 'error'>('info');
  const navigate = useNavigate();
  const { currentUser } = useAuth(); // Get the current user from auth context

  const apiUrl = 'http://localhost:3000/save-account-info';
  const statusApiUrl = 'http://localhost:3000/user-instagram-status';

  // Check if user has already entered Instagram username
  useEffect(() => {
    const checkUserStatus = async () => {
      if (!currentUser || !currentUser.uid) {
        console.error('No authenticated user found');
        setIsInitializing(false);
        return;
      }
      
      try {
        const response = await axios.get(`${statusApiUrl}/${currentUser.uid}`);
        
        if (response.data.hasEnteredInstagramUsername && redirectIfCompleted) {
          // User has already entered username, redirect to dashboard
          const savedUsername = response.data.instagram_username;
          onSubmitSuccess(savedUsername);
          
          if (response.data.accountType === 'branding') {
            navigate('/dashboard', { 
              state: { 
                accountHolder: savedUsername, 
                competitors: response.data.competitors || [],
                accountType: 'branding'
              } 
            });
          } else {
            navigate('/non-branding-dashboard', { 
              state: { 
                accountHolder: savedUsername,
                accountType: 'non-branding' 
              } 
            });
          }
        } else {
          setIsInitializing(false);
        }
      } catch (error) {
        console.error('Error checking user Instagram status:', error);
        setIsInitializing(false);
      }
    };
    
    checkUserStatus();
  }, [currentUser, navigate, onSubmitSuccess, redirectIfCompleted]);

  const isValidForSubmission = (): boolean => {
    if (!username.trim() || !accountType || !postingStyle.trim()) return false;
    if (accountType === 'branding') {
      return competitors.length >= 3 && competitors.every(comp => comp.trim() !== '');
    }
    return true;
  };

  const validationErrors = (): string[] => {
    const errors: string[] = [];
    if (!username.trim()) errors.push('Username is required');
    if (!accountType) errors.push('Account type is required');
    if (!postingStyle.trim()) errors.push('Posting style is required');
    if (accountType === 'branding') {
      if (competitors.length < 3) errors.push('At least 3 competitors are required for branding');
      competitors.forEach((comp, index) => {
        if (!comp.trim()) errors.push(`Competitor ${index + 1} username is required`);
      });
    }
    return errors;
  };

  const handleCompetitorChange = (index: number, value: string) => {
    const newCompetitors = [...competitors];
    newCompetitors[index] = value;
    setCompetitors(newCompetitors);
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
  };

  const showMessage = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  };

  const submitData = async () => {
    if (!isValidForSubmission()) {
      showMessage('Please fill in all required fields', 'error');
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
        competitors: accountType === 'branding' ? competitors.map(comp => comp.trim()) : [],
      };

      // Save to account info API
      const response = await axios.post(apiUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      if (response.status === 200) {
        // Now save the user's Instagram username entry state
        await axios.post(`${statusApiUrl}/${currentUser.uid}`, {
          instagram_username: username.trim(),
          accountType,
          competitors: accountType === 'branding' ? competitors.map(comp => comp.trim()) : []
        });
        
        showMessage('Submission successful', 'success');
        resetForm();
        setTimeout(() => {
          onSubmitSuccess(username);
          if (accountType === 'branding') {
            navigate('/dashboard', { 
              state: { 
                accountHolder: username, 
                competitors: payload.competitors,
                accountType: 'branding'
              } 
            });
          } else {
            navigate('/non-branding-dashboard', { 
              state: { 
                accountHolder: username,
                accountType: 'non-branding'
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
        <h1 className="title">Instagram Setup</h1>

        <div className="section">
          <h2 className="subtitle">Username</h2>
          <motion.div className="input-group" whileHover={{ x: 5 }}>
            <input
              value={username}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
              type="text"
              placeholder="Enter your Instagram username"
            />
          </motion.div>
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
              value={postingStyle}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPostingStyle(e.target.value)}
              type="text"
              placeholder="e.g., mood-based or event-based"
            />
          </motion.div>
        </div>

        {accountType === 'branding' && (
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
                  placeholder={`Enter competitor ${index + 1}`}
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
        )}

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

        <div className="submit-section">
          <motion.button
            onClick={submitData}
            disabled={isLoading || !isValidForSubmission()}
            className="submit-btn"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            animate={isLoading ? { opacity: 0.7 } : { opacity: 1 }}
          >
            {isLoading ? 'Submitting...' : 'Submit'}
          </motion.button>
        </div>

        {message && (
          <motion.div
            className={`message ${messageType}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {message}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default IG_EntryUsernames;