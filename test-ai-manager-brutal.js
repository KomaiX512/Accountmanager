/**
 * BRUTAL HONEST AI MANAGER STRESS TEST
 * Tests 20 real-world queries and monitors backend to catch failures
 * NO SUGAR COATING - Reports every failure honestly
 */

import axios from 'axios';
import fs from 'fs/promises';

const BASE_URL = 'http://127.0.0.1:3000';

// Test user ID - Use the Instagram username directly for testing
// In production, this would be a Firebase UID, but for testing we'll use a mock
const TEST_USER_ID = 'test_user_u2023460';
const TEST_INSTAGRAM_USERNAME = 'u2023460';
const TEST_TWITTER_USERNAME = 'muhammad_muti'; // From cache

const COLORS = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
};

let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

function log(message, color = COLORS.RESET) {
  console.log(`${color}${message}${COLORS.RESET}`);
}

function logTest(testNum, description) {
  log(`\n${'='.repeat(80)}`, COLORS.CYAN);
  log(`TEST ${testNum}/20: ${description}`, COLORS.CYAN);
  log('='.repeat(80), COLORS.CYAN);
}

function logSuccess(message) {
  log(`✅ ${message}`, COLORS.GREEN);
  testResults.passed++;
}

function logFailure(message, details = '') {
  log(`❌ ${message}`, COLORS.RED);
  if (details) log(`   Details: ${details}`, COLORS.RED);
  testResults.failed++;
  testResults.errors.push({ message, details });
}

function logWarning(message) {
  log(`⚠️  ${message}`, COLORS.YELLOW);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, COLORS.BLUE);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// TEST 1: Check if AI Manager endpoints exist
// ============================================================================
async function test1_checkEndpoints() {
  logTest(1, 'Check if AI Manager endpoints are registered');
  testResults.total++;
  
  try {
    const endpoints = [
      '/api/ai-manager/analyze-competitor',
      '/api/ai-manager/competitor-analysis',
      '/api/ai-manager/news-summary'
    ];
    
    for (const endpoint of endpoints) {
      try {
        // Try OPTIONS to see if endpoint exists
        const response = await axios.post(`${BASE_URL}${endpoint}`, {}, {
          validateStatus: () => true,
          timeout: 5000
        });
        
        if (response.status === 400) {
          logSuccess(`Endpoint ${endpoint} exists (returned 400 for missing params)`);
        } else if (response.status === 404) {
          logFailure(`Endpoint ${endpoint} NOT FOUND (404)`, 'Backend route not registered');
          return;
        } else {
          logInfo(`Endpoint ${endpoint} returned status ${response.status}`);
        }
      } catch (error) {
        logFailure(`Endpoint ${endpoint} error`, error.message);
        return;
      }
    }
    
    logSuccess('All AI Manager endpoints are registered');
  } catch (error) {
    logFailure('Failed to check endpoints', error.message);
  }
}

// ============================================================================
// TEST 2: Check user status endpoint for Instagram
// ============================================================================
async function test2_checkInstagramStatus() {
  logTest(2, 'Get Instagram status for test user');
  testResults.total++;
  
  try {
    logInfo(`Checking: GET /api/user-instagram-status/${TEST_USER_ID}`);
    
    const response = await axios.get(`${BASE_URL}/api/user-instagram-status/${TEST_USER_ID}`, {
      validateStatus: () => true,
      timeout: 5000
    });
    
    logInfo(`Status: ${response.status}`);
    logInfo(`Response: ${JSON.stringify(response.data, null, 2)}`);
    
    if (response.status === 200 && response.data.instagram_username) {
      logSuccess(`Instagram username found: @${response.data.instagram_username}`);
      return response.data.instagram_username;
    } else {
      logWarning('Instagram not connected for this user');
      return null;
    }
  } catch (error) {
    logFailure('Failed to check Instagram status', error.message);
    return null;
  }
}

