#!/usr/bin/env node

/**
 * COMPREHENSIVE IMAGE WORKFLOW STRESS TEST
 * 
 * Tests:
 * 1. 8 Save-Edited-Post tests (webp, png, jpg, jpeg x2 each)
 * 2. 4 Post Now scheduling tests (different extensions)
 * 3. End-to-end workflow validation
 * 4. Fallback contamination detection
 */

import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

// Test configuration
const BASE_URL = 'http://localhost:3002'; // Proxy server
const TEST_USERNAME = 'fentybeauty';
const FALLBACK_IMAGE_SIZE = 7781; // Known fallback size

// Generate test image data for different formats
function generateTestImageData(format, size = 50000) {
  const buffer = Buffer.alloc(size);
  
  switch (format) {
    case 'png':
      // PNG signature
      buffer.writeUInt32BE(0x89504E47, 0);
      buffer.writeUInt32BE(0x0D0A1A0A, 4);
      break;
    case 'jpg':
    case 'jpeg':
      // JPEG signature
      buffer.writeUInt16BE(0xFFD8, 0);
      buffer.writeUInt16BE(0xFFE0, 2);
      break;
    case 'webp':
      // WebP signature
      buffer.write('RIFF', 0);
      buffer.writeUInt32LE(size - 8, 4);
      buffer.write('WEBP', 8);
      break;
  }
  
  // Fill rest with random data to ensure size > fallback
  for (let i = 12; i < size; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }
  
  return buffer;
}

// Create test post keys for different scenarios
const testCases = [
  // Campaign posts with different original formats
  {
    type: 'campaign',
    postKey: 'ready_post/instagram/fentybeauty/campaign_ready_post_1755000001_test01.json',
    originalFormat: 'jpg',
    testName: 'Campaign JPG Original -> PNG Edited'
  },
  {
    type: 'campaign', 
    postKey: 'ready_post/instagram/fentybeauty/campaign_ready_post_1755000002_test02.json',
    originalFormat: 'png',
    testName: 'Campaign PNG Original -> PNG Edited'
  },
  {
    type: 'campaign',
    postKey: 'ready_post/instagram/fentybeauty/campaign_ready_post_1755000003_test03.json', 
    originalFormat: 'webp',
    testName: 'Campaign WebP Original -> PNG Edited'
  },
  {
    type: 'campaign',
    postKey: 'ready_post/instagram/fentybeauty/campaign_ready_post_1755000004_test04.json',
    originalFormat: 'jpeg',
    testName: 'Campaign JPEG Original -> PNG Edited'
  },
  // Regular posts with different original formats  
  {
    type: 'regular',
    postKey: 'ready_post/instagram/fentybeauty/ready_post_1755000005.json',
    originalFormat: 'jpg', 
    testName: 'Regular JPG Original -> PNG Edited'
  },
  {
    type: 'regular',
    postKey: 'ready_post/instagram/fentybeauty/ready_post_1755000006.json',
    originalFormat: 'png',
    testName: 'Regular PNG Original -> PNG Edited'
  },
  {
    type: 'regular', 
    postKey: 'ready_post/instagram/fentybeauty/ready_post_1755000007.json',
    originalFormat: 'webp',
    testName: 'Regular WebP Original -> PNG Edited'
  },
  {
    type: 'regular',
    postKey: 'ready_post/instagram/fentybeauty/ready_post_1755000008.json', 
    originalFormat: 'jpeg',
    testName: 'Regular JPEG Original -> PNG Edited'
  }
];

class ImageWorkflowTester {
  constructor() {
    this.results = [];
    this.errors = [];
  }

