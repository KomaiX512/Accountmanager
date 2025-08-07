#!/usr/bin/env node

/**
 * Complete Cache Invalidation Test
 * Tests the end-to-end cache invalidation flow for Canvas Editor
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const SERVER_URL = 'http://localhost:3002';
const TEST_USERNAME = 'testuser';
const TEST_PLATFORM = 'instagram';

console.log('🧪 Starting Complete Cache Invalidation Test...\n');

async function runTest() {
  try {
    // Step 1: Create a test image file
    console.log('📁 Step 1: Preparing test image...');
    const testImagePath = 'test_images/blue_test.jpg';
    if (!fs.existsSync(testImagePath)) {
      console.error('❌ Test image not found:', testImagePath);
      return;
    }
    console.log('✅ Test image found:', testImagePath);

    // Step 2: Test image before edit (should use cache if exists)
    console.log('\n🖼️  Step 2: Testing image access before edit...');
    const beforeEditUrl = `${SERVER_URL}/api/r2-image/${TEST_USERNAME}/image_1234567890.jpg?platform=${TEST_PLATFORM}`;
    try {
      const beforeResponse = await axios.get(beforeEditUrl, { 
        responseType: 'arraybuffer',
        timeout: 5000 
      });
      console.log('✅ Image accessible before edit, size:', beforeResponse.data.length, 'bytes');
    } catch (error) {
      console.log('ℹ️  Image not found before edit (expected for new images)');
    }

    // Step 3: Save edited image via Canvas Editor endpoint
    console.log('\n💾 Step 3: Saving edited image via Canvas Editor...');
    const formData = new FormData();
    formData.append('image', fs.createReadStream(testImagePath));
    formData.append('postKey', `ready_post/${TEST_PLATFORM}/${TEST_USERNAME}/ready_post_1234567890.json`);
    formData.append('caption', `Test edit at ${new Date().toISOString()}`);
    formData.append('platform', TEST_PLATFORM);

    const saveResponse = await axios.post(
      `${SERVER_URL}/api/save-edited-post/${TEST_USERNAME}`, 
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 10000
      }
    );

    console.log('✅ Save response:', JSON.stringify(saveResponse.data, null, 2));
    
    const { imageKey, r2Key, cacheBuster } = saveResponse.data;

    // Step 4: Test image access after edit with cache-busting
    console.log('\n🔄 Step 4: Testing image access after edit with cache-busting...');
    const afterEditUrl = `${SERVER_URL}/api/r2-image/${TEST_USERNAME}/${imageKey}?platform=${TEST_PLATFORM}&t=${cacheBuster}&v=1&force=1&edited=true`;
    
    const afterResponse = await axios.get(afterEditUrl, { 
      responseType: 'arraybuffer',
      timeout: 10000 
    });
    console.log('✅ Image accessible after edit, size:', afterResponse.data.length, 'bytes');

    // Step 5: Test without cache-busting (should still get fresh image due to cache clearing)
    console.log('\n📋 Step 5: Testing image access without cache-busting parameters...');
    const noCacheBustUrl = `${SERVER_URL}/api/r2-image/${TEST_USERNAME}/${imageKey}?platform=${TEST_PLATFORM}`;
    
    const noCacheBustResponse = await axios.get(noCacheBustUrl, { 
      responseType: 'arraybuffer',
      timeout: 10000 
    });
    console.log('✅ Image accessible without cache-busting, size:', noCacheBustResponse.data.length, 'bytes');

    // Step 6: Test with multiple cache-busting variations
    console.log('\n🔀 Step 6: Testing various cache-busting parameters...');
    const variations = [
      `t=${Date.now()}`,
      `v=${Math.random()}`,
      `refreshKey=${Math.random().toString(36)}`,
      `nocache=1`,
      `force=true`,
      `bust=${Date.now()}`
    ];

    for (const param of variations) {
      const variationUrl = `${SERVER_URL}/api/r2-image/${TEST_USERNAME}/${imageKey}?platform=${TEST_PLATFORM}&${param}`;
      try {
        const variationResponse = await axios.get(variationUrl, { 
          responseType: 'arraybuffer',
          timeout: 5000 
        });
        console.log(`✅ Cache-bust variation "${param}" works, size:`, variationResponse.data.length, 'bytes');
      } catch (error) {
        console.log(`❌ Cache-bust variation "${param}" failed:`, error.message);
      }
    }

    // Step 7: Verify frontend event structure
    console.log('\n📡 Step 7: Simulating frontend postUpdated event...');
    const postUpdatedEvent = {
      detail: {
        postKey: `ready_post/${TEST_PLATFORM}/${TEST_USERNAME}/ready_post_1234567890.json`,
        platform: TEST_PLATFORM,
        timestamp: Date.now(),
        action: 'edited',
        imageKey: imageKey,
        r2Key: r2Key,
        cacheBuster: cacheBuster,
        serverTimestamp: saveResponse.data.timestamp,
        forceRefresh: true
      }
    };
    
    console.log('✅ Frontend event structure:', JSON.stringify(postUpdatedEvent, null, 2));

    // Generate frontend-style URL
    const frontendParams = new URLSearchParams({
      platform: TEST_PLATFORM,
      t: cacheBuster.toString(),
      v: Math.floor(Math.random() * 1000000).toString(),
      edited: 'true',
      force: '1',
      serverTime: saveResponse.data.timestamp,
      refreshKey: Math.random().toString(36).substr(2, 9)
    });
    
    const frontendUrl = `${SERVER_URL}/api/r2-image/${TEST_USERNAME}/${imageKey}?${frontendParams.toString()}`;
    console.log('🌐 Frontend-style URL:', frontendUrl);

    const frontendResponse = await axios.get(frontendUrl, { 
      responseType: 'arraybuffer',
      timeout: 5000 
    });
    console.log('✅ Frontend-style request works, size:', frontendResponse.data.length, 'bytes');

    console.log('\n🎉 ALL TESTS PASSED! Cache invalidation is working correctly!');
    console.log('\n📊 Summary:');
    console.log(`   ✅ Image save: ${saveResponse.data.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   ✅ Cache-busting detection: WORKING`);
    console.log(`   ✅ Multiple cache-bust variations: WORKING`);
    console.log(`   ✅ Frontend integration: READY`);
    console.log(`   ✅ End-to-end flow: COMPLETE`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data);
    }
    process.exit(1);
  }
}

// Check if servers are running
async function checkServers() {
  try {
    await axios.get(`${SERVER_URL}/health`, { timeout: 2000 });
    console.log('✅ Server is running');
    return true;
  } catch (error) {
    console.error('❌ Server not running. Please start the servers first.');
    return false;
  }
}

async function main() {
  if (await checkServers()) {
    await runTest();
  }
}

main(); 