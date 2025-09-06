#!/usr/bin/env node

/**
 * Google-Level Dashboard Stress Testing Suite
 * Simulates 300 concurrent users accessing all dashboard modules
 * Measures compute, RAM, storage, bandwidth usage under realistic load
 */

import http from 'http';
import https from 'https';
import { performance } from 'perf_hooks';
import { spawn } from 'child_process';
import fs from 'fs/promises';

const BASE_URL = 'https://sentientm.com';
// Use a shared HTTPS Agent with keep-alive to avoid paying TLS handshake for every request
// This better reflects real browser behavior (persistent connections, HTTP/2 multiplexing at the edge)
const KEEP_ALIVE_AGENT = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 1000,
  maxFreeSockets: 256
});
const TEST_CONFIG = {
  concurrentUsers: 300,
  testDuration: 120000, // 2 minutes of sustained load
  rampUpTime: 30000,    // 30 seconds to reach full load
  userSessionDuration: 60000, // Each user session lasts 1 minute
  metricsInterval: 2000 // Collect metrics every 2 seconds
};

// Complete dashboard endpoint mapping (realistic user journey)
const DASHBOARD_ENDPOINTS = {
  // Core Dashboard Loading (always called first)
  accountLoading: [
    { path: '/api/processing-status/KUvVFxnLanYTWPuSIfphby5hxJQ2', weight: 100, critical: true },
    { path: '/api/profile-info/instagram/maccosmetics', weight: 100, critical: true },
    { path: '/api/usage/KUvVFxnLanYTWPuSIfphby5hxJQ2', weight: 100, critical: true }
  ],
  
  // News4U Module (high frequency)
  news4u: [
    { path: '/api/recommendations/KUvVFxnLanYTWPuSIfphby5hxJQ2?platform=instagram', weight: 80 },
    { path: '/api/news/instagram/maccosmetics', weight: 70 },
    { path: '/api/trending-topics/instagram', weight: 60 }
  ],
  
  // Notifications Module (very high frequency)
  notifications: [
    { path: '/api/events-list/KUvVFxnLanYTWPuSIfphby5hxJQ2?platform=instagram&limit=20', weight: 90 },
    { path: '/api/events-list/KUvVFxnLanYTWPuSIfphby5hxJQ2?platform=twitter&limit=20', weight: 70 },
    { path: '/api/events-list/KUvVFxnLanYTWPuSIfphby5hxJQ2?platform=facebook&limit=20', weight: 50 }
  ],
  
  // CookPost Module (medium frequency)
  cookPost: [
    { path: '/api/ready-posts/instagram/maccosmetics', weight: 60 },
    { path: '/api/ready-posts/twitter/gdb', weight: 40 },
    { path: '/api/ready-posts/facebook/AutoPulseGlobalTrading', weight: 30 }
  ],
  
  // Analytics Module (medium frequency)
  analytics: [
    { path: '/api/analytics/KUvVFxnLanYTWPuSIfphby5hxJQ2', weight: 50 },
    { path: '/api/performance-metrics/KUvVFxnLanYTWPuSIfphby5hxJQ2', weight: 40 },
    { path: '/api/engagement-stats/instagram/maccosmetics', weight: 35 }
  ],
  
  // Scheduled Posts (low frequency)
  scheduling: [
    { path: '/api/scheduled-posts/KUvVFxnLanYTWPuSIfphby5hxJQ2?platform=instagram', weight: 30 },
    { path: '/api/scheduled-posts/KUvVFxnLanYTWPuSIfphby5hxJQ2?platform=twitter', weight: 20 }
  ],
  
  // Settings & Profile (very low frequency)
  settings: [
    { path: '/api/user-settings/KUvVFxnLanYTWPuSIfphby5hxJQ2', weight: 10 },
    { path: '/api/connected-accounts/KUvVFxnLanYTWPuSIfphby5hxJQ2', weight: 15 }
  ]
};

// System metrics collector
class SystemMetricsCollector {
  constructor() {
    this.metrics = [];
    this.isCollecting = false;
  }

