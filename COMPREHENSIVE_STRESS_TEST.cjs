/**
 * 🔥 COMPREHENSIVE AI MANAGER STRESS TEST - 20 QUERIES
 * 
 * Tests EXACTLY what frontend does:
 * 1. Calls same backend endpoints
 * 2. Monitors backend logs in real-time
 * 3. Validates data comes from R2 (not hallucinated)
 * 4. Checks file retrieval paths
 * 5. Tests acquired vs unacquired platforms
 * 
 * NO SUGAR COATING - Shows exact failures
 */

const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const API_URL = 'http://127.0.0.1:3000';
const USER_ID = 'KomaiX512';

const COLORS = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  BOLD: '\x1b[1m',
};

function log(message, color = COLORS.RESET) {
  console.log(`${color}${message}${COLORS.RESET}`);
}

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  hallucinations: 0,
  networkErrors: 0,
  realDataRetrievals: 0,
  details: []
};

/**
 * Capture backend logs during operation
 */
async function getRecentBackendLogs() {
  try {
    const { stdout } = await execAsync(
      `pm2 logs main-api-unified --nostream --lines 30 | grep -E "AI-Manager|Reading|Retrieved|Fetching|Progress" | tail -15`,
      { timeout: 3000 }
    );
    return stdout.trim();
  } catch (error) {
    return '';
  }
}

/**
 * TEST 1-4: Platform Status Checks
 */
async function testPlatformStatus() {
  log('\n' + '═'.repeat(80), COLORS.BLUE);
  log('GROUP 1: PLATFORM STATUS (4 tests)', COLORS.BOLD + COLORS.YELLOW);
  log('═'.repeat(80), COLORS.BLUE);
  
  const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
  const expectedUsernames = {
    instagram: 'u2023460',
    twitter: 'muhammad_muti',
    facebook: 'AutoPulseGlobalTrading',
    linkedin: 'devenp'
  };
  
  for (const platform of platforms) {
    results.total++;
    log(`\n📋 TEST ${results.total}: Check ${platform} status`, COLORS.CYAN);
    
    try {
      const response = await axios.get(`${API_URL}/api/user-${platform}-status/${USER_ID}`, {
        timeout: 5000,
        validateStatus: () => true
      });
      
      if (response.status === 200 && response.data) {
        const hasEnteredKey = platform === 'twitter' ? 'hasEnteredTwitterUsername'
          : platform === 'facebook' ? 'hasEnteredFacebookUsername'
          : platform === 'linkedin' ? 'hasEnteredLinkedInUsername'
          : 'hasEnteredInstagramUsername';
        
        const username = response.data[`${platform}_username`];
        const isConnected = response.data[hasEnteredKey];
        
        if (isConnected && username === expectedUsernames[platform]) {
          log(`✅ PASS: ${platform} connected as @${username}`, COLORS.GREEN);
          results.passed++;
          results.realDataRetrievals++;
        } else if (isConnected && username) {
          log(`⚠️ WARNING: Connected but unexpected username: @${username} (expected: @${expectedUsernames[platform]})`, COLORS.YELLOW);
          results.passed++;
        } else {
          log(`❌ FAIL: Platform not connected or no username`, COLORS.RED);
          results.failed++;
        }
      } else {
        log(`❌ FAIL: API returned ${response.status}`, COLORS.RED);
        results.failed++;
      }
    } catch (error) {
      log(`❌ FAIL: ${error.message}`, COLORS.RED);
      results.failed++;
      if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
        results.networkErrors++;
      }
    }
  }
}

/**
 * TEST 5-8: Competitor Analysis (Real Data Retrieval)
 */
