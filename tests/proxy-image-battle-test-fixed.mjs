#!/usr/bin/env node

/**
 * Instagram CDN 403 Proxy Battle Test Framework - FIXED VERSION
 * Using axios for reliable HTTP requests
 */

import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:3000';
const TEST_RESULTS_DIR = './test-results';

// Ensure test results directory exists
await fs.mkdir(TEST_RESULTS_DIR, { recursive: true });

// Real Instagram CDN URLs for battle testing
const INSTAGRAM_TEST_URLS = [
  'https://scontent-lhr8-1.cdninstagram.com/v/t51.2885-19/358972367_292925063242734_4793023551906165095_n.jpg',
  'https://scontent-lhr8-2.cdninstagram.com/v/t51.2885-19/362208989_281511057670657_7297106897799320871_n.jpg',
  'https://scontent-lhr8-1.cdninstagram.com/v/t51.29350-15/362198989_656772329806157_8297106897799320871_n.jpg',
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
        instagramBlockRate: 0,
        negCacheEffectiveness: 0,
      }
    };
    this.startTime = performance.now();
  }

  async runAllTests() {
    console.log('🚀 Starting Instagram CDN 403 Proxy Battle Test Framework - FIXED');
    console.log('=' .repeat(80));

    await this.runTestSuite('Critical Path Tests', [
      () => this.testNegativeCacheCore(),
      () => this.testInstagramCDNBlocking(),
      () => this.testPixelFallbackCore(),
      () => this.testConcurrentRequestDeduplication(),
    ]);

    await this.runTestSuite('Load & Stress Tests', [
      () => this.testSustainedLoadCore(),
      () => this.testConcurrentInstagramRequests(),
      () => this.testCacheStormPrevention(),
    ]);

    await this.runTestSuite('Edge Case Tests', [
      () => this.testMalformedURLs(),
      () => this.testTimeoutBehavior(),
      () => this.testHeaderConsistency(),
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
        console.log(`  ${result.success ? '✅' : '❌'} ${result.name} (${result.duration.toFixed(2)}ms)`);
        if (!result.success) {
          console.log(`     Error: ${result.error || 'Test failed'}`);
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
      const response = await axios.get(url.toString(), {
        timeout: options.timeout || 10000,
        responseType: 'arraybuffer',
        validateStatus: () => true, // Don't throw on any status code
        headers: options.headers || {},
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      const headers = response.headers || {};
      const success = response.status >= 200 && response.status < 300;

      if (success) {
        this.results.metrics.successfulRequests++;
      } else {
        this.results.metrics.failedRequests++;
      }

      return {
        success,
        status: response.status,
        statusText: response.statusText,
        headers,
        body: response.data,
        duration,
        contentType: headers['content-type'] || '',
        bodySize: response.data ? response.data.length : 0,
      };
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      this.results.metrics.failedRequests++;

      return {
        success: false,
        error: error.message,
        duration,
        status: error.response?.status || 0,
        headers: error.response?.headers || {},
      };
    }
  }

  // Core negative cache test
  async testNegativeCacheCore() {
    const instagramUrl = INSTAGRAM_TEST_URLS[0];
    
    // First request - should trigger Instagram CDN 403 and set negative cache
    const firstResult = await this.makeProxyRequest(instagramUrl, { fallback: 'pixel' });
    
    // Immediate second request - should come from negative cache
    const secondResult = await this.makeProxyRequest(instagramUrl, { fallback: 'pixel' });
    
    const isCacheHit = secondResult.headers['x-proxy-cache'] === 'NEG_HIT';
    const fasterResponse = secondResult.duration < firstResult.duration;
    const bothSuccessful = firstResult.success && secondResult.success;
    const bothPixels = firstResult.contentType === 'image/png' && secondResult.contentType === 'image/png';
    
    return {
      name: 'Negative cache core functionality',
      success: bothSuccessful && bothPixels && isCacheHit && fasterResponse,
      duration: secondResult.duration,
      details: { 
        firstDuration: firstResult.duration,
        secondDuration: secondResult.duration,
        isCacheHit,
        fasterResponse,
        bothSuccessful,
        bothPixels,
        firstHeaders: firstResult.headers,
        secondHeaders: secondResult.headers,
      },
    };
  }

  // Test Instagram CDN blocking behavior
  async testInstagramCDNBlocking() {
    const results = [];
    
    for (const url of INSTAGRAM_TEST_URLS) {
      const result = await this.makeProxyRequest(url, { fallback: 'pixel' });
      results.push(result);
    }
    
    const allSuccessful = results.every(r => r.success);
    const allPixels = results.every(r => r.contentType === 'image/png');
    const hasProxyHeaders = results.every(r => 
      r.headers['x-proxy-fallback'] === 'pixel' && 
      (r.headers['x-proxy-cache'] === 'NEG_SET' || r.headers['x-proxy-cache'] === 'NEG_HIT')
    );
    
    // Track Instagram block rate
    const negSetCount = results.filter(r => r.headers['x-proxy-cache'] === 'NEG_SET').length;
    this.results.metrics.instagramBlockRate = negSetCount / results.length;
    
    return {
      name: 'Instagram CDN blocking behavior',
      success: allSuccessful && allPixels && hasProxyHeaders,
      duration: results.reduce((sum, r) => sum + r.duration, 0),
      details: { 
        totalRequests: results.length,
        successfulRequests: results.filter(r => r.success).length,
        pixelResponses: results.filter(r => r.contentType === 'image/png').length,
        negativeCache: { 
          NEG_SET: results.filter(r => r.headers['x-proxy-cache'] === 'NEG_SET').length,
          NEG_HIT: results.filter(r => r.headers['x-proxy-cache'] === 'NEG_HIT').length,
        },
        results
      },
    };
  }

  // Test pixel fallback core functionality
  async testPixelFallbackCore() {
    const result = await this.makeProxyRequest('https://httpstat.us/403', { fallback: 'pixel' });
    
    const isPixel = result.contentType === 'image/png';
    const hasCorrectHeaders = result.headers['x-proxy-fallback'] === 'pixel';
    const correctSize = result.bodySize === 68; // Expected size of 1x1 PNG
    
    return {
      name: 'Pixel fallback core functionality',
      success: result.success && isPixel && hasCorrectHeaders && correctSize,
      duration: result.duration,
      details: { 
        isPixel,
        hasCorrectHeaders,
        correctSize,
        actualSize: result.bodySize,
        headers: result.headers,
      },
    };
  }

  // Test concurrent request deduplication
  async testConcurrentRequestDeduplication() {
    const instagramUrl = INSTAGRAM_TEST_URLS[0];
    const concurrency = 20;
    
    const promises = Array(concurrency).fill().map(() => 
      this.makeProxyRequest(instagramUrl, { fallback: 'pixel' })
    );
    
    const startTime = performance.now();
    const results = await Promise.all(promises);
    const endTime = performance.now();
    
    const allSuccessful = results.every(r => r.success);
    const cacheHits = results.filter(r => r.headers['x-proxy-cache'] === 'NEG_HIT').length;
    const cacheEffectiveness = cacheHits / concurrency;
    
    // Update metrics
    this.results.metrics.negCacheEffectiveness = cacheEffectiveness;
    
    return {
      name: `Concurrent request deduplication (${concurrency} requests)`,
      success: allSuccessful && cacheHits > 0,
      duration: endTime - startTime,
      details: { 
        concurrency,
        successfulRequests: results.filter(r => r.success).length,
        cacheHits,
        cacheEffectiveness,
        avgResponseTime: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
      },
    };
  }

  // Sustained load test
  async testSustainedLoadCore() {
    const duration = 15000; // 15 seconds
    const requestsPerSecond = 5;
    const results = [];
    
    console.log(`    Running sustained load test: ${requestsPerSecond}/sec for ${duration/1000}s`);
    
    const startTime = performance.now();
    let requestCount = 0;
    
    while (performance.now() - startTime < duration) {
      const url = INSTAGRAM_TEST_URLS[requestCount % INSTAGRAM_TEST_URLS.length];
      const result = await this.makeProxyRequest(url, { fallback: 'pixel' });
      results.push(result);
      requestCount++;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000 / requestsPerSecond));
    }
    
    const endTime = performance.now();
    const successRate = results.filter(r => r.success).length / results.length;
    const avgResponseTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const cacheHitRate = results.filter(r => r.headers['x-proxy-cache'] === 'NEG_HIT').length / results.length;
    
    return {
      name: `Sustained load (${results.length} requests)`,
      success: successRate > 0.98, // 98% success rate requirement
      duration: endTime - startTime,
      details: { 
        totalRequests: results.length,
        successRate,
        avgResponseTime,
        cacheHitRate,
        duration: endTime - startTime,
      },
    };
  }

  // Test concurrent Instagram requests
  async testConcurrentInstagramRequests() {
    const promises = INSTAGRAM_TEST_URLS.map(url => 
      this.makeProxyRequest(url, { fallback: 'pixel' })
    );
    
    const startTime = performance.now();
    const results = await Promise.all(promises);
    const endTime = performance.now();
    
    const allSuccessful = results.every(r => r.success);
    const allPixels = results.every(r => r.contentType === 'image/png');
    
    return {
      name: 'Concurrent Instagram requests',
      success: allSuccessful && allPixels,
      duration: endTime - startTime,
      details: { 
        totalRequests: results.length,
        successfulRequests: results.filter(r => r.success).length,
        pixelResponses: results.filter(r => r.contentType === 'image/png').length,
      },
    };
  }

  // Test cache storm prevention
  async testCacheStormPrevention() {
    const testUrl = `https://httpstat.us/403?cache-test=${Date.now()}`;
    const concurrency = 10;
    
    // First wave - should set negative cache
    const firstWave = await Promise.all(
      Array(concurrency).fill().map(() => this.makeProxyRequest(testUrl, { fallback: 'pixel' }))
    );
    
    // Second wave - should all hit negative cache
    const secondWave = await Promise.all(
      Array(concurrency).fill().map(() => this.makeProxyRequest(testUrl, { fallback: 'pixel' }))
    );
    
    const firstWaveSuccess = firstWave.every(r => r.success);
    const secondWaveSuccess = secondWave.every(r => r.success);
    const secondWaveCacheHits = secondWave.filter(r => r.headers['x-proxy-cache'] === 'NEG_HIT').length;
    const cacheStormPrevented = secondWaveCacheHits >= concurrency * 0.8; // 80% cache hits
    
    return {
      name: 'Cache storm prevention',
      success: firstWaveSuccess && secondWaveSuccess && cacheStormPrevented,
      duration: 0,
      details: {
        firstWaveSuccessful: firstWave.filter(r => r.success).length,
        secondWaveSuccessful: secondWave.filter(r => r.success).length,
        secondWaveCacheHits,
        cacheStormPrevented,
        expectedCacheHits: concurrency,
      },
    };
  }

  // Test malformed URLs
  async testMalformedURLs() {
    const malformedUrls = [
      'not-a-url',
      'http://',
      'https://malformed..instagram.com/image.jpg',
      'javascript:alert(1)',
      '',
    ];
    
    const results = [];
    for (const url of malformedUrls) {
      const result = await this.makeProxyRequest(url, { fallback: 'pixel' });
      results.push(result);
    }
    
    const handledGracefully = results.every(r => r.status === 400 || r.success);
    
    return {
      name: 'Malformed URL handling',
      success: handledGracefully,
      duration: results.reduce((sum, r) => sum + r.duration, 0),
      details: { results },
    };
  }

  // Test timeout behavior
  async testTimeoutBehavior() {
    const result = await this.makeProxyRequest('https://httpstat.us/200?sleep=15000', { 
      fallback: 'pixel',
      timeout: 2000 
    });
    
    const timedOut = result.error && result.error.includes('timeout');
    const fastResponse = result.duration < 3000; // Should timeout within 3 seconds
    
    return {
      name: 'Timeout behavior',
      success: timedOut && fastResponse,
      duration: result.duration,
      details: { 
        timedOut,
        fastResponse,
        error: result.error,
        duration: result.duration,
      },
    };
  }

  // Test header consistency
  async testHeaderConsistency() {
    const result = await this.makeProxyRequest(INSTAGRAM_TEST_URLS[0], { fallback: 'pixel' });
    
    const hasRequiredHeaders = !!(
      result.headers['content-type'] &&
      result.headers['cache-control'] &&
      result.headers['x-proxy-fallback']
    );
    
    const correctCORS = result.headers['access-control-allow-origin'] === '*';
    
    return {
      name: 'Header consistency',
      success: hasRequiredHeaders && correctCORS,
      duration: result.duration,
      details: { 
        hasRequiredHeaders,
        correctCORS,
        headers: result.headers,
      },
    };
  }

  async generateReport() {
    const endTime = performance.now();
    const totalDuration = endTime - this.startTime;
    
    // Calculate final metrics
    const allTests = this.results.testSuites.flatMap(suite => suite.tests);
    this.results.metrics.averageResponseTime = 
      allTests.reduce((sum, test) => sum + test.duration, 0) / allTests.length;

    this.results.metrics.cacheHitRate = 
      allTests.filter(test => 
        test.details?.secondHeaders?.['x-proxy-cache'] === 'NEG_HIT' ||
        test.details?.cacheHits > 0
      ).length / allTests.length;

    this.results.totalDuration = totalDuration;
    this.results.endTime = new Date().toISOString();

    // Write detailed results to file
    const reportPath = path.join(TEST_RESULTS_DIR, `battle-test-report-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(this.results, null, 2));

    // Generate summary report
    console.log('\n' + '='.repeat(80));
    console.log('🏁 BATTLE TEST FRAMEWORK COMPLETE - PRODUCTION VALIDATION');
    console.log('='.repeat(80));
    console.log(`📊 Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`📈 Total Requests: ${this.results.metrics.totalRequests}`);
    console.log(`✅ Successful: ${this.results.metrics.successfulRequests}`);
    console.log(`❌ Failed: ${this.results.metrics.failedRequests}`);
    console.log(`⚡ Average Response Time: ${this.results.metrics.averageResponseTime.toFixed(2)}ms`);
    console.log(`🎯 Instagram Block Rate: ${(this.results.metrics.instagramBlockRate * 100).toFixed(1)}%`);
    console.log(`🚀 Negative Cache Effectiveness: ${(this.results.metrics.negCacheEffectiveness * 100).toFixed(1)}%`);
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
const framework = new BattleTestFramework();
await framework.runAllTests();