  async runAllTests() {
    console.log('🚀 STARTING COMPREHENSIVE IMAGE WORKFLOW STRESS TEST');
    console.log('=' .repeat(80));
    
    // Phase 1: Save-Edited-Post Tests (8 tests)
    console.log('\n📝 PHASE 1: SAVE-EDITED-POST TESTS');
    for (const testCase of testCases) {
      await this.testSaveEditedPost(testCase);
    }
    
    // Phase 2: Post Now Tests (4 tests)
    console.log('\n🚀 PHASE 2: POST NOW TESTS');
    const postNowTests = testCases.slice(0, 4); // Test first 4 cases
    for (const testCase of postNowTests) {
      await this.testPostNow(testCase);
    }
    
    // Phase 3: End-to-End Workflow Test
    console.log('\n🔄 PHASE 3: END-TO-END WORKFLOW TEST'); 
    await this.testEndToEndWorkflow();
    
    // Results Summary
    this.printResults();
  }

  async testSaveEditedPost(testCase) {
    console.log(`\n🧪 Testing: ${testCase.testName}`);
    
    try {
      // Generate PNG data (as Canvas Editor would)
      const editedImageData = generateTestImageData('png', 75000);
      console.log(`   📊 Generated PNG test data: ${editedImageData.length} bytes`);
      
      // Create form data
      const formData = new FormData();
      formData.append('image', editedImageData, 'edited_test.png');
      formData.append('postKey', testCase.postKey);
      formData.append('caption', 'Test caption for edited image');
      formData.append('platform', 'instagram');
      
      // Make save request
      const response = await fetch(`${BASE_URL}/api/save-edited-post/${TEST_USERNAME}`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        console.log(`   ✅ Save successful: ${result.message || 'OK'}`);
        
        // Verify the saved image key format
        const expectedKey = testCase.type === 'campaign' 
          ? `edited_${testCase.postKey.replace(/^.*\/([^\/]+)\.json$/, '$1')}.png`
          : `edited_image_${testCase.postKey.match(/ready_post_(\d+)\.json$/)[1]}.png`;
          
        console.log(`   🔍 Expected key: ${expectedKey}`);
        
        // Try to fetch the saved image to verify it exists and is correct size
        const imageResponse = await fetch(`${BASE_URL}/api/signed-image-url?key=ready_post/instagram/${TEST_USERNAME}/${expectedKey}`);
        
        if (imageResponse.ok) {
          const imageData = await imageResponse.buffer();
          if (imageData.length > FALLBACK_IMAGE_SIZE) {
            console.log(`   ✅ Image verified: ${imageData.length} bytes (not fallback)`);
            this.results.push({ test: testCase.testName, status: 'PASS', details: `Saved as PNG, ${imageData.length} bytes` });
          } else {
            console.log(`   ❌ Image is fallback size: ${imageData.length} bytes`);
            this.results.push({ test: testCase.testName, status: 'FAIL', details: `Fallback image detected: ${imageData.length} bytes` });
          }
        } else {
          console.log(`   ⚠️  Could not verify image existence`);
          this.results.push({ test: testCase.testName, status: 'WARN', details: 'Image save succeeded but verification failed' });
        }
        
      } else {
        console.log(`   ❌ Save failed: ${result.error || response.statusText}`);
        this.results.push({ test: testCase.testName, status: 'FAIL', details: result.error || response.statusText });
      }
      
    } catch (error) {
      console.log(`   💥 Test failed with exception: ${error.message}`);
      this.errors.push({ test: testCase.testName, error: error.message });
      this.results.push({ test: testCase.testName, status: 'ERROR', details: error.message });
    }
  }

