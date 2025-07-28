import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUsage } from '../../context/UsageContext';
import { useAuth } from '../../context/AuthContext';
import AccessControlPopup from './AccessControlPopup';
import { 
  FiRefreshCw,
  FiActivity,
  FiEdit3,
  FiMessageCircle,
  FiCpu,
  FiTarget,
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiPause,
  FiSearch,
  FiTrash2,
  FiLink,
  FiZap,
  FiShield,
  FiSettings,
  FiBarChart,
  FiLock
} from 'react-icons/fi';
import './UsageTracker.css';

const UsageTracker: React.FC = () => {
  const { usage, getUserLimits, isFeatureBlocked, trackFeatureUsage, resetUsage, refreshUsage, isLoading } = useUsage();
  const { currentUser } = useAuth();
  const [showDetails, setShowDetails] = useState(false);
  const [showTestSection, setShowTestSection] = useState(false);
  const [showDebugSection, setShowDebugSection] = useState(false);
  const [testingFeature, setTestingFeature] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [realTimeTracking, setRealTimeTracking] = useState<boolean>(true);
  
  // Upgrade popup state
  const [showUpgradePopup, setShowUpgradePopup] = useState(false);
  const [blockedFeature, setBlockedFeature] = useState<'posts' | 'discussions' | 'aiReplies' | 'campaigns' | 'resets' | null>(null);

  const limits = getUserLimits();

  const getUsagePercentage = (current: number, limit: number): number => {
    if (limit === -1) return 0; // Unlimited
    return Math.min((current / limit) * 100, 100);
  };

  const getStatusColor = (current: number, limit: number): string => {
    if (limit === -1) return '#00ffcc'; // Unlimited - cyan
    const percentage = getUsagePercentage(current, limit);
    if (percentage >= 90) return '#ff4444'; // Red - critical
    if (percentage >= 70) return '#ffaa00'; // Orange - warning
    return '#00ffcc'; // Cyan - good
  };

  const getStatusText = (current: number, limit: number): string => {
    if (limit === -1) return 'Unlimited';
    const percentage = getUsagePercentage(current, limit);
    if (percentage >= 100) return 'Limit Reached';
    if (percentage >= 90) return 'Almost Full';
    if (percentage >= 70) return 'Getting High';
    return 'Available';
  };

  const handleFeatureClick = (feature: string) => {
    if (isFeatureBlocked(feature as any)) {
      // Show upgrade popup instead of alert
      setBlockedFeature(feature as any);
      setShowUpgradePopup(true);
    }
  };
  
  // Reset dashboard button handler
  const handleResetClick = async () => {
    if (isFeatureBlocked('resets')) {
      setBlockedFeature('resets');
      setShowUpgradePopup(true);
      return;
    }
    addDebugLog('User initiated dashboard reset');
    try {
      await trackFeatureUsage('resets', 'ui', 'reset_dashboard');
      resetUsage();
      addDebugLog('Dashboard reset completed');
    } catch (error) {
      addDebugLog(`Dashboard reset failed: ${error}`);
    }
  };

  // Debug log function
  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    setDebugLogs(prev => [logEntry, ...prev.slice(0, 19)]); // Keep last 20 logs
    console.log(`[UsageTracker-Debug] ${message}`);
  };

  // Real-time tracking monitor
  useEffect(() => {
    if (!currentUser?.uid || !realTimeTracking) return;

    const handleUsageUpdate = (event: any) => {
      addDebugLog(`Cross-tab usage update detected: ${JSON.stringify(event.detail.usage)}`);
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key?.includes(`usage_${currentUser.uid}`) && event.newValue) {
        addDebugLog(`LocalStorage usage change: ${event.key} -> ${event.newValue}`);
      }
    };

    window.addEventListener('usageUpdated', handleUsageUpdate);
    window.addEventListener('storage', handleStorageChange);
    
    addDebugLog(`Real-time tracking monitor started for user ${currentUser.uid}`);
    
    return () => {
      window.removeEventListener('usageUpdated', handleUsageUpdate);
      window.removeEventListener('storage', handleStorageChange);
      addDebugLog(`Real-time tracking monitor stopped`);
    };
  }, [currentUser?.uid, realTimeTracking]);

  // Monitor usage changes
  useEffect(() => {
    addDebugLog(`Usage updated: Posts=${usage.posts}, Discussions=${usage.discussions}, AI Replies=${usage.aiReplies}, Campaigns=${usage.campaigns}`);
  }, [usage]);

  // Test function to validate tracking system
  const testFeatureTracking = async (feature: 'posts' | 'discussions' | 'aiReplies' | 'campaigns') => {
    if (!currentUser?.uid) {
      alert('Please log in to test tracking');
      return;
    }

    setTestingFeature(feature);
    addDebugLog(`🚀 BATTLE TEST: Starting ${feature} tracking test...`);
    
    try {
      const beforeUsage = usage[feature];
      const beforeLimits = getUserLimits();
      const currentLimit = beforeLimits[feature];
      
      addDebugLog(`📊 BEFORE: ${feature} = ${beforeUsage}/${currentLimit === -1 ? '∞' : currentLimit}`);
      
      // Check if this would exceed limits
      if (currentLimit !== -1 && beforeUsage >= currentLimit) {
        addDebugLog(`🚫 LIMIT REACHED: ${feature} is at limit (${beforeUsage}/${currentLimit})`);
        addDebugLog(`🔄 This should trigger upgrade popup...`);
      }
      
      // Perform the tracking
      await trackFeatureUsage(feature, 'battle_test', 'manual_verification_test');
      
      addDebugLog(`✅ ${feature} tracking API call completed!`);
      
      // Wait for state update and refresh
      await new Promise(resolve => setTimeout(resolve, 1000));
      await refreshUsage();
      
      // Check results after refresh
      setTimeout(async () => {
        const afterUsage = usage[feature];
        const expectedUsage = Math.min(beforeUsage + 1, currentLimit === -1 ? beforeUsage + 1 : currentLimit);
        
        addDebugLog(`📊 AFTER: ${feature} = ${afterUsage}/${currentLimit === -1 ? '∞' : currentLimit} (Expected: ${expectedUsage})`);
        
        if (afterUsage === expectedUsage) {
          addDebugLog(`✅ BATTLE TEST PASSED! ${feature} tracking working correctly.`);
        } else {
          addDebugLog(`❌ BATTLE TEST FAILED! ${feature} should be ${expectedUsage} but is ${afterUsage}`);
        }
        
        // Test limit enforcement
        if (currentLimit !== -1 && afterUsage >= currentLimit) {
          addDebugLog(`🚫 LIMIT TEST: ${feature} is now at/over limit - upgrade popup should appear for next usage`);
        }
        
        addDebugLog(`🏁 BATTLE TEST COMPLETE for ${feature}`);
      }, 2000);
      
    } catch (error) {
      console.error(`[UsageTracker] ${feature} battle test failed:`, error);
      addDebugLog(`❌ ${feature} battle test failed: ${error}`);
      alert(`${feature} battle test failed. Check console for details.`);
    } finally {
      setTimeout(() => setTestingFeature(null), 3000);
    }
  };

  // Debug backend connection
  const testBackendConnection = async () => {
    if (!currentUser?.uid) {
      addDebugLog('No current user for backend test');
      return;
    }

    addDebugLog('Testing backend connection...');
    
    try {
      const response = await fetch(`/api/user/${currentUser.uid}/usage`);
      if (response.ok) {
        const backendUsage = await response.json();
        addDebugLog(`Backend connected! Usage: ${JSON.stringify(backendUsage)}`);
      } else {
        addDebugLog(`Backend response error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      addDebugLog(`Backend connection failed: ${error}`);
    }
  };

  // Clear debug logs
  const clearDebugLogs = () => {
    setDebugLogs([]);
    addDebugLog('Debug logs cleared');
  };

  const features = [
    {
      key: 'posts',
      name: 'Posts',
      icon: <FiEdit3 size={20} />,
      description: 'Create and schedule posts across platforms',
      realTimeInfo: 'Tracked when you: Create posts via chat, schedule posts, publish "Post Now", auto-schedule posts'
    },
    {
      key: 'discussions',
      name: 'Discussions',
      icon: <FiMessageCircle size={20} />,
      description: 'Engage in AI-powered conversations',
      realTimeInfo: 'Tracked when you: Send chat messages, reply to DMs/comments manually, engage in discussions'
    },
    {
      key: 'aiReplies',
      name: 'AI Replies',
      icon: <FiCpu size={20} />,
      description: 'Generate intelligent responses',
      realTimeInfo: 'Tracked when you: Generate AI replies, send auto-replies, use "Reply with AI" feature'
    },
    {
      key: 'campaigns',
      name: 'Campaigns',
      icon: <FiTarget size={20} />,
      description: 'Advanced marketing campaigns',
      realTimeInfo: 'Tracked when you: Set campaign goals, start campaigns, manage campaign activities'
    },
    {
      key: 'resets',
      name: 'Resets',
      icon: <FiRefreshCw size={20} />,
      description: 'Reset your dashboard',
      realTimeInfo: 'Tracked when you: press the reset button'
    }
  ];

  return (
    <>
      <div className="usage-tracker">
        <div className="usage-header">
          <h3><FiRefreshCw size={18} /> Real-Time Usage Tracking</h3>
          <p className="usage-subtitle">
            <FiCheck size={16} /> Connected to actual platform features - tracking system active!
            {isLoading && <span className="loading-indicator"> <FiRefreshCw size={14} /> Syncing...</span>}
          </p>
          <div className="tracking-status">
            <span className={`status-indicator ${realTimeTracking ? 'active' : 'inactive'}`}>
              {realTimeTracking ? <><FiActivity size={14} /> Real-time ON</> : <><FiPause size={14} /> Real-time OFF</>}
            </span>
            <button 
              className="toggle-tracking-btn"
              onClick={() => setRealTimeTracking(!realTimeTracking)}
            >
              {realTimeTracking ? 'Disable' : 'Enable'} Monitoring
            </button>
          </div>
        </div>

        <div className="usage-grid">
          {features.map((feature) => {
            const current = usage[feature.key as keyof typeof usage] || 0;
            const limit = limits[feature.key as keyof typeof limits];
            const percentage = getUsagePercentage(current, limit);
            const statusColor = getStatusColor(current, limit);
            const statusText = getStatusText(current, limit);
            const isBlocked = isFeatureBlocked(feature.key as any);

            return (
              <motion.div
                key={feature.key}
                className={`usage-card ${isBlocked ? 'blocked' : 'available'}`}
                whileHover={{ scale: isBlocked ? 1.0 : 1.02 }}
                whileTap={{ scale: isBlocked ? 1.0 : 0.98 }}
                onClick={() => feature.key === 'resets' ? handleResetClick() : handleFeatureClick(feature.key)}
                style={{ cursor: isBlocked ? 'not-allowed' : 'pointer' }}
              >
                <div className="usage-card-header">
                  <span className="usage-icon">{feature.icon}</span>
                  <div className="usage-info">
                    <h4>{feature.name}</h4>
                    <p className="usage-description">{feature.description}</p>
                  </div>
                </div>

                <div className="usage-stats">
                  <div className="usage-numbers">
                    <span className="current-usage">{current}</span>
                    <span className="usage-separator">/</span>
                    <span className="limit-usage">
                      {limit === -1 ? '∞' : limit}
                    </span>
                  </div>
                  <div className="usage-status" style={{ color: statusColor }}>
                    {statusText}
                  </div>
                </div>

                <div className="usage-bar">
                  <div 
                    className="usage-fill"
                    style={{ 
                      width: `${percentage}%`,
                      backgroundColor: statusColor
                    }}
                  />
                </div>

                <div className="real-time-info">
                  <small><FiRefreshCw size={12} /> {feature.realTimeInfo}</small>
                </div>

                {isBlocked && (
                  <div className="blocked-overlay">
                    <span><FiLock size={16} /> {feature.key === 'campaigns' ? 'Premium Feature' : 'Limit Reached'}</span>
                    <button 
                      className="upgrade-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBlockedFeature(feature.key as any);
                        setShowUpgradePopup(true);
                      }}
                    >
                      Upgrade
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className="usage-footer">
          <motion.button
            className="details-toggle"
            onClick={() => setShowDetails(!showDetails)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {showDetails ? <><FiChevronUp size={16} /> Hide Details</> : <><FiChevronDown size={16} /> How Real-Time Tracking Works</>}
          </motion.button>

          <motion.button
            className="test-toggle"
            onClick={() => setShowTestSection(!showTestSection)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{ 
              background: 'linear-gradient(135deg, #ff6b35, #ff8c42)',
              marginLeft: '10px'
            }}
          >
            {showTestSection ? <><FiChevronUp size={16} /> Hide Tests</> : <><FiZap size={16} /> Test Tracking System</>}
          </motion.button>

          <motion.button
            className="debug-toggle"
            onClick={() => setShowDebugSection(!showDebugSection)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{ 
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              marginLeft: '10px'
            }}
          >
            {showDebugSection ? <><FiChevronUp size={16} /> Hide Debug</> : <><FiSearch size={16} /> Debug Tracking</>}
          </motion.button>

          <AnimatePresence>
            {showDebugSection && (
              <motion.div
                className="debug-section"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <h4><FiSearch size={16} /> Real-Time Tracking Debug Console</h4>
                <div className="debug-controls">
                  <button onClick={testBackendConnection} className="debug-btn">
                    <FiLink size={14} /> Test Backend Connection
                  </button>
                  <button onClick={clearDebugLogs} className="debug-btn">
                    <FiTrash2 size={14} /> Clear Logs
                  </button>
                  <button onClick={() => refreshUsage()} className="debug-btn">
                    <FiRefreshCw size={14} /> Force Refresh Usage
                  </button>
                </div>
                <div className="debug-logs">
                  <h5><FiBarChart size={14} /> Debug Logs (Live):</h5>
                  <div className="logs-container">
                    {debugLogs.length === 0 ? (
                      <div className="no-logs">No debug logs yet. Perform some actions to see tracking in real-time!</div>
                    ) : (
                      debugLogs.map((log, index) => (
                        <div key={index} className={`log-entry ${log.includes('❌') ? 'error' : log.includes('✅') ? 'success' : 'info'}`}>
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showTestSection && (
              <motion.div
                className="test-section"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <h4><FiZap size={16} /> Test Real-Time Tracking</h4>
                <p>Click these buttons to test if the tracking system is working properly:</p>
                <div className="test-buttons">
                  {features.map((feature) => (
                    <button
                      key={feature.key}
                      className={`test-btn ${testingFeature === feature.key ? 'testing' : ''}`}
                      onClick={() => testFeatureTracking(feature.key as any)}
                      disabled={testingFeature !== null}
                    >
                      {testingFeature === feature.key ? (
                        <><FiRefreshCw size={14} /> Testing...</>
                      ) : (
                        <>Test {feature.icon} {feature.name}</>
                      )}
                    </button>
                  ))}
                </div>
                <div className="test-info">
                  <small>
                    <FiSettings size={12} /> These test buttons will increment your usage counters to verify the tracking system is working.
                    Watch the usage bars above update in real-time!
                  </small>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showDetails && (
              <motion.div
                className="tracking-details"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <h4><FiTarget size={16} /> Professional Usage Tracking</h4>
                <div className="tracking-explanation">
                  <div className="tracking-point">
                    <strong><FiEdit3 size={14} /> Posts:</strong> Tracked when you actually create content through chat mode, schedule posts, publish via "Post Now", or use auto-scheduling features.
                  </div>
                  <div className="tracking-point">
                    <strong><FiMessageCircle size={14} /> Discussions:</strong> Tracked when you send messages in discussion mode, manually reply to DMs/comments, or engage in AI conversations.
                  </div>
                  <div className="tracking-point">
                    <strong><FiCpu size={14} /> AI Replies:</strong> Tracked when you generate AI responses, use auto-reply features, or send AI-powered replies to notifications.
                  </div>
                  <div className="tracking-point">
                    <strong><FiTarget size={14} /> Campaigns:</strong> Tracked when you set campaign goals, start marketing campaigns, or manage campaign activities.
                  </div>
                </div>
                <div className="tracking-benefits">
                  <h5><FiZap size={14} /> Benefits of Real-Time Tracking:</h5>
                  <ul>
                    <li><FiRefreshCw size={12} /> Accurate usage monitoring across all platforms</li>
                    <li><FiZap size={12} /> Instant limit enforcement when features are used</li>
                    <li><FiBarChart size={12} /> Transparent usage analytics</li>
                    <li><FiShield size={12} /> Prevents overuse and ensures fair access</li>
                    <li><FiTarget size={12} /> Seamless integration with actual workflows</li>
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Upgrade Popup */}
      <AccessControlPopup
        isOpen={showUpgradePopup}
        onClose={() => setShowUpgradePopup(false)}
        feature={blockedFeature || 'posts'}
        reason={`You've reached your ${blockedFeature || 'feature'} limit`}
        limitReached={true}
        upgradeRequired={blockedFeature === 'campaigns'}
        redirectToPricing={true}
        currentUsage={{
          used: blockedFeature ? usage[blockedFeature] : 0,
          limit: blockedFeature ? (limits[blockedFeature] === -1 ? 'unlimited' : limits[blockedFeature]) : 0
        }}
      />
    </>
  );
};

export default UsageTracker; 