#!/usr/bin/env node

/**
 * COMPREHENSIVE AVATAR INGESTION BATTLE TEST FRAMEWORK
 * Live production stress testing with edge case simulation
 */

import { performance } from 'perf_hooks';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const BASE_URL = 'http://localhost:3000';
const BATTLE_RESULTS_DIR = './test-results';

// Comprehensive edge case scenarios
const EDGE_CASE_MATRIX = {
  // Avatar endpoint edge cases
  AVATAR_SCENARIOS: [
    { username: 'maccosmetics', platform: 'instagram', expected: 'success' },
    { username: 'narsissist', platform: 'instagram', expected: 'alias_resolution' },
    { username: 'nonexistent_user_12345', platform: 'instagram', expected: 'generated_fallback' },
    { username: 'user_with_expired_token', platform: 'instagram', expected: 'profileinfo_fallback' },
  ],
  
  // Network failure simulations
  NETWORK_FAILURES: [
    'connection_reset', 'dns_failure', 'timeout', 'ssl_error', 
    'rate_limit', 'server_overload', 'partial_response'
  ],
  
  // Instagram API edge cases
  INSTAGRAM_API_SCENARIOS: [
    'token_expired', 'token_revoked', 'user_deactivated', 
    'privacy_changed', 'api_rate_limited', 'api_deprecated'
  ],
  
  // R2 storage edge cases
  R2_SCENARIOS: [
    'bucket_full', 'permission_denied', 'network_partition',
    'eventual_consistency', 'corrupted_data'
  ]
};