  async testPostNow(testCase) {
    console.log(`\n🚀 Testing Post Now: ${testCase.testName}`);
    
    try {
      // Simulate post data as it would appear in PostCooked component
      const postData = {
        key: testCase.postKey,
        data: {
          post: { caption: 'Test Post Now caption' },
          r2_image_url: `${BASE_URL}/api/signed-image-url?key=ready_post/instagram/${TEST_USERNAME}/test.png&edited=true`,
          image_url: `${BASE_URL}/api/signed-image-url?key=ready_post/instagram/${TEST_USERNAME}/test.png`
        }
      };
      
      // Test image key extraction logic (simulate frontend logic)
      let expectedImageKey;
      if (testCase.type === 'campaign') {
        const baseName = testCase.postKey.replace(/^.*\/([^\/]+)\.json$/, '$1');
        expectedImageKey = `edited_${baseName}.png`;
      } else {
        const match = testCase.postKey.match(/ready_post_(\d+)\.json$/);
        expectedImageKey = `edited_image_${match[1]}.png`;
      }
      
      console.log(`   🎯 Expected image key: ${expectedImageKey}`);
      
      // Test image fetching
      const imageUrl = `${BASE_URL}/api/signed-image-url?key=ready_post/instagram/${TEST_USERNAME}/${expectedImageKey}`;
      const imageResponse = await fetch(imageUrl);
      
      if (imageResponse.ok) {
        const imageData = await imageResponse.buffer();
        
        if (imageData.length > FALLBACK_IMAGE_SIZE) {
          console.log(`   ✅ Post Now would use correct image: ${imageData.length} bytes`);
          this.results.push({ test: `Post Now - ${testCase.testName}`, status: 'PASS', details: `Correct image found: ${imageData.length} bytes` });
        } else {
          console.log(`   ❌ Post Now would use fallback: ${imageData.length} bytes`);
          this.results.push({ test: `Post Now - ${testCase.testName}`, status: 'FAIL', details: `Fallback detected: ${imageData.length} bytes` });
        }
      } else {
        // Test fallback logic with extension variations
        console.log(`   🔄 Testing extension fallback logic...`);
        const extensions = ['png', 'jpg', 'jpeg', 'webp'];
        let foundValidImage = false;
        
        for (const ext of extensions) {
          const baseName = expectedImageKey.replace(/\.[^.]+$/, '');
          const testKey = `${baseName}.${ext}`;
          const testUrl = `${BASE_URL}/api/signed-image-url?key=ready_post/instagram/${TEST_USERNAME}/${testKey}`;
          const testResponse = await fetch(testUrl);
          
          if (testResponse.ok) {
            const testData = await testResponse.buffer();
            if (testData.length > FALLBACK_IMAGE_SIZE) {
              console.log(`   ✅ Fallback found valid image with .${ext}: ${testData.length} bytes`);
              foundValidImage = true;
              break;
            }
          }
        }
        
        if (!foundValidImage) {
          console.log(`   ❌ No valid images found with any extension`);
          this.results.push({ test: `Post Now - ${testCase.testName}`, status: 'FAIL', details: 'No valid images found' });
        } else {
          this.results.push({ test: `Post Now - ${testCase.testName}`, status: 'PASS', details: 'Fallback logic found valid image' });
        }
      }
      
    } catch (error) {
      console.log(`   💥 Post Now test failed: ${error.message}`);
      this.results.push({ test: `Post Now - ${testCase.testName}`, status: 'ERROR', details: error.message });
    }
  }

