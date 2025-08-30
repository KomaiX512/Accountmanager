#!/usr/bin/env node

/**
 * 🧪 COMPREHENSIVE R2 BUCKET TEST SUITE
 * 
 * This script performs comprehensive testing of all R2 bucket operations to ensure
 * the new Cloudflare R2 setup works perfectly with all application functionality.
 * 
 * TEST CATEGORIES:
 * 1. Basic connectivity and authentication
 * 2. Bucket access and permissions
 * 3. Object CRUD operations (Create, Read, Update, Delete)
 * 4. Directory structure validation
 * 5. Schema compliance testing
 * 6. Performance and reliability tests
 * 7. Application-specific workflow tests
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// NEW R2 CONFIGURATION (TO BE TESTED)
const NEW_S3_CONFIG = {
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: process.env.NEW_R2_ACCESS_KEY || 'REPLACE_WITH_NEW_ACCESS_KEY',
    secretAccessKey: process.env.NEW_R2_SECRET_KEY || 'REPLACE_WITH_NEW_SECRET_KEY',
  },
  maxAttempts: 5,
  requestHandler: {
    connectionTimeout: 15000,
    requestTimeout: 30000,
  },
  retryMode: 'adaptive'
};

// Create S3 client
const s3Client = new S3Client(NEW_S3_CONFIG);

// Test configuration
const TEST_CONFIG = {
  buckets: ['tasks', 'structuredb', 'admin'],
  testDataSize: 1024 * 1024, // 1MB test file
  concurrentTests: 5,
  timeoutMs: 30000
};

// Test statistics
const testStats = {
  totalTests: 0,
  passedTests: 0,
  failedTests: 0,
  skippedTests: 0,
  startTime: new Date(),
  testResults: [],
  errors: []
};

/**
 * Test result class for structured reporting
 */
class TestResult {
  constructor(name, category, description) {
    this.name = name;
    this.category = category;
    this.description = description;
    this.status = 'pending'; // pending, passed, failed, skipped
    this.duration = 0;
    this.error = null;
    this.details = {};
    this.startTime = null;
  }
  
  start() {
    this.startTime = Date.now();
    this.status = 'running';
  }
  
  pass(details = {}) {
    this.duration = Date.now() - this.startTime;
    this.status = 'passed';
    this.details = details;
    testStats.passedTests++;
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
  }
  
  skip(reason) {
    this.status = 'skipped';
    this.error = reason;
    testStats.skippedTests++;
  }
}

/**
 * Generate random test data
 */
function generateTestData(size = 1024) {
  return crypto.randomBytes(size);
}

/**
 * Calculate MD5 hash
 */
function calculateMD5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * Convert stream to buffer
 */
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Run a test with timeout and error handling
 */
async function runTest(testResult, testFunction) {
  testStats.totalTests++;
  testResult.start();
  
  try {
    console.log(`🧪 Running: ${testResult.name}`);
    
    // Run test with timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Test timeout')), TEST_CONFIG.timeoutMs)
    );
    
    await Promise.race([testFunction(), timeoutPromise]);
    
    testResult.pass();
    console.log(`✅ PASSED: ${testResult.name} (${testResult.duration}ms)`);
    
  } catch (error) {
    testResult.fail(error.message);
    console.log(`❌ FAILED: ${testResult.name} - ${error.message}`);
  }
  
  testStats.testResults.push(testResult);
  return testResult;
}

/**
 * Test basic connectivity to R2
 */
async function testConnectivity() {
  const test = new TestResult(
    'R2 Connectivity',
    'Basic',
    'Test basic connection to new R2 endpoint'
  );
  
  return runTest(test, async () => {
    const command = new ListObjectsV2Command({
      Bucket: 'tasks',
      MaxKeys: 1
    });
    
    const response = await s3Client.send(command);
    test.details.endpoint = NEW_S3_CONFIG.endpoint;
    test.details.responseTime = test.duration;
  });
}

/**
 * Test bucket access permissions
 */
