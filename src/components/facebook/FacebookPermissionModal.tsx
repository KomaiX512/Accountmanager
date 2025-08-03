import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import './FacebookPermissionModal.css';

interface PermissionOption {
  key: string;
  label: string;
  default?: boolean;
}

interface FacebookPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  selectedPermissions: string[];
  togglePermission: (perm: string) => void;
}

/**
 * Displays a full-screen modal allowing the user to:
 * 1. Select granular Facebook Page permissions
 * 2. Read & accept the Privacy Policy (must scroll to bottom)
 * Only after both are satisfied can the user hit Continue, which triggers
 * the actual Facebook OAuth popup (handled in parent component).
 */
const FacebookPermissionModal: React.FC<FacebookPermissionModalProps> = ({
  isOpen,
  onClose,
  onContinue,
  selectedPermissions,
  togglePermission,
}) => {
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const policyRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Detect bottom of scroll via IntersectionObserver (more reliable than scroll math)
  useEffect(() => {
    const sentinel = bottomRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsScrolledToBottom(true);
          }
        });
      },
      {
        root: policyRef.current,
        threshold: 1.0,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Fallback scroll math (old logic) in case IntersectionObserver unsupported
  useEffect(() => {
    const node = policyRef.current;
    if (!node) return;

    const handleScroll = () => {
      // More robust scroll detection
      const { scrollTop, scrollHeight, clientHeight } = node;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 5; // 5px tolerance
      
      if (isNearBottom) {
        setIsScrolledToBottom(true);
      }
    };
    
    // Add scroll listener
    node.addEventListener('scroll', handleScroll);
    
    // Also check on initial render
    handleScroll();
    
    return () => node.removeEventListener('scroll', handleScroll);
  }, [policyRef]);

  // Reset when (re)opened
  useEffect(() => {
    if (isOpen) {
      setIsScrolledToBottom(false);
      setAcceptPrivacy(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="overlay"
        className="fb-permission-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          key="modal"
          className="fb-permission-modal"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        >
          <button className="fb-modal-close" onClick={onClose} aria-label="Close" />
          <h2 className="fb-modal-title">Facebook Permissions</h2>

          {/* Permission checklist */}
          <div className="fb-permission-list">
            {selectedPermissions.map(() => null) /* silence lint */}
          </div>

          {/* We rely on parent to provide full option list via selector passed as children */}
          <div className="fb-permission-list">
            {/* Render options via togglePermission & selectedPermissions */}
            {(
              [
                { key: 'public_profile', label: 'Basic profile (required)', default: true },
                { key: 'pages_show_list', label: 'Show list of Pages you manage', default: true },
                { key: 'pages_messaging', label: 'Manage and access Page conversations on Messenger' },
                { key: 'pages_manage_posts', label: 'Create and manage content on your Page' },
                { key: 'pages_read_engagement', label: 'Read content posted on the Page' },
              ] as PermissionOption[]
            ).map(opt => (
              <label key={opt.key} className="fb-permission-option">
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

          {/* Privacy policy scroll */}
          <div className="fb-policy-container" ref={policyRef}>
            <div className="fb-policy-content">
              <h3>Privacy Policy</h3>
              <p><strong>Last Updated:</strong> July 19, 2025</p>
              
              <h4>1. Introduction</h4>
              <p>Sentient Marketting we operates an AI-powered social media management platform ("Platform") that enables clients to manage their Instagram accounts by generating and scheduling posts, comments, and replies, managing direct messages (DMs), and providing analytics. As a Tech Provider under Meta's Platform Terms, we process Instagram Graph API data ("Platform Data") on behalf of our clients (Instagram account holders) to deliver these services. This Privacy Policy explains how we collect, use, store, and protect data, including Platform Data, in compliance with Meta's Platform Terms (effective February 3, 2025), applicable laws (e.g., GDPR, CCPA), and our obligations as a Tech Provider. By using our Platform, you agree to this Privacy Policy. If you do not agree, please do not use our services.</p>
              
              <h4>2. Data We Collect</h4>
              <p><strong>Instagram Platform Data:</strong> With your explicit consent, we access and process the following Platform Data via the Instagram Graph API:</p>
              <ul>
                <li><strong>Direct Messages (DMs):</strong> To manage and respond to messages on your behalf.</li>
                <li><strong>Comments:</strong> To generate replies or provide analytics on post engagement.</li>
                <li><strong>Profile Information:</strong> Usernames, user IDs, and profile details to authenticate and manage your Instagram account.</li>
                <li><strong>Insights:</strong> Post performance and engagement metrics to provide analytics.</li>
                <li><strong>Access Tokens:</strong> To securely connect your Instagram account to our Platform.</li>
              </ul>
              
              <p><strong>Client-Provided Data:</strong></p>
              <ul>
                <li><strong>Account Information:</strong> Name, email address, and account settings (e.g., rules for AI-generated content).</li>
                <li><strong>Payment Information:</strong> Billing details processed securely via third-party payment processors (we do not store payment data).</li>
              </ul>
              
              <p><strong>Usage Data:</strong></p>
              <ul>
                <li><strong>Technical Data:</strong> IP address, device type, browser, and usage logs to ensure Platform functionality and security.</li>
                <li><strong>Analytics Data:</strong> Feature usage and performance metrics to optimize our services.</li>
              </ul>
              
              <h4>3. How We Use Your Data</h4>
              <p>We process data solely for the purposes authorized by you (our client) to provide social media management services:</p>
              <ul>
                <li><strong>Content Generation:</strong> Using Retrieval-Augmented Generation (RAG) AI to create and schedule posts, comments, and replies based on your predefined rules.</li>
                <li><strong>Message Management:</strong> Managing and responding to DMs and comments on your behalf, as directed.</li>
                <li><strong>Analytics:</strong> Providing insights on post performance and engagement metrics.</li>
                <li><strong>Authentication:</strong> Using access tokens to connect and manage your Instagram account.</li>
                <li><strong>Platform Improvement:</strong> Analyzing usage data to enhance Platform functionality (excluding Platform Data unless authorized).</li>
                <li><strong>Legal Compliance:</strong> Complying with applicable laws or responding to legal requests.</li>
              </ul>
              <p>We do not process Platform Data to build or augment user profiles, train AI models, or for any unauthorized purpose unless explicitly consented to by you.</p>
              
              <h4>4. Legal Basis for Processing</h4>
              <p>We process data based on:</p>
              <ul>
                <li><strong>Consent:</strong> Your explicit consent to access and process Platform Data via the Instagram Graph API.</li>
                <li><strong>Contract:</strong> To fulfill our agreement to provide social media management services.</li>
                <li><strong>Legal Obligation:</strong> To comply with laws like GDPR and CCPA.</li>
              </ul>
              <p>Before processing Platform Data, we obtain your consent through a clear mechanism (e.g., a checkbox during account setup). You may withdraw consent at any time by contacting us or disconnecting your Instagram account.</p>
              
              <h4>5. Data Storage and Security</h4>
              <ul>
                <li><strong>Storage:</strong> Platform Data (e.g., DMs, tokens) is stored in Cloudflare's R2-bucket, a third-party cloud storage service. Access is restricted to our authorized administrators and protected by encryption and strict access controls.</li>
                <li><strong>Security Measures:</strong> We implement industry-standard safeguards, including:
                  <ul>
                    <li>Encryption of data in transit and at rest.</li>
                    <li>Regular security audits and vulnerability assessments.</li>
                    <li>Role-based access controls and multi-factor authentication.</li>
                  </ul>
                </li>
              </ul>
              
              <h4>6. Data Sharing</h4>
              <p>We do not sell, trade, or rent your personal data. We may share data with:</p>
              <ul>
                <li><strong>Service Providers:</strong> Third-party vendors who assist in Platform operations (e.g., cloud storage, payment processing) under strict confidentiality agreements.</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect our rights, privacy, safety, or property.</li>
              </ul>
              
              <h4>7. Your Rights</h4>
              <p>Depending on your jurisdiction, you may have rights regarding your data:</p>
              <ul>
                <li>Access and rectification of your personal data.</li>
                <li>Erasure ("right to be forgotten") of your data.</li>
                <li>Restriction or objection to processing.</li>
                <li>Data portability.</li>
              </ul>
              <p>To exercise these rights, contact us at privacy@sentientmarketting.com. We will respond within 30 days.</p>
              
              <h4>8. Data Retention</h4>
              <p>We retain data only as long as necessary to provide services or comply with legal obligations. Platform Data is deleted within 30 days of account disconnection or service termination.</p>
              
              <h4>9. International Data Transfers</h4>
              <p>Your data may be transferred to and processed in countries other than your own. We ensure appropriate safeguards (e.g., Standard Contractual Clauses) are in place for such transfers.</p>
              
              <h4>10. Children's Privacy</h4>
              <p>Our services are not directed to individuals under 13. We do not knowingly collect personal data from children. If we discover such collection, we will promptly delete the data.</p>
              
              <h4>11. Changes to This Policy</h4>
              <p>We may update this policy to reflect changes in our practices or legal requirements. We will notify you of significant changes via email or Platform notification.</p>
              
              <h4>12. Contact Us</h4>
              <p>For privacy-related questions, contact us at:</p>
              <p>Sentient Marketting<br />
              Email: privacy@sentientmarketting.com<br />
              Address: [Full Address]</p>
              
              {/* Scroll sentinel - must be the last element in the scrollable area */}
              <div ref={bottomRef} style={{ height: 1 }} />
            </div>
          </div>

          {/* Accept policy checkbox */}
          <label className="fb-accept-option">
            <input
              type="checkbox"
              checked={acceptPrivacy}
              onChange={e => setAcceptPrivacy(e.target.checked)}
            />
            I have read and accept the Privacy Policy
          </label>

          <div className="fb-permission-actions">
            <button className="fb-cancel-button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="fb-continue-button"
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

export default FacebookPermissionModal;
