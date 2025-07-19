import React from 'react';
import './TopBar.css';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import UserDropdown from '../auth/UserDropdown';
import { useAuth } from '../../context/AuthContext';

const TopBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();

  return (
    <motion.div
      className="top-bar"
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="logo" onClick={() => navigate('/')}>
        <img 
          src="/Logo/logo.png" 
          alt="Logo" 
          className="logo-image"
        />
      </div>

      <div className="platform-title">
        <span>Dashboard</span>
      </div>

      <div className="nav-links">
        <motion.a
          href="#"
          className={`nav-link ${location.pathname === '/' || location.pathname === '/home' ? 'active' : ''}`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          Home
        </motion.a>
        {currentUser && (
          <motion.a
            href="#"
            className={`nav-link ${location.pathname === '/account' ? 'active' : ''}`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={(e) => {
              e.preventDefault();
              navigate('/account');
            }}
          >
            Dashboard
          </motion.a>
        )}
        <motion.a
          href="#"
          className={`nav-link ${location.pathname === '/privacy' ? 'active' : ''}`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={(e) => {
            e.preventDefault();
            navigate('/privacy');
          }}
        >
          Privacy Policy
        </motion.a>
        <motion.a
          href="#"
          className={`nav-link ${location.pathname === '/pricing' ? 'active' : ''}`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={(e) => {
            e.preventDefault();
            navigate('/pricing');
          }}
        >
          Pricing
        </motion.a>
      </div>

      <div className="right-controls">
      
      {currentUser ? (
        <UserDropdown />
      ) : (
        <motion.button
          className="login-button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/login')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Sign In
        </motion.button>
      )}
      </div>
    </motion.div>
  );
};

export default TopBar;