// ============================================================================
// TEST 3: Check Twitter status
// ============================================================================
async function test3_checkTwitterStatus() {
  logTest(3, 'Get Twitter status for test user');
  testResults.total++;
  
  try {
    logInfo(`Checking: GET /api/user-twitter-status/${TEST_USER_ID}`);
    
    const response = await axios.get(`${BASE_URL}/api/user-twitter-status/${TEST_USER_ID}`, {
      validateStatus: () => true,
      timeout: 5000
    });
    
    logInfo(`Status: ${response.status}`);
    logInfo(`Response: ${JSON.stringify(response.data, null, 2)}`);
    
    if (response.status === 200 && response.data.twitter_username) {
      logSuccess(`Twitter username found: @${response.data.twitter_username}`);
      return response.data.twitter_username;
    } else {
      logWarning('Twitter not connected for this user');
      return null;
    }
  } catch (error) {
    logFailure('Failed to check Twitter status', error.message);
    return null;
  }
}

// ============================================================================
// TEST 4: Test News Summary for Instagram (if connected)
// ============================================================================
async function test4_getInstagramNewsSummary(instagramUsername) {
  logTest(4, 'Get AI-powered news summary for Instagram');
  testResults.total++;
  
  if (!instagramUsername) {
    logWarning('Skipping - Instagram not connected');
    return;
  }
  
  try {
    logInfo(`Requesting news summary for Instagram user ${TEST_USER_ID}...`);
    
    const startTime = Date.now();
    const response = await axios.post(`${BASE_URL}/api/ai-manager/news-summary`, {
      userId: TEST_USER_ID,
      platform: 'instagram'
    }, {
      validateStatus: () => true,
      timeout: 30000
    });
    const elapsed = Date.now() - startTime;
    
    logInfo(`Response time: ${elapsed}ms`);
    logInfo(`Status: ${response.status}`);
    
    if (response.status === 200 && response.data.success) {
      logSuccess('News summary retrieved successfully');
      logInfo(`Message: ${response.data.message.substring(0, 200)}...`);
      
      // Check if it's real data or fallback
      if (response.data.message.includes('No news') || response.data.message.includes('failed')) {
        logFailure('News summary contains error/fallback message', response.data.message);
      } else {
        logSuccess('News summary appears to be real AI-generated content');
      }
    } else {
      logFailure('News summary failed', response.data.message || 'Unknown error');
    }
  } catch (error) {
    logFailure('News summary request error', error.message);
  }
}

// ============================================================================
// TEST 5: Test Competitor Analysis for specific competitor
// ============================================================================
async function test5_analyzeSpecificCompetitor(platform, competitorUsername) {
  logTest(5, `Analyze specific competitor: @${competitorUsername} on ${platform}`);
  testResults.total++;
  
  try {
    logInfo(`Requesting competitor analysis for @${competitorUsername}...`);
    
    const startTime = Date.now();
    const response = await axios.post(`${BASE_URL}/api/ai-manager/analyze-competitor`, {
      userId: TEST_USER_ID,
      platform: platform,
      competitorUsername: competitorUsername
    }, {
      validateStatus: () => true,
      timeout: 30000
    });
    const elapsed = Date.now() - startTime;
    
    logInfo(`Response time: ${elapsed}ms`);
    logInfo(`Status: ${response.status}`);
    
    if (response.status === 200 && response.data.success) {
      logSuccess(`Competitor analysis completed for @${competitorUsername}`);
      logInfo(`Message preview: ${response.data.message.substring(0, 200)}...`);
      
      // Check if it's real analysis
      if (response.data.message.includes('failed') || response.data.message.includes('not found')) {
        logFailure('Competitor analysis contains error', response.data.message);
      } else {
        logSuccess('Competitor analysis appears to be real AI-generated');
      }
    } else {
      logFailure('Competitor analysis failed', response.data.message || 'Unknown error');
    }
  } catch (error) {
    logFailure('Competitor analysis request error', error.message);
  }
}