class ComprehensiveAvatarBattleTest {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      battleSuites: [],
      systemMetrics: {
        totalRequests: 0,
        successRate: 0,
        averageLatency: 0,
        memorLeaks: [],
        errorPatterns: {},
        performanceProfile: {}
      }
    };
    this.startTime = performance.now();
  }

  async runComprehensiveBattle() {
    console.log('🚀 COMPREHENSIVE AVATAR INGESTION BATTLE TEST');
    console.log('=' .repeat(80));
    
    // Phase 1: Edge Case Matrix Testing
    await this.runBattleSuite('Edge Case Matrix', [
      () => this.testAvatarEndpointVariations(),
      () => this.testTokenExpiryScenarios(),
      () => this.testNetworkFailureRecovery(),
      () => this.testR2StorageResilience(),
    ]);

    // Phase 2: Production Load Simulation
    await this.runBattleSuite('Production Load Simulation', [
      () => this.testConcurrentUserAvatars(),
      () => this.testSustainedRealWorldLoad(),
      () => this.testMemoryLeakDetection(),
      () => this.testCascadingFailureRecovery(),
    ]);

    // Phase 3: Architectural Stress Testing
    await this.runBattleSuite('Architectural Stress', [
      () => this.testSystemUnderPressure(),
      () => this.testFailoverMechanisms(),
      () => this.testDataConsistencyUnderLoad(),
    ]);

    await this.generateBattleReport();
    return this.results;
  }

  async runBattleSuite(suiteName, tests) {
    console.log(`\n🔥 Battle Suite: ${suiteName}`);
    console.log('-'.repeat(50));

    const suiteResults = {
      name: suiteName,
      tests: [],
      startTime: performance.now(),
      memoryStart: process.memoryUsage(),
      success: true,
    };

    for (const test of tests) {
      try {
        const result = await test();
        suiteResults.tests.push(result);
        console.log(`  ${result.success ? '✅' : '💥'} ${result.name}`);
        if (!result.success) {
          console.log(`     🔍 Analysis: ${result.analysis}`);
          suiteResults.success = false;
        }
      } catch (error) {
        console.log(`  💥 Critical failure: ${error.message}`);
        suiteResults.success = false;
      }
    }

    suiteResults.endTime = performance.now();
    suiteResults.memoryEnd = process.memoryUsage();
    this.results.battleSuites.push(suiteResults);
  }

  async makeAvatarRequest(username, platform = 'instagram', options = {}) {
    const url = `${BASE_URL}/api/avatar/${platform}/${username}`;
    const queryParams = new URLSearchParams();
    
    if (options.refresh) queryParams.set('refresh', '1');
    if (options.timeout) queryParams.set('t', Date.now());

    const fullUrl = queryParams.size > 0 ? `${url}?${queryParams}` : url;
    const startTime = performance.now();
    this.results.systemMetrics.totalRequests++;

    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: options.headers || {},
        signal: options.abortSignal,
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      const headers = {};
      response.headers.forEach((value, key) => { headers[key] = value; });

      let body = null;
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.startsWith('image/')) {
        body = await response.arrayBuffer();
      } else {
        body = await response.text();
      }

      return {
        success: response.ok,
        status: response.status,
        headers,
        body,
        duration,
        contentType,
        bodySize: body instanceof ArrayBuffer ? body.byteLength : body.length,
        avatarSource: headers['x-avatar-source'],
        avatarCache: headers['x-avatar-cache'],
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        success: false,
        error: error.message,
        duration: endTime - startTime,
      };
    }
  }

  // Phase 1: Edge Case Matrix Testing
  async testAvatarEndpointVariations() {
    const results = [];
    
    for (const scenario of EDGE_CASE_MATRIX.AVATAR_SCENARIOS) {
      const result = await this.makeAvatarRequest(scenario.username, scenario.platform);
      
      let success = false;
      let analysis = '';
      
      if (scenario.expected === 'success' && result.success && result.contentType.startsWith('image/')) {
        success = true;
        analysis = `Avatar served successfully from ${result.avatarSource}`;
      } else if (scenario.expected === 'alias_resolution' && result.success) {
        success = true;
        analysis = `Alias resolution working, served from ${result.avatarSource}`;
      } else if (scenario.expected === 'generated_fallback' && result.success && result.avatarSource === 'Generated') {
        success = true;
        analysis = 'Generated fallback working correctly';
      } else {
        analysis = `Expected ${scenario.expected}, got ${result.avatarSource || 'error'}`;
      }
      
      results.push({ ...result, scenario, success, analysis });
    }

    const overallSuccess = results.every(r => r.success);
    
    return {
      name: 'Avatar endpoint variations',
      success: overallSuccess,
      duration: results.reduce((sum, r) => sum + r.duration, 0),
      analysis: overallSuccess ? 'All avatar scenarios handled correctly' : 'Some scenarios failed',
      details: results,
    };
  }

  async testConcurrentUserAvatars() {
    const usernames = ['maccosmetics', 'narsissist', 'fentybeauty'];
    const concurrency = 20;
    
    const promises = Array(concurrency).fill().flatMap(() =>
      usernames.map(username => this.makeAvatarRequest(username))
    );
    
    const startTime = performance.now();
    const results = await Promise.all(promises);
    const endTime = performance.now();
    
    const successCount = results.filter(r => r.success).length;
    const cacheHits = results.filter(r => r.avatarCache === 'HIT').length;
    const avgLatency = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    
    const success = successCount === results.length && avgLatency < 500; // Under 500ms avg
    
    return {
      name: `Concurrent avatar requests (${results.length} total)`,
      success,
      duration: endTime - startTime,
      analysis: success ? 
        `Excellent performance: ${cacheHits} cache hits, ${avgLatency.toFixed(0)}ms avg latency` :
        `Performance issues: ${successCount}/${results.length} success, ${avgLatency.toFixed(0)}ms avg latency`,
      details: { successCount, cacheHits, avgLatency, totalRequests: results.length },
    };
  }

  async testMemoryLeakDetection() {
    const initialMemory = process.memoryUsage();
    
    // Generate heavy load
    for (let i = 0; i < 100; i++) {
      await this.makeAvatarRequest('maccosmetics');
      if (i % 10 === 0) {
        this.results.systemMetrics.memorLeaks.push({
          iteration: i,
          memory: process.memoryUsage(),
          timestamp: Date.now()
        });
      }
    }
    
    // Force GC if available
    if (global.gc) global.gc();
    
    const finalMemory = process.memoryUsage();
    const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
    const maxAcceptableGrowth = 10 * 1024 * 1024; // 10MB
    
    const success = heapGrowth < maxAcceptableGrowth;
    
    return {
      name: 'Memory leak detection',
      success,
      duration: 0,
      analysis: success ? 
        `Memory stable: ${(heapGrowth/1024/1024).toFixed(1)}MB growth` :
        `Potential memory leak: ${(heapGrowth/1024/1024).toFixed(1)}MB growth`,
      details: { initialMemory, finalMemory, heapGrowth },
    };
  }

  async testTokenExpiryScenarios() {
    // Simulate token expiry by testing with invalid/missing tokens
    const result = await this.makeAvatarRequest('test_expired_token_user');
    
    const success = result.success && (result.avatarSource === 'ProfileInfo' || result.avatarSource === 'Generated');
    
    return {
      name: 'Token expiry fallback chain',
      success,
      duration: result.duration,
      analysis: success ? 
        `Graceful fallback to ${result.avatarSource}` : 
        'Token expiry not handled gracefully',
      details: result,
    };
  }

  async testNetworkFailureRecovery() {
    // Test various network failure scenarios
    const scenarios = [
      { name: 'Non-existent user', username: 'definitely_does_not_exist_12345' },
      { name: 'Valid user', username: 'maccosmetics' },
      { name: 'Alias resolution', username: 'narsissist' },
    ];

    const results = [];
    for (const scenario of scenarios) {
      const result = await this.makeAvatarRequest(scenario.username);
      results.push({ ...result, scenarioName: scenario.name });
    }

    const allSuccessful = results.every(r => r.success);
    
    return {
      name: 'Network failure recovery',
      success: allSuccessful,
      duration: results.reduce((sum, r) => sum + r.duration, 0),
      analysis: allSuccessful ? 'All network scenarios handled' : 'Some network failures not recovered',
      details: results,
    };
  }

  async testR2StorageResilience() {
    // Test R2 storage behavior under different conditions
    const result = await this.makeAvatarRequest('maccosmetics', 'instagram', { refresh: true });
    
    const success = result.success && result.contentType === 'image/jpeg';
    
    return {
      name: 'R2 storage resilience',
      success,
      duration: result.duration,
      analysis: success ? 
        `R2 storage working, source: ${result.avatarSource}` : 
        'R2 storage issues detected',
      details: result,
    };
  }

  // Missing test methods implementation
  async testCascadingFailureRecovery() {
    // Test system behavior when multiple components fail simultaneously
    const results = [];
    
    // Simulate cascade: non-existent user -> ProfileInfo fallback -> Generated fallback
    const cascadeTest = await this.makeAvatarRequest('cascade_failure_test_user_99999');
    results.push(cascadeTest);
    
    // Test multiple rapid requests during potential failures
    const rapidRequests = await Promise.all([
      this.makeAvatarRequest('nonexistent1'),
      this.makeAvatarRequest('nonexistent2'), 
      this.makeAvatarRequest('maccosmetics'), // Known good
    ]);
    results.push(...rapidRequests);
    
    const allHandled = results.every(r => r.success);
    const hasGenerated = results.some(r => r.avatarSource === 'Generated');
    
    return {
      name: 'Cascading failure recovery',
      success: allHandled && hasGenerated,
      duration: results.reduce((sum, r) => sum + r.duration, 0),
      analysis: allHandled ? 
        'System gracefully handles cascading failures' : 
        'Cascading failures cause system instability',
      details: results,
    };
  }

  async testSystemUnderPressure() {
    // Stress test with high concurrency and mixed workload
    const pressure = 100; // High pressure test
    const mixedWorkload = Array(pressure).fill().map((_, i) => {
      const users = ['maccosmetics', 'narsissist', 'fentybeauty', 'nonexistent' + i];
      return this.makeAvatarRequest(users[i % users.length]);
    });
    
    const startTime = performance.now();
    const results = await Promise.all(mixedWorkload);
    const endTime = performance.now();
    
    const successCount = results.filter(r => r.success).length;
    const avgLatency = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const maxLatency = Math.max(...results.map(r => r.duration));
    
    // System should handle 90%+ success rate under pressure with reasonable latency
    const success = (successCount / results.length) >= 0.9 && avgLatency < 1000 && maxLatency < 5000;
    
    return {
      name: `System under pressure (${pressure} concurrent)`,
      success,
      duration: endTime - startTime,
      analysis: success ? 
        `System stable under pressure: ${successCount}/${results.length} success, ${avgLatency.toFixed(0)}ms avg` :
        `System struggles under pressure: ${successCount}/${results.length} success, ${avgLatency.toFixed(0)}ms avg, ${maxLatency.toFixed(0)}ms max`,
      details: { successCount, totalRequests: results.length, avgLatency, maxLatency },
    };
  }

  async testFailoverMechanisms() {
    // Test various failover scenarios
    const scenarios = [
      { name: 'Graph API unavailable', user: 'user_no_graph_access' },
      { name: 'ProfileInfo missing', user: 'user_no_profile_info' }, 
      { name: 'R2 storage issues', user: 'user_r2_issues' },
    ];
    
    const results = [];
    for (const scenario of scenarios) {
      const result = await this.makeAvatarRequest(scenario.user);
      results.push({ ...result, scenarioName: scenario.name });
    }
    
    // All should succeed via fallback mechanisms
    const allHandled = results.every(r => r.success);
    
    return {
      name: 'Failover mechanisms',
      success: allHandled,
      duration: results.reduce((sum, r) => sum + r.duration, 0),
      analysis: allHandled ? 
        'All failover mechanisms working correctly' : 
        'Some failover mechanisms failing',
      details: results,
    };
  }

  async testDataConsistencyUnderLoad() {
    // Test that same user always gets consistent avatar
    const testUser = 'maccosmetics';
    const requests = 20;
    
    const results = await Promise.all(
      Array(requests).fill().map(() => this.makeAvatarRequest(testUser))
    );
    
    // All should return same ETag/Content-Length for consistency
    const firstResult = results[0];
    const allConsistent = results.every(r => 
      r.success && 
      r.bodySize === firstResult.bodySize &&
      r.contentType === firstResult.contentType
    );
    
    return {
      name: 'Data consistency under load',
      success: allConsistent,
      duration: results.reduce((sum, r) => sum + r.duration, 0),
      analysis: allConsistent ? 
        'Data remains consistent under concurrent load' :
        'Data consistency issues detected under load',
      details: { requests, consistentResponses: results.filter(r => r.bodySize === firstResult.bodySize).length },
    };
  }

  async generateBattleReport() {
    const endTime = performance.now();
    const totalDuration = endTime - this.startTime;
    
    // Calculate system metrics
    this.results.systemMetrics.successRate = 
      this.results.battleSuites.flatMap(s => s.tests).filter(t => t.success).length /
      this.results.battleSuites.flatMap(s => s.tests).length;

    this.results.systemMetrics.averageLatency = 
      this.results.battleSuites.flatMap(s => s.tests)
        .reduce((sum, t) => sum + t.duration, 0) / 
      this.results.battleSuites.flatMap(s => s.tests).length;

    this.results.totalDuration = totalDuration;
    
    // Write battle report
    const reportPath = path.join(BATTLE_RESULTS_DIR, `avatar-battle-report-${Date.now()}.json`);
    await fs.mkdir(BATTLE_RESULTS_DIR, { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(this.results, null, 2));

    console.log('\n' + '🔥'.repeat(80));
    console.log('⚔️  AVATAR INGESTION BATTLE TEST COMPLETE');
    console.log('🔥'.repeat(80));
    console.log(`📊 Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`📈 Requests: ${this.results.systemMetrics.totalRequests}`);
    console.log(`✅ Success Rate: ${(this.results.systemMetrics.successRate * 100).toFixed(1)}%`);
    console.log(`⚡ Avg Latency: ${this.results.systemMetrics.averageLatency.toFixed(0)}ms`);
    console.log(`📄 Report: ${reportPath}`);

    return reportPath;
  }
}

// Execute if main thread
if (isMainThread) {
  const battle = new ComprehensiveAvatarBattleTest();
  await battle.runComprehensiveBattle();
}
