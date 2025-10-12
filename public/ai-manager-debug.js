/**
 * AI Manager Debug Helper
 * Paste this into browser console for debugging
 */

window.AIManagerDebug = {
  // Check if AI Manager is loaded
  checkLoaded() {
    const container = document.querySelector('.ai-manager-button-container');
    const window_elem = document.querySelector('.ai-manager-window');
    
    console.log('🔍 AI Manager Debug Check:');
    console.log('  Button Container:', container ? '✅ Found' : '❌ Not found');
    console.log('  Chat Window:', window_elem ? '✅ Found' : '❌ Not found');
    
    if (container) {
      const styles = window.getComputedStyle(container);
      console.log('  Position:', {
        left: styles.left,
        bottom: styles.bottom,
        right: styles.right,
        zIndex: styles.zIndex
      });
    }
    
    return { container, window_elem };
  },

  // Check localStorage for platform connections
  checkPlatforms() {
    const userId = localStorage.getItem('userId') || 'unknown';
    const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
    
    console.log('🔍 Platform Connections:');
    platforms.forEach(platform => {
      const accessed = localStorage.getItem(`${platform}_accessed_${userId}`);
      const username = localStorage.getItem(`${platform}_username_${userId}`);
      
      if (accessed === 'true') {
        console.log(`  ✅ ${platform.toUpperCase()}: @${username || 'unknown'}`);
      } else {
        console.log(`  ❌ ${platform.toUpperCase()}: Not connected`);
      }
    });
    
    const accountHolder = localStorage.getItem('accountHolder');
    console.log(`  👤 Account Holder: ${accountHolder || 'None'}`);
  },

  // Test API endpoints
  async testEndpoints() {
    console.log('🔍 Testing API Endpoints:');
    
    const endpoints = [
      { name: 'Gemini Key', url: '/api/config/gemini-key' },
      { name: 'Health', url: '/api/health' }
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint.url);
        const status = response.status;
        console.log(`  ${status === 200 ? '✅' : '❌'} ${endpoint.name}: HTTP ${status}`);
      } catch (error) {
        console.log(`  ❌ ${endpoint.name}: ${error.message}`);
      }
    }
  },

  // Test platform status check
  async testPlatformStatus(platform = 'instagram') {
    const userId = localStorage.getItem('userId') || 'test-user';
    const url = `/api/user-${platform}-status/${userId}`;
    
    console.log(`🔍 Testing Platform Status: ${platform}`);
    console.log(`  URL: ${url}`);
    
    try {
      const startTime = Date.now();
      const response = await fetch(url);
      const duration = Date.now() - startTime;
      const data = await response.json();
      
      console.log(`  ✅ Response: HTTP ${response.status} (${duration}ms)`);
      console.log(`  Data:`, data);
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  },

  // Simulate rapid messages (stress test)
  async stressTest(count = 10) {
    console.log(`🚀 Stress Test: Sending ${count} rapid messages`);
    
    const input = document.querySelector('.ai-manager-input');
    const sendBtn = document.querySelector('.ai-manager-send');
    
    if (!input || !sendBtn) {
      console.log('  ❌ Chat not open. Click robot first!');
      return;
    }
    
    const messages = [
      'hi',
      'status',
      'what time',
      'open instagram',
      'help',
      'what platforms',
      'go home',
      'pricing',
      'create post',
      'analyze'
    ];
    
    for (let i = 0; i < count; i++) {
      const msg = messages[i % messages.length];
      console.log(`  ${i + 1}/${count}: Sending "${msg}"`);
      
      input.value = msg;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      await new Promise(resolve => setTimeout(resolve, 100));
      sendBtn.click();
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('  ✅ Stress test complete!');
  },

  // Check for memory leaks
  checkMemory() {
    if (performance.memory) {
      const used = Math.round(performance.memory.usedJSHeapSize / 1048576);
      const total = Math.round(performance.memory.totalJSHeapSize / 1048576);
      const limit = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
      
      console.log('🔍 Memory Usage:');
      console.log(`  Used: ${used} MB`);
      console.log(`  Total: ${total} MB`);
      console.log(`  Limit: ${limit} MB`);
      console.log(`  Usage: ${Math.round((used / limit) * 100)}%`);
      
      if (used > 100) {
        console.warn('  ⚠️  Memory usage high!');
      } else {
        console.log('  ✅ Memory usage normal');
      }
    } else {
      console.log('  ℹ️  Memory API not available');
    }
  },

  // Test navigation routes
  testNavigation() {
    console.log('🔍 Testing Navigation Routes:');
    
    const validRoutes = [
      '/', '/home', '/login', '/privacy', '/pricing',
      '/account', '/instagram', '/twitter', '/facebook', '/linkedin',
      '/processing'
    ];
    
    console.log('  Valid routes:', validRoutes.length);
    validRoutes.forEach(route => console.log(`    - ${route}`));
    
    console.log('  Current route:', window.location.pathname);
  },

  // Full diagnostic
  async fullDiagnostic() {
    console.log('═'.repeat(60));
    console.log('🔬 AI MANAGER FULL DIAGNOSTIC');
    console.log('═'.repeat(60));
    
    this.checkLoaded();
    console.log('');
    
    this.checkPlatforms();
    console.log('');
    
    await this.testEndpoints();
    console.log('');
    
    this.checkMemory();
    console.log('');
    
    this.testNavigation();
    console.log('');
    
    console.log('═'.repeat(60));
    console.log('Diagnostic complete! ✅');
    console.log('═'.repeat(60));
  }
};

// Auto-run basic check
console.log('🤖 AI Manager Debug Helper loaded!');
console.log('Commands:');
console.log('  AIManagerDebug.checkLoaded() - Check if UI loaded');
console.log('  AIManagerDebug.checkPlatforms() - Check connected platforms');
console.log('  AIManagerDebug.testEndpoints() - Test API endpoints');
console.log('  AIManagerDebug.testPlatformStatus("instagram") - Test platform API');
console.log('  AIManagerDebug.stressTest(10) - Send 10 rapid messages');
console.log('  AIManagerDebug.checkMemory() - Check memory usage');
console.log('  AIManagerDebug.fullDiagnostic() - Run all checks');
console.log('');
console.log('💡 Quick start: AIManagerDebug.fullDiagnostic()');
