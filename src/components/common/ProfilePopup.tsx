import React, { useState, useEffect } from 'react';
import './ProfilePopup.css';
import { motion } from 'framer-motion';
import axios from 'axios';
import ErrorBoundary from '../ErrorBoundary';
import { useAuth } from '../../context/AuthContext';
import { disconnectInstagramAccount, isInstagramConnected } from '../../utils/instagramSessionManager';
import { disconnectFacebookAccount, isFacebookConnected } from '../../utils/facebookSessionManager';
import { disconnectTwitterAccount, isTwitterConnected } from '../../utils/twitterSessionManager';
import { useFacebook } from '../../context/FacebookContext';
import { useTwitter } from '../../context/TwitterContext';
import { 
  FiCreditCard, 
  FiCalendar, 
  FiDollarSign, 
  FiDownload, 
  FiEdit3, 
  FiTrash2,
  FiPlus,
  FiCheck,
  FiX
} from 'react-icons/fi';

interface ProfilePopupProps {
  username: string;
  onClose: () => void;
  platform?: 'instagram' | 'twitter' | 'facebook' | 'linkedin';
}

const ProfilePopup: React.FC<ProfilePopupProps> = ({ username, onClose, platform = 'instagram' }) => {
  const normalizedPlatform = (platform || 'instagram').toLowerCase() as 'instagram' | 'twitter' | 'facebook' | 'linkedin';
  const [activeTab, setActiveTab] = useState<'Rules' | 'Billing Method' | 'Name' | 'Account'>('Rules');
  const [rules, setRules] = useState<string | null>(null);
  const [savedRules, setSavedRules] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isEditingRules, setIsEditingRules] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const maxRulesLength = 1000;
  
  // Billing method states
  const [showAddPaymentMethod, setShowAddPaymentMethod] = useState(false);
  const [_selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
  
  // Platform-specific connection states
  const [isConnectedToInstagram, setIsConnectedToInstagram] = useState(false);
  const [isConnectedToFacebook, setIsConnectedToFacebook] = useState(false);
  const [isConnectedToTwitter, setIsConnectedToTwitter] = useState(false);
  const { currentUser } = useAuth();
  const { isConnected: isFacebookConnectedContext, disconnectFacebook } = useFacebook();
  const { isConnected: isTwitterConnectedContext, disconnectTwitter } = useTwitter();

  // Get platform display name (normalized)
  const platformName = normalizedPlatform === 'twitter' ? 'X (Twitter)' : 
                      normalizedPlatform === 'facebook' ? 'Facebook' : 
                      normalizedPlatform === 'linkedin' ? 'LinkedIn' : 
                      'Instagram';

  // Dummy billing data - in production this would come from your payment provider
  const paymentMethods = [
    {
      id: '1',
      type: 'card',
      brand: 'Visa',
      last4: '4242',
      expiryMonth: 12,
      expiryYear: 2025,
      isDefault: true
    },
    {
      id: '2',
      type: 'card',
      brand: 'Mastercard',
      last4: '5555',
      expiryMonth: 8,
      expiryYear: 2026,
      isDefault: false
    }
  ];

  const billingHistory = [
    {
      id: '1',
      date: '2024-01-15',
      amount: 29.99,
      status: 'paid',
      plan: 'Premium Plan',
      invoiceUrl: '#'
    },
    {
      id: '2',
      date: '2023-12-15',
      amount: 29.99,
      status: 'paid',
      plan: 'Premium Plan',
      invoiceUrl: '#'
    },
    {
      id: '3',
      date: '2023-11-15',
      amount: 29.99,
      status: 'paid',
      plan: 'Premium Plan',
      invoiceUrl: '#'
    }
  ];

  const currentSubscription = {
    plan: 'Premium Plan',
    status: 'active',
    nextBillingDate: '2024-02-15',
    amount: 29.99
  };

  useEffect(() => {
    if (activeTab === 'Rules') {
      const fetchRules = async () => {
        setIsLoading(true);
        setError(null);
        try {
          // Make platform-aware request to server using normalized platform
          const response = await axios.get(`/api/rules/${username}?platform=${normalizedPlatform}`);
          setRules(response.data.rules || '');
          setSavedRules(response.data.rules || '');
          setIsEditingRules(false);
          setShowPreview(false);
        } catch (err) {
          if (axios.isAxiosError(err) && err.response?.status === 404) {
            setRules('');
            setSavedRules('');
            setIsEditingRules(true);
            setShowPreview(false);
          } else {
            setError('Failed to load rules.');
            setRules('');
            setSavedRules('');
            setIsEditingRules(false);
          }
        } finally {
          setIsLoading(false);
        }
      };
      fetchRules();
    }
  }, [activeTab, username, platform]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Check platform-specific connection status using session managers for consistency
  useEffect(() => {
    if (currentUser?.uid) {
      if (platform === 'instagram') {
        const connected = isInstagramConnected(currentUser.uid);
        setIsConnectedToInstagram(connected);
      } else if (platform === 'facebook') {
        // Use both session manager and context for consistency
        const connectedSession = isFacebookConnected(currentUser.uid);
        const connectedContext = isFacebookConnectedContext;
        setIsConnectedToFacebook(connectedSession || connectedContext);
      } else if (platform === 'twitter') {
        // Use both session manager and context for consistency
        const connectedSession = isTwitterConnected(currentUser.uid);
        const connectedContext = isTwitterConnectedContext;
        setIsConnectedToTwitter(connectedSession || connectedContext);
      }
    }
  }, [currentUser, platform, isFacebookConnectedContext, isTwitterConnectedContext]);

  const handleSubmitRules = async () => {
    if (!rules?.trim()) {
      setError('Rules cannot be empty.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
  // Make platform-aware request to server using normalized platform
  await axios.post(`/api/rules/${username}?platform=${normalizedPlatform}`, { rules });
      setSavedRules(rules);
      setIsEditingRules(false);
      setShowPreview(true);
      setToastMessage(`${platformName} rules saved successfully!`);
    } catch (err) {
      setError('Failed to save rules.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setRules(savedRules);
    setIsEditingRules(false);
    setShowPreview(!!savedRules);
    setError(null);
  };

  const handleClearRules = () => {
    setRules('');
    setError(null);
  };

  const handleAddOrEditRules = () => {
    setIsEditingRules(true);
    setShowPreview(false);
  };

  const isDirty = rules !== savedRules;

  // Handle platform-specific disconnection using session managers
  const handleDisconnectPlatform = async () => {
    if (!currentUser?.uid) {
      setError('No authenticated user found');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      if (platform === 'instagram') {
        await disconnectInstagramAccount(currentUser.uid);
        setToastMessage('Instagram account disconnected successfully!');
        setIsConnectedToInstagram(false);
      } else if (platform === 'facebook') {
        // Use session manager for consistency
        await disconnectFacebookAccount(currentUser.uid);
        // Also call context disconnect for UI updates
        disconnectFacebook();
        setToastMessage('Facebook account disconnected successfully!');
        setIsConnectedToFacebook(false);
      } else if (platform === 'twitter') {
        // Use session manager for consistency
        await disconnectTwitterAccount(currentUser.uid);
        // Also call context disconnect for UI updates
        disconnectTwitter();
        setToastMessage('X (Twitter) account disconnected successfully!');
        setIsConnectedToTwitter(false);
      }
      
      // Refresh the page after a brief delay to update the UI
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error: any) {
      console.error(`Error disconnecting ${platformName}:`, error);
      setError(`Failed to disconnect ${platformName} account`);
    } finally {
      setIsLoading(false);
    }
  };

  // Get current platform connection status
  const getCurrentPlatformConnectionStatus = () => {
    switch (normalizedPlatform) {
      case 'instagram':
        return isConnectedToInstagram;
      case 'facebook':
        return isConnectedToFacebook;
      case 'twitter':
        return isConnectedToTwitter;
      case 'linkedin':
        return false; // LinkedIn connection status not yet supported here
      default:
        return false;
    }
  };

  const isConnectedToPlatform = getCurrentPlatformConnectionStatus();

  // Billing method handlers
  const handleAddPaymentMethod = () => {
    setShowAddPaymentMethod(true);
  };

  const handleSavePaymentMethod = () => {
    // In production, this would integrate with Stripe/PayPal/etc.
    setToastMessage('Payment method added successfully!');
    setShowAddPaymentMethod(false);
  };

  const handleSetDefaultPaymentMethod = (methodId: string) => {
    // In production, this would update the default payment method
    setSelectedPaymentMethod(methodId);
    setToastMessage('Default payment method updated!');
  };

  const handleDeletePaymentMethod = (_methodId: string) => {
    // In production, this would delete the payment method
    setToastMessage('Payment method removed successfully!');
  };

  const handleDownloadInvoice = (_invoiceUrl: string) => {
    // In production, this would download the actual invoice
    setToastMessage('Invoice download started!');
  };

  return (
    <ErrorBoundary>
      <motion.div
        className="profile-popup-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      >
        <motion.div
          className="profile-popup-content"
          initial={{ scale: 0.8, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, y: 50 }}
          transition={{ duration: 0.3 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="popup-sidebar">
            <motion.button
              className={`sidebar-button ${activeTab === 'Rules' ? 'active' : ''}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('Rules')}
            >
              Rules
            </motion.button>
            <motion.button
              className={`sidebar-button ${activeTab === 'Account' ? 'active' : ''}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('Account')}
            >
              Account
            </motion.button>
            <motion.button
              className={`sidebar-button ${activeTab === 'Billing Method' ? 'active' : ''}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('Billing Method')}
            >
              <FiCreditCard size={16} /> Billing Method
            </motion.button>
            <motion.button
              className="sidebar-button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled
            >
              Name
            </motion.button>
          </div>
          <div className="popup-main">
            {activeTab === 'Rules' ? (
              <div className="rules-section">
                <motion.div
                  className="rules-header"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <h3>{platformName} Manager Rules for {username}</h3>
                  {rules && rules.trim() && !isEditingRules && (
                    <motion.button
                      className="edit-rules-button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleAddOrEditRules}
                    >
                      Edit Rules
                    </motion.button>
                  )}
                </motion.div>
                {isLoading ? (
                  <div className="loading">Loading...</div>
                ) : !rules && !isEditingRules ? (
                  <motion.div
                    className="no-rules-container"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <p className="no-rules-text">
                      No {platformName} rules set yet. Define how your manager should operate on {platformName}!
                    </p>
                    <motion.button
                      className="add-rules-button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleAddOrEditRules}
                    >
                      Add {platformName} Rules
                    </motion.button>
                  </motion.div>
                ) : isEditingRules ? (
                  <motion.div
                    className="rules-edit-container"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="textarea-wrapper">
                      <textarea
                        value={rules || ''}
                        onChange={(e) => setRules(e.target.value)}
                        placeholder={`Enter rules for ${platformName} manager behavior (e.g., What things should not be discussed in DMs, tone, content guidelines, etc.)...`}
                        className="rules-textarea"
                        maxLength={maxRulesLength}
                      />
                      <div className="char-counter">
                        {rules?.length || 0}/{maxRulesLength}
                      </div>
                    </div>
                    {error && <p className="error">{error}</p>}
                    <div className="rules-action-buttons">
                      <motion.button
                        className="submit-button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleSubmitRules}
                        disabled={isLoading || !rules?.trim() || !isDirty}
                      >
                        {isLoading ? 'Saving...' : `Save ${platformName} Rules`}
                      </motion.button>
                      <motion.button
                        className="clear-button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleClearRules}
                        disabled={isLoading || !rules?.trim()}
                      >
                        Clear Rules
                      </motion.button>
                      <motion.button
                        className="cancel-button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleCancelEdit}
                        disabled={isLoading}
                      >
                        Cancel
                      </motion.button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    className="rules-display-container"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="rules-toggle">
                      <motion.button
                        className={`toggle-button ${showPreview ? 'active' : ''}`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowPreview(true)}
                      >
                        Preview
                      </motion.button>
                      <motion.button
                        className={`toggle-button ${!showPreview ? 'active' : ''}`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowPreview(false)}
                      >
                        Raw
                      </motion.button>
                    </div>
                    <div className="rules-content">
                      {showPreview ? (
                        rules?.split('\n').map((line, index) => (
                          <p key={index} className="rule-line">
                            {line}
                          </p>
                        ))
                      ) : (
                        <pre className="rules-raw">{rules}</pre>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            ) : activeTab === 'Account' ? (
              <motion.div
                className="account-section"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="account-header"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <h3>{platformName} Account Settings for {username}</h3>
                </motion.div>
                
                <div className="account-options">
                  <div className="account-option">
                    <h4>{platformName} Connection</h4>
                    {isConnectedToPlatform ? (
                      <>
                        <p>Your {platformName} account is connected. You can disconnect it at any time.</p>
                        <motion.button
                          className="disconnect-platform-button"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={handleDisconnectPlatform}
                          disabled={isLoading}
                        >
                          {isLoading ? 'Disconnecting...' : `Disconnect ${platformName}`}
                        </motion.button>
                      </>
                    ) : (
                      <p>No {platformName} account connected. You can connect your {platformName} account from the dashboard.</p>
                    )}
                  </div>
                </div>
                
                {error && <p className="error">{error}</p>}
              </motion.div>
            ) : activeTab === 'Billing Method' ? (
              <motion.div
                className="billing-section"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="billing-header"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <h3><FiCreditCard size={20} /> Billing & Subscription Management</h3>
                  <p>Manage your payment methods and billing information</p>
                </motion.div>

                {/* Current Subscription */}
                <div className="subscription-info">
                  <h4>Current Subscription</h4>
                  <div className="subscription-card">
                    <div className="subscription-details">
                      <div className="plan-info">
                        <span className="plan-name">{currentSubscription.plan}</span>
                        <span className={`status ${currentSubscription.status}`}>
                          <FiCheck size={14} /> {currentSubscription.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="billing-info">
                        <span className="amount">${currentSubscription.amount}/month</span>
                        <span className="next-billing">
                          <FiCalendar size={14} /> Next billing: {currentSubscription.nextBillingDate}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Methods */}
                <div className="payment-methods">
                  <div className="section-header">
                    <h4>Payment Methods</h4>
                    <motion.button
                      className="add-payment-btn"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleAddPaymentMethod}
                    >
                      <FiPlus size={16} /> Add Payment Method
                    </motion.button>
                  </div>
                  
                  <div className="payment-methods-list">
                    {paymentMethods.map((method) => (
                      <div key={method.id} className={`payment-method-card ${method.isDefault ? 'default' : ''}`}>
                        <div className="payment-method-info">
                          <FiCreditCard size={20} />
                          <div className="card-details">
                            <span className="card-brand">{method.brand} •••• {method.last4}</span>
                            <span className="card-expiry">Expires {method.expiryMonth}/{method.expiryYear}</span>
                          </div>
                          {method.isDefault && <span className="default-badge">Default</span>}
                        </div>
                        <div className="payment-method-actions">
                          {!method.isDefault && (
                            <button
                              className="set-default-btn"
                              onClick={() => handleSetDefaultPaymentMethod(method.id)}
                            >
                              Set Default
                            </button>
                          )}
                          <button
                            className="edit-btn"
                            onClick={() => setToastMessage('Edit payment method functionality coming soon!')}
                          >
                            <FiEdit3 size={14} />
                          </button>
                          <button
                            className="delete-btn"
                            onClick={() => handleDeletePaymentMethod(method.id)}
                            disabled={method.isDefault}
                          >
                            <FiTrash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add Payment Method Form */}
                {showAddPaymentMethod && (
                  <motion.div
                    className="add-payment-form"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <h4>Add New Payment Method</h4>
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Card Number</label>
                        <input type="text" placeholder="1234 5678 9012 3456" />
                      </div>
                      <div className="form-group">
                        <label>Expiry Date</label>
                        <input type="text" placeholder="MM/YY" />
                      </div>
                      <div className="form-group">
                        <label>CVC</label>
                        <input type="text" placeholder="123" />
                      </div>
                      <div className="form-group">
                        <label>Cardholder Name</label>
                        <input type="text" placeholder="John Doe" />
                      </div>
                    </div>
                    <div className="form-actions">
                      <button className="save-btn" onClick={handleSavePaymentMethod}>
                        <FiCheck size={16} /> Save Payment Method
                      </button>
                      <button className="cancel-btn" onClick={() => setShowAddPaymentMethod(false)}>
                        <FiX size={16} /> Cancel
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Billing History */}
                <div className="billing-history">
                  <h4>Billing History</h4>
                  <div className="billing-history-list">
                    {billingHistory.map((invoice) => (
                      <div key={invoice.id} className="billing-history-item">
                        <div className="invoice-info">
                          <span className="invoice-date">{invoice.date}</span>
                          <span className="invoice-plan">{invoice.plan}</span>
                        </div>
                        <div className="invoice-details">
                          <span className="invoice-amount">
                            <FiDollarSign size={14} /> ${invoice.amount}
                          </span>
                          <span className={`invoice-status ${invoice.status}`}>
                            <FiCheck size={14} /> {invoice.status.toUpperCase()}
                          </span>
                          <button
                            className="download-btn"
                            onClick={() => handleDownloadInvoice(invoice.invoiceUrl)}
                          >
                            <FiDownload size={14} /> Download
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="placeholder">
                <p>This feature is coming soon.</p>
              </div>
            )}
          </div>
          
          {toastMessage && (
            <motion.div
              className="toast-message"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
            >
              {toastMessage}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </ErrorBoundary>
  );
};

export default ProfilePopup;