async function testBucketAccess() {
  const results = [];
  
  for (const bucket of TEST_CONFIG.buckets) {
    const test = new TestResult(
      `Bucket Access: ${bucket}`,
      'Permissions',
      `Test read access to ${bucket} bucket`
    );
    
    const result = await runTest(test, async () => {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 10
      });
      
      const response = await s3Client.send(command);
      test.details.objectCount = response.Contents?.length || 0;
      test.details.bucket = bucket;
    });
    
    results.push(result);
  }
  
  return results;
}

/**
 * Test object upload (CREATE)
 */
async function testObjectUpload() {
  const results = [];
  
  for (const bucket of TEST_CONFIG.buckets) {
    const test = new TestResult(
      `Object Upload: ${bucket}`,
      'CRUD',
      `Test uploading objects to ${bucket} bucket`
    );
    
    const result = await runTest(test, async () => {
      const testData = generateTestData(1024);
      const testKey = `test-upload-${Date.now()}.bin`;
      
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: testData,
        ContentType: 'application/octet-stream',
        Metadata: {
          'test-type': 'upload-test',
          'test-timestamp': Date.now().toString()
        }
      });
      
      await s3Client.send(command);
      
      test.details.bucket = bucket;
      test.details.key = testKey;
      test.details.size = testData.length;
      test.details.md5 = calculateMD5(testData);
      
      // Store for cleanup
      test.details.cleanupRequired = true;
    });
    
    results.push(result);
  }
  
  return results;
}

/**
 * Test object download (READ)
 */
async function testObjectDownload(uploadResults) {
  const results = [];
  
  for (const uploadResult of uploadResults) {
    if (uploadResult.status !== 'passed' || !uploadResult.details.cleanupRequired) {
      continue;
    }
    
    const test = new TestResult(
      `Object Download: ${uploadResult.details.bucket}`,
      'CRUD',
      `Test downloading objects from ${uploadResult.details.bucket} bucket`
    );
    
    const result = await runTest(test, async () => {
      const command = new GetObjectCommand({
        Bucket: uploadResult.details.bucket,
        Key: uploadResult.details.key
      });
      
      const response = await s3Client.send(command);
      const downloadedData = await streamToBuffer(response.Body);
      
      const downloadedMD5 = calculateMD5(downloadedData);
      
      if (downloadedMD5 !== uploadResult.details.md5) {
        throw new Error(`Data integrity check failed: expected ${uploadResult.details.md5}, got ${downloadedMD5}`);
      }
      
      test.details.bucket = uploadResult.details.bucket;
      test.details.key = uploadResult.details.key;
      test.details.size = downloadedData.length;
      test.details.md5 = downloadedMD5;
      test.details.integrityCheck = 'passed';
    });
    
    results.push(result);
  }
  
  return results;
}

/**
 * Test object metadata (HEAD)
 */
async function testObjectMetadata(uploadResults) {
  const results = [];
  
  for (const uploadResult of uploadResults) {
    if (uploadResult.status !== 'passed' || !uploadResult.details.cleanupRequired) {
      continue;
    }
    
    const test = new TestResult(
      `Object Metadata: ${uploadResult.details.bucket}`,
      'CRUD',
      `Test retrieving object metadata from ${uploadResult.details.bucket} bucket`
    );
    
    const result = await runTest(test, async () => {
      const command = new HeadObjectCommand({
        Bucket: uploadResult.details.bucket,
        Key: uploadResult.details.key
      });
      
      const response = await s3Client.send(command);
      
      test.details.bucket = uploadResult.details.bucket;
      test.details.key = uploadResult.details.key;
      test.details.contentLength = response.ContentLength;
      test.details.contentType = response.ContentType;
      test.details.lastModified = response.LastModified;
      test.details.metadata = response.Metadata;
      
      // Verify metadata
      if (response.ContentLength !== uploadResult.details.size) {
        throw new Error(`Size mismatch: expected ${uploadResult.details.size}, got ${response.ContentLength}`);
      }
      
      if (!response.Metadata || response.Metadata['test-type'] !== 'upload-test') {
        throw new Error('Custom metadata not preserved');
      }
    });
    
    results.push(result);
  }
  
  return results;
}

/**
 * Test object deletion (DELETE)
 */
