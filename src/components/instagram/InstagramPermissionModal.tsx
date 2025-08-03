import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import './InstagramPermissionModal.css';

interface PermissionOption {
  key: string;
  label: string;
  default?: boolean;
}

interface InstagramPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  selectedPermissions: string[];
  togglePermission: (perm: string) => void;
}

/**
 * Presents a GDPR-compliant modal before launching Instagram OAuth.
 * Users can (de)select optional scopes and must tick the Privacy Policy checkbox.
 * Note: Checkbox is always enabled (client demanded) – no scroll-locking.
 */
const InstagramPermissionModal: React.FC<InstagramPermissionModalProps> = ({
  isOpen,
  onClose,
  onContinue,
  selectedPermissions,
  togglePermission,
}) => {
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const policyRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver just marks bottom reached (not used for gating anymore)
  useEffect(() => {
    const sentinel = bottomRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // no-op; left for potential analytics
          }
        });
      },
      { root: policyRef.current, threshold: 1.0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Reset when modal reopens
  useEffect(() => {
    if (isOpen) {
      setAcceptPrivacy(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="overlay"
        className="ig-permission-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          key="modal"
          className="ig-permission-modal"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        >
          <button className="ig-modal-close" onClick={onClose} aria-label="Close" />
          <h2 className="ig-modal-title">Instagram Permissions</h2>

          {/* Permission checklist */}
          <div className="ig-permission-list">
            {[
              { key: 'instagram_business_basic', label: 'Basic profile (required)', default: true },
              { key: 'instagram_business_manage_messages', label: 'Manage and access messages' },
              { key: 'instagram_business_manage_comments', label: 'Manage and reply to comments' },
              { key: 'instagram_business_content_publish', label: 'Create and publish content' },
              { key: 'instagram_business_manage_insights', label: 'View insights and analytics' },
            ].map(opt => (
              <label key={opt.key} className="ig-permission-option">
                <input
                  type="checkbox"
                  checked={selectedPermissions.includes(opt.key)}
                  disabled={opt.default}
                  onChange={() => togglePermission(opt.key)}
                />
                {opt.label}
              </label>
            ))}
          </div>

          {/* Privacy policy */}
          <div className="ig-policy-container" ref={policyRef}>
            <div className="ig-policy-content">
              {/* Use the same plain-text policy as FB */}
              <h3>Privacy Policy</h3>
              <p>For full details please read our Privacy Policy available on our website. By proceeding you acknowledge that you have reviewed and accept our policy.</p>
              <div ref={bottomRef} style={{ height: 1 }} />
            </div>
          </div>

          {/* Accept */}
          <label className="ig-accept-option">
            <input
              type="checkbox"
              checked={acceptPrivacy}
              onChange={e => setAcceptPrivacy(e.target.checked)}
            />
            I have read and accept the Privacy Policy
          </label>

          <div className="ig-permission-actions">
            <button className="ig-cancel-button" onClick={onClose}>Cancel</button>
            <button
              className="ig-continue-button"
              onClick={onContinue}
              disabled={!acceptPrivacy}
            >
              Continue
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default InstagramPermissionModal;
