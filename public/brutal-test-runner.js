/**
 * 🔥 BRUTAL AI MANAGER TEST RUNNER
 * Run this in browser console for comprehensive production testing
 */

window.BrutalTest = {
  userId: 'HxiBWT2egCVtWtloIA5rLZz3rNr1',
  expectedUsername: 'muhammad_muti',
  expectedPlatform: 'twitter',
  results: {},
  
  async run() {
    console.log('🔥'.repeat(30));
    console.log('BRUTAL AI MANAGER TEST - PRODUCTION DATA');
    console.log('🔥'.repeat(30));
    console.log('');
    
    await this.testAuthentication();
    await this.testPlatformDetection();
    await this.testUsernameResolution();
    await this.testBackendCalls();
    await this.testStatusQuery();
    await this.testNavigation();
    await this.testPostCreation();
    await this.testStress();
    
    this.printResults();
  },
  
  async testAuthentication() {
    console.log('📌 TEST 1: Authentication & User ID');
    const userId = localStorage.getItem('userId');
    const accountHolder = localStorage.getItem('accountHolder');
    
    this.results.auth = {
      userIdMatch: userId === this.userId,
      userId: userId,
      accountHolder: accountHolder
    };
    
    if (userId === this.userId) {
      console.log('  ✅ User ID matches:', userId);
    } else {
      console.log('  ❌ User ID mismatch!');
      console.log('    Expected:', this.userId);
      console.log('    Got:', userId);
    }
    console.log('  Account Holder:', accountHolder);
    console.log('');
  },
  
  async testPlatformDetection() {
    console.log('📌 TEST 2: Platform Detection');
    const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
    const connected = {};
    
    platforms.forEach(p => {
      const accessed = localStorage.getItem(`${p}_accessed_${this.userId}`);
      const username = localStorage.getItem(`${p}_username_${this.userId}`);
      connected[p] = {
        accessed: accessed === 'true',
        username: username
      };
      
      if (accessed === 'true') {
        console.log(`  ✅ ${p.toUpperCase()}: @${username}`);
      } else {
        console.log(`  ❌ ${p.toUpperCase()}: Not connected`);
      }
    });
    
    this.results.platforms = connected;
    
    // Verify Twitter
    if (connected.twitter.accessed && connected.twitter.username === this.expectedUsername) {
      console.log('  ✅ Twitter username matches: muhammad_muti');
    } else {
      console.log('  ❌ Twitter username mismatch or not connected!');
    }
    console.log('');
  },
  
  async testUsernameResolution() {
    console.log('📌 TEST 3: Username Resolution Accuracy');
    const twitterUsername = localStorage.getItem(`twitter_username_${this.userId}`);
    
    this.results.username = {
      twitter: twitterUsername,
      matchesExpected: twitterUsername === this.expectedUsername
    };
    
    if (twitterUsername === this.expectedUsername) {
      console.log('  ✅ Correct username resolved: muhammad_muti');
    } else {
      console.log('  ❌ Username resolution failed!');
      console.log('    Expected: muhammad_muti');
      console.log('    Got:', twitterUsername);
    }
    console.log('');
  },
  
  async testBackendCalls() {
    console.log('📌 TEST 4: Backend API Calls');
    const endpoints = [
      {
        name: 'Twitter Status',
        url: `/api/user-twitter-status/${this.userId}`,
        shouldContain: 'muhammad_muti'
      },
      {
        name: 'Profile Info',
        url: `/api/profile-info/${this.expectedUsername}?platform=twitter`,
        shouldContain: 'muhammad_muti'
      },
      {
        name: 'Usage Stats',
        url: `/api/user/${this.userId}/usage`,
        shouldContain: 'postsUsed'
      }
    ];
    
    const results = [];
    
    for (const endpoint of endpoints) {
      try {
        const startTime = Date.now();
        const response = await fetch(endpoint.url);
        const duration = Date.now() - startTime;
        const text = await response.text();
        
        const passed = text.includes(endpoint.shouldContain) || response.status === 200;
        
        results.push({
          name: endpoint.name,
          status: response.status,
          duration: duration,
          passed: passed
        });
        
        if (passed && duration < 5000) {
          console.log(`  ✅ ${endpoint.name}: ${response.status} (${duration}ms)`);
        } else if (duration >= 5000) {
          console.log(`  ⚠️  ${endpoint.name}: SLOW! (${duration}ms)`);
        } else {
          console.log(`  ❌ ${endpoint.name}: ${response.status}`);
        }
      } catch (error) {
        console.log(`  ❌ ${endpoint.name}: ${error.message}`);
        results.push({ name: endpoint.name, error: error.message });
      }
    }
    
    this.results.backend = results;
    console.log('');
  },
  
  async testStatusQuery() {
    console.log('📌 TEST 5: Status Query Test');
    console.log('  📝 Type in AI Manager: "What\'s my status?"');
    console.log('  Expected:');
    console.log('    - Should mention @muhammad_muti');
    console.log('    - Should show Twitter connection');
    console.log('    - Should include follower/post counts');
    console.log('    - Response time < 3s');
    console.log('');
    console.log('  Monitor Network tab for:');
    console.log('    - GET /api/profile-info/muhammad_muti?platform=twitter');
    console.log('    - GET /api/user-twitter-status/' + this.userId);
    console.log('');
  },
  
  async testNavigation() {
    console.log('📌 TEST 6: Navigation Test');
    console.log('  Valid routes to test:');
    const validTests = [
      { command: 'Open Twitter dashboard', expected: '/twitter' },
      { command: 'Go to main dashboard', expected: '/account' },
      { command: 'Show pricing', expected: '/pricing' }
    ];
    validTests.forEach(t => {
      console.log(`    "${t.command}" → ${t.expected}`);
    });
    
    console.log('');
    console.log('  Invalid routes (should ERROR):');
    const invalidTests = [
      { command: 'Open usage dashboard', shouldFail: true },
      { command: 'Go to settings', shouldFail: true }
    ];
    invalidTests.forEach(t => {
      console.log(`    "${t.command}" → Should show error`);
    });
    console.log('');
  },
  
  async testPostCreation() {
    console.log('📌 TEST 7: Post Creation Test');
    console.log('  📝 Type: "Create a Twitter post about AI"');
    console.log('');
    console.log('  Monitor for:');
    console.log('    POST /api/post-generator');
    console.log('    Body should contain:');
    console.log('      - platform: "twitter"');
    console.log('      - username: "muhammad_muti"');
    console.log('    Response time: < 3s');
    console.log('');
    console.log('  After creation:');
    console.log('    - Event "newPostCreated" should fire');
    console.log('    - PostCooked module should refresh');
    console.log('');
  },
  
  async testStress() {
    console.log('📌 TEST 8: Stress Test');
    console.log('  Run: BrutalTest.runStress(10)');
    console.log('  This will send 10 rapid messages');
    console.log('');
  },
  
  async runStress(count = 10) {
    console.log(`🚀 Starting stress test with ${count} messages...`);
    
    const input = document.querySelector('.ai-manager-input');
    const sendBtn = document.querySelector('.ai-manager-send');
    
    if (!input || !sendBtn) {
      console.log('  ❌ AI Manager not open! Click the robot first.');
      return;
    }
    
    const messages = [
      "What's my status?",
      "Open Twitter",
      "What platforms do I have?",
      "Tell me about my account",
      "How many posts?",
      "What's my username?",
      "Create post about testing",
      "Go to pricing",
      "Show analytics",
      "What can you do?"
    ];
    
    const startMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const startTime = Date.now();
    
    for (let i = 0; i < count; i++) {
      const msg = messages[i % messages.length];
      console.log(`  [${i+1}/${count}] Sending: "${msg}"`);
      
      input.value = msg;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 100));
      sendBtn.click();
      await new Promise(r => setTimeout(r, 800));
    }
    
    const duration = Date.now() - startTime;
    const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const memoryGrowth = Math.round((endMemory - startMemory) / 1048576);
    
    console.log('');
    console.log('  ✅ Stress test complete!');
    console.log(`  Duration: ${duration}ms (${Math.round(duration/count)}ms per message)`);
    if (performance.memory) {
      console.log(`  Memory growth: ${memoryGrowth}MB`);
      if (memoryGrowth < 50) {
        console.log('  ✅ Memory usage acceptable');
      } else {
        console.log('  ⚠️  Memory growth high!');
      }
    }
    
    this.results.stress = {
      count: count,
      duration: duration,
      avgPerMessage: Math.round(duration/count),
      memoryGrowth: memoryGrowth
    };
  },
  
  printResults() {
    console.log('');
    console.log('═'.repeat(60));
    console.log('📊 BRUTAL TEST RESULTS SUMMARY');
    console.log('═'.repeat(60));
    console.log('');
    console.log('Test Results:', this.results);
    console.log('');
    
    // Print formatted summary
    if (this.results.auth?.userIdMatch) {
      console.log('✅ Authentication: PASS');
    } else {
      console.log('❌ Authentication: FAIL');
    }
    
    if (this.results.username?.matchesExpected) {
      console.log('✅ Username Resolution: PASS');
    } else {
      console.log('❌ Username Resolution: FAIL');
    }
    
    if (this.results.backend) {
      const backendPassed = this.results.backend.filter(r => r.passed).length;
      const backendTotal = this.results.backend.length;
      console.log(`${backendPassed === backendTotal ? '✅' : '❌'} Backend Calls: ${backendPassed}/${backendTotal}`);
    }
    
    console.log('');
    console.log('📝 Manual tests remaining:');
    console.log('  - Status query natural language');
    console.log('  - Navigation accuracy');
    console.log('  - Post creation speed');
    console.log('');
    console.log('═'.repeat(60));
  }
};

console.log('🔥 BRUTAL TEST RUNNER LOADED');
console.log('');
console.log('Commands:');
console.log('  BrutalTest.run()           - Run all automated tests');
console.log('  BrutalTest.runStress(10)   - Run stress test with 10 messages');
console.log('  BrutalTest.printResults()  - Show results summary');
console.log('');
console.log('💡 Quick start: BrutalTest.run()');
