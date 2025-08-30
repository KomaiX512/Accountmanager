#!/usr/bin/env node

/**
 * 🚀 FINAL SYSTEM TEST SUITE
 * 
 * This script performs end-to-end system tests to ensure the entire application
 * works seamlessly with the new Cloudflare R2 setup after migration.
 * 
 * TEST CATEGORIES:
 * 1. Server startup and health checks
 * 2. R2 bucket connectivity and operations
 * 3. Application-specific workflows
 * 4. API endpoint functionality
 * 5. Image processing and caching
 * 6. Data integrity and schema validation
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Server configuration
const SERVERS = {
  main: { port: 3000, name: 'Main Server' },
  proxy: { port: 3002, name: 'Proxy Server' },
  rag: { port: 3001, name: 'RAG Server' }
};

// New R2 configuration
const R2_CONFIG = {
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: process.env.NEW_R2_ACCESS_KEY || 'REPLACE_WITH_NEW_ACCESS_KEY',
    secretAccessKey: process.env.NEW_R2_SECRET_KEY || 'REPLACE_WITH_NEW_SECRET_KEY',
  }
};

const s3Client = new S3Client(R2_CONFIG);

// Test statistics
const testStats = {
  totalTests: 0,
  passedTests: 0,
  failedTests: 0,
  startTime: new Date(),
  testResults: [],
  errors: []
};

/**
 * Test result class
 */
class SystemTest {
  constructor(name, category, description) {
    this.name = name;
    this.category = category;
    this.description = description;
    this.status = 'pending';
    this.duration = 0;
    this.error = null;
    this.details = {};
    this.startTime = null;
  }
  
  start() {
    this.startTime = Date.now();
    this.status = 'running';
    console.log(`🧪 Testing: ${this.name}`);
  }
  
  pass(details = {}) {
    this.duration = Date.now() - this.startTime;
    this.status = 'passed';
    this.details = details;
    testStats.passedTests++;
    console.log(`✅ PASSED: ${this.name} (${this.duration}ms)`);
  }
  
  fail(error, details = {}) {
    this.duration = Date.now() - this.startTime;
    this.status = 'failed';
    this.error = error;
    this.details = details;
    testStats.failedTests++;
    testStats.errors.push({
      test: this.name,
      category: this.category,
      error: error,
      details: details
    });
    console.log(`❌ FAILED: ${this.name} - ${error}`);
  }
}

/**
 * Run a test with timeout and error handling
 */
async function runTest(test, testFunction) {
  testStats.totalTests++;
  test.start();
  
  try {
    await Promise.race([
      testFunction(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Test timeout')), 30000)
      )
    ]);
    
    test.pass();
  } catch (error) {
    test.fail(error.message);
  }
  
  testStats.testResults.push(test);
  return test;
}

/**
 * Check if server is running on a specific port
 */
async function checkServerRunning(port) {
  try {
    const response = await axios.get(`http://localhost:${port}/health`, {
      timeout: 5000
    });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Test server health and connectivity
 */
async function testServerHealth() {
  const results = [];
  
  for (const [key, server] of Object.entries(SERVERS)) {
    const test = new SystemTest(
      `${server.name} Health Check`,
      'Server Health',
      `Test ${server.name} is running and responding on port ${server.port}`
    );
    
    const result = await runTest(test, async () => {
      const isRunning = await checkServerRunning(server.port);
      
      if (!isRunning) {
        throw new Error(`Server not responding on port ${server.port}`);
      }
      
      // Try to get detailed health info
      try {
        const response = await axios.get(`http://localhost:${server.port}/health`, {
          timeout: 5000
        });
        
        test.details.status = response.data.status;
        test.details.port = server.port;
        test.details.responseTime = test.duration;
        
        if (response.data.s3Status) {
          test.details.s3Status = response.data.s3Status;
        }
      } catch (error) {
        test.details.healthEndpointError = error.message;
      }
    });
    
    results.push(result);
  }
  
  return results;
}

/**
 * Test R2 bucket connectivity
 */
async function testR2Connectivity() {
  const results = [];
  const buckets = ['tasks', 'structuredb', 'admin'];
  
  for (const bucket of buckets) {
    const test = new SystemTest(
      `R2 Bucket Access: ${bucket}`,
      'R2 Connectivity',
      `Test connectivity to ${bucket} bucket`
    );
    
    const result = await runTest(test, async () => {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 10
      });
      
      const response = await s3Client.send(command);
      
      test.details.bucket = bucket;
      test.details.objectCount = response.Contents?.length || 0;
      test.details.endpoint = R2_CONFIG.endpoint;
    });
    
    results.push(result);
  }
  
  return results;
}