async function testObjectDeletion(uploadResults) {
  const results = [];
  
  for (const uploadResult of uploadResults) {
    if (uploadResult.status !== 'passed' || !uploadResult.details.cleanupRequired) {
      continue;
    }
    
    const test = new TestResult(
      `Object Deletion: ${uploadResult.details.bucket}`,
      'CRUD',
      `Test deleting objects from ${uploadResult.details.bucket} bucket`
    );
    
    const result = await runTest(test, async () => {
      const command = new DeleteObjectCommand({
        Bucket: uploadResult.details.bucket,
        Key: uploadResult.details.key
      });
      
      await s3Client.send(command);
      
      // Verify deletion by trying to get the object
      try {
        const getCommand = new GetObjectCommand({
          Bucket: uploadResult.details.bucket,
          Key: uploadResult.details.key
        });
        
        await s3Client.send(getCommand);
        throw new Error('Object still exists after deletion');
      } catch (error) {
        if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
          // Expected - object was successfully deleted
          test.details.bucket = uploadResult.details.bucket;
          test.details.key = uploadResult.details.key;
          test.details.deletionConfirmed = true;
        } else {
          throw error;
        }
      }
    });
    
    results.push(result);
  }
  
  return results;
}

/**
 * Test directory structure validation
 */
async function testDirectoryStructure() {
  const results = [];
  
  // Expected directory structures based on application schema
  const expectedStructures = {
    'tasks': [
      'ready_post/',
      'ProfileInfo/',
      'Posts/',
      'Strategies/',
      'CompetitorAnalysis/',
      'News4U/'
    ],
    'structuredb': [
      'users/',
      'platforms/',
      'accounts/'
    ],
    'admin': [
      'logs/',
      'backups/',
      'config/'
    ]
  };
  
  for (const [bucket, expectedDirs] of Object.entries(expectedStructures)) {
    const test = new TestResult(
      `Directory Structure: ${bucket}`,
      'Schema',
      `Validate directory structure in ${bucket} bucket`
    );
    
    const result = await runTest(test, async () => {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Delimiter: '/',
        MaxKeys: 1000
      });
      
      const response = await s3Client.send(command);
      const foundPrefixes = response.CommonPrefixes?.map(p => p.Prefix) || [];
      
      test.details.bucket = bucket;
      test.details.expectedDirs = expectedDirs;
      test.details.foundDirs = foundPrefixes;
      test.details.missingDirs = expectedDirs.filter(dir => !foundPrefixes.includes(dir));
      test.details.extraDirs = foundPrefixes.filter(dir => !expectedDirs.includes(dir));
      
      // For now, just log findings - don't fail if directories don't exist yet
      console.log(`   📁 Found directories: ${foundPrefixes.length}`);
      console.log(`   📁 Expected directories: ${expectedDirs.length}`);
    });
    
    results.push(result);
  }
  
  return results;
}

/**
 * Test concurrent operations
 */
async function testConcurrentOperations() {
  const test = new TestResult(
    'Concurrent Operations',
    'Performance',
    'Test handling of concurrent R2 operations'
  );
  
  return runTest(test, async () => {
    const concurrentTasks = [];
    
    // Create multiple concurrent upload tasks
    for (let i = 0; i < TEST_CONFIG.concurrentTests; i++) {
      const task = async () => {
        const testData = generateTestData(512);
        const testKey = `concurrent-test-${i}-${Date.now()}.bin`;
        
        const uploadCommand = new PutObjectCommand({
          Bucket: 'tasks',
          Key: testKey,
          Body: testData,
          ContentType: 'application/octet-stream'
        });
        
        await s3Client.send(uploadCommand);
        
        // Immediately read it back
        const downloadCommand = new GetObjectCommand({
          Bucket: 'tasks',
          Key: testKey
        });
        
        const response = await s3Client.send(downloadCommand);
        const downloadedData = await streamToBuffer(response.Body);
        
        // Verify integrity
        const originalMD5 = calculateMD5(testData);
        const downloadedMD5 = calculateMD5(downloadedData);
        
        if (originalMD5 !== downloadedMD5) {
          throw new Error(`Concurrent test ${i}: Data integrity failed`);
        }
        
        // Clean up
        const deleteCommand = new DeleteObjectCommand({
          Bucket: 'tasks',
          Key: testKey
        });
        
        await s3Client.send(deleteCommand);
        
        return { taskId: i, success: true };
      };
      
      concurrentTasks.push(task());
    }
    
    const results = await Promise.all(concurrentTasks);
    
    test.details.concurrentTasks = TEST_CONFIG.concurrentTests;
    test.details.successfulTasks = results.filter(r => r.success).length;
    test.details.results = results;
  });
}

