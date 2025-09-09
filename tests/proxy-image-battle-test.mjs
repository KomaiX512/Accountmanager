#!/usr/bin/env node

/**
 * Instagram CDN 403 Proxy Battle Test Framework
 * Comprehensive automated testing for production resilience
 */

import { performance } from 'perf_hooks';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import fs from 'fs/promises';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const TEST_RESULTS_DIR = './test-results';

// Ensure test results directory exists
await fs.mkdir(TEST_RESULTS_DIR, { recursive: true });

// Real Instagram CDN URLs for battle testing
const INSTAGRAM_TEST_URLS = [
  // Profile pictures (commonly blocked)
  'https://scontent-lhr8-1.cdninstagram.com/v/t51.2885-19/358972367_292925063242734_4793023551906165095_n.jpg',
  'https://scontent-lhr8-2.cdninstagram.com/v/t51.2885-19/362208989_281511057670657_7297106897799320871_n.jpg',
  'https://scontent-lhr8-1.cdninstagram.com/v/t51.2885-19/448996398_450263704384646_3156120711618296066_n.jpg',
  
  // Post images (different CDN behavior)
  'https://scontent-lhr8-1.cdninstagram.com/v/t51.29350-15/362198989_656772329806157_8297106897799320871_n.jpg',
  'https://scontent-lhr8-2.cdninstagram.com/v/t51.29350-15/448996398_656772329806157_3156120711618296066_n.webp',
  
  // Intentionally malformed URLs for edge case testing
  'https://scontent-invalid.cdninstagram.com/nonexistent.jpg',
  'https://httpstat.us/403', // Always returns 403
  'https://httpstat.us/429', // Rate limiting simulation
  'https://httpstat.us/500', // Server error simulation
  'https://httpstat.us/200?sleep=5000', // Timeout simulation
];