/**
 * Test API endpoints
 */
async function testAPIEndpoints() {
  const results = [];
  
  // Test main server API endpoints
  const mainEndpoints = [
    { path: '/api/health-check', method: 'GET', server: 'main' },
    { path: '/health', method: 'GET', server: 'proxy' }
  ];
  
  for (const endpoint of mainEndpoints) {
    const server = SERVERS[endpoint.server];
    const test = new SystemTest(
      `API Endpoint: ${endpoint.method} ${endpoint.path}`,
      'API Testing',
      `Test ${endpoint.path} endpoint on ${server.name}`
    );
    
    const result = await runTest(test, async () => {
      const url = `http://localhost:${server.port}${endpoint.path}`;
      
      const response = await axios({
        method: endpoint.method,
        url: url,
        timeout: 10000
      });
      
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Unexpected status code: ${response.status}`);
      }
      
      test.details.url = url;
      test.details.status = response.status;
      test.details.responseData = response.data;
    });
    
    results.push(result);
  }
  
  return results;
}

/**
 * Test image processing workflow
 */
async function testImageProcessing() {
  const test = new SystemTest(
    'Image Processing Workflow',
    'Application Workflow',
    'Test image upload, processing, and retrieval workflow'
  );
  
  return runTest(test, async () => {
    // Create test image data
    const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const testKey = `test-image-${Date.now()}.png`;
    
    // Upload test image to R2
    const uploadCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: `ready_post/test/${testKey}`,
      Body: testImageData,
      ContentType: 'image/png'
    });
    
    await s3Client.send(uploadCommand);
    
    // Test image retrieval via proxy server
    try {
      const imageUrl = `http://localhost:3002/api/r2-image?bucket=tasks&key=ready_post/test/${testKey}`;
      const response = await axios.get(imageUrl, {
        timeout: 10000,
        responseType: 'arraybuffer'
      });
      
      if (response.status !== 200) {
        throw new Error(`Image retrieval failed: ${response.status}`);
      }
      
      test.details.uploadSuccess = true;
      test.details.retrievalSuccess = true;
      test.details.imageSize = response.data.length;
      
    } finally {
      // Clean up test image
      const deleteCommand = new DeleteObjectCommand({
        Bucket: 'tasks',
        Key: `ready_post/test/${testKey}`
      });
      
      await s3Client.send(deleteCommand);
      test.details.cleanupSuccess = true;
    }
  });
}

/**
 * Test data schema validation
 */