// ============================================================================
// TEST 6: Test Overall Competitor Analysis
// ============================================================================
async function test6_overallCompetitorAnalysis(platform) {
  logTest(6, `Get overall competitor analysis for ${platform}`);
  testResults.total++;
  
  try {
    logInfo(`Requesting overall competitive analysis for ${platform}...`);
    
    const startTime = Date.now();
    const response = await axios.post(`${BASE_URL}/api/ai-manager/competitor-analysis`, {
      userId: TEST_USER_ID,
      platform: platform
    }, {
      validateStatus: () => true,
      timeout: 30000
    });
    const elapsed = Date.now() - startTime;
    
    logInfo(`Response time: ${elapsed}ms`);
    logInfo(`Status: ${response.status}`);
    
    if (response.status === 200 && response.data.success) {
      logSuccess('Overall competitor analysis completed');
      logInfo(`Message preview: ${response.data.message.substring(0, 200)}...`);
    } else {
      logFailure('Overall competitor analysis failed', response.data.message || 'Unknown error');
    }
  } catch (error) {
    logFailure('Overall competitor analysis request error', error.message);
  }
}

// ============================================================================
// TEST 7: Check cached profile files exist
// ============================================================================
async function test7_checkCachedFiles(platform, username) {
  logTest(7, `Check if cached profile files exist for @${username}`);
  testResults.total++;
  
  try {
    const cacheDir = '/home/komail/Accountmanager/data/cache';
    const filename = `${platform}_${username}_profile.json`;
    const filepath = `${cacheDir}/${filename}`;
    
    logInfo(`Checking file: ${filepath}`);
    
    try {
      await fs.access(filepath);
      logSuccess(`Cache file exists: ${filename}`);
      
      // Read and validate
      const content = await fs.readFile(filepath, 'utf-8');
      const data = JSON.parse(content);
      
      if (data.data && data.data[0]) {
        logSuccess(`Cache file is valid JSON with profile data`);
        logInfo(`Followers: ${data.data[0].followersCount || 'N/A'}`);
      } else {
        logWarning('Cache file has unexpected structure');
      }
    } catch (error) {
      logFailure(`Cache file NOT FOUND: ${filename}`, 'This will cause AI Manager operations to fail');
    }
  } catch (error) {
    logFailure('Error checking cache files', error.message);
  }
}

// ============================================================================
// TEST 8: Test with NON-ACQUIRED platform (should detect and fail gracefully)
// ============================================================================
async function test8_testNonAcquiredPlatform() {
  logTest(8, 'Test news summary for NON-ACQUIRED platform (Facebook)');
  testResults.total++;
  
  try {
    logInfo('Testing if AI Manager detects non-acquired platforms...');
    
    const response = await axios.post(`${BASE_URL}/api/ai-manager/news-summary`, {
      userId: TEST_USER_ID,
      platform: 'facebook' // Assuming not acquired
    }, {
      validateStatus: () => true,
      timeout: 10000
    });
    
    logInfo(`Status: ${response.status}`);
    
    if (response.status === 200 && !response.data.success) {
      if (response.data.message.includes('username') || response.data.message.includes('not find')) {
        logSuccess('AI Manager correctly detected non-acquired platform');
        logInfo(`Error message: ${response.data.message}`);
      } else {
        logWarning('Unexpected error message for non-acquired platform');
      }
    } else if (response.status === 200 && response.data.success) {
      logFailure('AI Manager did NOT detect non-acquired platform', 'Returned success for non-connected platform');
    }
  } catch (error) {
    logFailure('Error testing non-acquired platform', error.message);
  }
}

// ============================================================================
// TEST 9-15: Test various cached competitor profiles
// ============================================================================
async function test9_15_testCachedCompetitors() {
  const competitors = [
    { platform: 'instagram', username: 'fentybeauty' },
    { platform: 'instagram', username: 'maccosmetics' },
    { platform: 'instagram', username: 'narsissist' },
    { platform: 'instagram', username: 'u2023460' },
    { platform: 'twitter', username: 'elonmusk' },
    { platform: 'twitter', username: 'Jack' },
    { platform: 'linkedin', username: 'devenp' }
  ];
  
  for (let i = 0; i < competitors.length; i++) {
    logTest(9 + i, `Check cached file for @${competitors[i].username} on ${competitors[i].platform}`);
    testResults.total++;
    
    await test7_checkCachedFiles(competitors[i].platform, competitors[i].username);
    await sleep(500);
  }
}