  async startCollection() {
    this.isCollecting = true;
    this.collectLoop();
  }

  stopCollection() {
    this.isCollecting = false;
  }

  async collectLoop() {
    while (this.isCollecting) {
      try {
        const metrics = await this.collectMetrics();
        this.metrics.push({
          timestamp: Date.now(),
          ...metrics
        });
        await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.metricsInterval));
      } catch (error) {
        console.error('Metrics collection error:', error.message);
      }
    }
  }

  async collectMetrics() {
    const [cpuUsage, memoryUsage, diskUsage, networkStats] = await Promise.all([
      this.getCPUUsage(),
      this.getMemoryUsage(),
      this.getDiskUsage(),
      this.getNetworkStats()
    ]);

    return {
      cpu: cpuUsage,
      memory: memoryUsage,
      disk: diskUsage,
      network: networkStats
    };
  }

  async getCPUUsage() {
    return new Promise((resolve) => {
      const child = spawn('top', ['-bn1']);
      let output = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.on('close', () => {
        const cpuLine = output.split('\n').find(line => line.includes('Cpu(s)'));
        if (cpuLine) {
          const match = cpuLine.match(/(\d+\.\d+)%us/);
          resolve(match ? parseFloat(match[1]) : 0);
        } else {
          resolve(0);
        }
      });
      
      child.on('error', () => resolve(0));
    });
  }

  async getMemoryUsage() {
    return new Promise((resolve) => {
      const child = spawn('free', ['-m']);
      let output = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.on('close', () => {
        const lines = output.split('\n');
        const memLine = lines.find(line => line.startsWith('Mem:'));
        if (memLine) {
          const parts = memLine.split(/\s+/);
          const total = parseInt(parts[1]);
          const used = parseInt(parts[2]);
          resolve({
            total: total,
            used: used,
            free: total - used,
            percentage: ((used / total) * 100).toFixed(2)
          });
        } else {
          resolve({ total: 0, used: 0, free: 0, percentage: 0 });
        }
      });
      
      child.on('error', () => resolve({ total: 0, used: 0, free: 0, percentage: 0 }));
    });
  }

  async getDiskUsage() {
    return new Promise((resolve) => {
      const child = spawn('df', ['-h', '/']);
      let output = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.on('close', () => {
        const lines = output.split('\n');
        const diskLine = lines[1];
        if (diskLine) {
          const parts = diskLine.split(/\s+/);
          resolve({
            total: parts[1],
            used: parts[2],
            available: parts[3],
            percentage: parts[4]
          });
        } else {
          resolve({ total: '0G', used: '0G', available: '0G', percentage: '0%' });
        }
      });
      
      child.on('error', () => resolve({ total: '0G', used: '0G', available: '0G', percentage: '0%' }));
    });
  }

  async getNetworkStats() {
    // Simplified network stats - in production would use more detailed monitoring
    return {
      connections: await this.getActiveConnections(),
      bandwidth: 'monitoring' // Placeholder for bandwidth monitoring
    };
  }

  async getActiveConnections() {
    return new Promise((resolve) => {
      const child = spawn('netstat', ['-an']);
      let output = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.on('close', () => {
        const lines = output.split('\n');
        const connections = lines.filter(line => line.includes(':3000')).length;
        resolve(connections);
      });
      
      child.on('error', () => resolve(0));
    });
  }

  getStats() {
    if (this.metrics.length === 0) return null;

    const cpuValues = this.metrics.map(m => m.cpu).filter(v => v > 0);
    const memoryValues = this.metrics.map(m => parseFloat(m.memory.percentage)).filter(v => v > 0);
    
    return {
      duration: this.metrics.length * (TEST_CONFIG.metricsInterval / 1000),
      samples: this.metrics.length,
      cpu: {
        avg: cpuValues.length > 0 ? (cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length).toFixed(2) : 0,
        max: cpuValues.length > 0 ? Math.max(...cpuValues).toFixed(2) : 0,
        min: cpuValues.length > 0 ? Math.min(...cpuValues).toFixed(2) : 0
      },
      memory: {
        avg: memoryValues.length > 0 ? (memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length).toFixed(2) : 0,
        max: memoryValues.length > 0 ? Math.max(...memoryValues).toFixed(2) : 0,
        peak: this.metrics.length > 0 ? this.metrics[this.metrics.length - 1].memory : null
      },
      network: {
        maxConnections: Math.max(...this.metrics.map(m => m.network.connections))
      }
    };
  }
}

