import React, { useState, useRef, ChangeEvent, KeyboardEvent } from 'react';
import axios from 'axios';
import './IG_EntryUsernames.css';
import LeftBar from './LeftBar';
import TopBar from './TopBar';

interface Competitor {
  username: string;
}

const UsernameEntry: React.FC<{ onSubmitSuccess: () => void }> = ({ onSubmitSuccess }) => {
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
        children: competitors.map(username => ({ username: username.trim() }))
      };

      const response = await axios.post(apiUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });

      if (response.status === 200) {
        showMessage('Submission successful', 'success');
        resetForm();
        setTimeout(() => onSubmitSuccess(), 1000);
      }
    } catch (error: any) {
      console.error('Error submitting data:', error);
      const errorMessage = error.response?.data?.message || 
                         error.response?.data?.error || 
                         'Server error occurred';
      showMessage(`Error: ${errorMessage}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
        <TopBar />
        <div className="main-content">
            <LeftBar />
            <div className="dashboard-container">
                <div className="card">
                    <h1 className="title">Phase 4, begins</h1>

                    <div className="section">
                      <h2 className="subtitle">Account Holder</h2>
                      <div className="input-group">
                        <input
                          value={accountHolder}
                          onChange={handleAccountHolderChange}
                          type="text"
                          placeholder="Enter account holder username"
                          onKeyUp={handleKeyUp}
                        />
                      </div>
                    </div>

                    <div className="section">
                      <h2 className="subtitle">Competitors (5 required)</h2>
                      {competitors.map((competitor, index) => (
                        <div key={index} className="input-group competitor-input">
                          <input
                            value={competitor}
                            onChange={(e) => handleCompetitorChange(index, e.target.value)}
                            type="text"
                            placeholder={`Enter competitor ${index + 1}`}
                            onKeyUp={(e) => handleKeyUp(e, index)}
                            ref={(el) => { competitorRefs.current[index] = el }}
                          />
                          {competitors.length > 1 && (
                            <button
                              className="remove-btn"
                              onClick={() => removeCompetitor(index)}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      {competitors.length < 5 && (
                        <button className="add-btn" onClick={addCompetitor}>
                          Add Competitor
                        </button>
                      )}
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

                    <div className="submit-section">
                      <button
                        onClick={submitData}
                        disabled={isLoading || !isValidForSubmission()}
                        className="submit-btn"
                      >
                        {isLoading ? 'Submitting...' : 'Submit'}
                      </button>
                    </div>

                    {message && (
                      <div className={`message ${messageType}`}>
                        {message}
                      </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default UsernameEntry;
