import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUsage } from '../../context/UsageContext';
import { useAuth } from '../../context/AuthContext';
import useFeatureTracking from '../../hooks/useFeatureTracking';
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
  FiLock,
  FiAlertTriangle,
  FiPlay,
  FiSquare,
  FiDatabase,
  FiServer,
  FiWifi,
  FiWifiOff
} from 'react-icons/fi';
import './UsageTracker.css';

interface BattleTestResult {
  feature: string;
  success: boolean;
  beforeCount: number;
  afterCount: number;
  expectedCount: number;
  error?: string;
  timestamp: string;
}

const UsageTracker: React.FC = () => {
  const { usage, getUserLimits, isFeatureBlocked, trackFeatureUsage, resetUsage, refreshUsage, isLoading } = useUsage();
  const { currentUser } = useAuth();
  const { trackRealPostCreation, trackRealDiscussion, trackRealAIReply, trackRealCampaign } = useFeatureTracking();
  
  const [showDetails, setShowDetails] = useState(false);
  const [showTestSection, setShowTestSection] = useState(false);
  const [showDebugSection, setShowDebugSection] = useState(false);
  const [showBattleSection, setShowBattleSection] = useState(false);
  
  // Battle testing state
  const [isBattleTesting, setIsBattleTesting] = useState(false);
  const [battleResults, setBattleResults] = useState<BattleTestResult[]>([]);
  const [currentTest, setCurrentTest] = useState<string | null>(null);
  
  // Debug state
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [realTimeTracking, setRealTimeTracking] = useState<boolean>(true);
  const [backendStatus, setBackendStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  
  // Upgrade popup state
  const [showUpgradePopup, setShowUpgradePopup] = useState(false);
  const [blockedFeature, setBlockedFeature] = useState<'posts' | 'discussions' | 'aiReplies' | 'campaigns' | 'resets' | null>(null);

  const limits = getUserLimits();

  // Debug log function
  const addDebugLog = useCallback((message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    setDebugLogs(prev => [logEntry, ...prev.slice(0, 49)]); // Keep last 50 logs
    console.log(`[UsageTracker-${type.toUpperCase()}] ${message}`);
  }, []);

  // Check backend connection
  const checkBackendConnection = useCallback(async () => {
    if (!currentUser?.uid) return;
    
    setBackendStatus('checking');
    addDebugLog('🔍 Checking backend connection...', 'info');
    
    try {
      const response = await fetch(`/api/user/${currentUser.uid}/usage`);
      if (response.ok) {
        const backendUsage = await response.json();
        setBackendStatus('connected');
        addDebugLog(`✅ Backend connected! Current usage: ${JSON.stringify(backendUsage)}`, 'success');
        return backendUsage;
      } else {
        setBackendStatus('disconnected');
        addDebugLog(`❌ Backend response error: ${response.status} ${response.statusText}`, 'error');
        return null;
      }
    } catch (error) {
      setBackendStatus('disconnected');
      addDebugLog(`❌ Backend connection failed: ${error}`, 'error');
      return null;
    }
  }, [currentUser?.uid, addDebugLog]);

  // Monitor usage changes
  useEffect(() => {
    addDebugLog(`📊 Usage updated: Posts=${usage.posts}, Discussions=${usage.discussions}, AI Replies=${usage.aiReplies}, Campaigns=${usage.campaigns}`, 'info');
  }, [usage, addDebugLog]);

  // Real-time tracking monitor
  useEffect(() => {
    if (!currentUser?.uid || !realTimeTracking) return;

    const handleUsageUpdate = (event: any) => {
      addDebugLog(`🔄 Cross-tab usage update: ${JSON.stringify(event.detail.usage)}`, 'info');
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key?.includes(`usage_${currentUser.uid}`) && event.newValue) {
        addDebugLog(`💾 LocalStorage change: ${event.key} -> ${event.newValue}`, 'info');
      }
    };

    window.addEventListener('usageUpdated', handleUsageUpdate);
    window.addEventListener('storage', handleStorageChange);
    
    addDebugLog(`🚀 Real-time tracking monitor started for user ${currentUser.uid}`, 'success');
    
    return () => {
      window.removeEventListener('usageUpdated', handleUsageUpdate);
      window.removeEventListener('storage', handleStorageChange);
      addDebugLog(`⏹️ Real-time tracking monitor stopped`, 'info');
    };
  }, [currentUser?.uid, realTimeTracking, addDebugLog]);

  // Check backend on mount
  useEffect(() => {
    checkBackendConnection();
  }, [checkBackendConnection]);

  // BATTLE TESTING SYSTEM
  const runBattleTest = useCallback(async (feature: 'posts' | 'discussions' | 'aiReplies' | 'campaigns') => {
    if (!currentUser?.uid) {
      addDebugLog('❌ No current user for battle test', 'error');
      return;
    }

    setIsBattleTesting(true);
    setCurrentTest(feature);
    addDebugLog(`⚔️ BATTLE TEST STARTED: ${feature}`, 'info');
    
    try {
      // Step 1: Get initial state
      const beforeUsage = usage[feature];
      const beforeLimits = getUserLimits();
      const currentLimit = beforeLimits[feature];
      
      addDebugLog(`📊 BEFORE: ${feature} = ${beforeUsage}/${currentLimit === -1 ? '∞' : currentLimit}`, 'info');
      
      // Step 2: Check if this would exceed limits
      if (currentLimit !== -1 && beforeUsage >= currentLimit) {
        addDebugLog(`🚫 LIMIT REACHED: ${feature} is at limit (${beforeUsage}/${currentLimit})`, 'warning');
        addDebugLog(`🔄 This should trigger upgrade popup...`, 'info');
      }
      
      // Step 3: Perform the actual tracking
      let trackingSuccess = false;
      let trackingError = '';
      
      try {
        switch (feature) {
          case 'posts':
            await trackRealPostCreation('battle_test', { immediate: true, type: 'battle_test' });
            break;
          case 'discussions':
            await trackRealDiscussion('battle_test', { messageCount: 1, type: 'chat' });
            break;
          case 'aiReplies':
            await trackRealAIReply('battle_test', { type: 'dm', mode: 'instant' });
            break;
          case 'campaigns':
            await trackRealCampaign('battle_test', { action: 'goal_set' });
            break;
        }
        trackingSuccess = true;
        addDebugLog(`✅ ${feature} tracking API call completed!`, 'success');
      } catch (error) {
        trackingError = error instanceof Error ? error.message : String(error);
        addDebugLog(`❌ ${feature} tracking API call failed: ${trackingError}`, 'error');
      }
      
      // Step 4: Wait for state update and refresh
      addDebugLog(`⏳ Waiting for state update and refresh...`, 'info');
      await new Promise(resolve => setTimeout(resolve, 2000));
      await refreshUsage();
      
      // Step 5: Check results after refresh
      await new Promise(resolve => setTimeout(resolve, 1000));
      const afterUsage = usage[feature];
      const expectedUsage = Math.min(beforeUsage + 1, currentLimit === -1 ? beforeUsage + 1 : currentLimit);
      
      addDebugLog(`📊 AFTER: ${feature} = ${afterUsage}/${currentLimit === -1 ? '∞' : currentLimit} (Expected: ${expectedUsage})`, 'info');
      
      // Step 6: Record battle result
      const result: BattleTestResult = {
        feature,
        success: trackingSuccess && afterUsage === expectedUsage,
        beforeCount: beforeUsage,
        afterCount: afterUsage,
        expectedCount: expectedUsage,
        error: trackingError || (afterUsage !== expectedUsage ? `Expected ${expectedUsage} but got ${afterUsage}` : undefined),
        timestamp: new Date().toISOString()
      };
      
      setBattleResults(prev => [result, ...prev.slice(0, 19)]); // Keep last 20 results
      
      if (result.success) {
        addDebugLog(`🏆 BATTLE TEST PASSED! ${feature} tracking working correctly.`, 'success');
      } else {
        addDebugLog(`💥 BATTLE TEST FAILED! ${feature} should be ${expectedUsage} but is ${afterUsage}`, 'error');
      }
      
      // Step 7: Test limit enforcement
      if (currentLimit !== -1 && afterUsage >= currentLimit) {
        addDebugLog(`🚫 LIMIT TEST: ${feature} is now at/over limit - upgrade popup should appear for next usage`, 'warning');
      }
      
      addDebugLog(`🏁 BATTLE TEST COMPLETE for ${feature}`, 'info');
      
    } catch (error) {
      console.error(`[UsageTracker] ${feature} battle test failed:`, error);
      addDebugLog(`❌ ${feature} battle test failed: ${error}`, 'error');
    } finally {
      setCurrentTest(null);
      setIsBattleTesting(false);
    }
  }, [currentUser?.uid, usage, getUserLimits, trackRealPostCreation, trackRealDiscussion, trackRealAIReply, trackRealCampaign, refreshUsage, addDebugLog]);

  // Run all battle tests
  const runAllBattleTests = useCallback(async () => {
    if (isBattleTesting) return;
    
    addDebugLog('🚀 Starting comprehensive battle test suite...', 'info');
    setBattleResults([]);
    
    const features: ('posts' | 'discussions' | 'aiReplies' | 'campaigns')[] = ['posts', 'discussions', 'aiReplies', 'campaigns'];
    
    for (const feature of features) {
      if (isBattleTesting) break; // Stop if interrupted
      await runBattleTest(feature);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait between tests
    }
    
    addDebugLog('🏁 Comprehensive battle test suite completed!', 'info');
  }, [isBattleTesting, runBattleTest, addDebugLog]);

  // Stop battle testing
  const stopBattleTesting = useCallback(() => {
    setIsBattleTesting(false);
    setCurrentTest(null);
    addDebugLog('⏹️ Battle testing stopped by user', 'info');
  }, [addDebugLog]);

  // Clear debug logs
  const clearDebugLogs = useCallback(() => {
    setDebugLogs([]);
    addDebugLog('🧹 Debug logs cleared', 'info');
  }, [addDebugLog]);

  // Clear battle results
  const clearBattleResults = useCallback(() => {
    setBattleResults([]);
    addDebugLog('🧹 Battle results cleared', 'info');
  }, [addDebugLog]);

  // Test backend connection
  const testBackendConnection = useCallback(async () => {
    await checkBackendConnection();
  }, [checkBackendConnection]);

  // Reset dashboard button handler
  const handleResetClick = async () => {
    if (isFeatureBlocked('resets')) {
      setBlockedFeature('resets');
      setShowUpgradePopup(true);
      return;
    }
    addDebugLog('🔄 User initiated dashboard reset', 'info');
    try {
      await trackFeatureUsage('resets', 'ui', 'reset_dashboard');
      resetUsage();
      addDebugLog('✅ Dashboard reset completed', 'success');
    } catch (error) {
      addDebugLog(`❌ Dashboard reset failed: ${error}`, 'error');
    }
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
      setBlockedFeature(feature as any);
      setShowUpgradePopup(true);
    }
  };

  return (
    <>
      <div className="usage-tracker">
        <div className="usage-header">
          <h3><FiRefreshCw size={18} /> Real-Time Usage Tracking</h3>
          <p className="usage-subtitle">
            <FiCheck size={16} /> Connected to actual platform features - tracking system active!
            {isLoading && <span className="loading-indicator"> <FiRefreshCw size={14} /> Syncing...</span>}
          </p>
          
          {/* Backend Status */}
          <div className="backend-status">
            <span className={`status-indicator ${backendStatus}`}>
              {backendStatus === 'connected' && <><FiWifi size={14} /> Backend Connected</>}
              {backendStatus === 'disconnected' && <><FiWifiOff size={14} /> Backend Disconnected</>}
              {backendStatus === 'checking' && <><FiRefreshCw size={14} /> Checking...</>}
            </span>
            <button 
              className="test-backend-btn"
              onClick={testBackendConnection}
              disabled={backendStatus === 'checking'}
            >
              <FiServer size={14} /> Test Connection
            </button>
          </div>
          
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

        {/* Usage Grid */}
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

        {/* Control Buttons */}
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
            className="battle-toggle"
            onClick={() => setShowBattleSection(!showBattleSection)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{ 
              background: 'linear-gradient(135deg, #dc3545, #c82333)',
              marginLeft: '10px'
            }}
          >
            {showBattleSection ? <><FiChevronUp size={16} /> Hide Battle Tests</> : <><FiZap size={16} /> Battle Test System</>}
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
        </div>

        {/* BATTLE TESTING SECTION */}
        <AnimatePresence>
          {showBattleSection && (
            <motion.div
              className="battle-section"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <h4><FiZap size={16} /> ⚔️ BATTLE TEST SYSTEM - Find Usage Tracking Bugs</h4>
              <p>This system will test each feature tracking mechanism to identify where usage counting is failing:</p>
              
              <div className="battle-controls">
                {!isBattleTesting ? (
                  <button 
                    className="battle-start-btn"
                    onClick={runAllBattleTests}
                    disabled={!currentUser?.uid}
                  >
                    <FiPlay size={16} /> Start Battle Test Suite
                  </button>
                ) : (
                  <button 
                    className="battle-stop-btn"
                    onClick={stopBattleTesting}
                  >
                    <FiSquare size={16} /> Stop Battle Testing
                  </button>
                )}
                
                <button 
                  className="battle-clear-btn"
                  onClick={clearBattleResults}
                  disabled={battleResults.length === 0}
                >
                  <FiTrash2 size={16} /> Clear Results
                </button>
              </div>

              {currentTest && (
                <div className="current-test">
                  <FiRefreshCw size={16} className="spinning" /> Currently testing: {currentTest}
                </div>
              )}

              <div className="battle-results">
                <h5><FiBarChart size={16} /> Battle Test Results:</h5>
                {battleResults.length === 0 ? (
                  <div className="no-results">No battle tests run yet. Start the battle test suite to see results!</div>
                ) : (
                  <div className="results-grid">
                    {battleResults.map((result, index) => (
                      <div key={index} className={`result-card ${result.success ? 'success' : 'failed'}`}>
                        <div className="result-header">
                          <span className="result-feature">{result.feature}</span>
                          <span className={`result-status ${result.success ? 'success' : 'failed'}`}>
                            {result.success ? <FiCheck size={14} /> : <FiAlertTriangle size={14} />}
                            {result.success ? 'PASSED' : 'FAILED'}
                          </span>
                        </div>
                        <div className="result-details">
                          <div>Before: {result.beforeCount}</div>
                          <div>After: {result.afterCount}</div>
                          <div>Expected: {result.expectedCount}</div>
                          {result.error && <div className="result-error">Error: {result.error}</div>}
                        </div>
                        <div className="result-timestamp">
                          {new Date(result.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* DEBUG SECTION */}
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
                      <div key={index} className={`log-entry ${log.includes('❌') ? 'error' : log.includes('✅') ? 'success' : log.includes('⚠️') ? 'warning' : 'info'}`}>
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* TEST SECTION */}
        <AnimatePresence>
          {showTestSection && (
            <motion.div
              className="test-section"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <h4><FiZap size={16} /> Test Individual Features</h4>
              <p>Click these buttons to test individual feature tracking:</p>
              <div className="test-buttons">
                {features.slice(0, 4).map((feature) => (
                  <button
                    key={feature.key}
                    className={`test-btn ${currentTest === feature.key ? 'testing' : ''}`}
                    onClick={() => runBattleTest(feature.key as any)}
                    disabled={isBattleTesting}
                  >
                    {currentTest === feature.key ? (
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

        {/* DETAILS SECTION */}
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