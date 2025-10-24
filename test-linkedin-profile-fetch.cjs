#!/usr/bin/env node

/**
 * 🔍 COMPREHENSIVE LINKEDIN PROFILE FETCH STRESS TEST
 * 
 * This script performs exhaustive testing to identify why LinkedIn profile data
 * fails to fetch even after processing completes and data exists in R2.
 */

const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const axios = require('axios');

// R2 Configuration (matching server.js)
const R2_ENDPOINT = 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com';
const R2_ACCESS_KEY = '7e15d4a51abb43fff3a7da4a8813044f';
const R2_SECRET_KEY = '8fccd5540c85304347cbbd25d8e1f67776a8473c73c4a8811e83d0970bd461e2';
const BUCKET_NAME = 'tasks';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
});

// Test Configuration
const TEST_USERNAME = 'ziaullaha';
const TEST_PLATFORM = 'linkedin';
const BACKEND_URL = 'http://localhost:3000';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'cyan');
  console.log('='.repeat(80) + '\n');
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * TEST 1: List ALL keys in R2 bucket related to LinkedIn/ziaullaha
 */
async function test1_listAllR2Keys() {
  section('TEST 1: List ALL R2 Keys for LinkedIn/ziaullaha');
  
  const prefixes = [
    'linkedin/ziaullaha/',
    'ProfileInfo/linkedin/ziaullaha',
    'ProfileInfo/linkedin/',
    'AccountInfo/linkedin/ziaullaha',
    'linkedin/',
  ];
  
  for (const prefix of prefixes) {
    try {
      log(`\n🔍 Searching with prefix: "${prefix}"`, 'yellow');
      
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: 100,
      });
      
      const response = await s3Client.send(command);
      
      if (response.Contents && response.Contents.length > 0) {
        log(`✅ Found ${response.Contents.length} objects:`, 'green');
        response.Contents.forEach((obj, idx) => {
          log(`   ${idx + 1}. ${obj.Key} (${obj.Size} bytes, modified: ${obj.LastModified})`, 'blue');
        });
      } else {
        log(`❌ No objects found with prefix "${prefix}"`, 'red');
      }
    } catch (error) {
      log(`❌ Error listing with prefix "${prefix}": ${error.message}`, 'red');
    }
  }
}

/**
 * TEST 2: Try fetching profile with different key patterns
 */
async function test2_tryDifferentKeyPatterns() {
  section('TEST 2: Try Fetching Profile with Different Key Patterns');
  
  const keyPatterns = [
    `${TEST_PLATFORM}/${TEST_USERNAME}/profile.json`,
    `ProfileInfo/${TEST_PLATFORM}/${TEST_USERNAME}.json`,
    `ProfileInfo/${TEST_PLATFORM}/${TEST_USERNAME}/profileinfo.json`,
    `AccountInfo/${TEST_PLATFORM}/${TEST_USERNAME}/info.json`,
    `linkedin_${TEST_USERNAME}_profile.json`,
  ];
  
  for (const key of keyPatterns) {
    try {
      log(`\n🔍 Trying key: "${key}"`, 'yellow');
      
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });
      
      const response = await s3Client.send(command);
      const data = await streamToString(response.Body);
      
      log(`✅ SUCCESS! Found profile data at: ${key}`, 'green');
      log(`📊 Data size: ${data.length} bytes`, 'blue');
      
      // Parse and show structure
      try {
        const parsed = JSON.parse(data);
        log(`📋 Data structure keys: ${Object.keys(parsed).join(', ')}`, 'magenta');
        
        if (parsed.fullName) log(`   - Full Name: ${parsed.fullName}`, 'blue');
        if (parsed.headline) log(`   - Headline: ${parsed.headline}`, 'blue');
        if (parsed.connections) log(`   - Connections: ${parsed.connections}`, 'blue');
        if (parsed.followers) log(`   - Followers: ${parsed.followers}`, 'blue');
      } catch (parseError) {
        log(`⚠️  Could not parse JSON: ${parseError.message}`, 'yellow');
      }
      
      return { success: true, key, data };
    } catch (error) {
      log(`❌ Not found at: ${key} (${error.message})`, 'red');
    }
  }
  
  return { success: false };
}

/**
 * TEST 3: Test backend API endpoint
 */
async function test3_testBackendAPI() {
  section('TEST 3: Test Backend API Endpoint');
  
  const endpoints = [
    `/api/profile-info/${TEST_PLATFORM}/${TEST_USERNAME}`,
    `/profile-info/${TEST_PLATFORM}/${TEST_USERNAME}`,
    `/api/profileinfo/${TEST_USERNAME}?platform=${TEST_PLATFORM}`,
  ];
  
  for (const endpoint of endpoints) {
    try {
      log(`\n🔍 Testing endpoint: ${BACKEND_URL}${endpoint}`, 'yellow');
      
      const startTime = Date.now();
      const response = await axios.get(`${BACKEND_URL}${endpoint}`, {
        timeout: 10000,
        validateStatus: () => true, // Don't throw on any status
      });
      const duration = Date.now() - startTime;
      
      if (response.status === 200) {
        log(`✅ SUCCESS! Status: ${response.status} (${duration}ms)`, 'green');
        log(`📊 Response data keys: ${Object.keys(response.data).join(', ')}`, 'blue');
        
        if (response.data.fullName) log(`   - Full Name: ${response.data.fullName}`, 'blue');
        if (response.data.headline) log(`   - Headline: ${response.data.headline}`, 'blue');
        if (response.data.followersCount) log(`   - Followers: ${response.data.followersCount}`, 'blue');
      } else {
        log(`❌ Failed! Status: ${response.status} (${duration}ms)`, 'red');
        log(`   Error: ${JSON.stringify(response.data)}`, 'red');
      }
    } catch (error) {
      log(`❌ Request failed: ${error.message}`, 'red');
    }
  }
}