// Request metrics collector
class RequestMetricsCollector {
  constructor() {
    this.requests = [];
    this.errors = [];
    this.startTime = Date.now();
  }

  recordRequest(endpoint, duration, status, size = 0) {
    this.requests.push({
      endpoint,
      duration,
      status,
      size,
      timestamp: Date.now()
    });
  }

  recordError(endpoint, error) {
    this.errors.push({
      endpoint,
      error: error.message,
      timestamp: Date.now()
    });
  }

  getStats() {
    const successful = this.requests.filter(r => r.status >= 200 && r.status < 300);
    const failed = this.requests.filter(r => r.status >= 400);
    const durations = this.requests.map(r => r.duration);
    const totalSize = this.requests.reduce((sum, r) => sum + r.size, 0);
    
    const sorted = [...durations].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    
    const testDuration = (Date.now() - this.startTime) / 1000;
    const rps = this.requests.length / testDuration;

    return {
      totalRequests: this.requests.length,
      successful: successful.length,
      failed: failed.length,
      errors: this.errors.length,
      successRate: ((successful.length / this.requests.length) * 100).toFixed(2) + '%',
      requestsPerSecond: rps.toFixed(2),
      responseTimes: {
        avg: durations.length > 0 ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2) : 0,
        p50: p50.toFixed(2),
        p95: p95.toFixed(2),
        p99: p99.toFixed(2),
        min: Math.min(...durations) || 0,
        max: Math.max(...durations) || 0
      },
      bandwidth: {
        totalBytes: totalSize,
        avgResponseSize: (totalSize / this.requests.length).toFixed(0),
        bytesPerSecond: (totalSize / testDuration).toFixed(0)
      },
      endpointBreakdown: this.getEndpointBreakdown()
    };
  }

  getEndpointBreakdown() {
    const breakdown = {};
    this.requests.forEach(req => {
      const endpoint = req.endpoint.split('?')[0]; // Remove query params
      if (!breakdown[endpoint]) {
        breakdown[endpoint] = { count: 0, totalDuration: 0, errors: 0 };
      }
      breakdown[endpoint].count++;
      breakdown[endpoint].totalDuration += req.duration;
      if (req.status >= 400) breakdown[endpoint].errors++;
    });

    return Object.entries(breakdown).map(([endpoint, stats]) => ({
      endpoint,
      requests: stats.count,
      avgDuration: (stats.totalDuration / stats.count).toFixed(2),
      errorRate: ((stats.errors / stats.count) * 100).toFixed(1) + '%'
    })).sort((a, b) => b.requests - a.requests);
  }
}

// Virtual user simulator
class DashboardUser {
  constructor(id, requestMetrics) {
    this.id = id;
    this.requestMetrics = requestMetrics;
    this.active = true;
    this.sessionStartTime = Date.now();
  }

  async simulateUserSession() {
    // Phase 1: Initial dashboard load (critical path)
    await this.executePhase('accountLoading', 1.0);
    await this.randomDelay(500, 1500); // User reads dashboard
    
    // Phase 2: Primary activity (notifications + news)
    for (let i = 0; i < 3; i++) {
      await this.executePhase('notifications', 0.8);
      await this.executePhase('news4u', 0.6);
      await this.randomDelay(2000, 4000); // User interaction time
    }
    
    // Phase 3: Secondary activities (cookpost, analytics)
    await this.executePhase('cookPost', 0.4);
    await this.randomDelay(1000, 3000);
    await this.executePhase('analytics', 0.3);
    
    // Phase 4: Occasional activities
    if (Math.random() < 0.3) {
      await this.executePhase('scheduling', 0.2);
    }
    if (Math.random() < 0.1) {
      await this.executePhase('settings', 0.1);
    }
  }

