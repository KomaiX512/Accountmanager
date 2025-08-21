/**
 * Backend Usage Synchronization Test
 * Tests the R2 storage backend to ensure cross-device sync works properly
 */

import axios from 'axios';

// Test configuration
const TEST_CONFIG = {
  baseURL: process.env.NODE_ENV === 'production' ? 'https://your-production-url.com' : 'http://127.0.0.1:3000',
  platforms: ['instagram', 'twitter', 'facebook'],
  testUsername: 'testuser123',
  timeout: 30000
};

class BackendUsageSyncTester {
  constructor() {
    this.results = [];
    this.totalTests = 0;
    this.passedTests = 0;
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }

  async runTest(testName, testFn) {
    this.totalTests++;
    try {
      this.log(`Running test: ${testName}`);
      await testFn();
      this.passedTests++;
      this.log(`PASSED: ${testName}`, 'success');
      this.results.push({ test: testName, status: 'PASSED' });
    } catch (error) {
      this.log(`FAILED: ${testName} - ${error.message}`, 'error');
      this.results.push({ test: testName, status: 'FAILED', error: error.message });
    }
  }

  async testPlatformUsageIncrement(platform) {
    const response = await axios.post(
      `${TEST_CONFIG.baseURL}/api/usage/increment/${platform}/${TEST_CONFIG.testUsername}`,
      { feature: 'posts', count: 1 },
      { timeout: TEST_CONFIG.timeout }
    );

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (!response.data.postsUsed || response.data.postsUsed < 1) {
      throw new Error(`Expected postsUsed >= 1, got ${response.data.postsUsed}`);
    }

    this.log(`${platform} posts incremented to: ${response.data.postsUsed}`);
  }

  async testPlatformUsageRetrieval(platform) {
    const response = await axios.get(
      `${TEST_CONFIG.baseURL}/api/usage/${platform}/${TEST_CONFIG.testUsername}`,
      { timeout: TEST_CONFIG.timeout }
    );

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    const requiredFields = ['postsUsed', 'discussionsUsed', 'aiRepliesUsed', 'campaignsUsed', 'viewsUsed', 'resetsUsed'];
    for (const field of requiredFields) {
      if (typeof response.data[field] !== 'number') {
        throw new Error(`Missing or invalid field: ${field}`);
      }
    }

    this.log(`${platform} usage retrieved successfully: ${JSON.stringify(response.data)}`);
  }

  async testCrossDeviceSync(platform) {
    // Simulate device 1: increment posts
    const device1Response = await axios.post(
      `${TEST_CONFIG.baseURL}/api/usage/increment/${platform}/${TEST_CONFIG.testUsername}`,
      { feature: 'posts', count: 2 },
      { timeout: TEST_CONFIG.timeout }
    );

    const device1Posts = device1Response.data.postsUsed;

    // Simulate device 2: retrieve usage (should see device 1 changes)
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for R2 consistency

    const device2Response = await axios.get(
      `${TEST_CONFIG.baseURL}/api/usage/${platform}/${TEST_CONFIG.testUsername}`,
      { timeout: TEST_CONFIG.timeout }
    );

    const device2Posts = device2Response.data.postsUsed;

    if (device1Posts !== device2Posts) {
      throw new Error(`Cross-device sync failed: Device1=${device1Posts}, Device2=${device2Posts}`);
    }

    this.log(`Cross-device sync verified: ${device1Posts} posts synchronized`);
  }

  async testIncrementalPostCounting(platform) {
    // Get current count
    const initialResponse = await axios.get(
      `${TEST_CONFIG.baseURL}/api/usage/${platform}/${TEST_CONFIG.testUsername}`,
      { timeout: TEST_CONFIG.timeout }
    );
    
    const initialCount = initialResponse.data.postsUsed;

    // Set posts count to a higher value
    const newCount = initialCount + 5;
    const setResponse = await axios.post(
      `${TEST_CONFIG.baseURL}/api/usage/set-posts/${platform}/${TEST_CONFIG.testUsername}`,
      { count: newCount },
      { timeout: TEST_CONFIG.timeout }
    );

    if (setResponse.data.postsUsed < newCount) {
      throw new Error(`Incremental counting failed: Expected >= ${newCount}, got ${setResponse.data.postsUsed}`);
    }

    // Try to set to a lower value (should not decrease)
    const lowerCount = initialCount - 1;
    const decreaseResponse = await axios.post(
      `${TEST_CONFIG.baseURL}/api/usage/set-posts/${platform}/${TEST_CONFIG.testUsername}`,
      { count: lowerCount },
      { timeout: TEST_CONFIG.timeout }
    );

    if (decreaseResponse.data.postsUsed < setResponse.data.postsUsed) {
      throw new Error(`Post count decreased: This should not happen in incremental-only mode`);
    }

    this.log(`Incremental post counting verified: Cannot decrease from ${setResponse.data.postsUsed}`);
  }