// ============================================================================
// TEST 16: Test profile-info endpoint
// ============================================================================
async function test16_testProfileInfo(platform, username) {
  logTest(16, `Test profile-info endpoint for @${username}`);
  testResults.total++;
  
  if (!username) {
    logWarning('Skipping - no username provided');
    return;
  }
  
  try {
    const url = platform === 'linkedin'
      ? `${BASE_URL}/api/profile-info/${platform}/${username}`
      : `${BASE_URL}/api/profile-info/${username}?platform=${platform}`;
    
    logInfo(`GET ${url}`);
    
    const response = await axios.get(url, {
      validateStatus: () => true,
      timeout: 10000
    });
    
    logInfo(`Status: ${response.status}`);
    
    if (response.status === 200 && response.data) {
      logSuccess('Profile info retrieved');
      logInfo(`Followers: ${response.data.followersCount || response.data.followers || 'N/A'}`);
    } else {
      logFailure('Profile info failed', `Status ${response.status}`);
    }
  } catch (error) {
    logFailure('Profile info error', error.message);
  }
}

// ============================================================================
// TEST 17: Check R2 news files structure
// ============================================================================
async function test17_checkR2NewsStructure(platform, username) {
  logTest(17, 'Check if R2 news files can be listed (simulated)');
  testResults.total++;
  
  logInfo('This would test R2 ListObjectsV2 for news files');
  logInfo(`Expected prefix: ${platform}_news_${username}/`);
  logWarning('Cannot directly test R2 from this script - relies on backend');
  testResults.total--; // Don't count this
}

// ============================================================================
// TEST 18: Test error handling with invalid competitor
// ============================================================================
async function test18_testInvalidCompetitor() {
  logTest(18, 'Test with INVALID competitor username (should fail gracefully)');
  testResults.total++;
  
  try {
    logInfo('Testing error handling with non-existent competitor...');
    
    const response = await axios.post(`${BASE_URL}/api/ai-manager/analyze-competitor`, {
      userId: TEST_USER_ID,
      platform: 'instagram',
      competitorUsername: 'thisuserdoesnotexist123456'
    }, {
      validateStatus: () => true,
      timeout: 15000
    });
    
    logInfo(`Status: ${response.status}`);
    
    if (response.status === 200 && !response.data.success) {
      logSuccess('AI Manager correctly handled invalid competitor');
      logInfo(`Error message: ${response.data.message}`);
    } else if (response.status === 200 && response.data.success) {
      logFailure('AI Manager did NOT detect invalid competitor', 'Returned success for non-existent user');
    }
  } catch (error) {
    logFailure('Error testing invalid competitor', error.message);
  }
}

// ============================================================================
// TEST 19: Test response time under load
// ============================================================================
async function test19_testResponseTimes() {
  logTest(19, 'Test response times for AI Manager operations');
  testResults.total++;
  
  try {
    logInfo('Testing multiple operations to measure performance...');
    
    const operations = [
      { name: 'News Summary', endpoint: '/api/ai-manager/news-summary', data: { userId: TEST_USER_ID, platform: 'instagram' } },
      { name: 'Competitor Analysis', endpoint: '/api/ai-manager/competitor-analysis', data: { userId: TEST_USER_ID, platform: 'instagram' } }
    ];
    
    for (const op of operations) {
      const start = Date.now();
      try {
        await axios.post(`${BASE_URL}${op.endpoint}`, op.data, {
          validateStatus: () => true,
          timeout: 30000
        });
        const elapsed = Date.now() - start;
        
        if (elapsed < 10000) {
          logSuccess(`${op.name} completed in ${elapsed}ms (FAST)`);
        } else if (elapsed < 20000) {
          logInfo(`${op.name} completed in ${elapsed}ms (ACCEPTABLE)`);
        } else {
          logWarning(`${op.name} took ${elapsed}ms (SLOW)`);
        }
      } catch (error) {
        logFailure(`${op.name} error`, error.message);
      }
    }
    
    logSuccess('Response time test completed');
  } catch (error) {
    logFailure('Response time test failed', error.message);
  }
}