  async executePhase(moduleName, executionProbability) {
    const endpoints = DASHBOARD_ENDPOINTS[moduleName];
    if (!endpoints) return;

    for (const endpoint of endpoints) {
      if (Math.random() < (endpoint.weight / 100) * executionProbability) {
        await this.makeRequest(endpoint);
        await this.randomDelay(100, 500); // Small delay between requests
      }
    }
  }

  async makeRequest(endpoint) {
    const start = performance.now();
    
    return new Promise((resolve) => {
      const url = new URL(BASE_URL + endpoint.path);
      const options = {
        method: 'GET',
        headers: {
          'User-Agent': `StressTest-User-${this.id}`,
          'Accept': 'application/json'
        },
        timeout: 10000,
        agent: KEEP_ALIVE_AGENT
      };

      const req = https.request(url, options, (res) => {
        let data = '';
        let size = 0;
        
        res.on('data', chunk => {
          data += chunk;
          size += chunk.length;
        });
        
        res.on('end', () => {
          const duration = performance.now() - start;
          this.requestMetrics.recordRequest(endpoint.path, duration, res.statusCode, size);
          resolve();
        });
      });

      req.on('error', (error) => {
        this.requestMetrics.recordError(endpoint.path, error);
        resolve();
      });

      req.on('timeout', () => {
        req.destroy();
        this.requestMetrics.recordError(endpoint.path, new Error('Request timeout'));
        resolve();
      });

      req.end();
    });
  }

  async randomDelay(min, max) {
    const delay = Math.random() * (max - min) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async run() {
    while (this.active && (Date.now() - this.sessionStartTime) < TEST_CONFIG.userSessionDuration) {
      await this.simulateUserSession();
      await this.randomDelay(1000, 3000); // Break between sessions
    }
  }

  stop() {
    this.active = false;
  }
}

// Main stress test orchestrator
async function runDashboardStressTest() {
  console.log('🚀 Starting Google-Level Dashboard Stress Test');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Target: ${TEST_CONFIG.concurrentUsers} concurrent users`);
  console.log(`Duration: ${TEST_CONFIG.testDuration / 1000}s sustained load`);
  console.log(`Ramp-up: ${TEST_CONFIG.rampUpTime / 1000}s`);
  console.log('');

  const systemMetrics = new SystemMetricsCollector();
  const requestMetrics = new RequestMetricsCollector();
  const users = [];

  // Start system monitoring
  await systemMetrics.startCollection();
  console.log('📊 System monitoring started...');

  // Gradual user ramp-up
  console.log('📈 Ramping up users...');
  const usersPerBatch = 25;
  const batchInterval = TEST_CONFIG.rampUpTime / (TEST_CONFIG.concurrentUsers / usersPerBatch);

  const rampUpInterval = setInterval(() => {
    for (let i = 0; i < usersPerBatch && users.length < TEST_CONFIG.concurrentUsers; i++) {
      const user = new DashboardUser(users.length + 1, requestMetrics);
      users.push(user);
      user.run().catch(console.error);
    }

    process.stdout.write(`\rActive users: ${users.length}/${TEST_CONFIG.concurrentUsers}`);

    if (users.length >= TEST_CONFIG.concurrentUsers) {
      clearInterval(rampUpInterval);
      console.log('\n✅ All users active - sustained load phase started\n');
    }
  }, batchInterval);

  // Live metrics display
  const metricsInterval = setInterval(() => {
    const reqStats = requestMetrics.getStats();
    const sysStats = systemMetrics.getStats();
    
    console.clear();
    console.log('📊 Live Dashboard Stress Test Metrics');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Active Users: ${users.length}/${TEST_CONFIG.concurrentUsers}`);
    console.log(`Requests/sec: ${reqStats.requestsPerSecond}`);
    console.log(`Success Rate: ${reqStats.successRate}`);
    console.log(`Total Requests: ${reqStats.totalRequests}`);
    console.log('');
    console.log('Response Times (ms):');
    console.log(`  Avg: ${reqStats.responseTimes.avg}ms`);
    console.log(`  P50: ${reqStats.responseTimes.p50}ms`);
    console.log(`  P95: ${reqStats.responseTimes.p95}ms`);
    console.log(`  P99: ${reqStats.responseTimes.p99}ms`);
    