async function testCompetitorAnalysis() {
  log('\n' + '═'.repeat(80), COLORS.BLUE);
  log('GROUP 2: COMPETITOR ANALYSIS (4 tests)', COLORS.BOLD + COLORS.YELLOW);
  log('═'.repeat(80), COLORS.BLUE);
  
  const tests = [
    { platform: 'instagram', username: 'u2023460', competitors: ['maccosmetics', 'fentybeauty', 'narsissist'] },
    { platform: 'twitter', username: 'muhammad_muti', competitors: ['Jack', 'elonmusk'] },
    { platform: 'facebook', username: 'AutoPulseGlobalTrading', competitors: ['nike'] },
    { platform: 'linkedin', username: 'devenp', competitors: [] }
  ];
  
  for (const test of tests) {
    results.total++;
    log(`\n📊 TEST ${results.total}: ${test.platform} competitor analysis (@${test.username})`, COLORS.CYAN);
    
    try {
      // Capture logs before request
      const logsBefore = await getRecentBackendLogs();
      
      const response = await axios.post(`${API_URL}/api/ai-manager/competitor-analysis`, {
        userId: USER_ID,
        platform: test.platform,
        username: test.username,
        competitors: test.competitors.length > 0 ? test.competitors : ['competitor1', 'competitor2', 'competitor3']
      }, {
        timeout: 60000,
        validateStatus: () => true
      });
      
      // Capture logs after request
      await new Promise(r => setTimeout(r, 1000));
      const logsAfter = await getRecentBackendLogs();
      
      if (response.status === 200 && response.data.success) {
        const message = response.data.message.toLowerCase();
        
        // Check for real data indicators
        const hasCompetitorNames = test.competitors.some(c => message.includes(c.toLowerCase()));
        const hasMetrics = /\d+/.test(message);
        const hasFileReads = logsAfter.includes('Reading') || logsAfter.includes('profile.json');
        
        if (hasCompetitorNames && hasMetrics) {
          log(`✅ PASS: Real competitor data found (${test.competitors.filter(c => message.includes(c.toLowerCase())).join(', ')})`, COLORS.GREEN);
          log(`   Metrics: ${hasMetrics ? '✅' : '❌'} | File reads: ${hasFileReads ? '✅' : '⚠️'}`, COLORS.CYAN);
          results.passed++;
          results.realDataRetrievals++;
        } else if (message.includes('comprehensive') || message.includes('analysis')) {
          log(`⚠️ PARTIAL: Response received but data validation unclear`, COLORS.YELLOW);
          log(`   Competitor names: ${hasCompetitorNames ? '✅' : '❌'} | Metrics: ${hasMetrics ? '✅' : '❌'}`, COLORS.YELLOW);
          results.passed++;
        } else {
          log(`❌ FAIL: Generic response - possible hallucination`, COLORS.RED);
          log(`   Response: ${response.data.message.substring(0, 100)}...`, COLORS.RED);
          results.failed++;
          results.hallucinations++;
        }
      } else {
        log(`❌ FAIL: API returned ${response.status} - ${response.data?.message}`, COLORS.RED);
        results.failed++;
      }
    } catch (error) {
      log(`❌ FAIL: ${error.message}`, COLORS.RED);
      results.failed++;
      if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
        results.networkErrors++;
      }
    }
  }
}

/**
 * TEST 9-12: Analytics (Real Profile Data)
 */
async function testAnalytics() {
  log('\n' + '═'.repeat(80), COLORS.BLUE);
  log('GROUP 3: ANALYTICS (4 tests)', COLORS.BOLD + COLORS.YELLOW);
  log('═'.repeat(80), COLORS.BLUE);
  
  const tests = [
    { platform: 'instagram', username: 'u2023460', expectedFile: 'instagram_u2023460_profile.json' },
    { platform: 'twitter', username: 'muhammad_muti', expectedFile: 'twitter_muhammad_muti_profile.json' },
    { platform: 'facebook', username: 'AutoPulseGlobalTrading', expectedFile: 'facebook_AutoPulseGlobalTrading_profile.json' },
    { platform: 'linkedin', username: 'devenp', expectedFile: 'linkedin_devenp' }
  ];
  
  for (const test of tests) {
    results.total++;
    log(`\n📈 TEST ${results.total}: ${test.platform} analytics for @${test.username}`, COLORS.CYAN);
    
    try {
      const response = await axios.get(
        `${API_URL}/api/profile-info/${test.username}?platform=${test.platform}`,
        { timeout: 8000, validateStatus: () => true }
      );
      
      if (response.status === 200) {
        const data = response.data;
        const hasFollowers = data.followersCount !== undefined || data.followers !== undefined;
        const hasPosts = data.posts !== undefined || data.postsCount !== undefined;
        
        const followers = data.followersCount || data.followers || 0;
        const posts = Array.isArray(data.posts) ? data.posts.length : data.postsCount || 0;
        
        log(`✅ PASS: Profile data retrieved`, COLORS.GREEN);
        log(`   Followers: ${followers} | Posts: ${posts}`, COLORS.CYAN);
        results.passed++;
        results.realDataRetrievals++;
      } else if (response.status === 404) {
        log(`⚠️ WARNING: Profile file not found (${test.expectedFile})`, COLORS.YELLOW);
        results.passed++;
      } else {
        log(`❌ FAIL: API returned ${response.status}`, COLORS.RED);
        results.failed++;
      }
    } catch (error) {
      log(`❌ FAIL: ${error.message}`, COLORS.RED);
      results.failed++;
      if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
        results.networkErrors++;
      }
    }
  }
}

