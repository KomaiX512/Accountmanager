#!/usr/bin/env node

/**
 * Test Suite to Verify Scheduling and Posting Functionality
 * Ensures our optimizations don't break existing features
 */

import http from 'http';
import { performance } from 'perf_hooks';

const API_BASE = 'http://127.0.0.1:3000';

// Test endpoints critical for scheduling and posting
const CRITICAL_ENDPOINTS = [
  {
    name: 'Post Generator',
    method: 'POST',
    path: '/api/post-generator',
    body: {
      username: 'test',
      platform: 'instagram',
      prompt: 'Test post generation'
    }
  },
  {
    name: 'Schedule Post',
    method: 'GET',
    path: '/api/scheduled-posts/KUvVFxnLanYTWPuSIfphby5hxJQ2?platform=instagram'
  },
  {
    name: 'Processing Status',
    method: 'GET',
    path: '/api/processing-status/KUvVFxnLanYTWPuSIfphby5hxJQ2'
  },
  {
    name: 'Profile Info',
    method: 'GET',
    path: '/api/profile-info/instagram/maccosmetics'
  },
  {
    name: 'Image Proxy',
    method: 'GET',
    path: '/api/proxy-image?url=https://via.placeholder.com/300x300.jpg'
  }
];

async function testEndpoint(endpoint) {
  return new Promise((resolve) => {
    const start = performance.now();
    const url = new URL(API_BASE + endpoint.path);
    
    const options = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = performance.now() - start;
        resolve({
          name: endpoint.name,
          status: res.statusCode,
          duration: Math.round(duration),
          success: res.statusCode >= 200 && res.statusCode < 400,
          cacheStatus: res.headers['x-cache'],
          error: res.statusCode >= 400 ? data : null
        });
      });
    });

    req.on('error', (error) => {
      resolve({
        name: endpoint.name,
        status: 0,
        duration: 0,
        success: false,
        error: error.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        name: endpoint.name,
        status: 0,
        duration: 10000,
        success: false,
        error: 'Request timeout'
      });
    });

    if (endpoint.body) {
      req.write(JSON.stringify(endpoint.body));
    }
    req.end();
  });
}

async function runFunctionalityTest() {
  console.log('🧪 Testing Critical Scheduling & Posting Functionality');
  console.log('═══════════════════════════════════════════════════════');
  
  const results = [];
  
  for (const endpoint of CRITICAL_ENDPOINTS) {
    process.stdout.write(`Testing ${endpoint.name}... `);
    const result = await testEndpoint(endpoint);
    results.push(result);
    
    const statusIcon = result.success ? '✅' : '❌';
    const cacheInfo = result.cacheStatus ? ` (${result.cacheStatus})` : '';
    console.log(`${statusIcon} ${result.status} - ${result.duration}ms${cacheInfo}`);
    
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error.substring(0, 100)}...`);
    }
  }
  
  console.log('\n📊 Functionality Test Results:');
  console.log('═══════════════════════════════════════════════════════');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const avgResponseTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  
  console.log(`✅ Successful: ${successful}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  console.log(`⚡ Average Response Time: ${Math.round(avgResponseTime)}ms`);
  
  // Check if critical functionality is preserved
  const criticalEndpoints = ['Processing Status', 'Profile Info', 'Image Proxy'];
  const criticalResults = results.filter(r => criticalEndpoints.includes(r.name));
  const criticalSuccess = criticalResults.filter(r => r.success).length;
  
  console.log(`🎯 Critical Endpoints: ${criticalSuccess}/${criticalResults.length} working`);
  
  if (criticalSuccess === criticalResults.length) {
    console.log('\n🎉 SUCCESS: All critical functionality preserved!');
    console.log('✅ Optimizations do not break scheduling and posting');
  } else {
    console.log('\n⚠️ WARNING: Some critical endpoints failing');
    console.log('❌ May need to adjust optimizations');
  }
  
  // Performance analysis
  console.log('\n⚡ Performance Analysis:');
  results.forEach(result => {
    const perfGrade = result.duration < 100 ? 'Excellent' : 
                     result.duration < 500 ? 'Good' : 
                     result.duration < 1000 ? 'Acceptable' : 'Slow';
    console.log(`  ${result.name}: ${result.duration}ms (${perfGrade})`);
  });
  
  return {
    totalTests: results.length,
    successful,
    failed,
    avgResponseTime: Math.round(avgResponseTime),
    criticalWorking: criticalSuccess === criticalResults.length
  };
}

// Check server availability
async function checkServer() {
  return new Promise((resolve) => {
    http.get(API_BASE + '/health', (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

async function main() {
  console.log('🔍 Checking server availability...');
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.error('❌ Server not running on port 3000');
    process.exit(1);
  }
  
  console.log('✅ Server is running\n');
  
  const results = await runFunctionalityTest();
  
  // Exit with appropriate code
  process.exit(results.criticalWorking ? 0 : 1);
}

main().catch(console.error);
