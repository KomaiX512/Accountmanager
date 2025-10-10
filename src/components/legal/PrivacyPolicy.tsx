import React from 'react';
import { motion } from 'framer-motion';
import './PrivacyPolicy.css';

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="privacy-policy-page">
      <div className="privacy-banner">
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          Privacy Policy
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Last Updated: July 19, 2025
        </motion.p>
      </div>

      <div className="privacy-content">
        <motion.div
          className="privacy-container"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <section className="privacy-section">
            <h2>1. Introduction</h2>
            <p>
              Sentient Marketting is an AI-powered social media management platform ("Platform") that enables clients to manage their Instagram accounts by generating and scheduling posts, comments, and replies, managing direct messages (DMs), and providing analytics. As a Tech Provider under Meta's Platform Terms, we process Instagram Graph API data ("Platform Data") on behalf of our clients (Instagram account holders) to deliver these services. This Privacy Policy explains how we collect, use, store, and protect data, including Platform Data, in compliance with Meta's Platform Terms (effective February 3, 2025), applicable laws (e.g., GDPR, CCPA), and our obligations as a Tech Provider. By using our Platform, you agree to this Privacy Policy. If you do not agree, please do not use our services.
            </p>
            <p>
              This Privacy Policy is publicly available and disclosed in our Meta App Dashboard.
            </p>
          </section>

          <section className="privacy-section">
            <h2>2. Data We Collect</h2>
            <p>We collect the following data to provide our services:</p>
            
            <h3>2.1 Instagram Platform Data</h3>
            <p>With your explicit consent, we access and process the following Platform Data via the Instagram Graph API:</p>
            <ul>
              <li><strong>Direct Messages (DMs):</strong> To manage and respond to messages on your behalf.</li>
              <li><strong>Comments:</strong> To generate replies or provide analytics on post engagement.</li>
              <li><strong>Profile Information:</strong> Usernames, user IDs, and profile details to authenticate and manage your Instagram account.</li>
              <li><strong>Insights:</strong> Post performance and engagement metrics to provide analytics.</li>
              <li><strong>Access Tokens:</strong> To securely connect your Instagram account to our Platform.</li>
            </ul>

            <h3>2.2 Client-Provided Data</h3>
            <ul>
              <li><strong>Account Information:</strong> Name, email address, and account settings (e.g., rules for AI-generated content).</li>
              <li><strong>Payment Information:</strong> Billing details processed securely via third-party payment processors (we do not store payment data).</li>
            </ul>

            <h3>2.3 Usage Data</h3>
            <ul>
              <li><strong>Technical Data:</strong> IP address, device type, browser, and usage logs to ensure Platform functionality and security.</li>
              <li><strong>Analytics Data:</strong> Feature usage and performance metrics to optimize our services.</li>
            </ul>
          </section>

          <section className="privacy-section">
            <h2>3. How We Use Your Data</h2>
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
          </section>

          <section className="privacy-section">
            <h2>4. Legal Basis for Processing</h2>
            <p>We process data based on:</p>
            <ul>
              <li><strong>Consent:</strong> Your explicit consent to access and process Platform Data via the Instagram Graph API.</li>
              <li><strong>Contract:</strong> To fulfill our agreement to provide social media management services.</li>
              <li><strong>Legal Obligation:</strong> To comply with laws like GDPR and CCPA.</li>
            </ul>
            <p>Before processing Platform Data, we obtain your consent through a clear mechanism (e.g., a checkbox during account setup). You may withdraw consent at any time by contacting us or disconnecting your Instagram account.</p>
          </section>

          <section className="privacy-section">
            <h2>5. Data Storage and Security</h2>
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
          </section>

          <section className="privacy-section">
            <h2>6. Data Sharing</h2>
            <p>We only share Platform Data in the following circumstances:</p>
            <ul>
              <li><strong>With Clients:</strong> To provide services (e.g., sharing analytics with you).</li>
              <li><strong>With Cloudflare:</strong> For secure storage in R2-bucket, as described above.</li>
              <li><strong>With Your Consent:</strong> When you direct us to share data with a third party (e.g., a client's service provider), with proof of consent retained.</li>
              <li><strong>Legal Requirements:</strong> When required by law, with proof of the legal requirement retained.</li>
            </ul>
            <p>We do not sell, license, or share Platform Data for unauthorized purposes, and we contractually prohibit third parties from using shared data in violation of Meta's terms.</p>
          </section>



          <section className="privacy-section">
            <h2>7. Data Retention and Deletion</h2>
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
              <li><strong>Deletion Process:</strong> We will delete or anonymize data within 30 days, except where retention is required by law (proof of which will be retained).</li>
            </ul>
          </section>

          <section className="privacy-section">
            <h2>8. Your Data Rights</h2>
            <p>You have the following rights under GDPR, CCPA, and other applicable laws:</p>
            <ul>
              <li><strong>Access:</strong> Request a copy of your data.</li>
              <li><strong>Correction:</strong> Update or correct your data.</li>
              <li><strong>Deletion:</strong> Request deletion of your data.</li>
              <li><strong>Restriction:</strong> Restrict processing of your data.</li>
              <li><strong>Portability:</strong> Obtain your data in a portable format.</li>
              <li><strong>Objection:</strong> Object to certain data processing.</li>
            </ul>
            <p>To exercise these rights, please use the contact methods provided in our application interface. We will respond within 30 days. As a Tech Provider, we notify clients of user data rights requests, as required by Meta's Platform Terms.</p>
          </section>

          <section className="privacy-section">
            <h2>9. International Data Transfers</h2>
            <p>Platform Data may be transferred to Cloudflare's R2-bucket servers outside the EEA or UK. We ensure compliance with GDPR and UK GDPR by:</p>
            <ul>
              <li>Using Standard Contractual Clauses (Module One) for EEA data transfers, as required by Meta's Platform Terms (Section 10).</li>
              <li>Using the UK Addendum for UK data transfers, as required by Section 10A.</li>
            </ul>
            <p>Contact us for details on these safeguards. We retain proof of compliance and provide it to Meta upon request.</p>
          </section>

          <section className="privacy-section">
            <h2>10. Tech Provider Role</h2>
            <p>As a Tech Provider under Meta's Platform Terms, we:</p>
            <ul>
              <li>Process Platform Data only on behalf of and at the direction of our clients for their authorized purposes (e.g., social media management).</li>
              <li>Maintain client data separately to prevent cross-client processing.</li>
              <li>Notify clients of user data rights requests or Meta communications regarding Platform Data.</li>
              <li>Ensure clients comply with Meta's terms, terminating non-compliant clients if requested by Meta.</li>
            </ul>
          </section>

          <section className="privacy-section">
            <h2>11. Children's Privacy</h2>
            <p>Our services are not intended for children under 13. We do not knowingly collect data from children under 13. If we discover such data, we will delete it promptly, as required by COPPA.</p>
          </section>

          <section className="privacy-section">
            <h2>12. Changes to This Privacy Policy</h2>
            <p>We may update this Privacy Policy to reflect changes in our practices or legal requirements. We will notify you of material changes via email or in-app notifications. Your continued use of our Platform after changes indicates acceptance of the updated policy.</p>
          </section>

          <section className="privacy-section">
            <h2>13. Children's Privacy</h2>
            <p>
              Our services are not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take steps to delete such information promptly.
            </p>
          </section>

          <section className="privacy-section">
            <h2>14. Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will notify you of any material changes by:
            </p>
            <ul>
              <li>Posting the updated policy on our website</li>
              <li>Sending you an email notification</li>
              <li>Providing in-app notifications</li>
            </ul>
            <p>
              Your continued use of our services after any changes indicates your acceptance of the updated Privacy Policy.
            </p>
          </section>
        </motion.div>
      </div>
    </div>
  );
};

export default PrivacyPolicy; 