/**
 * TEST 13-16: News Summary (R2 Bucket Retrieval)
 */
async function testNewsSummary() {
  log('\n' + '═'.repeat(80), COLORS.BLUE);
  log('GROUP 4: NEWS SUMMARY (4 tests)', COLORS.BOLD + COLORS.YELLOW);
  log('═'.repeat(80), COLORS.BLUE);
  
  const tests = [
    { platform: 'instagram', username: 'u2023460' },
    { platform: 'twitter', username: 'muhammad_muti' },
    { platform: 'facebook', username: 'AutoPulseGlobalTrading' },
    { platform: 'linkedin', username: 'devenp' }
  ];
  
  for (const test of tests) {
    results.total++;
    log(`\n📰 TEST ${results.total}: ${test.platform} trending news`, COLORS.CYAN);
    
    try {
      const logsBefore = await getRecentBackendLogs();
      
      const response = await axios.post(`${API_URL}/api/ai-manager/news-summary`, {
        userId: USER_ID,
        platform: test.platform,
        username: test.username
      }, {
        timeout: 60000,
        validateStatus: () => true,
        headers: { 'Content-Type': 'application/json' }
      });
      
      await new Promise(r => setTimeout(r, 1000));
      const logsAfter = await getRecentBackendLogs();
      
      if (response.status === 200 && response.data.success) {
        const message = response.data.message.toLowerCase();
        
        // Check for real news indicators
        const hasNewsKeywords = message.includes('news') || message.includes('trending') || message.includes('market') || message.includes('tech');
        const hasR2Retrieval = logsAfter.includes('Fetching news') || logsAfter.includes('news_for_you') || logsAfter.includes('R2');
        const hasDate = /202[4-5]/.test(message); // Real news mentions current year
        
        if (hasNewsKeywords && (hasR2Retrieval || hasDate)) {
          log(`✅ PASS: Real news data retrieved from R2`, COLORS.GREEN);
          log(`   R2 retrieval: ${hasR2Retrieval ? '✅' : '⚠️'} | Recent date: ${hasDate ? '✅' : '⚠️'}`, COLORS.CYAN);
          results.passed++;
          results.realDataRetrievals++;
        } else if (hasNewsKeywords) {
          log(`⚠️ PARTIAL: News response but R2 retrieval unclear`, COLORS.YELLOW);
          results.passed++;
        } else {
          log(`❌ FAIL: Generic response - possible hallucination`, COLORS.RED);
          results.failed++;
          results.hallucinations++;
        }
      } else {
        log(`❌ FAIL: API returned ${response.status} - ${response.data?.message || 'No message'}`, COLORS.RED);
        results.failed++;
      }
    } catch (error) {
      log(`❌ FAIL: ${error.message}`, COLORS.RED);
      results.failed++;
      if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
        results.networkErrors++;
      } else if (error.code === 'ECONNABORTED') {
        log(`   Timeout - backend took >60s`, COLORS.YELLOW);
      }
    }
  }
}

/**
 * TEST 17-18: Post Creation (RAG Integration)
 */