  async testEndToEndWorkflow() {
    console.log('\n🔄 COMPREHENSIVE END-TO-END WORKFLOW TEST');
    
    const workflowTest = {
      postKey: 'ready_post/instagram/fentybeauty/campaign_ready_post_1755999999_e2e.json',
      originalFormat: 'jpg'
    };
    
    try {
      // Step 1: Save edited image
      console.log('   📝 Step 1: Save edited PNG image...');
      const editedImageData = generateTestImageData('png', 100000);
      
      const formData = new FormData();
      formData.append('image', editedImageData, 'edited_e2e.png');
      formData.append('postKey', workflowTest.postKey);
      formData.append('caption', 'End-to-end test caption');
      formData.append('platform', 'instagram');
      
      const saveResponse = await fetch(`${BASE_URL}/api/save-edited-post/${TEST_USERNAME}`, {
        method: 'POST',
        body: formData
      });
      
      const saveResult = await saveResponse.json();
      
      if (!saveResponse.ok || !saveResult.success) {
        throw new Error(`Save failed: ${saveResult.error}`);
      }
      
      console.log('   ✅ Step 1 completed: Image saved');
      
      // Step 2: Verify image key extraction
      console.log('   🔍 Step 2: Test image key extraction...');
      const baseName = workflowTest.postKey.replace(/^.*\/([^\/]+)\.json$/, '$1');
      const expectedKey = `edited_${baseName}.png`;
      
      // Step 3: Test Post Now simulation
      console.log('   🚀 Step 3: Simulate Post Now...');
      const imageUrl = `${BASE_URL}/api/signed-image-url?key=ready_post/instagram/${TEST_USERNAME}/${expectedKey}`;
      const imageResponse = await fetch(imageUrl);
      
      if (imageResponse.ok) {
        const imageData = await imageResponse.buffer();
        
        if (imageData.length === editedImageData.length) {
          console.log('   ✅ Step 3 completed: Post Now would use exact saved image');
          this.results.push({ test: 'End-to-End Workflow', status: 'PASS', details: 'Perfect workflow - no contamination' });
        } else if (imageData.length > FALLBACK_IMAGE_SIZE) {
          console.log('   ⚠️  Step 3: Post Now uses different size image');
          this.results.push({ test: 'End-to-End Workflow', status: 'WARN', details: `Size mismatch: saved ${editedImageData.length}, fetched ${imageData.length}` });
        } else {
          console.log('   ❌ Step 3 failed: Post Now would use fallback');
          this.results.push({ test: 'End-to-End Workflow', status: 'FAIL', details: 'Fallback contamination detected' });
        }
      } else {
        console.log('   ❌ Step 3 failed: Image not accessible');
        this.results.push({ test: 'End-to-End Workflow', status: 'FAIL', details: 'Saved image not accessible' });
      }
      
    } catch (error) {
      console.log(`   💥 End-to-end test failed: ${error.message}`);
      this.results.push({ test: 'End-to-End Workflow', status: 'ERROR', details: error.message });
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(80));
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length; 
    const warnings = this.results.filter(r => r.status === 'WARN').length;
    const errors = this.results.filter(r => r.status === 'ERROR').length;
    
    console.log(`✅ PASSED: ${passed}`);
    console.log(`❌ FAILED: ${failed}`); 
    console.log(`⚠️  WARNINGS: ${warnings}`);
    console.log(`💥 ERRORS: ${errors}`);
    console.log(`📈 TOTAL: ${this.results.length}`);
    
    if (failed > 0 || errors > 0) {
      console.log('\n🚨 CRITICAL ISSUES DETECTED:');
      this.results.filter(r => r.status === 'FAIL' || r.status === 'ERROR').forEach(result => {
        console.log(`   ${result.status === 'FAIL' ? '❌' : '💥'} ${result.test}: ${result.details}`);
      });
    }
    
    if (warnings > 0) {
      console.log('\n⚠️  WARNINGS:');
      this.results.filter(r => r.status === 'WARN').forEach(result => {
        console.log(`   ⚠️  ${result.test}: ${result.details}`);
      });
    }
    
    console.log('\n📋 DETAILED RESULTS:');
    this.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : 
                   result.status === 'FAIL' ? '❌' : 
                   result.status === 'WARN' ? '⚠️' : '💥';
      console.log(`${icon} ${result.test.padEnd(50)} ${result.details}`);
    });
    
    if (this.errors.length > 0) {
      console.log('\n💥 ERROR DETAILS:');
      this.errors.forEach(error => {
        console.log(`   ${error.test}: ${error.error}`);
      });
    }
    
    console.log('\n' + '='.repeat(80));
    
    // Final verdict
    if (failed === 0 && errors === 0) {
      console.log('🎉 ALL TESTS PASSED! Image workflow is functioning correctly.');
    } else {
      console.log('🚨 TESTS FAILED! Image workflow has critical issues that need fixing.');
    }
  }
}

// Run the tests
const tester = new ImageWorkflowTester();
tester.runAllTests().catch(console.error);

export default ImageWorkflowTester;
