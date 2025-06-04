import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import './Auth.css';

interface LocationState {
  from?: {
    pathname: string;
  };
}

type AuthMode = 'login' | 'register' | 'reset';

const Login: React.FC = () => {
  const { currentUser, signIn, signInWithEmail, signUpWithEmail, sendPasswordReset, error, clearError, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Form state
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [mode, setMode] = useState<AuthMode>('login');
  
  // UI state
  const [loginAttempts, setLoginAttempts] = useState<number>(0);
  const [lockout, setLockout] = useState<boolean>(false);
  const [lockoutTimer, setLockoutTimer] = useState<number>(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Get the path the user was trying to access before being redirected to login
  const from = (location.state as LocationState)?.from?.pathname || '/';

  useEffect(() => {
    // If user is already logged in, redirect to the previous page or dashboard
    if (currentUser) {
      navigate(from, { replace: true });
    }
  }, [currentUser, navigate, from]);

  useEffect(() => {
    // Handle login attempts and lockout
    if (loginAttempts >= 5 && !lockout) {
      setLockout(true);
      setLockoutTimer(30);
      
      const interval = setInterval(() => {
        setLockoutTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setLockout(false);
            setLoginAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [loginAttempts, lockout]);

  const validateForm = (): boolean => {
    setFormError(null);
    
    if (!email.trim()) {
      setFormError('Email is required');
      return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setFormError('Please enter a valid email address');
      return false;
    }
    
    if (mode !== 'reset') {
      if (!password) {
        setFormError('Password is required');
        return false;
      }
      
      if (mode === 'register') {
        if (password.length < 6) {
          setFormError('Password must be at least 6 characters');
          return false;
        }
        
        if (password !== confirmPassword) {
          setFormError('Passwords do not match');
          return false;
        }
        
        if (!displayName.trim()) {
          setFormError('Name is required');
          return false;
        }
      }
    }
    
    return true;
  };

  const handleGoogleLogin = async () => {
    if (lockout) return;
    
    try {
      await signIn();
      // Note: Successful login will trigger the useEffect to redirect
    } catch (error) {
      setLoginAttempts((prev) => prev + 1);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockout) return;
    
    if (!validateForm()) return;
    
    try {
      await signInWithEmail(email, password);
      // Successful login will trigger the useEffect to redirect
    } catch (error) {
      setLoginAttempts((prev) => prev + 1);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockout) return;
    
    if (!validateForm()) return;
    
    try {
      await signUpWithEmail(email, password, displayName);
      // Successful registration will redirect automatically
    } catch (error) {
      setLoginAttempts((prev) => prev + 1);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockout) return;
    
    if (!validateForm()) return;
    
    try {
      await sendPasswordReset(email);
      setSuccessMessage('Password reset email sent. Please check your inbox.');
      
      // After 5 seconds, switch back to login mode
      setTimeout(() => {
        setSuccessMessage(null);
        setMode('login');
      }, 5000);
    } catch (error) {
      setLoginAttempts((prev) => prev + 1);
    }
  };

  const renderForm = () => {
    switch (mode) {
      case 'login':
        return (
          <form className="auth-form" onSubmit={handleEmailLogin}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="forgot-password">
              <a href="#" onClick={(e) => { e.preventDefault(); setMode('reset'); }}>
                Forgot password?
              </a>
            </div>
            <button
              type="submit"
              className="submit-btn"
              disabled={loading || lockout}
            >
              {loading ? <span className="loading-spinner"></span> : 'Sign In'}
            </button>
            
            <div className="auth-divider">
              <span>OR</span>
            </div>
          </form>
        );
      
      case 'register':
        return (
          <form className="auth-form" onSubmit={handleSignUp}>
            <div className="form-group">
              <label htmlFor="displayName">Full Name</label>
              <input
                id="displayName"
                type="text"
                className="form-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your Name"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              className="submit-btn"
              disabled={loading || lockout}
            >
              {loading ? <span className="loading-spinner"></span> : 'Create Account'}
            </button>
            
            <div className="auth-divider">
              <span>OR</span>
            </div>
          </form>
        );
        
      case 'reset':
        return (
          <form className="auth-form" onSubmit={handlePasswordReset}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>
            <button
              type="submit"
              className="submit-btn"
              disabled={loading || lockout}
            >
              {loading ? <span className="loading-spinner"></span> : 'Send Reset Link'}
            </button>
            
            <div className="auth-divider">
              <span>OR</span>
            </div>
          </form>
        );
      
      default:
        return null;
    }
  };

  return (
    <motion.div
      className="auth-container"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="auth-card"
        whileHover={{ boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)' }}
      >
        <div className="auth-header">
          <h1>Welcome to KomX</h1>
          <p>
            {mode === 'login' && 'Sign in to access your dashboard'}
            {mode === 'register' && 'Create a new account to get started'}
            {mode === 'reset' && 'Reset your password'}
          </p>
        </div>
        
        {error && (
          <motion.div
            className="auth-error"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button className="error-close" onClick={clearError}>×</button>
            {error}
          </motion.div>
        )}
        
        {formError && (
          <motion.div
            className="auth-error"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button className="error-close" onClick={() => setFormError(null)}>×</button>
            {formError}
          </motion.div>
        )}
        
        {successMessage && (
          <motion.div
            className="success-message"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {successMessage}
          </motion.div>
        )}
        
        {lockout && (
          <motion.div
            className="auth-lockout"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            Too many login attempts. Please try again in {lockoutTimer} seconds.
          </motion.div>
        )}
        
        {renderForm()}
        
        <motion.button
          className="google-signin-btn"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleGoogleLogin}
          disabled={loading || lockout}
        >
          {loading && mode === 'login' ? (
            <span className="loading-spinner"></span>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="google-icon">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Sign in with Google
            </>
          )}
        </motion.button>
        
        <div className="auth-switch">
          {mode === 'login' ? (
            <>
              Don't have an account?
              <a href="#" onClick={(e) => { e.preventDefault(); setMode('register'); }}>
                Sign up
              </a>
            </>
          ) : mode === 'register' ? (
            <>
              Already have an account?
              <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); }}>
                Sign in
              </a>
            </>
          ) : (
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); }}>
              Back to sign in
            </a>
          )}
        </div>
        
        <div className="auth-footer">
          <p>By signing in, you agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a></p>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Login; 