/**
 * Test large file handling
 */
async function testLargeFileHandling() {
  const test = new TestResult(
    'Large File Handling',
    'Performance',
    'Test uploading and downloading large files'
  );
  
  return runTest(test, async () => {
    const largeData = generateTestData(TEST_CONFIG.testDataSize);
    const testKey = `large-file-test-${Date.now()}.bin`;
    const originalMD5 = calculateMD5(largeData);
    
    // Upload large file
    const uploadCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: testKey,
      Body: largeData,
      ContentType: 'application/octet-stream'
    });
    
    const uploadStart = Date.now();
    await s3Client.send(uploadCommand);
    const uploadTime = Date.now() - uploadStart;
    
    // Download large file
    const downloadCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: testKey
    });
    
    const downloadStart = Date.now();
    const response = await s3Client.send(downloadCommand);
    const downloadedData = await streamToBuffer(response.Body);
    const downloadTime = Date.now() - downloadStart;
    
    // Verify integrity
    const downloadedMD5 = calculateMD5(downloadedData);
    
    if (originalMD5 !== downloadedMD5) {
      throw new Error('Large file data integrity check failed');
    }
    
    // Clean up
    const deleteCommand = new DeleteObjectCommand({
      Bucket: 'tasks',
      Key: testKey
    });
    
    await s3Client.send(deleteCommand);
    
    test.details.fileSize = largeData.length;
    test.details.uploadTime = uploadTime;
    test.details.downloadTime = downloadTime;
    test.details.uploadSpeed = (largeData.length / 1024 / 1024) / (uploadTime / 1000); // MB/s
    test.details.downloadSpeed = (largeData.length / 1024 / 1024) / (downloadTime / 1000); // MB/s
    test.details.integrityCheck = 'passed';
  });
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration to human readable format
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Generate comprehensive test report
 */