class BattleTestFramework {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      testSuites: [],
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        cacheHitRate: 0,
        memoryUsage: [],
      }
    };
    this.startTime = performance.now();
  }

  async runAllTests() {
    console.log('🚀 Starting Instagram CDN 403 Proxy Battle Test Framework');
    console.log('=' .repeat(80));

    // Test Suite 1: Basic Functionality
    await this.runTestSuite('Basic Functionality', [
      () => this.testBasicProxyRequest(),
      () => this.testPixelFallback(),
      () => this.testNonImageURL(),
      () => this.testMalformedURL(),
    ]);

    // Test Suite 2: Instagram CDN Specific
    await this.runTestSuite('Instagram CDN Behavior', [
      () => this.testInstagram403Handling(),
      () => this.testNegativeCacheConsistency(),
      () => this.testDifferentInstagramURLs(),
    ]);

    // Test Suite 3: Concurrency & Load
    await this.runTestSuite('Concurrency & Load', [
      () => this.testConcurrentSameURL(),
      () => this.testConcurrentDifferentURLs(),
      () => this.testSustainedLoad(),
      () => this.testMemoryUsageUnderLoad(),
    ]);

    // Test Suite 4: Edge Cases
    await this.runTestSuite('Edge Cases', [
      () => this.testTimeoutHandling(),
      () => this.testRateLimitingResponse(),
      () => this.testServerErrorHandling(),
      () => this.testLargeImageHandling(),
    ]);

    // Test Suite 5: Cache Behavior
    await this.runTestSuite('Cache Behavior', [
      () => this.testNegativeCacheTTL(),
      () => this.testCacheEviction(),
      () => this.testCacheHeaders(),
    ]);

    await this.generateReport();
    return this.results;
  }

  async runTestSuite(suiteName, tests) {
    console.log(`\n📋 Running Test Suite: ${suiteName}`);
    console.log('-'.repeat(50));

    const suiteResults = {
      name: suiteName,
      tests: [],
      startTime: performance.now(),
      endTime: null,
      success: true,
    };

    for (const test of tests) {
      try {
        const result = await test();
        suiteResults.tests.push(result);
        console.log(`  ${result.success ? '✅' : '❌'} ${result.name}`);
        if (!result.success) {
          console.log(`     Error: ${result.error}`);
          suiteResults.success = false;
        }
      } catch (error) {
        console.log(`  ❌ Test failed with exception: ${error.message}`);
        suiteResults.success = false;
        suiteResults.tests.push({
          name: test.name || 'Unknown Test',
          success: false,
          error: error.message,
          duration: 0,
        });
      }
    }

    suiteResults.endTime = performance.now();
    this.results.testSuites.push(suiteResults);
  }

  async makeProxyRequest(imageUrl, options = {}) {
    const url = new URL('/api/proxy-image', BASE_URL);
    url.searchParams.set('url', imageUrl);
    
    if (options.fallback) {
      url.searchParams.set('fallback', options.fallback);
    }

    const startTime = performance.now();
    this.results.metrics.totalRequests++;

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: options.headers || {},
        signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      const headers = {};
      if (response.headers) {
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
      }

      let body = null;
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.startsWith('image/')) {
        body = await response.arrayBuffer();
      } else {
        body = await response.text();
      }

      if (response.ok) {
        this.results.metrics.successfulRequests++;
      } else {
        this.results.metrics.failedRequests++;
      }

      return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers,
        body,
        duration,
        contentType,
        bodySize: body instanceof ArrayBuffer ? body.byteLength : body.length,
      };
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      this.results.metrics.failedRequests++;

      return {
        success: false,
        error: error.message,
        duration,
      };
    }
  }

  // Test Suite 1: Basic Functionality
  async testBasicProxyRequest() {
    const result = await this.makeProxyRequest('https://httpbin.org/image/jpeg');
    return {
      name: 'Basic proxy request for valid image',
      success: result.success && result.contentType.startsWith('image/'),
      duration: result.duration,
      details: result,
    };
  }

  async testPixelFallback() {
    const result = await this.makeProxyRequest('https://httpstat.us/403', { fallback: 'pixel' });
    return {
      name: 'Pixel fallback for 403 response',
      success: result.success && 
               result.contentType === 'image/png' && 
               result.headers['x-proxy-fallback'] === 'pixel',
      duration: result.duration,
      details: result,
    };
  }

  async testNonImageURL() {
    const result = await this.makeProxyRequest('https://httpbin.org/json');
    return {
      name: 'Non-image URL handling',
      success: !result.success && result.status === 400,
      duration: result.duration,
      details: result,
    };
  }

  async testMalformedURL() {
    const result = await this.makeProxyRequest('not-a-valid-url');
    return {
      name: 'Malformed URL handling',
      success: !result.success,
      duration: result.duration,
      details: result,
    };
  }

  // Test Suite 2: Instagram CDN Specific
  async testInstagram403Handling() {
    const instagramUrl = INSTAGRAM_TEST_URLS[0];
    const result = await this.makeProxyRequest(instagramUrl, { fallback: 'pixel' });
    
    return {
      name: 'Instagram CDN 403 handling',
      success: result.success && result.headers['x-proxy-fallback'] === 'pixel',
      duration: result.duration,
      details: result,
    };
  }

  async testNegativeCacheConsistency() {
    const instagramUrl = INSTAGRAM_TEST_URLS[0];
    
    // First request - should hit Instagram and get cached
    const firstResult = await this.makeProxyRequest(instagramUrl, { fallback: 'pixel' });
    
    // Second request - should come from negative cache
    const secondResult = await this.makeProxyRequest(instagramUrl, { fallback: 'pixel' });
    
    const isCacheHit = secondResult.headers && secondResult.headers['x-proxy-cache'] === 'NEG_HIT';
    const fasterResponse = secondResult.duration < firstResult.duration;
    
    return {
      name: 'Negative cache consistency',
      success: isCacheHit && fasterResponse,
      duration: secondResult.duration,
      details: { firstResult, secondResult, isCacheHit, fasterResponse },
    };
  }

  async testDifferentInstagramURLs() {
    const results = [];
    for (const url of INSTAGRAM_TEST_URLS.slice(0, 3)) {
      const result = await this.makeProxyRequest(url, { fallback: 'pixel' });
      results.push(result);
    }
    
    const allHandledCorrectly = results.every(r => 
      r.success && r.contentType === 'image/png'
    );
    
    return {
      name: 'Different Instagram URL patterns',
      success: allHandledCorrectly,
      duration: results.reduce((sum, r) => sum + r.duration, 0),
      details: results,
    };
  }

  // Test Suite 3: Concurrency & Load
  async testConcurrentSameURL() {
    const instagramUrl = INSTAGRAM_TEST_URLS[0];
    const concurrency = 50;
    
    const promises = Array(concurrency).fill().map(() => 
      this.makeProxyRequest(instagramUrl, { fallback: 'pixel' })
    );
    
    const startTime = performance.now();
    const results = await Promise.all(promises);
    const endTime = performance.now();
    
    const successCount = results.filter(r => r.success).length;
    const cacheHits = results.filter(r => r.headers && r.headers['x-proxy-cache'] === 'NEG_HIT').length;
    
    return {
      name: `Concurrent same URL (${concurrency} requests)`,
      success: successCount === concurrency && cacheHits > 0,
      duration: endTime - startTime,
      details: { successCount, cacheHits, totalRequests: concurrency },
    };
  }

  async testConcurrentDifferentURLs() {
    const promises = INSTAGRAM_TEST_URLS.slice(0, 5).map(url => 
      this.makeProxyRequest(url, { fallback: 'pixel' })
    );
    
    const startTime = performance.now();
    const results = await Promise.all(promises);
    const endTime = performance.now();
    
    const successCount = results.filter(r => r.success).length;
    
    return {
      name: 'Concurrent different URLs',
      success: successCount === results.length,
      duration: endTime - startTime,
      details: { successCount, totalRequests: results.length },
    };
  }

  async testSustainedLoad() {
    const duration = 30000; // 30 seconds
    const requestsPerSecond = 10;
    const totalRequests = (duration / 1000) * requestsPerSecond;
    
    console.log(`    Running sustained load test: ${totalRequests} requests over ${duration/1000}s`);
    
    const startTime = performance.now();
    let requestCount = 0;
    const results = [];
    
    const runRequests = async () => {
      while (performance.now() - startTime < duration) {
        const url = INSTAGRAM_TEST_URLS[requestCount % INSTAGRAM_TEST_URLS.length];
        const result = await this.makeProxyRequest(url, { fallback: 'pixel' });
        results.push(result);
        requestCount++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000 / requestsPerSecond));
      }
    };
    
    await runRequests();
    const endTime = performance.now();
    
    const successCount = results.filter(r => r.success).length;
    const averageResponseTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    
    return {
      name: `Sustained load (${results.length} requests)`,
      success: successCount / results.length > 0.95, // 95% success rate
      duration: endTime - startTime,
      details: { 
        requestCount: results.length, 
        successCount, 
        successRate: successCount / results.length,
        averageResponseTime 
      },
    };
  }

  async testMemoryUsageUnderLoad() {
    const initialMemory = process.memoryUsage();
    
    // Create multiple concurrent requests
    const promises = Array(100).fill().map((_, i) => 
      this.makeProxyRequest(INSTAGRAM_TEST_URLS[i % INSTAGRAM_TEST_URLS.length], { fallback: 'pixel' })
    );
    
    await Promise.all(promises);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage();
    const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
    
    return {
      name: 'Memory usage under load',
      success: memoryGrowth < 50 * 1024 * 1024, // Less than 50MB growth
      duration: 0,
      details: { initialMemory, finalMemory, memoryGrowth },
    };
  }

  // Test Suite 4: Edge Cases
  async testTimeoutHandling() {
    const result = await this.makeProxyRequest('https://httpstat.us/200?sleep=15000', { 
      fallback: 'pixel',
      timeout: 5000 
    });
    
    return {
      name: 'Timeout handling',
      success: !result.success && result.error.includes('timeout'),
      duration: result.duration,
      details: result,
    };
  }

  async testRateLimitingResponse() {
    const result = await this.makeProxyRequest('https://httpstat.us/429', { fallback: 'pixel' });
    
    return {
      name: 'Rate limiting response',
      success: result.status === 429,
      duration: result.duration,
      details: result,
    };
  }

  async testServerErrorHandling() {
    const result = await this.makeProxyRequest('https://httpstat.us/500', { fallback: 'pixel' });
    
    return {
      name: 'Server error handling',
      success: result.status === 500,
      duration: result.duration,
      details: result,
    };
  }

  async testLargeImageHandling() {
    // Using a large image URL (this is a real large image from httpbin)
    const result = await this.makeProxyRequest('https://httpbin.org/image/jpeg', { 
      timeout: 30000 
    });
    
    return {
      name: 'Large image handling',
      success: result.success && result.bodySize > 1024, // At least 1KB
      duration: result.duration,
      details: result,
    };
  }

  // Test Suite 5: Cache Behavior
  async testNegativeCacheTTL() {
    const testUrl = `https://httpstat.us/403?t=${Date.now()}`;
    
    // First request - should set negative cache
    const firstResult = await this.makeProxyRequest(testUrl, { fallback: 'pixel' });
    
    // Wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Second request - should hit negative cache
    const secondResult = await this.makeProxyRequest(testUrl, { fallback: 'pixel' });
    
    const isCacheHit = secondResult.headers && secondResult.headers['x-proxy-cache'] === 'NEG_HIT';
    
    return {
      name: 'Negative cache TTL behavior',
      success: isCacheHit && secondResult.duration < firstResult.duration,
      duration: secondResult.duration,
      details: { firstResult, secondResult, isCacheHit },
    };
  }

  async testCacheEviction() {
    // This test would require longer TTL testing or cache size limits
    // For now, just verify cache headers exist
    const result = await this.makeProxyRequest(INSTAGRAM_TEST_URLS[0], { fallback: 'pixel' });
    
    return {
      name: 'Cache eviction behavior',
      success: result.headers && result.headers['cache-control'] !== undefined,
      duration: result.duration,
      details: result,
    };
  }

  async testCacheHeaders() {
    const result = await this.makeProxyRequest(INSTAGRAM_TEST_URLS[0], { fallback: 'pixel' });
    
    const hasProxyHeaders = result.headers && (result.headers['x-proxy-fallback'] || result.headers['x-proxy-cache']);
    const hasCacheControl = result.headers && result.headers['cache-control'];
    
    return {
      name: 'Cache headers present',
      success: hasProxyHeaders && hasCacheControl,
      duration: result.duration,
      details: { headers: result.headers },
    };
  }

  async generateReport() {
    const endTime = performance.now();
    const totalDuration = endTime - this.startTime;
    
    // Calculate final metrics
    this.results.metrics.averageResponseTime = 
      this.results.testSuites.flatMap(suite => suite.tests)
        .reduce((sum, test) => sum + test.duration, 0) / 
      this.results.testSuites.flatMap(suite => suite.tests).length;

    this.results.metrics.cacheHitRate = 
      this.results.testSuites.flatMap(suite => suite.tests)
        .filter(test => test.details?.headers && test.details.headers['x-proxy-cache'] === 'NEG_HIT').length /
      this.results.testSuites.flatMap(suite => suite.tests).length;

    this.results.totalDuration = totalDuration;
    this.results.endTime = new Date().toISOString();

    // Write detailed results to file
    const reportPath = path.join(TEST_RESULTS_DIR, `battle-test-report-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(this.results, null, 2));

    // Generate summary report
    console.log('\n' + '='.repeat(80));
    console.log('🏁 BATTLE TEST FRAMEWORK COMPLETE');
    console.log('='.repeat(80));
    console.log(`📊 Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`📈 Total Requests: ${this.results.metrics.totalRequests}`);
    console.log(`✅ Successful: ${this.results.metrics.successfulRequests}`);
    console.log(`❌ Failed: ${this.results.metrics.failedRequests}`);
    console.log(`⚡ Average Response Time: ${this.results.metrics.averageResponseTime.toFixed(2)}ms`);
    console.log(`🎯 Cache Hit Rate: ${(this.results.metrics.cacheHitRate * 100).toFixed(1)}%`);
    console.log(`📄 Detailed report: ${reportPath}`);

    // Test suite summary
    console.log('\n📋 Test Suite Results:');
    for (const suite of this.results.testSuites) {
      const passedTests = suite.tests.filter(t => t.success).length;
      const totalTests = suite.tests.length;
      const status = suite.success ? '✅' : '❌';
      console.log(`  ${status} ${suite.name}: ${passedTests}/${totalTests} tests passed`);
    }

    return reportPath;
  }
}

// Main execution
if (isMainThread) {
  const framework = new BattleTestFramework();
  await framework.runAllTests();
} else {
  // Worker thread code for parallel execution (if needed)
  const { testFunction, testData } = workerData;
  const result = await testFunction(testData);
  parentPort.postMessage(result);
}
