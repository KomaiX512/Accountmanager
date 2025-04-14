import React, { useState, useRef, ChangeEvent, KeyboardEvent } from 'react';
import axios from 'axios';
import './IG_EntryUsernames.css';
import { motion } from 'framer-motion';

interface IG_EntryUsernamesProps {
  onSubmitSuccess: (accountHolder: string, competitors: string[]) => void;
}

const IG_EntryUsernames: React.FC<IG_EntryUsernamesProps> = ({ onSubmitSuccess }) => {
  const [accountHolder, setAccountHolder] = useState<string>('');
  const [competitors, setCompetitors] = useState<string[]>(['']);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'info' | 'success' | 'error'>('info');
  const competitorRefs = useRef<(HTMLInputElement | null)[]>([]);

  const apiUrl = 'http://localhost:3000/scrape';

  const isValidForSubmission = (): boolean => {
    return (
      accountHolder.trim() !== '' &&
      competitors.length === 5 &&
      competitors.every(comp => comp.trim() !== '')
    );
  };

  const validationErrors = (): string[] => {
    const errors: string[] = [];
    if (!accountHolder.trim()) errors.push('Account holder username is required');
    if (competitors.length < 5) errors.push('5 competitors are required');
    competitors.forEach((comp, index) => {
      if (!comp.trim()) errors.push(`Competitor ${index + 1} username is required`);
    });
    return errors;
  };

  const handleAccountHolderChange = (e: ChangeEvent<HTMLInputElement>) => {
    setAccountHolder(e.target.value);
  };

  const handleCompetitorChange = (index: number, value: string) => {
    const newCompetitors = [...competitors];
    newCompetitors[index] = value;
    setCompetitors(newCompetitors);
  };

  const addCompetitor = () => {
    if (competitors.length < 5) {
      setCompetitors([...competitors, '']);
    }
  };

  const removeCompetitor = (index: number) => {
    setCompetitors(competitors.filter((_, i) => i !== index));
  };

  const focusCompetitorInput = () => {
    competitorRefs.current[0]?.focus();
  };

  const focusNextInput = (currentIndex: number) => {
    if (currentIndex < 4) {
      competitorRefs.current[currentIndex + 1]?.focus();
    }
  };

  const handleKeyUp = (e: KeyboardEvent<HTMLInputElement>, index?: number) => {
    if (e.key === 'Enter') {
      if (index === undefined) {
        focusCompetitorInput();
      } else {
        focusNextInput(index);
      }
    }
  };

  const resetForm = () => {
    setAccountHolder('');
    setCompetitors(['']);
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

    setIsLoading(true);

    try {
      const payload = {
        parent: { username: accountHolder.trim() },
        children: competitors.map(username => ({ username: username.trim() })),
      };

      const response = await axios.post(apiUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      if (response.status === 200) {
        showMessage('Submission successful', 'success');
        resetForm();
        setTimeout(() => onSubmitSuccess(accountHolder, competitors), 1000);
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

  return (
    <motion.div
      className="dashboard-container"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <motion.div
        className="card"
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="title">Instagram Setup</h1>

        <div className="section">
          <h2 className="subtitle">Account Holder</h2>
          <motion.div className="input-group" whileHover={{ x: 5 }}>
            <input
              value={accountHolder}
              onChange={handleAccountHolderChange}
              type="text"
              placeholder="Enter Instagram account holder username"
              onKeyUp={handleKeyUp}
            />
          </motion.div>
        </div>

        <div className="section">
          <h2 className="subtitle">Competitors (5 required)</h2>
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
                onKeyUp={(e) => handleKeyUp(e, index)}
                ref={(el) => (competitorRefs.current[index] = el)}
              />
              {competitors.length > 1 && (
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
          {competitors.length < 5 && (
            <motion.button
              className="add-btn"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={addCompetitor}
            >
              Add Competitor
            </motion.button>
          )}
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