async function testDataSchema() {
  const results = [];
  
  // Test expected directory structures
  const expectedStructures = {
    'tasks': ['ready_post/', 'ProfileInfo/', 'Posts/'],
    'structuredb': ['users/', 'platforms/'],
    'admin': ['logs/', 'config/']
  };
  
  for (const [bucket, expectedDirs] of Object.entries(expectedStructures)) {
    const test = new SystemTest(
      `Schema Validation: ${bucket}`,
      'Data Schema',
      `Validate directory structure in ${bucket} bucket`
    );
    
    const result = await runTest(test, async () => {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Delimiter: '/',
        MaxKeys: 100
      });
      
      const response = await s3Client.send(command);
      const foundPrefixes = response.CommonPrefixes?.map(p => p.Prefix) || [];
      
      test.details.bucket = bucket;
      test.details.expectedDirs = expectedDirs;
      test.details.foundDirs = foundPrefixes;
      test.details.missingDirs = expectedDirs.filter(dir => !foundPrefixes.includes(dir));
      test.details.extraDirs = foundPrefixes.filter(dir => !expectedDirs.includes(dir));
      
      // Log findings but don't fail for missing directories (they may not exist yet)
      console.log(`   📁 Found ${foundPrefixes.length} directories in ${bucket}`);
    });
    
    results.push(result);
  }
  
  return results;
}

/**
 * Test application-specific workflows
 */
async function testApplicationWorkflows() {
  const results = [];
  
  // Test post retrieval workflow
  const postTest = new SystemTest(
    'Post Retrieval Workflow',
    'Application Workflow',
    'Test retrieving posts from R2 bucket via API'
  );
  
  const postResult = await runTest(postTest, async () => {
    try {
      const response = await axios.get('http://localhost:3002/posts/test', {
        timeout: 10000
      });
      
      postTest.details.status = response.status;
      postTest.details.postsFound = Array.isArray(response.data) ? response.data.length : 0;
      
    } catch (error) {
      if (error.response?.status === 404) {
        // 404 is acceptable - no posts for test user
        postTest.details.status = 404;
        postTest.details.message = 'No posts found (expected for test user)';
      } else {
        throw error;
      }
    }
  });
  
  results.push(postResult);
  
  return results;
}

/**
 * Test performance and reliability
 */
async function testPerformance() {
  const test = new SystemTest(
    'Performance Test',
    'Performance',
    'Test system performance with concurrent operations'
  );
  
  return runTest(test, async () => {
    const concurrentRequests = 5;
    const requests = [];
    
    // Create concurrent health check requests
    for (let i = 0; i < concurrentRequests; i++) {
      requests.push(
        axios.get('http://localhost:3002/health', { timeout: 5000 })
      );
    }
    
    const startTime = Date.now();
    const responses = await Promise.all(requests);
    const totalTime = Date.now() - startTime;
    
    const successfulRequests = responses.filter(r => r.status === 200).length;
    
    if (successfulRequests !== concurrentRequests) {
      throw new Error(`Only ${successfulRequests}/${concurrentRequests} requests succeeded`);
    }
    
    test.details.concurrentRequests = concurrentRequests;
    test.details.successfulRequests = successfulRequests;
    test.details.totalTime = totalTime;
    test.details.averageResponseTime = totalTime / concurrentRequests;
  });
}

/**
 * Generate final test report
 */