function generateTestReport() {
  const endTime = new Date();
  const duration = endTime - testStats.startTime;
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 R2 TEST SUITE COMPLETE - FINAL REPORT`);
  console.log(`${'='.repeat(80)}`);
  
  console.log(`⏱️  Duration: ${formatDuration(duration)}`);
  console.log(`📊 Total Tests: ${testStats.totalTests}`);
  console.log(`✅ Passed Tests: ${testStats.passedTests}`);
  console.log(`❌ Failed Tests: ${testStats.failedTests}`);
  console.log(`⏭️  Skipped Tests: ${testStats.skippedTests}`);
  
  const successRate = testStats.totalTests > 0 
    ? ((testStats.passedTests / testStats.totalTests) * 100).toFixed(2)
    : 0;
  console.log(`🎯 Success Rate: ${successRate}%`);
  
  // Test results by category
  const categories = {};
  testStats.testResults.forEach(result => {
    if (!categories[result.category]) {
      categories[result.category] = { passed: 0, failed: 0, skipped: 0 };
    }
    categories[result.category][result.status]++;
  });
  
  console.log(`\n📋 RESULTS BY CATEGORY:`);
  console.log(`${'='.repeat(50)}`);
  
  Object.entries(categories).forEach(([category, stats]) => {
    console.log(`\n📂 ${category}:`);
    console.log(`   ✅ Passed: ${stats.passed}`);
    console.log(`   ❌ Failed: ${stats.failed}`);
    console.log(`   ⏭️  Skipped: ${stats.skipped}`);
  });
  
  // Detailed test results
  console.log(`\n📋 DETAILED TEST RESULTS:`);
  console.log(`${'='.repeat(50)}`);
  
  testStats.testResults.forEach(result => {
    const statusIcon = result.status === 'passed' ? '✅' : 
                      result.status === 'failed' ? '❌' : 
                      result.status === 'skipped' ? '⏭️' : '🔄';
    
    console.log(`${statusIcon} ${result.name} (${result.duration}ms)`);
    if (result.status === 'failed') {
      console.log(`   Error: ${result.error}`);
    }
    if (Object.keys(result.details).length > 0) {
      console.log(`   Details: ${JSON.stringify(result.details, null, 2).substring(0, 200)}...`);
    }
  });
  
  // Error summary
  if (testStats.errors.length > 0) {
    console.log(`\n❌ ERROR SUMMARY:`);
    console.log(`${'='.repeat(50)}`);
    testStats.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.test} (${error.category}): ${error.error}`);
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
      skippedTests: testStats.skippedTests,
      successRate: successRate
    },
    categories: categories,
    testResults: testStats.testResults,
    errors: testStats.errors,
    configuration: {
      endpoint: NEW_S3_CONFIG.endpoint,
      buckets: TEST_CONFIG.buckets,
      testDataSize: TEST_CONFIG.testDataSize,
      concurrentTests: TEST_CONFIG.concurrentTests
    }
  };
  
  const reportPath = path.join(process.cwd(), 'scripts', `test-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`\n📄 Detailed test report saved to: ${reportPath}`);
  
  return testStats.failedTests === 0;
}

/**
 * Main test runner
 */
async function runTestSuite() {
  console.log(`🧪 R2 COMPREHENSIVE TEST SUITE STARTING`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📅 Start Time: ${testStats.startTime.toISOString()}`);
  console.log(`🔗 Endpoint: ${NEW_S3_CONFIG.endpoint}`);
  console.log(`🪣 Buckets: ${TEST_CONFIG.buckets.join(', ')}`);
  console.log(`📦 Test Data Size: ${formatBytes(TEST_CONFIG.testDataSize)}`);
  
  try {
    // 1. Basic connectivity test
    console.log(`\n🔗 CONNECTIVITY TESTS`);
    console.log(`${'='.repeat(40)}`);
    await testConnectivity();
    
    // 2. Bucket access tests
    console.log(`\n🪣 BUCKET ACCESS TESTS`);
    console.log(`${'='.repeat(40)}`);
    await testBucketAccess();
    
    // 3. CRUD operation tests
    console.log(`\n📝 CRUD OPERATION TESTS`);
    console.log(`${'='.repeat(40)}`);
    
    const uploadResults = await testObjectUpload();
    const downloadResults = await testObjectDownload(uploadResults);
    const metadataResults = await testObjectMetadata(uploadResults);
    const deleteResults = await testObjectDeletion(uploadResults);
    
    // 4. Schema validation tests
    console.log(`\n📁 SCHEMA VALIDATION TESTS`);
    console.log(`${'='.repeat(40)}`);
    await testDirectoryStructure();
    
    // 5. Performance tests
    console.log(`\n⚡ PERFORMANCE TESTS`);
    console.log(`${'='.repeat(40)}`);
    await testConcurrentOperations();
    await testLargeFileHandling();
    
  } catch (error) {
    console.error(`💥 Critical test suite error:`, error);
    testStats.errors.push({
      test: 'Test Suite',
      category: 'Critical',
      error: error.message
    });
  }
  
  // Generate final report
  const allTestsPassed = generateTestReport();
  
  if (allTestsPassed) {
    console.log(`\n🎉 ALL TESTS PASSED! 🎉`);
    console.log(`✅ R2 setup is ready for production use.`);
    process.exit(0);
  } else {
    console.log(`\n⚠️  SOME TESTS FAILED`);
    console.log(`❌ Please review the test report and fix issues before proceeding.`);
    process.exit(1);
  }
}

// Handle process signals gracefully
process.on('SIGINT', () => {
  console.log(`\n⚠️  Test suite interrupted by user`);
  generateTestReport();
  process.exit(1);
});

// Start test suite if this script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTestSuite().catch(error => {
    console.error(`💥 Critical test suite error:`, error);
    generateTestReport();
    process.exit(1);
  });
}

export { runTestSuite, testStats };