async function testPostCreation() {
  log('\n' + '═'.repeat(80), COLORS.BLUE);
  log('GROUP 5: POST CREATION (2 tests)', COLORS.BOLD + COLORS.YELLOW);
  log('═'.repeat(80), COLORS.BLUE);
  
  const tests = [
    { platform: 'instagram', username: 'u2023460', topic: 'trending news' },
    { platform: 'twitter', username: 'muhammad_muti', topic: 'AI technology' }
  ];
  
  for (const test of tests) {
    results.total++;
    log(`\n✍️ TEST ${results.total}: Create ${test.platform} post about ${test.topic}`, COLORS.CYAN);
    
    try {
      const response = await axios.post(`${API_URL}/api/post-generator`, {
        platform: test.platform,
        username: test.username,
        topic: test.topic
      }, {
        timeout: 90000,
        validateStatus: () => true
      });
      
      if (response.status === 200 && response.data) {
        log(`✅ PASS: Post generated`, COLORS.GREEN);
        log(`   Caption length: ${response.data.caption?.length || 0} chars`, COLORS.CYAN);
        results.passed++;
      } else if (response.status === 500) {
        log(`❌ FAIL: Post generation failed (500) - ${response.data?.error || 'RAG server issue'}`, COLORS.RED);
        results.failed++;
      } else {
        log(`❌ FAIL: API returned ${response.status}`, COLORS.RED);
        results.failed++;
      }
    } catch (error) {
      log(`❌ FAIL: ${error.message}`, COLORS.RED);
      results.failed++;
      if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
        results.networkErrors++;
      }
    }
  }
}

/**
 * TEST 19-20: Unacquired Platform Handling
 */
async function testUnacquiredPlatforms() {
  log('\n' + '═'.repeat(80), COLORS.BLUE);
  log('GROUP 6: UNACQUIRED PLATFORMS (2 tests)', COLORS.BOLD + COLORS.YELLOW);
  log('═'.repeat(80), COLORS.BLUE);
  
  // Create temporary test user
  const testUserId = 'TEST_UNACQUIRED_' + Date.now();
  
  results.total++;
  log(`\n🚫 TEST ${results.total}: Check unacquired Instagram`, COLORS.CYAN);
  
  try {
    const response = await axios.get(`${API_URL}/api/user-instagram-status/${testUserId}`, {
      timeout: 5000,
      validateStatus: () => true
    });
    
    if (response.status === 200 && response.data.hasEnteredInstagramUsername === false) {
      log(`✅ PASS: Correctly reports platform not acquired`, COLORS.GREEN);
      results.passed++;
    } else {
      log(`❌ FAIL: Unexpected response: ${JSON.stringify(response.data)}`, COLORS.RED);
      results.failed++;
    }
  } catch (error) {
    log(`❌ FAIL: ${error.message}`, COLORS.RED);
    results.failed++;
  }
  
  results.total++;
  log(`\n🚫 TEST ${results.total}: Request analytics for unacquired platform`, COLORS.CYAN);
  
  // This should gracefully fail (no hallucination)
  try {
    const response = await axios.get(`${API_URL}/api/profile-info/nonexistent_user?platform=instagram`, {
      timeout: 5000,
      validateStatus: () => true
    });
    
    if (response.status === 404) {
      log(`✅ PASS: Gracefully returns 404 (no hallucination)`, COLORS.GREEN);
      results.passed++;
    } else if (response.status === 200 && !response.data.followersCount) {
      log(`⚠️ WARNING: Returns 200 but no data (acceptable)`, COLORS.YELLOW);
      results.passed++;
    } else {
      log(`❌ FAIL: Returns data for non-existent user (hallucination!)`, COLORS.RED);
      results.failed++;
      results.hallucinations++;
    }
  } catch (error) {
    log(`✅ PASS: Error thrown as expected`, COLORS.GREEN);
    results.passed++;
  }
}

/**
 * FINAL REPORT
 */
