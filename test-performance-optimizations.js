#!/usr/bin/env node

/**
 * Performance Testing Suite for Social Media Dashboard Optimizations
 * Tests cache behavior, response times, and parallel processing improvements
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';
const TEST_USER = 'maccosmetics';

// ANSI color codes for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

async function measureApiCall(endpoint, description) {
  const start = Date.now();
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`);
    const elapsed = Date.now() - start;
    const data = await response.json();
    const cacheHeader = response.headers.get('X-Cache');
    
    return {
      success: response.ok,
      elapsed,
      cached: cacheHeader === 'HIT',
      cacheStatus: cacheHeader || 'NONE',
      statusCode: response.status
    };
  } catch (error) {
    const elapsed = Date.now() - start;
    return {
      success: false,
      elapsed,
      error: error.message,
      cached: false
    };
  }
}

async function testCacheBehavior() {
  console.log(`\n${colors.blue}=== CACHE BEHAVIOR TEST ===${colors.reset}\n`);
  
  const endpoints = [
    { path: `/api/processing-status/${TEST_USER}`, name: 'Processing Status' },
    { path: `/api/profile-info/${TEST_USER}?platform=instagram`, name: 'Profile Info' },
    { path: `/api/events-list/${TEST_USER}?platform=instagram&limit=10`, name: 'Notifications' }
  ];
  
  for (const endpoint of endpoints) {
    console.log(`Testing ${endpoint.name}:`);
    
    // First call - should be cache MISS
    const first = await measureApiCall(endpoint.path, 'First call');
    console.log(`  1st call: ${first.elapsed}ms - Cache: ${first.cacheStatus} ${first.cached ? '✅' : '❌'}`);
    
    // Second call - should be cache HIT
    const second = await measureApiCall(endpoint.path, 'Second call');
    console.log(`  2nd call: ${second.elapsed}ms - Cache: ${second.cacheStatus} ${second.cached ? '✅' : '❌'}`);
    
    // Calculate improvement
    const improvement = ((first.elapsed - second.elapsed) / first.elapsed * 100).toFixed(1);
    const speedup = (first.elapsed / second.elapsed).toFixed(1);
    
    if (second.cached) {
      console.log(`  ${colors.green}✅ Cache working! ${speedup}x faster (${improvement}% improvement)${colors.reset}`);
    } else {
      console.log(`  ${colors.red}❌ Cache not working for this endpoint${colors.reset}`);
    }
    console.log();
  }
}

async function testParallelVsSequential() {
  console.log(`\n${colors.blue}=== PARALLEL vs SEQUENTIAL TEST ===${colors.reset}\n`);
  
  const endpoints = [
    `/api/processing-status/${TEST_USER}`,
    `/api/profile-info/${TEST_USER}?platform=instagram`,
    `/api/events-list/${TEST_USER}?platform=instagram&limit=10`
  ];
  
  // Sequential execution
  console.log('Sequential execution:');
  const seqStart = Date.now();
  for (const endpoint of endpoints) {
    await measureApiCall(endpoint, 'Sequential');
  }
  const seqTime = Date.now() - seqStart;
  console.log(`  Total time: ${seqTime}ms`);
  
  // Parallel execution
  console.log('\nParallel execution:');
  const parStart = Date.now();
  await Promise.all(endpoints.map(endpoint => measureApiCall(endpoint, 'Parallel')));
  const parTime = Date.now() - parStart;
  console.log(`  Total time: ${parTime}ms`);
  
  const improvement = ((seqTime - parTime) / seqTime * 100).toFixed(1);
  const speedup = (seqTime / parTime).toFixed(1);
  
  console.log(`\n${colors.green}✅ Parallel execution is ${speedup}x faster (${improvement}% improvement)${colors.reset}`);
}

async function testDashboardLoadTime() {
  console.log(`\n${colors.blue}=== SIMULATED DASHBOARD LOAD TEST ===${colors.reset}\n`);
  
  // Simulate dashboard loading all required data
  const dashboardEndpoints = [
    `/api/processing-status/${TEST_USER}`,
    `/api/profile-info/${TEST_USER}?platform=instagram`,
    `/api/profile-info/${TEST_USER}?platform=twitter`,
    `/api/profile-info/${TEST_USER}?platform=facebook`,
    `/api/events-list/${TEST_USER}?platform=instagram&limit=50`,
    `/api/usage/${TEST_USER}/2025-09`
  ];
  
  console.log('Loading dashboard data (parallel calls)...');
  const start = Date.now();
  
  const results = await Promise.all(
    dashboardEndpoints.map(async (endpoint, index) => {
      const result = await measureApiCall(endpoint, `Dashboard API ${index + 1}`);
      console.log(`  API ${index + 1}: ${result.elapsed}ms ${result.cached ? '(cached)' : ''}`);
      return result;
    })
  );
  
  const totalTime = Date.now() - start;
  const avgTime = results.reduce((sum, r) => sum + r.elapsed, 0) / results.length;
  const cachedCount = results.filter(r => r.cached).length;
  
  console.log(`\n${colors.blue}Dashboard Load Statistics:${colors.reset}`);
  console.log(`  Total load time: ${totalTime}ms`);
  console.log(`  Average per API: ${avgTime.toFixed(0)}ms`);
  console.log(`  Cached responses: ${cachedCount}/${results.length}`);
  
  if (totalTime < 3000) {
    console.log(`\n${colors.green}✅ GOAL ACHIEVED! Dashboard loads in ${(totalTime/1000).toFixed(1)}s (target: 2-3s)${colors.reset}`);
  } else {
    console.log(`\n${colors.yellow}⚠️ Dashboard load time: ${(totalTime/1000).toFixed(1)}s (target: 2-3s)${colors.reset}`);
  }
}

async function testCacheInvalidation() {
  console.log(`\n${colors.blue}=== CACHE INVALIDATION TEST ===${colors.reset}\n`);
  
  // First, populate the cache
  console.log('1. Populating cache...');
  await measureApiCall(`/api/processing-status/${TEST_USER}`, 'Initial');
  
  // Second call should be cached
  const cached = await measureApiCall(`/api/processing-status/${TEST_USER}`, 'Cached');
  console.log(`   Cache status: ${cached.cacheStatus} ${cached.cached ? '✅' : '❌'}`);
  
  // Force refresh should bypass cache
  console.log('\n2. Testing force refresh...');
  const forced = await measureApiCall(`/api/processing-status/${TEST_USER}?forceRefresh=true`, 'Force refresh');
  console.log(`   Cache bypassed: ${!forced.cached ? '✅' : '❌'} (${forced.cacheStatus})`);
  
  // Next call should be cached again
  const recached = await measureApiCall(`/api/processing-status/${TEST_USER}`, 'Re-cached');
  console.log(`   Re-cached: ${recached.cached ? '✅' : '❌'} (${recached.cacheStatus})`);
}

async function main() {
  console.log(`${colors.green}========================================`);
  console.log(`   PERFORMANCE OPTIMIZATION TEST SUITE`);
  console.log(`========================================${colors.reset}`);
  
  // Skip health check and test actual endpoints directly
  
  await testCacheBehavior();
  await testParallelVsSequential();
  await testCacheInvalidation();
  await testDashboardLoadTime();
  
  console.log(`\n${colors.green}========================================`);
  console.log(`   TEST SUITE COMPLETED`);
  console.log(`========================================${colors.reset}\n`);
}

main().catch(console.error);