/**
 * TEST 4: Check local cache files
 */
async function test4_checkLocalCache() {
  section('TEST 4: Check Local Cache Files');
  
  const fs = require('fs');
  const path = require('path');
  
  const cacheDir = path.join(__dirname, 'data', 'cache');
  const expectedFile = `${TEST_PLATFORM}_${TEST_USERNAME}_profile.json`;
  const fullPath = path.join(cacheDir, expectedFile);
  
  log(`🔍 Checking for cache file: ${fullPath}`, 'yellow');
  
  if (fs.existsSync(fullPath)) {
    log(`✅ Cache file exists!`, 'green');
    
    try {
      const data = fs.readFileSync(fullPath, 'utf-8');
      const parsed = JSON.parse(data);
      
      log(`📊 Cache file size: ${data.length} bytes`, 'blue');
      log(`📋 Data structure keys: ${Object.keys(parsed).join(', ')}`, 'magenta');
    } catch (error) {
      log(`❌ Error reading cache file: ${error.message}`, 'red');
    }
  } else {
    log(`❌ Cache file does NOT exist`, 'red');
    
    // List what's actually in the cache directory
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      log(`\n📁 Files in cache directory (${files.length} total):`, 'yellow');
      files.forEach((file, idx) => {
        log(`   ${idx + 1}. ${file}`, 'blue');
      });
    } else {
      log(`❌ Cache directory does not exist: ${cacheDir}`, 'red');
    }
  }
}

/**
 * TEST 5: Verify R2 key pattern used by backend
 */
async function test5_verifyBackendKeyPattern() {
  section('TEST 5: Verify Backend Key Pattern Logic');
  
  log('Backend code uses this key pattern:', 'yellow');
  log(`   const r2Key = \`\${platform}/\${username}/profile.json\`;`, 'blue');
  log(`   Expected key: "${TEST_PLATFORM}/${TEST_USERNAME}/profile.json"`, 'magenta');
  
  // Now check if this exact key exists
  try {
    const expectedKey = `${TEST_PLATFORM}/${TEST_USERNAME}/profile.json`;
    log(`\n🔍 Checking if exact key exists: "${expectedKey}"`, 'yellow');
    
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: expectedKey,
    });
    
    const response = await s3Client.send(command);
    const data = await streamToString(response.Body);
    
    log(`✅ KEY EXISTS! Backend should be able to fetch this!`, 'green');
    log(`📊 Data size: ${data.length} bytes`, 'blue');
    
    return { exists: true, key: expectedKey, data };
  } catch (error) {
    log(`❌ Key does NOT exist: ${error.message}`, 'red');
    log(`\n🔧 This is the ROOT CAUSE! Backend expects this key but it doesn't exist.`, 'red');
    return { exists: false };
  }
}

/**
 * TEST 6: Check processing status
 */
async function test6_checkProcessingStatus() {
  section('TEST 6: Check Processing Status');
  
  try {
    const userId = 'HxiBWT2egCVtWtloIA5rLZz3rNr1'; // From terminal logs
    log(`🔍 Checking processing status for user: ${userId}`, 'yellow');
    
    const response = await axios.get(`${BACKEND_URL}/api/processing-status/${userId}`, {
      timeout: 5000,
      validateStatus: () => true,
    });
    
    if (response.status === 200) {
      log(`✅ Processing status retrieved`, 'green');
      log(`📊 Status data: ${JSON.stringify(response.data, null, 2)}`, 'blue');
    } else {
      log(`❌ Failed to get processing status: ${response.status}`, 'red');
    }
  } catch (error) {
    log(`❌ Error checking processing status: ${error.message}`, 'red');
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  log('\n🚀 STARTING COMPREHENSIVE LINKEDIN PROFILE FETCH STRESS TEST', 'green');
  log(`   Platform: ${TEST_PLATFORM}`, 'blue');
  log(`   Username: ${TEST_USERNAME}`, 'blue');
  log(`   Backend: ${BACKEND_URL}`, 'blue');
  
  try {
    await test1_listAllR2Keys();
    await test2_tryDifferentKeyPatterns();
    await test5_verifyBackendKeyPattern();
    await test4_checkLocalCache();
    await test3_testBackendAPI();
    await test6_checkProcessingStatus();
    
    section('🎯 TEST SUMMARY & ROOT CAUSE ANALYSIS');
    log('All tests completed. Review the output above to identify:', 'yellow');
    log('1. ✅ Which R2 keys actually exist for this LinkedIn profile', 'blue');
    log('2. ❌ Which key pattern the backend is trying to use', 'blue');
    log('3. 🔧 The mismatch between expected and actual key patterns', 'blue');
    log('4. 💡 The exact fix needed to resolve the 404 errors', 'blue');
    
  } catch (error) {
    log(`\n❌ FATAL ERROR: ${error.message}`, 'red');
    console.error(error);
  }
}

// Run tests
runAllTests().catch(console.error);
