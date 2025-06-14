import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import './EmailVerification.css';

interface EmailVerificationProps {
  email: string;
  onVerificationSuccess: (verificationCode: string) => void;
  onResendCode: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const EmailVerification: React.FC<EmailVerificationProps> = ({
  email,
  onVerificationSuccess,
  onResendCode,
  onCancel,
  isLoading = false
}) => {
  const [codes, setCodes] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string>('');
  const [isResending, setIsResending] = useState<boolean>(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Focus first input on mount
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  const handleInputChange = (index: number, value: string) => {
    setError('');
    
    // Handle paste operation
    if (value.length > 1) {
      const pastedWords = value.trim().split(/\s+/).slice(0, 6);
      const newCodes = [...codes];
      
      pastedWords.forEach((word, i) => {
        if (index + i < 6) {
          newCodes[index + i] = word.toLowerCase();
        }
      });
      
      setCodes(newCodes);
      
      // Focus the next empty input or the last input
      const nextIndex = Math.min(index + pastedWords.length, 5);
      if (inputRefs.current[nextIndex]) {
        inputRefs.current[nextIndex].focus();
      }
      
      return;
    }

    // Handle single character input
    const newCodes = [...codes];
    newCodes[index] = value.toLowerCase();
    setCodes(newCodes);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codes[index] && index > 0) {
      // Focus previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'Enter') {
      handleVerify();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleVerify = () => {
    const verificationCode = codes.join(' ').trim();
    
    if (codes.some(code => !code)) {
      setError('Please enter all 6 words');
      return;
    }

    onVerificationSuccess(verificationCode);
  };

  const handleResend = async () => {
    setIsResending(true);
    setError('');
    
    try {
      await onResendCode();
      setCodes(['', '', '', '', '', '']);
      if (inputRefs.current[0]) {
        inputRefs.current[0].focus();
      }
    } catch (error) {
      setError('Failed to resend verification code');
    } finally {
      setIsResending(false);
    }
  };

  const isComplete = codes.every(code => code.length > 0);

  return (
    <motion.div
      className="email-verification-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="email-verification-modal"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <div className="verification-header">
          <motion.div
            className="verification-icon"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          >
            📧
          </motion.div>
          <h2>Email Verification</h2>
          <p>
            We've sent a 6-word verification code to<br />
            <strong>{email}</strong>
          </p>
        </div>

        <div className="verification-form">
          <div className="code-inputs">
            {codes.map((code, index) => (
                             <motion.input
                 key={index}
                 ref={(el) => { inputRefs.current[index] = el; }}
                 type="text"
                className={`code-input ${code ? 'filled' : ''} ${error ? 'error' : ''}`}
                value={code}
                onChange={(e) => handleInputChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                placeholder={`Word ${index + 1}`}
                maxLength={20}
                disabled={isLoading}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              />
            ))}
          </div>

          {error && (
            <motion.div
              className="error-message"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {error}
            </motion.div>
          )}

          <div className="verification-actions">
            <motion.button
              className={`verify-button ${isComplete ? 'active' : ''}`}
              onClick={handleVerify}
              disabled={!isComplete || isLoading}
              whileHover={isComplete ? { scale: 1.02 } : {}}
              whileTap={isComplete ? { scale: 0.98 } : {}}
            >
              {isLoading ? (
                <div className="loading-spinner" />
              ) : (
                'Verify Email'
              )}
            </motion.button>

            <div className="secondary-actions">
              <button
                className="resend-button"
                onClick={handleResend}
                disabled={isResending || isLoading}
              >
                {isResending ? 'Sending...' : 'Resend Code'}
              </button>
              
              <button
                className="cancel-button"
                onClick={onCancel}
                disabled={isLoading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        <div className="verification-help">
          <p>💡 <strong>Tip:</strong> You can paste all 6 words at once into any input field</p>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default EmailVerification; 