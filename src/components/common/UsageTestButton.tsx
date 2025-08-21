import React, { useState } from 'react';
import { useUsage } from '../../context/UsageContext';
import useDefensiveUsageTracking from '../../hooks/useDefensiveUsageTracking';

const UsageTestButton: React.FC = () => {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<string>('');
  const { incrementUsage, usage, trackFeatureUsage } = useUsage();
  const { safeIncrementUsage, safeTrackFeature } = useDefensiveUsageTracking();

  const runUsageTest = async () => {
    setTesting(true);
    setResults('🚀 Starting usage tracking tests...\n');
    
    try {
      // Test 1: Direct increment usage
      setResults(prev => prev + '📊 Test 1: Direct incrementUsage call...\n');
      await incrementUsage('posts', 'instagram', 1);
      setResults(prev => prev + '✅ Test 1 completed\n');
      
      // Test 2: Safe increment usage
      setResults(prev => prev + '🛡️ Test 2: Safe incrementUsage call...\n');
      await safeIncrementUsage('discussions', 1);
      setResults(prev => prev + '✅ Test 2 completed\n');
      
      // Test 3: Track feature usage
      setResults(prev => prev + '🎯 Test 3: trackFeatureUsage call...\n');
      await trackFeatureUsage('aiReplies', 'instagram', 'test_action');
      setResults(prev => prev + '✅ Test 3 completed\n');
      
      // Test 4: Safe track feature
      setResults(prev => prev + '🔒 Test 4: safeTrackFeature call...\n');
      await safeTrackFeature('campaigns', 'test_action', 1);
      setResults(prev => prev + '✅ Test 4 completed\n');
      
      // Test 5: Direct backend API call
      setResults(prev => prev + '🌐 Test 5: Direct backend API call...\n');
      const response = await fetch('/api/usage/increment/instagram/testuser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature: 'views', count: 1 })
      });
      
      if (response.ok) {
        const data = await response.json();
        setResults(prev => prev + `✅ Test 5 completed: ${JSON.stringify(data)}\n`);
      } else {
        setResults(prev => prev + `❌ Test 5 failed: ${response.status} ${response.statusText}\n`);
      }
      
      setResults(prev => prev + '\n🏁 All tests completed!\n');
      setResults(prev => prev + `Current usage: ${JSON.stringify(usage, null, 2)}\n`);
      
    } catch (error) {
      setResults(prev => prev + `❌ Error: ${error}\n`);
      console.error('Usage test error:', error);
    }
    
    setTesting(false);
  };

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: '#1a1a2e',
      border: '1px solid #333',
      borderRadius: '8px',
      padding: '12px',
      zIndex: 9999,
      maxWidth: '400px',
      color: '#fff',
      fontSize: '12px'
    }}>
      <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>
        🧪 Usage Tracking Test
      </div>
      
      <button
        onClick={runUsageTest}
        disabled={testing}
        style={{
          background: testing ? '#666' : '#0066cc',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          padding: '8px 12px',
          cursor: testing ? 'not-allowed' : 'pointer',
          marginBottom: '8px',
          width: '100%'
        }}
      >
        {testing ? '🔄 Testing...' : '🚀 Run Usage Tests'}
      </button>
      
      {results && (
        <div style={{
          background: '#0a0a0a',
          padding: '8px',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '10px',
          maxHeight: '300px',
          overflow: 'auto',
          whiteSpace: 'pre-wrap'
        }}>
          {results}
        </div>
      )}
      
      <div style={{ marginTop: '8px', fontSize: '10px', opacity: 0.7 }}>
        Current Usage: Posts: {usage.posts}, Discussions: {usage.discussions}, AI: {usage.aiReplies}, Campaigns: {usage.campaigns}, Views: {usage.views}
      </div>
    </div>
  );
};

export default UsageTestButton;
