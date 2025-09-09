#!/usr/bin/env node

/**
 * Direct Instagram Fix Battle Test Framework
 * Validates Instagram Graph API-only approach without fallbacks
 * Per user directive: NO FALLBACK SYSTEMS ALLOWED
 */

import { performance } from 'perf_hooks';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:3000';
const TEST_RESULTS_DIR = './test-results';

// Ensure test results directory exists
await fs.mkdir(TEST_RESULTS_DIR, { recursive: true });

// Test scenarios for direct Instagram Graph API validation
const INSTAGRAM_ACCOUNTS = [
  { username: 'maccosmetics', expected: 'success', note: 'Primary Instagram account with Graph API token' },
  { username: 'fentybeauty', expected: 'success_or_404', note: 'Secondary account - may have Graph API access' },
  { username: 'nonexistent_account_xyz', expected: '404', note: 'Should return 404 - no Graph API access' },
  { username: 'narsissist', expected: 'success', note: 'Alias mapping should resolve to maccosmetics' }
];

class DirectInstagramBattleTest {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      testSuites: [],
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        graphApiSuccessRate: 0,
        fallbackAttempts: 0 // Should be 0 per user directive
      }
    };
    this.reportId = `instagram-direct-fix-${Date.now()}`;
  }

  async runComprehensiveBattleTest() {
    console.log(`🚀 Starting Direct Instagram Fix Battle Test - ${this.reportId}`);
    console.log(`📊 Testing Instagram Graph API ONLY approach (NO FALLBACKS)`);
    
    try {
      await this.testDirectGraphApiAccess();
      await this.testAliasMapping();
      await this.testCircuitBreakerBehavior();
      await this.testConcurrentRequests();
      await this.testCacheValidation();
      await this.testErrorHandling();
      
      await this.generateFinalReport();
      
    } catch (error) {
      console.error('❌ Battle test framework failed:', error);
      process.exit(1);
    }
  }

  async testDirectGraphApiAccess() {
    console.log('\n🔍 Test Suite 1: Direct Instagram Graph API Access');
    const suite = {
      name: 'Direct Graph API Access',
      tests: [],
      summary: { passed: 0, failed: 0, totalTime: 0 }
    };

    for (const account of INSTAGRAM_ACCOUNTS) {
      const startTime = performance.now();
      try {
        console.log(`   Testing ${account.username} (${account.note})`);
        
        const response = await axios.get(`${BASE_URL}/api/avatar/instagram/${account.username}`, {
          timeout: 10000,
          validateStatus: () => true // Accept all status codes
        });

        const endTime = performance.now();
        const duration = endTime - startTime;
        
        let passed = false;
        let reason = '';

        if (account.expected === 'success' && response.status === 200) {
          passed = response.headers['content-type']?.includes('image/jpeg');
          reason = passed ? 'Valid JPEG returned' : 'Invalid content type';
        } else if (account.expected === '404' && response.status === 404) {
          passed = response.data?.error?.includes('Graph API required');
          reason = passed ? 'Correct 404 with Graph API message' : 'Wrong error message';
        } else if (account.expected === 'success_or_404' && (response.status === 200 || response.status === 404)) {
          passed = true;
          reason = response.status === 200 ? 'Success' : 'Expected 404';
        } else {
          reason = `Unexpected status ${response.status}`;
        }

        suite.tests.push({
          username: account.username,
          status: response.status,
          duration: Math.round(duration),
          passed,
          reason,
          contentType: response.headers['content-type'],
          avatarSource: response.headers['x-avatar-source'],
          fallbackDetected: response.headers['x-proxy-fallback'] ? true : false
        });

        if (passed) suite.summary.passed++;
        else suite.summary.failed++;
        suite.summary.totalTime += duration;

        console.log(`   ✅ ${account.username}: ${response.status} (${Math.round(duration)}ms) - ${reason}`);
        
      } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        suite.tests.push({
          username: account.username,
          status: 'error',
          duration: Math.round(duration),
          passed: false,
          reason: error.message,
          error: error.code
        });
        
        suite.summary.failed++;
        suite.summary.totalTime += duration;
        console.log(`   ❌ ${account.username}: ERROR (${Math.round(duration)}ms) - ${error.message}`);
      }
      
      this.results.metrics.totalRequests++;
    }

    this.results.testSuites.push(suite);
  }

  async testAliasMapping() {
    console.log('\n🔄 Test Suite 2: Alias Mapping Validation');
    const suite = {
      name: 'Alias Mapping Validation',
      tests: [],
      summary: { passed: 0, failed: 0, totalTime: 0 }
    };

    // Test narsissist → maccosmetics mapping
    const startTime = performance.now();
    try {
      const [directResponse, aliasResponse] = await Promise.all([
        axios.get(`${BASE_URL}/api/avatar/instagram/maccosmetics`, { timeout: 10000, validateStatus: () => true }),
        axios.get(`${BASE_URL}/api/avatar/instagram/narsissist`, { timeout: 10000, validateStatus: () => true })
      ]);

      const endTime = performance.now();
      const duration = endTime - startTime;

      const passed = (directResponse.status === aliasResponse.status) && 
                     (directResponse.status === 200 ? 
                      directResponse.headers['content-length'] === aliasResponse.headers['content-length'] : 
                      true);

      suite.tests.push({
        test: 'narsissist → maccosmetics mapping',
        directStatus: directResponse.status,
        aliasStatus: aliasResponse.status,
        duration: Math.round(duration),
        passed,
        reason: passed ? 'Alias mapping working correctly' : 'Alias mapping failed'
      });

      if (passed) suite.summary.passed++;
      else suite.summary.failed++;
      suite.summary.totalTime += duration;

      console.log(`   ${passed ? '✅' : '❌'} Alias mapping: ${directResponse.status}=${aliasResponse.status} (${Math.round(duration)}ms)`);

    } catch (error) {
      suite.tests.push({
        test: 'narsissist → maccosmetics mapping',
        duration: 0,
        passed: false,
        reason: error.message,
        error: error.code
      });
      suite.summary.failed++;
      console.log(`   ❌ Alias mapping test failed: ${error.message}`);
    }

    this.results.testSuites.push(suite);
  }

  async testCircuitBreakerBehavior() {
    console.log('\n⚡ Test Suite 3: Circuit Breaker Validation');
    const suite = {
      name: 'Circuit Breaker Validation',
      tests: [],
      summary: { passed: 0, failed: 0, totalTime: 0 }
    };

    // Test circuit breaker returns proper error instead of fallback
    const startTime = performance.now();
    try {
      // Make multiple rapid requests to potentially trigger circuit breaker
      const rapidRequests = Array(10).fill().map(() => 
        axios.get(`${BASE_URL}/api/avatar/instagram/invalid_account_to_trigger_failure`, {
          timeout: 2000,
          validateStatus: () => true
        })
      );

      const responses = await Promise.allSettled(rapidRequests);
      const endTime = performance.now();
      const duration = endTime - startTime;

      let circuitBreakerDetected = false;
      let errorResponseCount = 0;
      let fallbackDetected = false;

      responses.forEach(result => {
        if (result.status === 'fulfilled') {
          const response = result.value;
          errorResponseCount++;
          
          if (response.status === 503 && response.data?.error?.includes('circuit breaker')) {
            circuitBreakerDetected = true;
          }
          
          if (response.headers['x-proxy-fallback'] || response.headers['x-avatar-source'] === 'Generated') {
            fallbackDetected = true;
          }
        }
      });

      const passed = !fallbackDetected; // NO FALLBACKS ALLOWED per user directive

      suite.tests.push({
        test: 'Circuit breaker behavior',
        totalRequests: 10,
        errorResponses: errorResponseCount,
        circuitBreakerTriggered: circuitBreakerDetected,
        fallbacksDetected: fallbackDetected,
        duration: Math.round(duration),
        passed,
        reason: passed ? 'No fallbacks detected - correct behavior' : 'FALLBACKS DETECTED - violates user directive'
      });

      if (passed) suite.summary.passed++;
      else suite.summary.failed++;
      suite.summary.totalTime += duration;

      console.log(`   ${passed ? '✅' : '❌'} Circuit breaker: ${errorResponseCount}/10 errors, fallbacks=${fallbackDetected} (${Math.round(duration)}ms)`);

    } catch (error) {
      suite.tests.push({
        test: 'Circuit breaker behavior',
        duration: 0,
        passed: false,
        reason: error.message,
        error: error.code
      });
      suite.summary.failed++;
      console.log(`   ❌ Circuit breaker test failed: ${error.message}`);
    }

    this.results.testSuites.push(suite);
  }

  async testConcurrentRequests() {
    console.log('\n🔄 Test Suite 4: Concurrent Request Handling');
    const suite = {
      name: 'Concurrent Request Handling',
      tests: [],
      summary: { passed: 0, failed: 0, totalTime: 0 }
    };

    const startTime = performance.now();
    try {
      // Test concurrent requests for same username
      const concurrentRequests = Array(5).fill().map(() => 
        axios.get(`${BASE_URL}/api/avatar/instagram/maccosmetics?t=${Date.now()}`, {
          timeout: 15000,
          validateStatus: () => true
        })
      );

      const responses = await Promise.all(concurrentRequests);
      const endTime = performance.now();
      const duration = endTime - startTime;

      let allSuccessful = true;
      let responseTimes = [];
      let fallbacksDetected = 0;

      responses.forEach((response, index) => {
        responseTimes.push(response.headers['x-response-time'] || 0);
        
        if (response.status !== 200 && response.status !== 404) {
          allSuccessful = false;
        }
        
        if (response.headers['x-proxy-fallback'] || response.headers['x-avatar-source'] === 'Generated') {
          fallbacksDetected++;
        }
      });

      const passed = allSuccessful && fallbacksDetected === 0;
      
      suite.tests.push({
        test: 'Concurrent requests',
        totalRequests: 5,
        successful: responses.filter(r => r.status === 200 || r.status === 404).length,
        averageResponseTime: Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length),
        fallbacksDetected,
        duration: Math.round(duration),
        passed,
        reason: passed ? 'All concurrent requests handled correctly' : `${fallbacksDetected} fallbacks detected`
      });

      if (passed) suite.summary.passed++;
      else suite.summary.failed++;
      suite.summary.totalTime += duration;

      console.log(`   ${passed ? '✅' : '❌'} Concurrent requests: ${responses.filter(r => r.status === 200).length}/5 success, ${fallbacksDetected} fallbacks (${Math.round(duration)}ms)`);

    } catch (error) {
      suite.tests.push({
        test: 'Concurrent requests',
        duration: 0,
        passed: false,
        reason: error.message,
        error: error.code
      });
      suite.summary.failed++;
      console.log(`   ❌ Concurrent request test failed: ${error.message}`);
    }

    this.results.testSuites.push(suite);
  }

  async testCacheValidation() {
    console.log('\n💾 Test Suite 5: Cache Behavior Validation');
    const suite = {
      name: 'Cache Behavior Validation',
      tests: [],
      summary: { passed: 0, failed: 0, totalTime: 0 }
    };

    const startTime = performance.now();
    try {
      // First request (should miss cache)
      const firstResponse = await axios.get(`${BASE_URL}/api/avatar/instagram/maccosmetics`, {
        timeout: 10000,
        validateStatus: () => true
      });

      // Second request (should hit cache)
      const secondResponse = await axios.get(`${BASE_URL}/api/avatar/instagram/maccosmetics`, {
        timeout: 10000,
        validateStatus: () => true
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      const cacheHit = secondResponse.headers['x-avatar-cache'] === 'HIT' || 
                      secondResponse.headers['x-avatar-cache'] === 'DEDUP_HIT';
      
      const bothSuccessful = (firstResponse.status === 200 || firstResponse.status === 404) &&
                            (secondResponse.status === 200 || secondResponse.status === 404);

      const passed = bothSuccessful && !firstResponse.headers['x-proxy-fallback'] && !secondResponse.headers['x-proxy-fallback'];

      suite.tests.push({
        test: 'Cache behavior',
        firstRequestStatus: firstResponse.status,
        secondRequestStatus: secondResponse.status,
        cacheHit,
        duration: Math.round(duration),
        passed,
        reason: passed ? 'Cache working without fallbacks' : 'Cache issues or fallbacks detected'
      });

      if (passed) suite.summary.passed++;
      else suite.summary.failed++;
      suite.summary.totalTime += duration;

      console.log(`   ${passed ? '✅' : '❌'} Cache validation: ${firstResponse.status}→${secondResponse.status}, cache=${cacheHit} (${Math.round(duration)}ms)`);

    } catch (error) {
      suite.tests.push({
        test: 'Cache behavior',
        duration: 0,
        passed: false,
        reason: error.message,
        error: error.code
      });
      suite.summary.failed++;
      console.log(`   ❌ Cache validation test failed: ${error.message}`);
    }

    this.results.testSuites.push(suite);
  }

  async testErrorHandling() {
    console.log('\n🚨 Test Suite 6: Error Handling Validation');
    const suite = {
      name: 'Error Handling Validation',
      tests: [],
      summary: { passed: 0, failed: 0, totalTime: 0 }
    };

    const errorScenarios = [
      { username: '', expected: 400, note: 'Empty username' },
      { username: 'a'.repeat(100), expected: 400, note: 'Extremely long username' },
      { username: 'invalid@username!', expected: 400, note: 'Invalid characters in username' }
    ];

    for (const scenario of errorScenarios) {
      const startTime = performance.now();
      try {
        console.log(`   Testing error scenario: ${scenario.note}`);
        
        const response = await axios.get(`${BASE_URL}/api/avatar/instagram/${scenario.username}`, {
          timeout: 5000,
          validateStatus: () => true
        });

        const endTime = performance.now();
        const duration = endTime - startTime;

        const passed = response.status === scenario.expected && 
                      !response.headers['x-proxy-fallback'] &&
                      response.headers['content-type']?.includes('application/json');

        suite.tests.push({
          scenario: scenario.note,
          username: scenario.username,
          expectedStatus: scenario.expected,
          actualStatus: response.status,
          duration: Math.round(duration),
          passed,
          reason: passed ? 'Correct error handling' : 'Unexpected response or fallback detected'
        });

        if (passed) suite.summary.passed++;
        else suite.summary.failed++;
        suite.summary.totalTime += duration;

        console.log(`   ${passed ? '✅' : '❌'} ${scenario.note}: ${response.status} (${Math.round(duration)}ms)`);
        
      } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        suite.tests.push({
          scenario: scenario.note,
          username: scenario.username,
          duration: Math.round(duration),
          passed: false,
          reason: error.message,
          error: error.code
        });
        
        suite.summary.failed++;
        console.log(`   ❌ ${scenario.note}: ERROR (${Math.round(duration)}ms) - ${error.message}`);
      }
    }

    this.results.testSuites.push(suite);
  }

  async generateFinalReport() {
    // Calculate overall metrics
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalTime = 0;
    let fallbackViolations = 0;

    this.results.testSuites.forEach(suite => {
      totalTests += suite.tests.length;
      totalPassed += suite.summary.passed;
      totalFailed += suite.summary.failed;
      totalTime += suite.summary.totalTime;

      // Count fallback violations (critical for user directive)
      suite.tests.forEach(test => {
        if (test.fallbackDetected || test.fallbacksDetected > 0) {
          fallbackViolations++;
        }
      });
    });

    this.results.metrics.totalRequests = totalTests;
    this.results.metrics.successfulRequests = totalPassed;
    this.results.metrics.failedRequests = totalFailed;
    this.results.metrics.averageResponseTime = Math.round(totalTime / totalTests);
    this.results.metrics.graphApiSuccessRate = Math.round((totalPassed / totalTests) * 100);
    this.results.metrics.fallbackAttempts = fallbackViolations;

    // Write detailed results
    const reportPath = path.join(TEST_RESULTS_DIR, `${this.reportId}.json`);
    await fs.writeFile(reportPath, JSON.stringify(this.results, null, 2));

    // Generate executive summary
    console.log('\n📊 DIRECT INSTAGRAM FIX BATTLE TEST RESULTS');
    console.log('=' .repeat(60));
    console.log(`🎯 Report ID: ${this.reportId}`);
    console.log(`📅 Timestamp: ${this.results.timestamp}`);
    console.log(`⚡ Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${totalPassed} (${Math.round((totalPassed/totalTests)*100)}%)`);
    console.log(`❌ Failed: ${totalFailed} (${Math.round((totalFailed/totalTests)*100)}%)`);
    console.log(`⏱️  Average Response Time: ${this.results.metrics.averageResponseTime}ms`);
    console.log(`🚫 Fallback Violations: ${fallbackViolations} (Must be 0 per user directive)`);
    
    // Critical validation for user directive
    if (fallbackViolations === 0) {
      console.log(`\n🎉 SUCCESS: NO FALLBACKS DETECTED - User directive compliance achieved!`);
      console.log(`✅ Instagram Graph API is the ONLY source - no fallback systems active`);
    } else {
      console.log(`\n🚨 CRITICAL FAILURE: ${fallbackViolations} fallback violations detected!`);
      console.log(`❌ User directive violated - fallback systems still active`);
    }

    console.log(`\n📁 Detailed report saved: ${reportPath}`);
    
    // Test suite summaries
    console.log('\nTest Suite Performance:');
    this.results.testSuites.forEach(suite => {
      const passRate = Math.round((suite.summary.passed / suite.tests.length) * 100);
      console.log(`  ${suite.name}: ${suite.summary.passed}/${suite.tests.length} passed (${passRate}%)`);
    });

    return this.results;
  }
}

// Run the battle test
if (isMainThread) {
  const battleTest = new DirectInstagramBattleTest();
  await battleTest.runComprehensiveBattleTest();
} else {
  // Worker thread logic for concurrent testing if needed
  const { testData } = workerData;
  // Implementation for worker threads if parallel processing needed
}
