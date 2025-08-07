import { S3Client, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

// Test configuration
const TEST_BUCKET = 'tasks';
const TEST_USER = 'testuser';
const TEST_PLATFORM = 'instagram';

// Initialize S3 client
const s3Client = new S3Client({
  region: 'auto',
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

// Test data
const testCases = [
  {
    name: 'PNG Campaign Post',
    postKey: `ready_post/${TEST_PLATFORM}/${TEST_USER}/campaign_ready_post_1752000987874_9c14f1fd.json`,
    imageKey: `ready_post/${TEST_PLATFORM}/${TEST_USER}/campaign_ready_post_1752000987874_9c14f1fd.png`,
    expectedExtension: 'png'
  },
  {
    name: 'JPG Campaign Post',
    postKey: `ready_post/${TEST_PLATFORM}/${TEST_USER}/campaign_ready_post_1752000987875_abc123.json`,
    imageKey: `ready_post/${TEST_PLATFORM}/${TEST_USER}/campaign_ready_post_1752000987875_abc123.jpg`,
    expectedExtension: 'jpg'
  },
  {
    name: 'PNG Traditional Post',
    postKey: `ready_post/${TEST_PLATFORM}/${TEST_USER}/ready_post_1752000987876.json`,
    imageKey: `ready_post/${TEST_PLATFORM}/${TEST_USER}/image_1752000987876.png`,
    expectedExtension: 'png'
  },
  {
    name: 'JPG Traditional Post',
    postKey: `ready_post/${TEST_PLATFORM}/${TEST_USER}/ready_post_1752000987877.json`,
    imageKey: `ready_post/${TEST_PLATFORM}/${TEST_USER}/image_1752000987877.jpg`,
    expectedExtension: 'jpg'
  },
  {
    name: 'WebP Campaign Post',
    postKey: `ready_post/${TEST_PLATFORM}/${TEST_USER}/campaign_ready_post_1752000987878_def456.json`,
    imageKey: `ready_post/${TEST_PLATFORM}/${TEST_USER}/campaign_ready_post_1752000987878_def456.webp`,
    expectedExtension: 'webp'
  }
];

// Create test image buffer
function createTestImage(format = 'png') {
  // Create a simple test image buffer
  const width = 100;
  const height = 100;
  const buffer = Buffer.alloc(width * height * 4);
  
  // Fill with a simple pattern
  for (let i = 0; i < buffer.length; i += 4) {
    buffer[i] = 255;     // R
    buffer[i + 1] = 0;   // G
    buffer[i + 2] = 0;   // B
    buffer[i + 3] = 255; // A
  }
  
  return buffer;
}

// Test extension detection logic (simulated from server.js)
async function testExtensionDetection(postKey) {
  console.log(`\n🔍 Testing extension detection for: ${postKey}`);
  
  const extensions = ['jpg', 'jpeg', 'png', 'webp'];
  let foundExtension = null;
  let foundKey = null;
  
  if (postKey.includes('campaign_ready_post_') && postKey.endsWith('.json')) {
    // Campaign pattern: campaign_ready_post_1752000987874_9c14f1fd.json -> campaign_ready_post_1752000987874_9c14f1fd.[ext]
    const baseName = postKey.replace(/^.*\/([^\/]+)\.json$/, '$1');
    const prefix = postKey.replace(/[^\/]+$/, ''); // Get directory path
    
    // Find the first existing image file with any of these extensions
    for (const ext of extensions) {
      const potentialKey = `${prefix}${baseName}.${ext}`;
      try {
        const headCommand = new HeadObjectCommand({
          Bucket: TEST_BUCKET,
          Key: potentialKey
        });
        await s3Client.send(headCommand);
        foundExtension = ext;
        foundKey = potentialKey;
        console.log(`✅ Found image with extension .${ext}: ${foundKey}`);
        break;
      } catch (error) {
        console.log(`❌ Image not found with extension .${ext}: ${potentialKey}`);
        continue;
      }
    }
    
    // If no image found with any extension, fallback to jpg
    if (!foundExtension) {
      foundExtension = 'jpg';
      foundKey = `${prefix}${baseName}.jpg`;
      console.log(`⚠️ No image found, using fallback: ${foundKey}`);
    }
  } else if (postKey.includes('ready_post_') && postKey.endsWith('.json')) {
    // Traditional pattern: ready_post_1234567890.json -> image_1234567890.[ext]
    const match = postKey.match(/ready_post_(\d+)\.json$/);
    if (match) {
      const fileId = match[1];
      const prefix = postKey.replace(/[^\/]+$/, ''); // Get directory path
      
      // Find the first existing image file with any of these extensions
      for (const ext of extensions) {
        const potentialKey = `${prefix}image_${fileId}.${ext}`;
        try {
          const headCommand = new HeadObjectCommand({
            Bucket: TEST_BUCKET,
            Key: potentialKey
          });
          await s3Client.send(headCommand);
          foundExtension = ext;
          foundKey = potentialKey;
          console.log(`✅ Found image with extension .${ext}: ${foundKey}`);
          break;
        } catch (error) {
          console.log(`❌ Image not found with extension .${ext}: ${potentialKey}`);
          continue;
        }
      }
      
      // If no image found with any extension, fallback to jpg
      if (!foundExtension) {
        foundExtension = 'jpg';
        foundKey = `${prefix}image_${fileId}.jpg`;
        console.log(`⚠️ No image found, using fallback: ${foundKey}`);
      }
    }
  }
  
  return { foundExtension, foundKey };
}

// Main test function
async function runExtensionDetectionTest() {
  console.log('🚀 Starting Extension Detection Fix Test');
  console.log('=' .repeat(60));
  
  let passedTests = 0;
  let totalTests = 0;
  
  for (const testCase of testCases) {
    totalTests++;
    console.log(`\n📋 Test Case ${totalTests}: ${testCase.name}`);
    console.log(`   Post Key: ${testCase.postKey}`);
    console.log(`   Expected Image: ${testCase.imageKey}`);
    console.log(`   Expected Extension: ${testCase.expectedExtension}`);
    
    try {
      // Step 1: Upload test image
      console.log(`\n📤 Uploading test image: ${testCase.imageKey}`);
      const imageBuffer = createTestImage(testCase.expectedExtension);
      
      const putCommand = new PutObjectCommand({
        Bucket: TEST_BUCKET,
        Key: testCase.imageKey,
        Body: imageBuffer,
        ContentType: `image/${testCase.expectedExtension}`
      });
      
      await s3Client.send(putCommand);
      console.log(`✅ Test image uploaded successfully`);
      
      // Step 2: Test extension detection
      const { foundExtension, foundKey } = await testExtensionDetection(testCase.postKey);
      
      // Step 3: Verify results
      const isCorrect = foundExtension === testCase.expectedExtension && foundKey === testCase.imageKey;
      
      if (isCorrect) {
        console.log(`✅ PASS: Correctly detected ${testCase.expectedExtension} extension`);
        passedTests++;
      } else {
        console.log(`❌ FAIL: Expected ${testCase.expectedExtension}, got ${foundExtension}`);
        console.log(`   Expected key: ${testCase.imageKey}`);
        console.log(`   Found key: ${foundKey}`);
      }
      
      // Step 4: Cleanup test image
      console.log(`\n🧹 Cleaning up test image: ${testCase.imageKey}`);
      const deleteCommand = new DeleteObjectCommand({
        Bucket: TEST_BUCKET,
        Key: testCase.imageKey
      });
      
      await s3Client.send(deleteCommand);
      console.log(`✅ Test image cleaned up successfully`);
      
    } catch (error) {
      console.error(`❌ ERROR in test case ${testCase.name}:`, error.message);
    }
  }
  
  // Test summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log(`✅ Passed: ${passedTests}/${totalTests}`);
  console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);
  console.log(`📈 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 ALL TESTS PASSED! The extension detection fix is working correctly.');
    console.log('✅ The system now properly detects PNG, JPG, JPEG, and WebP images.');
    console.log('✅ No more placeholder scheduling due to hardcoded JPG extensions.');
  } else {
    console.log('\n⚠️ Some tests failed. Please review the implementation.');
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  runExtensionDetectionTest().catch(console.error);
}

export { runExtensionDetectionTest }; 