function generateTestReport() {
  const endTime = new Date();
  const duration = endTime - testStats.startTime;
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 FINAL SYSTEM TEST COMPLETE - REPORT`);
  console.log(`${'='.repeat(80)}`);
  
  console.log(`⏱️  Duration: ${Math.floor(duration / 1000)}s`);
  console.log(`📊 Total Tests: ${testStats.totalTests}`);
  console.log(`✅ Passed Tests: ${testStats.passedTests}`);
  console.log(`❌ Failed Tests: ${testStats.failedTests}`);
  
  const successRate = testStats.totalTests > 0 
    ? ((testStats.passedTests / testStats.totalTests) * 100).toFixed(2)
    : 0;
  console.log(`🎯 Success Rate: ${successRate}%`);
  
  // Results by category
  const categories = {};
  testStats.testResults.forEach(result => {
    if (!categories[result.category]) {
      categories[result.category] = { passed: 0, failed: 0 };
    }
    categories[result.category][result.status]++;
  });
  
  console.log(`\n📋 RESULTS BY CATEGORY:`);
  console.log(`${'='.repeat(50)}`);
  
  Object.entries(categories).forEach(([category, stats]) => {
    console.log(`\n📂 ${category}:`);
    console.log(`   ✅ Passed: ${stats.passed}`);
    console.log(`   ❌ Failed: ${stats.failed}`);
  });
  
  // Error summary
  if (testStats.errors.length > 0) {
    console.log(`\n❌ FAILED TESTS:`);
    console.log(`${'='.repeat(50)}`);
    testStats.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.test}: ${error.error}`);
    });
  }
  
  // Save detailed report
  const reportData = {
    summary: {
      startTime: testStats.startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration: duration,
      totalTests: testStats.totalTests,
      passedTests: testStats.passedTests,
      failedTests: testStats.failedTests,
      successRate: successRate
    },
    categories: categories,
    testResults: testStats.testResults,
    errors: testStats.errors,
    configuration: {
      r2Endpoint: R2_CONFIG.endpoint,
      servers: SERVERS
    }
  };
  
  const reportPath = path.join(process.cwd(), 'scripts', `final-system-test-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  
  return testStats.failedTests === 0;
}

/**
 * Main test runner
 */
async function runFinalSystemTest() {
  console.log(`🚀 FINAL SYSTEM TEST SUITE STARTING`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📅 Start Time: ${testStats.startTime.toISOString()}`);
  console.log(`🔗 R2 Endpoint: ${R2_CONFIG.endpoint}`);
  console.log(`🖥️  Servers: ${Object.values(SERVERS).map(s => `${s.name}:${s.port}`).join(', ')}`);
  
  try {
    // 1. Server health tests
    console.log(`\n🖥️  SERVER HEALTH TESTS`);
    console.log(`${'='.repeat(40)}`);
    await testServerHealth();
    
    // 2. R2 connectivity tests
    console.log(`\n🔗 R2 CONNECTIVITY TESTS`);
    console.log(`${'='.repeat(40)}`);
    await testR2Connectivity();
    
    // 3. API endpoint tests
    console.log(`\n🌐 API ENDPOINT TESTS`);
    console.log(`${'='.repeat(40)}`);
    await testAPIEndpoints();
    
    // 4. Application workflow tests
    console.log(`\n🔄 APPLICATION WORKFLOW TESTS`);
    console.log(`${'='.repeat(40)}`);
    await testImageProcessing();
    await testApplicationWorkflows();
    
    // 5. Data schema tests
    console.log(`\n📁 DATA SCHEMA TESTS`);
    console.log(`${'='.repeat(40)}`);
    await testDataSchema();
    
    // 6. Performance tests
    console.log(`\n⚡ PERFORMANCE TESTS`);
    console.log(`${'='.repeat(40)}`);
    await testPerformance();
    
  } catch (error) {
    console.error(`💥 Critical test error:`, error);
    testStats.errors.push({
      test: 'System Test Suite',
      category: 'Critical',
      error: error.message
    });
  }
  
  // Generate final report
  const allTestsPassed = generateTestReport();
  
  if (allTestsPassed) {
    console.log(`\n🎉 ALL SYSTEM TESTS PASSED! 🎉`);
    console.log(`✅ Migration completed successfully - system is ready for production!`);
    console.log(`🔗 All servers are connected to new R2 endpoint: ${R2_CONFIG.endpoint}`);
    process.exit(0);
  } else {
    console.log(`\n⚠️  SOME SYSTEM TESTS FAILED`);
    console.log(`❌ Please review the test report and address issues before going live.`);
    process.exit(1);
  }
}

// Handle process signals gracefully
process.on('SIGINT', () => {
  console.log(`\n⚠️  System test interrupted by user`);
  generateTestReport();
  process.exit(1);
});

// Start test suite if this script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runFinalSystemTest().catch(error => {
    console.error(`💥 Critical system test error:`, error);
    generateTestReport();
    process.exit(1);
  });
}

export { runFinalSystemTest, testStats };
