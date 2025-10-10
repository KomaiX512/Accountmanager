import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import './InstagramPermissionModal.css';

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
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ zIndex: 999999 }}
      >
        <motion.div
          key="modal"
          className="modal-content"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          style={{ zIndex: 1000000 }}
        >
          <button className="ig-modal-close" onClick={onClose} aria-label="Close" />
          <h2 className="ig-modal-title">Instagram Permissions</h2>

          {/* Permission checklist */}
          <div className="ig-permission-list" onClick={(e) => e.stopPropagation()}>
            {[
              { key: 'instagram_business_basic', label: 'Basic profile (required)', default: true },
              { key: 'instagram_business_manage_messages', label: 'Manage and access messages' },
              { key: 'instagram_business_manage_comments', label: 'Manage and reply to comments' },
              { key: 'instagram_business_content_publish', label: 'Create and publish content' },
              { key: 'instagram_business_manage_insights', label: 'View insights and analytics' },
            ].map(opt => (
              <label key={opt.key} className="ig-permission-option" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedPermissions.includes(opt.key)}
                  disabled={opt.default}
                  onChange={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    togglePermission(opt.key);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                {opt.label}
              </label>
            ))}
          </div>

          {/* Privacy policy */}
          <div className="ig-policy-container" ref={policyRef} onClick={(e) => e.stopPropagation()}>
            <div className="ig-policy-content">
              <h3>Privacy Policy</h3>
              <div className="ig-policy-scrollable">
                <p><strong>Last Updated: July 19, 2025</strong></p>
                
                <p><strong>1. Introduction</strong></p>
                <p>Sentient Marketting we operates an AI-powered social media management platform ("Platform") that enables clients to manage their Instagram accounts by generating and scheduling posts, comments, and replies, managing direct messages (DMs), and providing analytics. As a Tech Provider under Meta's Platform Terms, we process Instagram Graph API data ("Platform Data") on behalf of our clients (Instagram account holders) to deliver these services. This Privacy Policy explains how we collect, use, store, and protect data, including Platform Data, in compliance with Meta's Platform Terms (effective February 3, 2025), applicable laws (e.g., GDPR, CCPA), and our obligations as a Tech Provider. By using our Platform, you agree to this Privacy Policy. If you do not agree, please do not use our services.</p>
                <p>This Privacy Policy is publicly available and disclosed in our Meta App Dashboard.</p>
                
                <p><strong>2. Data We Collect</strong></p>
                <p>We collect the following data to provide our services:</p>
                
                <p><strong>2.1 Instagram Platform Data</strong></p>
                <p>With your explicit consent, we access and process the following Platform Data via the Instagram Graph API:</p>
                <ul>
                  <li><strong>Direct Messages (DMs):</strong> To manage and respond to messages on your behalf.</li>
                  <li><strong>Comments:</strong> To generate replies or provide analytics on post engagement.</li>
                  <li><strong>Profile Information:</strong> Usernames, user IDs, and profile details to authenticate and manage your Instagram account.</li>
                  <li><strong>Insights:</strong> Post performance and engagement metrics to provide analytics.</li>
                  <li><strong>Access Tokens:</strong> To securely connect your Instagram account to our Platform.</li>
                </ul>
                
                <p><strong>2.2 Client-Provided Data</strong></p>
                <ul>
                  <li><strong>Account Information:</strong> Name, email address, and account settings (e.g., rules for AI-generated content).</li>
                  <li><strong>Payment Information:</strong> Billing details processed securely via third-party payment processors (we do not store payment data).</li>
                </ul>
                
                <p><strong>2.3 Usage Data</strong></p>
                <ul>
                  <li><strong>Technical Data:</strong> IP address, device type, browser, and usage logs to ensure Platform functionality and security.</li>
                  <li><strong>Analytics Data:</strong> Feature usage and performance metrics to optimize our services.</li>
                </ul>
                
                <p><strong>3. How We Use Your Data</strong></p>
                <p>We process data solely for the purposes authorized by you (our client) to provide social media management services, as follows:</p>
                <ul>
                  <li><strong>Content Generation:</strong> Using Retrieval-Augmented Generation (RAG) AI to create and schedule posts, comments, and replies based on your predefined rules.</li>
                  <li><strong>Message Management:</strong> Managing and responding to DMs and comments on your behalf, as directed.</li>
                  <li><strong>Analytics:</strong> Providing insights on post performance and engagement metrics.</li>
                  <li><strong>Authentication:</strong> Using access tokens to connect and manage your Instagram account.</li>
                  <li><strong>Platform Improvement:</strong> Analyzing usage data to enhance Platform functionality (excluding Platform Data unless authorized).</li>
                  <li><strong>Legal Compliance:</strong> Complying with applicable laws or responding to legal requests.</li>
                </ul>
                <p>We do not process Platform Data to build or augment user profiles, train AI models, or for any unauthorized purpose unless explicitly consented to by you.</p>
                
                <p><strong>4. Legal Basis for Processing</strong></p>
                <p>We process data based on:</p>
                <ul>
                  <li><strong>Consent:</strong> Your explicit consent to access and process Platform Data via the Instagram Graph API.</li>
                  <li><strong>Contract:</strong> To fulfill our agreement to provide social media management services.</li>
                  <li><strong>Legal Obligation:</strong> To comply with laws like GDPR and CCPA.</li>
                </ul>
                <p>Before processing Platform Data, we obtain your consent through a clear mechanism (e.g., a checkbox during account setup). You may withdraw consent at any time by contacting us or disconnecting your Instagram account.</p>
                
                <p><strong>5. Data Storage and Security</strong></p>
                <ul>
                  <li><strong>Storage:</strong> Platform Data (e.g., DMs, tokens) is stored in Cloudflare's R2-bucket, a third-party cloud storage service. Access is restricted to our authorized administrators and protected by encryption and strict access controls.</li>
                  <li><strong>Security Measures:</strong> We implement industry-standard safeguards, including:
                    <ul>
                      <li>Encryption of data in transit and at rest.</li>
                      <li>Role-based access controls limiting access to authorized personnel.</li>
                      <li>Regular security audits and vulnerability assessments.</li>
                      <li>Secure infrastructure hosted on compliant cloud systems.</li>
                    </ul>
                  </li>
                  <li><strong>Service Provider Compliance:</strong> Cloudflare, our Service Provider, operates under a written agreement ensuring compliance with Meta's Platform Terms and this Privacy Policy. Cloudflare processes Platform Data only at our direction and for your authorized purposes.</li>
                </ul>
                <p>If we detect unauthorized access or a data breach, we will notify Meta and affected clients promptly using Meta's designated form and take immediate remedial action, as required by Section IK6.b of Meta's Platform Terms.</p>
                
                <p><strong>6. Data Sharing</strong></p>
                <p>We only share Platform Data in the following circumstances:</p>
                <ul>
                  <li><strong>With Clients:</strong> To provide services (e.g., sharing analytics with you).</li>
                  <li><strong>With Cloudflare:</strong> For secure storage in R2-bucket, as described above.</li>
                  <li><strong>With Your Consent:</strong> When you direct us to share data with a third party (e.g., a client's service provider), with proof of consent retained.</li>
                  <li><strong>Legal Requirements:</strong> When required by law, with proof of the legal requirement retained.</li>
                </ul>
                <p>We do not sell, license, or share Platform Data for unauthorized purposes, and we contractually prohibit third parties from using shared data in violation of Meta's terms.</p>
                
                <p><strong>7. Data Retention and Deletion</strong></p>
                <ul>
                  <li><strong>Retention:</strong> We retain Platform Data only as long as necessary to provide our services or as required by law. Client data is maintained separately to ensure compliance with Meta's Tech Provider requirements.</li>
                  <li><strong>Deletion:</strong> We delete Platform Data promptly when:
                    <ul>
                      <li>You or Meta request deletion.</li>
                      <li>You terminate your account.</li>
                      <li>The data is no longer necessary for the authorized purpose.</li>
                      <li>Required by law.</li>
                    </ul>
                  </li>
                  <li><strong>Deletion Process:</strong> To request deletion of your Platform Data, please use the contact methods provided in our application interface. We will delete or anonymize data within 30 days, except where retention is required by law (proof of which will be retained).</li>
                </ul>
                
                <p><strong>8. Your Data Rights</strong></p>
                <p>You have the following rights under GDPR, CCPA, and other applicable laws:</p>
                <ul>
                  <li><strong>Access:</strong> Request a copy of your data.</li>
                  <li><strong>Correction:</strong> Update or correct your data.</li>
                  <li><strong>Deletion:</strong> Request deletion of your data.</li>
                  <li><strong>Restriction:</strong> Restrict processing of your data.</li>
                  <li><strong>Portability:</strong> Obtain your data in a portable format.</li>
                  <li><strong>Objection:</strong> Object to certain data processing.</li>
                </ul>
                <p>To exercise these rights, contact us at privacy@sentientai.com. We will respond within 30 days. As a Tech Provider, we notify clients of user data rights requests, as required by Meta's Platform Terms.</p>
                
                <p><strong>9. International Data Transfers</strong></p>
                <p>Platform Data may be transferred to Cloudflare's R2-bucket servers outside the EEA or UK. We ensure compliance with GDPR and UK GDPR by:</p>
                <ul>
                  <li>Using Standard Contractual Clauses (Module One) for EEA data transfers, as required by Meta's Platform Terms (Section 10).</li>
                  <li>Using the UK Addendum for UK data transfers, as required by Section 10A.</li>
                </ul>
                <p>Contact us for details on these safeguards. We retain proof of compliance and provide it to Meta upon request.</p>
                
                <p><strong>10. Tech Provider Role</strong></p>
                <p>As a Tech Provider under Meta's Platform Terms, we:</p>
                <ul>
                  <li>Process Platform Data only on behalf of and at the direction of our clients for their authorized purposes (e.g., social media management).</li>
                  <li>Maintain client data separately to prevent cross-client processing.</li>
                  <li>Notify clients of user data rights requests or Meta communications regarding Platform Data.</li>
                  <li>Ensure clients comply with Meta's terms, terminating non-compliant clients if requested by Meta.</li>
                </ul>
                
                <p><strong>11. Children's Privacy</strong></p>
                <p>Our services are not intended for children under 13. We do not knowingly collect data from children under 13. If we discover such data, we will delete it promptly, as required by COPPA.</p>
                
                <p><strong>12. Contact Us</strong></p>
                <p>For questions, data rights requests, or to report security vulnerabilities, contact:</p>
                <ul>
                  <li><strong>Address:</strong> Ghulam Ishaq Khan Institute of Science and Technology, Tarbela Road, District Swabi, Khyber Pakhtoon Khwa, Topi, 23640</li>
                  <li><strong>Phone:</strong> +92 303 5233321</li>
                </ul>
                <p>We will respond within 30 days. Report security vulnerabilities to the above email for prompt resolution.</p>
                
                <p><strong>13. Changes to This Privacy Policy</strong></p>
                <p>We may update this Privacy Policy to reflect changes in our practices or legal requirements. We will notify you of material changes via email or in-app notifications. Your continued use of our Platform after changes indicates acceptance of the updated policy.</p>
              </div>
              <div ref={bottomRef} style={{ height: 1 }} />
            </div>
          </div>

          {/* Accept */}
          <label className="ig-accept-option" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={acceptPrivacy}
              onChange={(e) => {
                e.stopPropagation();
                setAcceptPrivacy(e.target.checked);
              }}
              onClick={(e) => e.stopPropagation()}
            />
            I have read and accept the Privacy Policy
          </label>

          <div className="ig-permission-actions" onClick={(e) => e.stopPropagation()}>
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