    if (sysStats) {
      console.log('');
      console.log('System Resources:');
      console.log(`  CPU Usage: ${sysStats.cpu.avg}% (max: ${sysStats.cpu.max}%)`);
      console.log(`  Memory Usage: ${sysStats.memory.avg}% (max: ${sysStats.memory.max}%)`);
      console.log(`  Active Connections: ${sysStats.network.maxConnections}`);
    }
    
    console.log('');
    console.log('Top Endpoints:');
    reqStats.endpointBreakdown.slice(0, 5).forEach(ep => {
      console.log(`  ${ep.endpoint}: ${ep.requests} req (${ep.avgDuration}ms avg)`);
    });
  }, 3000);

  // Wait for test completion
  await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.rampUpTime + TEST_CONFIG.testDuration));

  // Stop test
  console.log('\n\n🛑 Stopping stress test...');
  users.forEach(user => user.stop());
  clearInterval(metricsInterval);
  systemMetrics.stopCollection();

  // Wait for cleanup
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Generate final report
  await generateStressTestReport(requestMetrics, systemMetrics);
}

async function generateStressTestReport(requestMetrics, systemMetrics) {
  const reqStats = requestMetrics.getStats();
  const sysStats = systemMetrics.getStats();
  
  console.log('\n\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    DASHBOARD STRESS TEST REPORT                ');
  console.log('═══════════════════════════════════════════════════════════════');
  
  console.log('\n🎯 TEST CONFIGURATION:');
  console.log(`  Concurrent Users: ${TEST_CONFIG.concurrentUsers}`);
  console.log(`  Test Duration: ${TEST_CONFIG.testDuration / 1000}s`);
  console.log(`  Ramp-up Time: ${TEST_CONFIG.rampUpTime / 1000}s`);
  
  console.log('\n📊 REQUEST PERFORMANCE:');
  console.log(`  Total Requests: ${reqStats.totalRequests}`);
  console.log(`  Successful: ${reqStats.successful} (${reqStats.successRate})`);
  console.log(`  Failed: ${reqStats.failed}`);
  console.log(`  Requests/Second: ${reqStats.requestsPerSecond}`);
  
  console.log('\n⚡ RESPONSE TIMES:');
  console.log(`  Average: ${reqStats.responseTimes.avg}ms`);
  console.log(`  Median (P50): ${reqStats.responseTimes.p50}ms`);
  console.log(`  P95: ${reqStats.responseTimes.p95}ms`);
  console.log(`  P99: ${reqStats.responseTimes.p99}ms`);
  console.log(`  Min: ${reqStats.responseTimes.min}ms`);
  console.log(`  Max: ${reqStats.responseTimes.max}ms`);
  
  console.log('\n💾 BANDWIDTH USAGE:');
  console.log(`  Total Data: ${(reqStats.bandwidth.totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Avg Response Size: ${reqStats.bandwidth.avgResponseSize} bytes`);
  console.log(`  Throughput: ${(reqStats.bandwidth.bytesPerSecond / 1024).toFixed(2)} KB/s`);
  
  if (sysStats) {
    console.log('\n🖥️ SYSTEM RESOURCES:');
    console.log(`  CPU Usage: ${sysStats.cpu.avg}% avg (max: ${sysStats.cpu.max}%)`);
    console.log(`  Memory Usage: ${sysStats.memory.avg}% avg (max: ${sysStats.memory.max}%)`);
    console.log(`  Peak Memory: ${sysStats.memory.peak?.used || 'N/A'} MB`);
    console.log(`  Max Connections: ${sysStats.network.maxConnections}`);
  }
  
  console.log('\n📈 ENDPOINT ANALYSIS:');
  reqStats.endpointBreakdown.forEach((ep, i) => {
    if (i < 10) { // Top 10 endpoints
      console.log(`  ${ep.endpoint}:`);
      console.log(`    Requests: ${ep.requests}`);
      console.log(`    Avg Duration: ${ep.avgDuration}ms`);
      console.log(`    Error Rate: ${ep.errorRate}`);
    }
  });
  
  // Performance grading
  const avgTime = parseFloat(reqStats.responseTimes.avg);
  const p95Time = parseFloat(reqStats.responseTimes.p95);
  const successRate = parseFloat(reqStats.successRate);
  const rps = parseFloat(reqStats.requestsPerSecond);
  
  let grade = 'A+';
  if (avgTime > 100 || p95Time > 500 || successRate < 99 || rps < 100) grade = 'A';
  if (avgTime > 200 || p95Time > 1000 || successRate < 95 || rps < 50) grade = 'B';
  if (avgTime > 500 || p95Time > 2000 || successRate < 90 || rps < 25) grade = 'C';
  if (avgTime > 1000 || p95Time > 5000 || successRate < 80 || rps < 10) grade = 'D';
  if (successRate < 70) grade = 'F';
  
  console.log('\n🎖️ PERFORMANCE GRADE:', grade);
  console.log('\n✅ OPTIMIZATION RECOMMENDATIONS:');
  
  if (avgTime > 100) {
    console.log('  • Average response time > 100ms - Consider additional caching');
  }
  if (p95Time > 1000) {
    console.log('  • P95 response time > 1s - Investigate slow queries');
  }
  if (successRate < 99) {
    console.log('  • Success rate < 99% - Check error handling and timeouts');
  }
  if (rps < 100) {
    console.log('  • Low throughput - Consider connection pooling and async processing');
  }
  
  if (sysStats && parseFloat(sysStats.cpu.max) > 80) {
    console.log('  • High CPU usage - Consider load balancing or optimization');
  }
  if (sysStats && parseFloat(sysStats.memory.max) > 80) {
    console.log('  • High memory usage - Check for memory leaks and optimize caching');
  }
  
  console.log('\n🏆 SCALABILITY ASSESSMENT:');
  const scalabilityScore = Math.min(100, (rps / 10) + (100 - avgTime) + successRate);
  console.log(`  Scalability Score: ${scalabilityScore.toFixed(0)}/100`);
  
  if (scalabilityScore >= 90) {
    console.log('  🌟 EXCELLENT - Ready for production scale');
  } else if (scalabilityScore >= 75) {
    console.log('  ✅ GOOD - Minor optimizations recommended');
  } else if (scalabilityScore >= 60) {
    console.log('  ⚠️ FAIR - Significant optimizations needed');
  } else {
    console.log('  ❌ POOR - Major performance issues detected');
  }
  
  console.log('═══════════════════════════════════════════════════════════════');

  // Save detailed report to file
  const report = {
    testConfig: TEST_CONFIG,
    requestStats: reqStats,
    systemStats: sysStats,
    grade,
    scalabilityScore: scalabilityScore.toFixed(0),
    timestamp: new Date().toISOString()
  };

  await fs.writeFile('dashboard-stress-test-report.json', JSON.stringify(report, null, 2));
  console.log('\n📄 Detailed report saved to: dashboard-stress-test-report.json');
}

// Check server availability
async function checkServer() {
  return new Promise((resolve) => {
    https.get(BASE_URL + '/health', (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

async function main() {
  console.log('🔍 Checking server availability...');
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.error('❌ Server not running on port 3000');
    console.log('Please start the server first');
    process.exit(1);
  }
  
  console.log('✅ Server is running\n');
  await runDashboardStressTest();
}

main().catch(console.error);
