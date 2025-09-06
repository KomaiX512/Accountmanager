#!/usr/bin/env node

/**
 * Load Testing Suite - 1000+ Users Simulation
 * Tests platform stability and performance under extreme load
 */

import http from 'http';
import https from 'https';
import { performance } from 'perf_hooks';

const API_BASE = 'http://127.0.0.1:3000';
const PROXY_BASE = 'http://127.0.0.1:3002';

// Test configuration
const CONFIG = {
  concurrentUsers: 1000,
  rampUpTime: 10000, // 10 seconds to ramp up to full load
  testDuration: 30000, // 30 seconds of sustained load
  endpoints: [
    { path: '/api/processing-status/KUvVFxnLanYTWPuSIfphby5hxJQ2', method: 'GET', weight: 30 },
    { path: '/api/events-list/KUvVFxnLanYTWPuSIfphby5hxJQ2?platform=instagram&limit=20', method: 'GET', weight: 25 },
    { path: '/api/profile-info/instagram/maccosmetics', method: 'GET', weight: 20 },
    { path: '/api/recommendations/KUvVFxnLanYTWPuSIfphby5hxJQ2', method: 'GET', weight: 15 },
    { path: '/api/usage/KUvVFxnLanYTWPuSIfphby5hxJQ2', method: 'GET', weight: 10 }
  ]
};

// Metrics collector
class MetricsCollector {
  constructor() {
    this.metrics = {
      requests: 0,
      successful: 0,
      failed: 0,
      responseTimes: [],
      errors: [],
      cacheHits: 0,
      cacheMisses: 0,
      statusCodes: {}
    };
    this.startTime = Date.now();
  }

  recordRequest(duration, status, cacheStatus = null) {
    this.metrics.requests++;
    this.metrics.responseTimes.push(duration);
    
    if (status >= 200 && status < 300) {
      this.metrics.successful++;
    } else {
      this.metrics.failed++;
    }
    
    this.metrics.statusCodes[status] = (this.metrics.statusCodes[status] || 0) + 1;
    
    if (cacheStatus === 'hit') {
      this.metrics.cacheHits++;
    } else if (cacheStatus === 'miss') {
      this.metrics.cacheMisses++;
    }
  }

  recordError(error) {
    this.metrics.failed++;
    this.metrics.errors.push(error.message);
  }

  getStats() {
    const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const avg = sorted.length > 0 
      ? sorted.reduce((a, b) => a + b, 0) / sorted.length 
      : 0;
    
    const duration = (Date.now() - this.startTime) / 1000;
    const rps = this.metrics.requests / duration;
    const cacheHitRate = this.metrics.requests > 0 
      ? (this.metrics.cacheHits / this.metrics.requests * 100).toFixed(1)
      : 0;

    return {
      totalRequests: this.metrics.requests,
      successful: this.metrics.successful,
      failed: this.metrics.failed,
      successRate: ((this.metrics.successful / this.metrics.requests) * 100).toFixed(2) + '%',
      requestsPerSecond: rps.toFixed(2),
      cacheHitRate: cacheHitRate + '%',
      responseTimes: {
        min: Math.min(...sorted) || 0,
        avg: avg.toFixed(2),
        p50: p50.toFixed(2),
        p95: p95.toFixed(2),
        p99: p99.toFixed(2),
        max: Math.max(...sorted) || 0
      },
      statusCodes: this.metrics.statusCodes,
      errors: [...new Set(this.metrics.errors)].slice(0, 5)
    };
  }
}

// Virtual user simulator
class VirtualUser {
  constructor(id, endpoints, metrics) {
    this.id = id;
    this.endpoints = endpoints;
    this.metrics = metrics;
    this.active = true;
  }

  async makeRequest(endpoint) {
    const start = performance.now();
    
    return new Promise((resolve) => {
      const url = new URL(API_BASE + endpoint.path);
      const options = {
        method: endpoint.method,
        headers: {
          'User-Agent': `LoadTest-User-${this.id}`,
          'Accept': 'application/json'
        },
        timeout: 5000
      };

      const req = http.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const duration = performance.now() - start;
          const cacheStatus = res.headers['x-cache'];
          this.metrics.recordRequest(duration, res.statusCode, cacheStatus);
          resolve();
        });
      });

      req.on('error', (error) => {
        this.metrics.recordError(error);
        resolve();
      });

      req.on('timeout', () => {
        req.destroy();
        this.metrics.recordError(new Error('Request timeout'));
        resolve();
      });

      req.end();
    });
  }

  selectEndpoint() {
    const random = Math.random() * 100;
    let cumulative = 0;
    
    for (const endpoint of this.endpoints) {
      cumulative += endpoint.weight;
      if (random < cumulative) {
        return endpoint;
      }
    }
    
    return this.endpoints[0];
  }

  async run() {
    while (this.active) {
      const endpoint = this.selectEndpoint();
      await this.makeRequest(endpoint);
      
      // Random think time between requests (100-500ms)
      await new Promise(resolve => 
        setTimeout(resolve, 100 + Math.random() * 400)
      );
    }
  }

  stop() {
    this.active = false;
  }
}