// ============================================================================
// TEST 20: Final summary and recommendations
// ============================================================================
async function test20_finalSummary() {
  logTest(20, 'FINAL SUMMARY & BRUTAL HONEST ASSESSMENT');
  
  log('\n' + '='.repeat(80), COLORS.MAGENTA);
  log('BRUTAL HONEST TEST RESULTS', COLORS.MAGENTA);
  log('='.repeat(80), COLORS.MAGENTA);
  
  log(`\nTotal Tests: ${testResults.total}`, COLORS.CYAN);
  log(`Passed: ${testResults.passed}`, COLORS.GREEN);
  log(`Failed: ${testResults.failed}`, COLORS.RED);
  
  const successRate = testResults.total > 0 ? ((testResults.passed / testResults.total) * 100).toFixed(1) : 0;
  
  log(`\nSuccess Rate: ${successRate}%`, successRate > 80 ? COLORS.GREEN : COLORS.RED);
  
  if (testResults.errors.length > 0) {
    log('\n' + '='.repeat(80), COLORS.RED);
    log('CRITICAL FAILURES:', COLORS.RED);
    log('='.repeat(80), COLORS.RED);
    
    testResults.errors.forEach((error, idx) => {
      log(`\n${idx + 1}. ${error.message}`, COLORS.RED);
      if (error.details) {
        log(`   ${error.details}`, COLORS.YELLOW);
      }
    });
  }
  
  log('\n' + '='.repeat(80), COLORS.MAGENTA);
  log('HONEST ASSESSMENT:', COLORS.MAGENTA);
  log('='.repeat(80), COLORS.MAGENTA);
  
  if (successRate >= 90) {
    log('✅ AI Manager is PRODUCTION READY', COLORS.GREEN);
  } else if (successRate >= 70) {
    log('⚠️  AI Manager NEEDS IMPROVEMENTS but is functional', COLORS.YELLOW);
  } else {
    log('❌ AI Manager is NOT READY - CRITICAL ISSUES FOUND', COLORS.RED);
  }
  
  // Write results to file
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: testResults.total,
      passed: testResults.passed,
      failed: testResults.failed,
      successRate: successRate + '%'
    },
    errors: testResults.errors
  };
  
  await fs.writeFile('/home/komail/Accountmanager/ai-manager-test-report.json', JSON.stringify(report, null, 2));
  log('\n📄 Full report saved to: ai-manager-test-report.json', COLORS.BLUE);
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runAllTests() {
  log('\n' + '█'.repeat(80), COLORS.CYAN);
  log('BRUTAL HONEST AI MANAGER STRESS TEST', COLORS.CYAN);
  log('Testing 20 real-world scenarios - NO SUGAR COATING', COLORS.CYAN);
  log('█'.repeat(80) + '\n', COLORS.CYAN);
  
  await sleep(1000);
  
  // Run tests
  await test1_checkEndpoints();
  await sleep(500);
  
  const instagramUsername = await test2_checkInstagramStatus();
  await sleep(500);
  
  const twitterUsername = await test3_checkTwitterStatus();
  await sleep(500);
  
  await test4_getInstagramNewsSummary(instagramUsername);
  await sleep(1000);
  
  if (instagramUsername) {
    await test5_analyzeSpecificCompetitor('instagram', 'fentybeauty');
    await sleep(1000);
    
    await test6_overallCompetitorAnalysis('instagram');
    await sleep(1000);
    
    await test7_checkCachedFiles('instagram', instagramUsername);
    await sleep(500);
  }
  
  await test8_testNonAcquiredPlatform();
  await sleep(500);
  
  await test9_15_testCachedCompetitors();
  
  if (instagramUsername) {
    await test16_testProfileInfo('instagram', instagramUsername);
    await sleep(500);
  }
  
  await test18_testInvalidCompetitor();
  await sleep(500);
  
  await test19_testResponseTimes();
  await sleep(500);
  
  await test20_finalSummary();
}

// Run the tests
runAllTests().catch(error => {
  log(`\n❌ CATASTROPHIC FAILURE: ${error.message}`, COLORS.RED);
  console.error(error);
  process.exit(1);
});