  async testAllFeatures(platform) {
    const features = ['posts', 'discussions', 'aiReplies', 'campaigns', 'views'];
    
    for (const feature of features) {
      const response = await axios.post(
        `${TEST_CONFIG.baseURL}/api/usage/increment/${platform}/${TEST_CONFIG.testUsername}`,
        { feature, count: 1 },
        { timeout: TEST_CONFIG.timeout }
      );

      const featureKey = `${feature}Used`;
      if (!response.data[featureKey] || response.data[featureKey] < 1) {
        throw new Error(`Feature ${feature} not incremented properly`);
      }
    }

    this.log(`All features tested successfully for ${platform}`);
  }

  async testErrorHandling() {
    try {
      // Test with invalid platform
      await axios.post(
        `${TEST_CONFIG.baseURL}/api/usage/increment/invalid/testuser`,
        { feature: 'posts', count: 1 },
        { timeout: TEST_CONFIG.timeout }
      );
      throw new Error('Should have failed with invalid platform');
    } catch (error) {
      if (error.message === 'Should have failed with invalid platform') {
        throw error;
      }
      // Expected error - API should handle gracefully
      this.log('Error handling verified: Invalid platform rejected properly');
    }
  }

  async runAllTests() {
    this.log('🚀 Starting Backend Usage Synchronization Tests', 'info');
    this.log(`Testing against: ${TEST_CONFIG.baseURL}`);

    // Test each platform
    for (const platform of TEST_CONFIG.platforms) {
      await this.runTest(
        `Platform Usage Increment - ${platform}`,
        () => this.testPlatformUsageIncrement(platform)
      );

      await this.runTest(
        `Platform Usage Retrieval - ${platform}`,
        () => this.testPlatformUsageRetrieval(platform)
      );

      await this.runTest(
        `Cross-Device Sync - ${platform}`,
        () => this.testCrossDeviceSync(platform)
      );

      await this.runTest(
        `Incremental Post Counting - ${platform}`,
        () => this.testIncrementalPostCounting(platform)
      );

      await this.runTest(
        `All Features Test - ${platform}`,
        () => this.testAllFeatures(platform)
      );
    }

    // Test error handling
    await this.runTest(
      'Error Handling',
      () => this.testErrorHandling()
    );

    // Print results
    this.printResults();
  }

  printResults() {
    this.log('\n' + '='.repeat(60), 'info');
    this.log('📊 TEST RESULTS SUMMARY', 'info');
    this.log('='.repeat(60), 'info');
    
    this.log(`Total Tests: ${this.totalTests}`);
    this.log(`Passed: ${this.passedTests}`, 'success');
    this.log(`Failed: ${this.totalTests - this.passedTests}`, this.passedTests === this.totalTests ? 'success' : 'error');
    
    if (this.passedTests === this.totalTests) {
      this.log('\n🎉 ALL TESTS PASSED - Usage tracking is working correctly!', 'success');
      this.log('✅ Cross-device synchronization verified', 'success');
      this.log('✅ Incremental-only counting verified', 'success');
      this.log('✅ All four features (posts, discussions, AI replies, campaigns) working', 'success');
    } else {
      this.log('\n❌ SOME TESTS FAILED - Check the errors above', 'error');
      
      const failedTests = this.results.filter(r => r.status === 'FAILED');
      failedTests.forEach(test => {
        this.log(`Failed: ${test.test} - ${test.error}`, 'error');
      });
    }
    
    this.log('='.repeat(60), 'info');
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new BackendUsageSyncTester();
  
  tester.runAllTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

export default BackendUsageSyncTester;
