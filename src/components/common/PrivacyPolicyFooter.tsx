import React from 'react';
import { motion } from 'framer-motion';
import './PrivacyPolicyFooter.css';

interface PrivacyPolicyFooterProps {
  className?: string;
}

const PrivacyPolicyFooter: React.FC<PrivacyPolicyFooterProps> = ({ className = '' }) => {
  const handlePrivacyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Open privacy policy in a new tab
    window.open('/privacy', '_blank');
  };

  return (
    <motion.footer 
      className={`privacy-policy-footer ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="privacy-footer-content">
        <a 
          href="/privacy" 
          onClick={handlePrivacyClick}
          className="privacy-link"
          title="View Privacy Policy"
        >
          Privacy Policy
        </a>
      </div>
    </motion.footer>
  );
};

export default PrivacyPolicyFooter; 