// Load test orchestrator
async function runLoadTest() {
  console.log('🚀 Starting Load Test Simulation');
  console.log(`- Target: ${CONFIG.concurrentUsers} concurrent users`);
  console.log(`- Ramp up: ${CONFIG.rampUpTime / 1000}s`);
  console.log(`- Duration: ${CONFIG.testDuration / 1000}s`);
  console.log('');

  const metrics = new MetricsCollector();
  const users = [];
  
  // Gradual ramp-up
  console.log('📈 Ramping up users...');
  const usersPerInterval = 50;
  const intervalTime = CONFIG.rampUpTime / (CONFIG.concurrentUsers / usersPerInterval);
  
  const rampUpInterval = setInterval(() => {
    for (let i = 0; i < usersPerInterval && users.length < CONFIG.concurrentUsers; i++) {
      const user = new VirtualUser(users.length, CONFIG.endpoints, metrics);
      users.push(user);
      user.run();
    }
    
    process.stdout.write(`\rActive users: ${users.length}/${CONFIG.concurrentUsers}`);
    
    if (users.length >= CONFIG.concurrentUsers) {
      clearInterval(rampUpInterval);
      console.log('\n✅ All users active\n');
    }
  }, intervalTime);

  // Run test and show live metrics
  const metricsInterval = setInterval(() => {
    const stats = metrics.getStats();
    console.clear();
    console.log('📊 Live Performance Metrics');
    console.log('═══════════════════════════════════════');
    console.log(`Active Users:    ${users.length}`);
    console.log(`Requests/sec:    ${stats.requestsPerSecond}`);
    console.log(`Success Rate:    ${stats.successRate}`);
    console.log(`Cache Hit Rate:  ${stats.cacheHitRate}`);
    console.log('');
    console.log('Response Times (ms):');
    console.log(`  Min:     ${stats.responseTimes.min}ms`);
    console.log(`  Avg:     ${stats.responseTimes.avg}ms`);
    console.log(`  P50:     ${stats.responseTimes.p50}ms`);
    console.log(`  P95:     ${stats.responseTimes.p95}ms`);
    console.log(`  P99:     ${stats.responseTimes.p99}ms`);
    console.log(`  Max:     ${stats.responseTimes.max}ms`);
    console.log('');
    console.log('Status Codes:', stats.statusCodes);
    
    if (stats.errors.length > 0) {
      console.log('\n⚠️ Errors:', stats.errors);
    }
  }, 2000);

  // Wait for test duration
  await new Promise(resolve => setTimeout(resolve, CONFIG.rampUpTime + CONFIG.testDuration));

  // Stop all users
  console.log('\n\n🛑 Stopping test...');
  users.forEach(user => user.stop());
  clearInterval(metricsInterval);

  // Wait for pending requests
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Final report
  const finalStats = metrics.getStats();
  console.log('\n\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log('                  LOAD TEST RESULTS                      ');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Total Requests:      ${finalStats.totalRequests}`);
  console.log(`Successful:          ${finalStats.successful}`);
  console.log(`Failed:              ${finalStats.failed}`);
  console.log(`Success Rate:        ${finalStats.successRate}`);
  console.log(`Requests/Second:     ${finalStats.requestsPerSecond}`);
  console.log(`Cache Hit Rate:      ${finalStats.cacheHitRate}`);
  console.log('');
  console.log('Response Time Summary:');
  console.log(`  Minimum:           ${finalStats.responseTimes.min}ms`);
  console.log(`  Average:           ${finalStats.responseTimes.avg}ms`);
  console.log(`  Median (P50):      ${finalStats.responseTimes.p50}ms`);
  console.log(`  P95:               ${finalStats.responseTimes.p95}ms`);
  console.log(`  P99:               ${finalStats.responseTimes.p99}ms`);
  console.log(`  Maximum:           ${finalStats.responseTimes.max}ms`);
  console.log('');
  console.log('Performance Analysis:');
  
  // Performance grading
  const avgTime = parseFloat(finalStats.responseTimes.avg);
  const p95Time = parseFloat(finalStats.responseTimes.p95);
  const successRate = parseFloat(finalStats.successRate);
  const cacheRate = parseFloat(finalStats.cacheHitRate);
  
  let grade = 'A+';
  if (avgTime > 100 || p95Time > 500 || successRate < 99) grade = 'A';
  if (avgTime > 200 || p95Time > 1000 || successRate < 95) grade = 'B';
  if (avgTime > 500 || p95Time > 2000 || successRate < 90) grade = 'C';
  if (avgTime > 1000 || p95Time > 5000 || successRate < 80) grade = 'D';
  if (successRate < 70) grade = 'F';
  
  console.log(`  Performance Grade: ${grade}`);
  console.log(`  ${avgTime < 100 ? '✅' : '⚠️'} Average response time: ${avgTime < 100 ? 'Excellent' : avgTime < 500 ? 'Good' : 'Needs improvement'}`);
  console.log(`  ${p95Time < 1000 ? '✅' : '⚠️'} P95 response time: ${p95Time < 1000 ? 'Excellent' : p95Time < 3000 ? 'Acceptable' : 'Too slow'}`);
  console.log(`  ${successRate > 99 ? '✅' : '⚠️'} Success rate: ${successRate > 99 ? 'Excellent' : successRate > 95 ? 'Good' : 'Poor'}`);
  console.log(`  ${cacheRate > 80 ? '✅' : '⚠️'} Cache effectiveness: ${cacheRate > 80 ? 'Excellent' : cacheRate > 50 ? 'Good' : 'Low'}`);
  console.log('═══════════════════════════════════════════════════════');

  process.exit(0);
}

// Check if servers are running
async function checkServers() {
  return new Promise((resolve) => {
    http.get(API_BASE + '/health', (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => {
      resolve(false);
    });
  });
}

// Main
async function main() {
  console.log('🔍 Checking server availability...');
  const serverRunning = await checkServers();
  
  if (!serverRunning) {
    console.error('❌ Server is not running on port 3000');
    console.log('Please start the server with: npm start');
    process.exit(1);
  }
  
  console.log('✅ Server is running\n');
  await runLoadTest();
}

main().catch(console.error);
