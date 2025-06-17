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
          Last updated: {new Date().toLocaleDateString()}
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
              Welcome to Sentient Marketting ("we," "our," or "us"). We are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI-powered social media management platform and related services.
            </p>
            <p>
              By using Sentient Marketting, you agree to the collection and use of information in accordance with this Privacy Policy. If you do not agree with our policies and practices, please do not use our services.
            </p>
          </section>

          <section className="privacy-section">
            <h2>2. Information We Collect</h2>
            
            <h3>2.1 Personal Information</h3>
            <p>We may collect the following types of personal information:</p>
            <ul>
              <li><strong>Account Information:</strong> Name, email address, username, password, and profile information</li>
              <li><strong>Contact Information:</strong> Phone number, billing address, and communication preferences</li>
              <li><strong>Payment Information:</strong> Credit card details, billing information (processed securely through third-party payment processors)</li>
              <li><strong>Social Media Account Data:</strong> When you connect your social media accounts (Instagram, Twitter, Facebook, LinkedIn), we access and store relevant data as authorized by you</li>
            </ul>

            <h3>2.2 Usage Information</h3>
            <p>We automatically collect information about how you use our services:</p>
            <ul>
              <li><strong>Device Information:</strong> IP address, browser type, operating system, device identifiers</li>
              <li><strong>Usage Analytics:</strong> Pages visited, features used, time spent on platform, click patterns</li>
              <li><strong>Performance Data:</strong> System performance metrics, error logs, and diagnostic information</li>
              <li><strong>Content Data:</strong> Posts, comments, media files, and other content you create or manage through our platform</li>
            </ul>

            <h3>2.3 AI-Generated Data</h3>
            <p>Our AI systems generate and process:</p>
            <ul>
              <li>Content recommendations and suggestions</li>
              <li>Performance analytics and insights</li>
              <li>Automated responses and engagement data</li>
              <li>Competitor analysis and market intelligence</li>
            </ul>
          </section>

          <section className="privacy-section">
            <h2>3. How We Use Your Information</h2>
            <p>We use the collected information for the following purposes:</p>
            
            <h3>3.1 Service Provision</h3>
            <ul>
              <li>Provide, operate, and maintain our AI-powered social media management services</li>
              <li>Process transactions and manage your account</li>
              <li>Generate AI-driven content recommendations and insights</li>
              <li>Schedule and publish content across your connected social media platforms</li>
              <li>Provide customer support and respond to your inquiries</li>
            </ul>

            <h3>3.2 Service Improvement</h3>
            <ul>
              <li>Analyze usage patterns to improve our AI algorithms and platform functionality</li>
              <li>Develop new features and enhance existing services</li>
              <li>Conduct research and analytics to better understand user needs</li>
              <li>Optimize platform performance and user experience</li>
            </ul>

            <h3>3.3 Communication</h3>
            <ul>
              <li>Send you service-related notifications and updates</li>
              <li>Provide technical support and customer service</li>
              <li>Send marketing communications (with your consent)</li>
              <li>Notify you about changes to our services or policies</li>
            </ul>
          </section>

          <section className="privacy-section">
            <h2>4. Information Sharing and Disclosure</h2>
            <p>We do not sell, trade, or rent your personal information to third parties. We may share your information in the following circumstances:</p>

            <h3>4.1 Service Providers</h3>
            <p>We may share information with trusted third-party service providers who assist us in:</p>
            <ul>
              <li>Cloud hosting and data storage</li>
              <li>Payment processing</li>
              <li>Analytics and performance monitoring</li>
              <li>Customer support services</li>
              <li>Email and communication services</li>
            </ul>

            <h3>4.2 Social Media Platforms</h3>
            <p>When you connect your social media accounts, we share necessary information with these platforms to:</p>
            <ul>
              <li>Publish content on your behalf</li>
              <li>Retrieve analytics and performance data</li>
              <li>Manage your social media presence</li>
            </ul>

            <h3>4.3 Legal Requirements</h3>
            <p>We may disclose your information if required by law or in response to:</p>
            <ul>
              <li>Legal processes, subpoenas, or court orders</li>
              <li>Government investigations or regulatory requests</li>
              <li>Protection of our rights, property, or safety</li>
              <li>Prevention of fraud or illegal activities</li>
            </ul>
          </section>

          <section className="privacy-section">
            <h2>5. Data Security</h2>
            <p>We implement comprehensive security measures to protect your information:</p>
            <ul>
              <li><strong>Encryption:</strong> All data is encrypted in transit and at rest using industry-standard encryption protocols</li>
              <li><strong>Access Controls:</strong> Strict access controls and authentication mechanisms protect your data</li>
              <li><strong>Regular Audits:</strong> We conduct regular security audits and vulnerability assessments</li>
              <li><strong>Secure Infrastructure:</strong> Our systems are hosted on secure, compliant cloud infrastructure</li>
              <li><strong>Employee Training:</strong> Our team receives regular security and privacy training</li>
            </ul>
            <p>
              While we strive to protect your information, no method of transmission over the internet or electronic storage is 100% secure. We cannot guarantee absolute security but are committed to maintaining the highest security standards.
            </p>
          </section>

          <section className="privacy-section">
            <h2>6. Your Rights and Choices</h2>
            <p>You have the following rights regarding your personal information:</p>

            <h3>6.1 Access and Portability</h3>
            <ul>
              <li>Request access to your personal information</li>
              <li>Obtain a copy of your data in a portable format</li>
              <li>Review how your information is being used</li>
            </ul>

            <h3>6.2 Correction and Updates</h3>
            <ul>
              <li>Update or correct your personal information</li>
              <li>Modify your account settings and preferences</li>
              <li>Change your communication preferences</li>
            </ul>

            <h3>6.3 Deletion and Restriction</h3>
            <ul>
              <li>Request deletion of your personal information</li>
              <li>Restrict processing of your data</li>
              <li>Withdraw consent for data processing</li>
            </ul>

            <h3>6.4 Opt-Out Options</h3>
            <ul>
              <li>Unsubscribe from marketing communications</li>
              <li>Disable certain data collection features</li>
              <li>Disconnect social media accounts</li>
            </ul>
          </section>

          <section className="privacy-section">
            <h2>7. Data Retention</h2>
            <p>We retain your information for as long as necessary to:</p>
            <ul>
              <li>Provide our services to you</li>
              <li>Comply with legal obligations</li>
              <li>Resolve disputes and enforce agreements</li>
              <li>Improve our AI algorithms and services</li>
            </ul>
            <p>
              When you delete your account, we will delete or anonymize your personal information within 30 days, except where we are required to retain certain information for legal or regulatory purposes.
            </p>
          </section>

          <section className="privacy-section">
            <h2>8. International Data Transfers</h2>
            <p>
              Your information may be transferred to and processed in countries other than your country of residence. We ensure that such transfers comply with applicable data protection laws and implement appropriate safeguards, including:
            </p>
            <ul>
              <li>Standard contractual clauses approved by regulatory authorities</li>
              <li>Adequacy decisions by relevant data protection authorities</li>
              <li>Certification schemes and codes of conduct</li>
            </ul>
          </section>

          <section className="privacy-section">
            <h2>9. Children's Privacy</h2>
            <p>
              Our services are not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take steps to delete such information promptly.
            </p>
          </section>

          <section className="privacy-section">
            <h2>10. Changes to This Privacy Policy</h2>
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

          <section className="privacy-section">
            <h2>11. Contact Us</h2>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
            </p>
            <div className="contact-info">
              <p><strong>Email:</strong> privacy@sentientai.com</p>
              <p><strong>Address:</strong> Sentient Marketting Privacy Team<br />
              123 AI Innovation Drive<br />
              Tech Valley, CA 94000<br />
              United States</p>
              <p><strong>Phone:</strong> +1 (555) 123-4567</p>
            </div>
            <p>
              We will respond to your inquiries within 30 days and work with you to resolve any privacy concerns.
            </p>
          </section>

          <section className="privacy-section">
            <h2>12. Compliance and Certifications</h2>
            <p>
              Sentient Marketting is committed to maintaining compliance with applicable privacy laws and regulations, including:
            </p>
            <ul>
              <li>General Data Protection Regulation (GDPR)</li>
              <li>California Consumer Privacy Act (CCPA)</li>
              <li>Children's Online Privacy Protection Act (COPPA)</li>
              <li>SOC 2 Type II certification</li>
              <li>ISO 27001 information security standards</li>
            </ul>
          </section>
        </motion.div>
      </div>
    </div>
  );
};

export default PrivacyPolicy; 