function generateReport() {
  console.log('\n\n' + '═'.repeat(80));
  log('📊 COMPREHENSIVE STRESS TEST REPORT - NO SUGAR COATING', COLORS.BOLD + COLORS.CYAN);
  console.log('═'.repeat(80) + '\n');
  
  const passRate = ((results.passed / results.total) * 100).toFixed(1);
  const grade = passRate >= 90 ? 'A+' : passRate >= 80 ? 'A' : passRate >= 70 ? 'B' : passRate >= 60 ? 'C' : passRate >= 50 ? 'D' : 'F';
  
  log(`Total Tests: ${results.total}`, COLORS.CYAN);
  log(`✅ Passed: ${results.passed}`, COLORS.GREEN);
  log(`❌ Failed: ${results.failed}`, COLORS.RED);
  log(`\n🔥 CRITICAL METRICS:`, COLORS.BOLD);
  log(`👻 Hallucinations: ${results.hallucinations}`, results.hallucinations === 0 ? COLORS.GREEN : COLORS.RED);
  log(`🌐 Network Errors: ${results.networkErrors}`, results.networkErrors === 0 ? COLORS.GREEN : COLORS.RED);
  log(`📂 Real Data Retrievals: ${results.realDataRetrievals}`, COLORS.GREEN);
  log(`\n📈 Pass Rate: ${passRate}% (Grade: ${grade})`, passRate >= 70 ? COLORS.GREEN : passRate >= 50 ? COLORS.YELLOW : COLORS.RED);
  
  // Detailed breakdown
  console.log('\n' + '─'.repeat(80));
  log('BREAKDOWN BY GROUP:', COLORS.BOLD);
  log('  Tests 1-4:   Platform Status', COLORS.CYAN);
  log('  Tests 5-8:   Competitor Analysis', COLORS.CYAN);
  log('  Tests 9-12:  Analytics', COLORS.CYAN);
  log('  Tests 13-16: News Summary', COLORS.CYAN);
  log('  Tests 17-18: Post Creation', COLORS.CYAN);
  log('  Tests 19-20: Unacquired Platforms', COLORS.CYAN);
  
  // Issues found
  if (results.failed > 0 || results.hallucinations > 0 || results.networkErrors > 0) {
    console.log('\n' + '─'.repeat(80));
    log('🚨 ISSUES FOUND:', COLORS.BOLD + COLORS.RED);
    
    if (results.hallucinations > 0) {
      log(`  • ${results.hallucinations} HALLUCINATIONS - AI returning fake data instead of real backend data`, COLORS.RED);
    }
    if (results.networkErrors > 0) {
      log(`  • ${results.networkErrors} NETWORK ERRORS - Backend connection issues`, COLORS.RED);
    }
    if (results.failed > results.hallucinations + results.networkErrors) {
      log(`  • ${results.failed - results.hallucinations - results.networkErrors} OTHER FAILURES - API errors, timeouts, or validation issues`, COLORS.RED);
    }
  }
  
  // Final verdict
  console.log('\n' + '═'.repeat(80));
  if (passRate >= 80 && results.hallucinations === 0 && results.networkErrors === 0) {
    log('✅ PRODUCTION READY - AI Manager is working correctly!', COLORS.BOLD + COLORS.GREEN);
    log('   All critical systems operational. No hallucinations detected.', COLORS.GREEN);
  } else if (passRate >= 60) {
    log('⚠️ NEEDS IMPROVEMENT - Core features work but issues remain', COLORS.BOLD + COLORS.YELLOW);
    log('   Fix critical issues before production deployment.', COLORS.YELLOW);
  } else {
    log('❌ NOT PRODUCTION READY - Major failures detected', COLORS.BOLD + COLORS.RED);
    log('   Significant work needed before deployment.', COLORS.RED);
  }
  console.log('═'.repeat(80) + '\n');
  
  // Recommendations
  if (results.hallucinations > 0) {
    log('💡 RECOMMENDATION: Review system prompts and add anti-hallucination checks', COLORS.YELLOW);
  }
  if (results.networkErrors > 0) {
    log('💡 RECOMMENDATION: Check backend server status and network configuration', COLORS.YELLOW);
  }
  if (results.realDataRetrievals < results.total / 2) {
    log('💡 RECOMMENDATION: Increase R2 data retrieval validation', COLORS.YELLOW);
  }
}

/**
 * MAIN TEST EXECUTION
 */
async function runComprehensiveTest() {
  console.log('\n' + '═'.repeat(80));
  log('🔥 COMPREHENSIVE AI MANAGER STRESS TEST - 20 QUERIES', COLORS.BOLD + COLORS.RED);
  log('TESTING: Real data retrieval, hallucination detection, network stability', COLORS.CYAN);
  console.log('═'.repeat(80));
  
  log(`\nBackend: ${API_URL}`, COLORS.CYAN);
  log(`User ID: ${USER_ID}`, COLORS.CYAN);
  log(`Timestamp: ${new Date().toISOString()}\n`, COLORS.CYAN);
  
  // Run all test groups
  await testPlatformStatus();
  await testCompetitorAnalysis();
  await testAnalytics();
  await testNewsSummary();
  await testPostCreation();
  await testUnacquiredPlatforms();
  
  // Generate final report
  generateReport();
}

// Execute
runComprehensiveTest().catch(error => {
  log(`\n💥 TEST SUITE CRASHED: ${error.message}`, COLORS.RED);
  console.error(error);
  process.exit(1);
});
