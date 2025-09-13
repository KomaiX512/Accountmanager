#!/usr/bin/env node

/**
 * BRUTAL OPTIMIZATION STRESS TESTING SUITE
 * Tests every vulnerability and edge case in our Netflix-scale optimizations
 */

import axios from 'axios';
import cluster from 'cluster';
import os from 'os';
import fs from 'fs';

class OptimizationStressTester {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.results = {
      cacheExhaustion: [],
      s3Failures: [],
      concurrencyIssues: [],
      imageProcessingErrors: [],
      memoryLeaks: [],
      performanceBottlenecks: []
    };
    this.testStartTime = Date.now();
  }

  // CACHE MEMORY EXHAUSTION TESTS
  async testCacheMemoryExhaustion() {
    console.log('🔥 TESTING CACHE MEMORY EXHAUSTION...');
    
    try {
      await this.testImageCacheOverflow();
      await this.testProcessedImageCacheOverflow();
      await this.testS3OperationCacheOverflow();
      await this.testCacheEvictionUnderPressure();
      await this.testCacheTTLExpiration();
      await this.testCacheCleanupFailure();
    } catch (error) {
      this.results.cacheExhaustion.push({
        test: 'cacheMemoryExhaustion',
        error: error.message,
        stack: error.stack
      });
    }
  }

  async testProcessedImageCacheOverflow() {
    console.log('  → Testing processed image cache overflow...');
    
    const promises = [];
    for (let i = 0; i < 30; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/r2-images/webp-test-${i}/processed-image-${i}.webp`, {
          timeout: 8000
        }).catch(err => ({ error: err.message, iteration: i }))
      );
    }

    const responses = await Promise.all(promises);
    const errors = responses.filter(r => r.error);
    
    console.log(`    Processed image cache test: ${errors.length}/${promises.length} errors`);
    
    if (errors.length > 15) {
      throw new Error(`Processed image cache overflow: ${errors.length}/30 conversions failed`);
    }
  }

  async testS3OperationCacheOverflow() {
    console.log('  → Testing S3 operation cache overflow...');
    
    const promises = [];
    for (let i = 0; i < 25; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/api/posts/cache-overflow-test-${i}`, {
          timeout: 5000
        }).catch(err => ({ error: err.message, iteration: i }))
      );
    }

    const responses = await Promise.all(promises);
    const errors = responses.filter(r => r.error);
    
    console.log(`    S3 operation cache test: ${errors.length}/${promises.length} errors`);
    
    if (errors.length > 12) {
      throw new Error(`S3 operation cache overflow: ${errors.length}/25 operations failed`);
    }
  }

  async testCacheEvictionUnderPressure() {
    console.log('  → Testing cache eviction under memory pressure...');
    
    // Generate memory pressure
    const largeArrays = [];
    for (let i = 0; i < 100; i++) {
      largeArrays.push(new Array(100000).fill(`memory-pressure-${i}`));
    }

    // Test cache operations under pressure
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/api/health`).catch(err => ({ error: err.message }))
      );
    }

    const responses = await Promise.all(promises);
    const errors = responses.filter(r => r.error);
    
    // Cleanup
    largeArrays.length = 0;
    
    if (errors.length > 5) {
      throw new Error(`Cache eviction failed under pressure: ${errors.length}/20 requests failed`);
    }
  }

  async testCacheTTLExpiration() {
    console.log('  → Testing cache TTL expiration behavior...');
    
    // First request to populate cache
    await axios.get(`${this.baseUrl}/api/proxy-image`, {
      params: {
        imageUrl: 'https://picsum.photos/400/300?random=ttl-test',
        username: 'ttl-test-user',
        platform: 'instagram'
      }
    });

    // Wait a bit, then make another request
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const response = await axios.get(`${this.baseUrl}/api/health`);
    if (!response.data.cache || !response.data.cache.imageCache) {
      throw new Error('Cache health metrics not available for TTL testing');
    }
  }

  async testCacheCleanupFailure() {
    console.log('  → Testing cache cleanup failure scenarios...');
    
    // Fill cache with many items
    const promises = [];
    for (let i = 0; i < 25; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/api/proxy-image`, {
          params: {
            url: `https://picsum.photos/200/150?random=cleanup-${i}`,
            username: `cleanup-test-${i}`,
            platform: 'instagram'
          },
          timeout: 5000
        }).catch(err => ({ error: err.message }))
      );
    }

    await Promise.all(promises);
    
    // Check if cleanup is working
    const healthCheck = await axios.get(`${this.baseUrl}/api/health`);
    if (healthCheck.data.cache && healthCheck.data.cache.imageCache) {
      const cacheSize = healthCheck.data.cache.imageCache.size;
      if (cacheSize > 1000) {
        throw new Error(`Cache cleanup may be failing: cache size ${cacheSize} seems excessive`);
      }
    }
  }

  async testImageCacheOverflow() {
    console.log('  → Testing image cache overflow with massive images...');
    
    // Use actual optimized endpoints with real image processing
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/fix-image/stress-test-${i}/large-image-${i}.jpg`, {
          timeout: 10000
        }).catch(err => ({ error: err.message, iteration: i }))
      );
    }

    const responses = await Promise.all(promises);
    const errors = responses.filter(r => r.error);
    
    console.log(`    Image cache overflow test: ${errors.length}/${promises.length} errors`);
    
    if (errors.length > 25) {
      throw new Error(`Image cache overflow: ${errors.length}/50 requests failed`);
    }

    // Test memory usage after cache overflow
    const healthCheck = await axios.get(`${this.baseUrl}/health`);
    if (healthCheck.data.status !== 'healthy') {
      throw new Error(`Server unhealthy after image cache overflow: ${healthCheck.data.status}`);
    }
  }

  // S3 OPERATION FAILURE TESTS
  async testS3OperationFailures() {
    console.log('🔥 TESTING S3 OPERATION FAILURES...');
    
    try {
      await this.testS3ConnectionTimeout();
      await this.testS3AuthenticationFailure();
      await this.testS3BucketNotFound();
      await this.testS3RateLimiting();
      await this.testS3NetworkInterruption();
      await this.testS3FallbackMechanisms();
    } catch (error) {
      this.results.s3Failures.push({
        test: 's3OperationFailures',
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async testS3AuthenticationFailure() {
    console.log('  → Testing S3 authentication failure scenarios...');
    
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/api/posts/invalid-auth-test-${i}`, {
          timeout: 3000
        }).catch(err => ({ error: err.message, iteration: i }))
      );
    }

    const responses = await Promise.all(promises);
    const authErrors = responses.filter(r => 
      r.error && (r.error.includes('403') || r.error.includes('Forbidden'))
    );
    
    console.log(`    Auth errors detected: ${authErrors.length}/10`);
  }

  async testS3BucketNotFound() {
    console.log('  → Testing S3 bucket not found scenarios...');
    
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/api/instagram/get-user-posts`, {
          params: { 
            username: `nonexistent-bucket-${i}`,
            limit: 5 
          },
          timeout: 4000
        }).catch(err => ({ error: err.message, iteration: i }))
      );
    }

    const responses = await Promise.all(promises);
    const bucketErrors = responses.filter(r => 
      r.error && (r.error.includes('404') || r.error.includes('NoSuchBucket'))
    );
    
    console.log(`    Bucket errors detected: ${bucketErrors.length}/5`);
  }

  async testS3RateLimiting() {
    console.log('  → Testing S3 rate limiting scenarios...');
    
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/api/proxy-image`, {
          params: {
            url: `https://picsum.photos/100/100?random=rate-${i}`,
            username: 'rate-limit-test',
            platform: 'instagram'
          },
          timeout: 2000
        }).catch(err => ({ error: err.message, iteration: i }))
      );
    }

    const responses = await Promise.all(promises);
    const rateLimitErrors = responses.filter(r => 
      r.error && (r.error.includes('429') || r.error.includes('TooManyRequests'))
    );
    
    console.log(`    Rate limit errors: ${rateLimitErrors.length}/50`);
  }

  async testS3NetworkInterruption() {
    console.log('  → Testing S3 network interruption scenarios...');
    
    const promises = [];
    for (let i = 0; i < 15; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/api/instagram/get-user-posts`, {
          params: { 
            username: `network-interruption-${i}`,
            limit: 3 
          },
          timeout: 1000 // Very short timeout to simulate interruption
        }).catch(err => ({ error: err.message, iteration: i }))
      );
    }

    const responses = await Promise.all(promises);
    const networkErrors = responses.filter(r => 
      r.error && (r.error.includes('timeout') || r.error.includes('ECONNRESET'))
    );
    
    console.log(`    Network interruption errors: ${networkErrors.length}/15`);
  }

  async testS3FallbackMechanisms() {
    console.log('  → Testing S3 fallback mechanisms...');
    
    // Test image proxy fallback
    const fallbackTests = [];
    for (let i = 0; i < 10; i++) {
      fallbackTests.push(
        axios.get(`${this.baseUrl}/api/proxy-image`, {
          params: {
            url: `https://invalid-domain-${i}.example.com/image.jpg`,
            username: `fallback-test-${i}`,
            platform: 'instagram'
          },
          timeout: 3000
        }).catch(err => ({ error: err.message, iteration: i }))
      );
    }

    const responses = await Promise.all(fallbackTests);
    const fallbackSuccesses = responses.filter(r => !r.error && r.status === 200);
    
    console.log(`    Fallback successes: ${fallbackSuccesses.length}/10`);
  }

  async testS3ConnectionTimeout() {
    console.log('  → Testing S3 connection timeout scenarios...');
    
    // Test with invalid endpoint that will timeout
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/api/instagram/get-user-posts`, {
          params: { 
            username: 'nonexistent-user-timeout-test',
            limit: 50 
          },
          timeout: 2000
        }).catch(err => ({ error: err.message, code: err.code }))
      );
    }

    const responses = await Promise.all(promises);
    const timeouts = responses.filter(r => r.error && r.error.includes('timeout'));
    
    if (timeouts.length < 15) {
      throw new Error(`S3 timeout handling failed: only ${timeouts.length}/20 properly handled timeouts`);
    }
  }

  // CONCURRENCY AND RACE CONDITION TESTS
  async testConcurrencyIssues() {
    console.log('🔥 TESTING CONCURRENCY AND RACE CONDITIONS...');
    
    try {
      await this.testConcurrentCacheAccess();
      await this.testRaceConditionInImageProcessing();
      await this.testConcurrentS3Operations();
      await this.testCacheKeyCollisions();
      await this.testMemoryRaceConditions();
    } catch (error) {
      this.results.concurrencyIssues.push({
        test: 'concurrencyIssues',
        error: error.message,
        severity: 'HIGH'
      });
    }
  }

  async testRaceConditionInImageProcessing() {
    console.log('  → Testing race conditions in image processing...');
    
    const promises = [];
    const testImageUrl = 'https://picsum.photos/500/400?random=race-processing';
    
    for (let i = 0; i < 30; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/api/proxy-image`, {
          params: {
            url: testImageUrl,
            username: 'race-processing-test',
            platform: 'instagram',
            format: 'jpeg'
          },
          timeout: 8000
        }).catch(err => ({ error: err.message, worker: i }))
      );
    }

    const responses = await Promise.all(promises);
    const errors = responses.filter(r => r.error);
    const successful = responses.filter(r => !r.error);
    
    if (errors.length > 10) {
      throw new Error(`Image processing race condition: ${errors.length}/30 requests failed`);
    }
    
    // Check for processing inconsistencies
    if (successful.length > 1) {
      const firstSize = successful[0].headers['content-length'];
      const inconsistent = successful.filter(r => r.headers['content-length'] !== firstSize);
      
      if (inconsistent.length > 0) {
        throw new Error(`Processing race condition detected: ${inconsistent.length} inconsistent results`);
      }
    }
  }

  async testConcurrentS3Operations() {
    console.log('  → Testing concurrent S3 operations...');
    
    const promises = [];
    
    for (let i = 0; i < 25; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/api/instagram/get-user-posts`, {
          params: { 
            username: `concurrent-s3-${i % 5}`, // Use 5 different usernames
            limit: 10 
          },
          timeout: 6000
        }).catch(err => ({ error: err.message, iteration: i }))
      );
    }

    const responses = await Promise.all(promises);
    const errors = responses.filter(r => r.error);
    
    if (errors.length > 12) {
      throw new Error(`Concurrent S3 operations failed: ${errors.length}/25 requests failed`);
    }
  }

  async testCacheKeyCollisions() {
    console.log('  → Testing cache key collisions...');
    
    const promises = [];
    
    // Test with similar but different cache keys
    for (let i = 0; i < 20; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/api/proxy-image`, {
          params: {
            url: `https://picsum.photos/300/200?random=collision${i}`,
            username: `collision-test-${i}`,
            platform: 'instagram'
          },
          timeout: 5000
        }).catch(err => ({ error: err.message, iteration: i }))
      );
    }

    const responses = await Promise.all(promises);
    const errors = responses.filter(r => r.error);
    
    if (errors.length > 8) {
      throw new Error(`Cache key collision issues: ${errors.length}/20 requests failed`);
    }
  }

  async testMemoryRaceConditions() {
    console.log('  → Testing memory race conditions...');
    
    const promises = [];
    
    for (let i = 0; i < 15; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/api/health`).catch(err => ({ error: err.message }))
      );
    }

    const responses = await Promise.all(promises);
    const errors = responses.filter(r => r.error);
    
    if (errors.length > 5) {
      throw new Error(`Memory race conditions detected: ${errors.length}/15 health checks failed`);
    }
  }

  async testConcurrentCacheAccess() {
    console.log('  → Testing concurrent cache access with same keys...');
    
    // 40 concurrent requests for the same image endpoint
    const promises = [];
    
    for (let i = 0; i < 40; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/fix-image/concurrency-test/same-image.jpg`, {
          timeout: 10000
        }).catch(err => ({ error: err.message, worker: i }))
      );
    }

    const startTime = Date.now();
    const responses = await Promise.all(promises);
    const endTime = Date.now();
    
    const errors = responses.filter(r => r.error);
    const successful = responses.filter(r => !r.error);
    
    console.log(`    Concurrency test: ${errors.length}/${promises.length} errors, ${endTime - startTime}ms total`);
    
    // Check for race condition indicators
    if (errors.length > 10) {
      throw new Error(`Concurrency failure: ${errors.length}/40 requests failed`);
    }
    
    // All successful responses should be identical (cached)
    if (successful.length > 1) {
      const firstResponse = successful[0];
      const inconsistent = successful.filter(r => 
        r.headers['content-length'] !== firstResponse.headers['content-length']
      );
      
      if (inconsistent.length > 0) {
        throw new Error(`Cache inconsistency detected: ${inconsistent.length} responses differ`);
      }
    }
  }

  // IMAGE PROCESSING ERROR TESTS
  async testImageProcessingErrors() {
    console.log('🔥 TESTING IMAGE PROCESSING ERRORS AND MEMORY LEAKS...');
    
    try {
      await this.testCorruptedImageHandling();
      await this.testUnsupportedImageFormats();
      await this.testMassiveImageProcessing();
      await this.testImageProcessingMemoryLeaks();
      await this.testWebPConversionFailures();
    } catch (error) {
      this.results.imageProcessingErrors.push({
        test: 'imageProcessingErrors',
        error: error.message,
        memoryBefore: process.memoryUsage(),
        memoryAfter: process.memoryUsage()
      });
    }
  }

  async testUnsupportedImageFormats() {
    console.log('  → Testing unsupported image formats...');
    
    const unsupportedFormats = [
      'https://httpbin.org/base64/aGVsbG8=', // Base64 text
      'https://httpbin.org/json',           // JSON response
      'https://httpbin.org/xml',            // XML response
      'data:text/plain,plaintext',          // Plain text
      'https://httpbin.org/bytes/1000'      // Random bytes
    ];

    const promises = unsupportedFormats.map((url, i) =>
      axios.get(`${this.baseUrl}/api/proxy-image`, {
        params: {
          imageUrl: url,
          username: `unsupported-${i}`,
          platform: 'instagram'
        },
        timeout: 4000
      }).catch(err => ({ error: err.message, url }))
    );

    const responses = await Promise.all(promises);
    const serverErrors = responses.filter(r => 
      r.error && r.error.includes('500')
    );

    if (serverErrors.length > 2) {
      throw new Error(`Server crashes with unsupported formats: ${serverErrors.length} crashes`);
    }
  }

  async testMassiveImageProcessing() {
    console.log('  → Testing massive image processing...');
    
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/api/proxy-image`, {
          params: {
            url: `https://picsum.photos/2000/1500?random=massive${i}`,
            username: `massive-test-${i}`,
            platform: 'instagram',
            format: 'jpeg'
          },
          timeout: 15000
        }).catch(err => ({ error: err.message, iteration: i }))
      );
    }

    const memoryBefore = process.memoryUsage();
    const responses = await Promise.all(promises);
    const memoryAfter = process.memoryUsage();
    
    const errors = responses.filter(r => r.error);
    const memoryGrowth = memoryAfter.heapUsed - memoryBefore.heapUsed;
    
    if (errors.length > 10) {
      throw new Error(`Massive image processing failed: ${errors.length}/20 requests failed`);
    }
    
    if (memoryGrowth > 50 * 1024 * 1024) { // 50MB threshold
      throw new Error(`Excessive memory usage in massive processing: ${(memoryGrowth / 1024 / 1024).toFixed(2)} MB`);
    }
  }

  async testImageProcessingMemoryLeaks() {
    console.log('  → Testing image processing memory leaks...');
    
    const initialMemory = process.memoryUsage();
    
    for (let cycle = 0; cycle < 3; cycle++) {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          axios.get(`${this.baseUrl}/api/proxy-image`, {
            params: {
              url: `https://picsum.photos/600/400?random=leak${cycle}${i}`,
              username: `leak-test-${cycle}-${i}`,
              platform: 'instagram'
            },
            timeout: 6000
          }).catch(err => ({ error: err.message }))
        );
      }
      
      await Promise.all(promises);
      
      if (global.gc) {
        global.gc();
      }
    }
    
    const finalMemory = process.memoryUsage();
    const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
    
    if (memoryGrowth > 30 * 1024 * 1024) { // 30MB threshold
      throw new Error(`Memory leak in image processing: ${(memoryGrowth / 1024 / 1024).toFixed(2)} MB growth`);
    }
  }

  async testWebPConversionFailures() {
    console.log('  → Testing WebP conversion failures...');
    
    const promises = [];
    for (let i = 0; i < 15; i++) {
      promises.push(
        axios.get(`${this.baseUrl}/api/proxy-image`, {
          params: {
            url: `https://picsum.photos/400/300?random=webp${i}`,
            username: `webp-test-${i}`,
            platform: 'instagram',
            format: 'webp'
          },
          timeout: 8000
        }).catch(err => ({ error: err.message, iteration: i }))
      );
    }

    const responses = await Promise.all(promises);
    const errors = responses.filter(r => r.error);
    
    if (errors.length > 8) {
      throw new Error(`WebP conversion failures: ${errors.length}/15 conversions failed`);
    }
  }

    );

    const responses = await Promise.all(promises);
    const crashes = responses.filter(r => 
      r.error && (r.error.includes('ECONNRESET') || r.error.includes('socket hang up'))
    );

    if (crashes.length > 0) {
      throw new Error(`Server crashes detected with corrupted images: ${crashes.length} crashes`);
    }
  }

  // EXTREME LOAD TESTING
  async testExtremeLoad() {
    console.log('🔥 TESTING EXTREME LOAD SCENARIOS...');
    
    if (cluster.isMaster) {
      const numCPUs = os.cpus().length;
      console.log(`  → Spawning ${numCPUs} worker processes for load testing...`);
      
      for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
      }

      cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
      });
      
      // Wait for all workers to complete
      await new Promise(resolve => {
        let completedWorkers = 0;
        cluster.on('message', (worker, message) => {
          if (message.type === 'load-test-complete') {
            completedWorkers++;
            if (completedWorkers === numCPUs) {
              resolve();
            }
          }
        });
      });
    } else {
      // Worker process - run load tests
      await this.runWorkerLoadTests();
      process.send({ type: 'load-test-complete', pid: process.pid });
      process.exit(0);
    }
  }

  async runWorkerLoadTests() {
    const workerId = process.pid;
    const requests = [];
    
    // Each worker makes 100 concurrent requests
    for (let i = 0; i < 100; i++) {
      requests.push(
        axios.get(`${this.baseUrl}/api/health`, { timeout: 5000 })
          .catch(err => ({ error: err.message, worker: workerId, iteration: i }))
      );
    }

    const results = await Promise.all(requests);
    const errors = results.filter(r => r.error);
    
    if (errors.length > 20) {
      throw new Error(`Worker ${workerId}: High error rate ${errors.length}/100`);
    }
  }

  // MEMORY LEAK DETECTION
  async detectMemoryLeaks() {
    console.log('🔥 DETECTING MEMORY LEAKS...');
    
    const initialMemory = process.memoryUsage();
    console.log('Initial memory:', initialMemory);

    // Run intensive operations
    for (let cycle = 0; cycle < 5; cycle++) {
      console.log(`  → Memory leak test cycle ${cycle + 1}/5`);
      
      await this.testImageCacheOverflow();
      await this.testConcurrentCacheAccess();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const currentMemory = process.memoryUsage();
      const memoryGrowth = currentMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`    Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)} MB`);
      
      if (memoryGrowth > 100 * 1024 * 1024) { // 100MB growth threshold
        throw new Error(`Memory leak detected: ${(memoryGrowth / 1024 / 1024).toFixed(2)} MB growth`);
      }
    }
  }

  // COMPREHENSIVE TEST RUNNER
  async runAllTests() {
    console.log('🚀 STARTING COMPREHENSIVE OPTIMIZATION STRESS TESTS...');
    console.log('='.repeat(60));

    try {
      await this.testCacheMemoryExhaustion();
      await this.testS3OperationFailures();
      await this.testConcurrencyIssues();
      await this.testImageProcessingErrors();
      await this.detectMemoryLeaks();
      await this.testExtremeLoad();

      // Generate comprehensive report
      this.generateTestReport();
      
    } catch (error) {
      console.error('❌ CRITICAL TEST FAILURE:', error);
      process.exit(1);
    }
  }

  generateTestReport() {
    const totalTests = Object.values(this.results).reduce((acc, arr) => acc + arr.length, 0);
    const testDuration = Date.now() - this.testStartTime;

    const report = {
      summary: {
        totalTests,
        duration: `${(testDuration / 1000).toFixed(2)}s`,
        timestamp: new Date().toISOString(),
        status: totalTests === 0 ? 'PASSED' : 'FAILED'
      },
      vulnerabilities: this.results,
      recommendations: this.generateRecommendations()
    };

    fs.writeFileSync('optimization-stress-test-report.json', JSON.stringify(report, null, 2));
    
    console.log('\n📊 STRESS TEST RESULTS:');
    console.log('='.repeat(40));
    console.log(`Status: ${report.summary.status}`);
    console.log(`Total Issues Found: ${totalTests}`);
    console.log(`Test Duration: ${report.summary.duration}`);
    console.log(`Report saved to: optimization-stress-test-report.json`);
    
    if (totalTests > 0) {
      console.log('\n❌ VULNERABILITIES DETECTED:');
      Object.entries(this.results).forEach(([category, issues]) => {
        if (issues.length > 0) {
          console.log(`  ${category}: ${issues.length} issues`);
        }
      });
    } else {
      console.log('\n✅ ALL TESTS PASSED - SYSTEM HARDENED AGAINST VULNERABILITIES');
    }
  }

  generateRecommendations() {
    const recommendations = [];
    
    if (this.results.cacheExhaustion.length > 0) {
      recommendations.push('Implement more aggressive cache size limits and LRU eviction');
    }
    
    if (this.results.s3Failures.length > 0) {
      recommendations.push('Add circuit breaker pattern for S3 operations');
    }
    
    if (this.results.concurrencyIssues.length > 0) {
      recommendations.push('Implement proper mutex/semaphore for cache operations');
    }
    
    if (this.results.imageProcessingErrors.length > 0) {
      recommendations.push('Add timeout and memory limits for image processing');
    }
    
    return recommendations;
  }
}

// RUN TESTS
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new OptimizationStressTester();
  tester.runAllTests().catch(console.error);
}

export default OptimizationStressTester;
