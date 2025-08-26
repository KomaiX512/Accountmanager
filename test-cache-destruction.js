/**
 * 🚀 NUCLEAR CACHE DESTRUCTION TEST SCRIPT
 * 
 * This script tests our comprehensive cache clearing system
 * Use this to validate that ALL cache sources are eliminated
 */

const axios = require('axios');

const PROXY_SERVER_URL = 'http://localhost:3002';
const TEST_CONFIG = {
  platform: 'instagram',
  username: 'fentybeauty',
  imageKey: 'image_1755732953733.jpg' // Use an actual image from your data
};

async function testCacheDestruction() {
  console.log('🚀 STARTING NUCLEAR CACHE DESTRUCTION TEST');
  console.log('=' .repeat(60));
  
  const { platform, username, imageKey } = TEST_CONFIG;
  
  try {
    // Step 1: Inspect cache before destruction
    console.log('\n📊 STEP 1: Inspecting cache BEFORE destruction...');
    try {
      const inspectResponse = await axios.get(
        `${PROXY_SERVER_URL}/admin/inspect-cache/${platform}/${username}/${imageKey}`
      );
      console.log('Cache inspection BEFORE:', JSON.stringify(inspectResponse.data, null, 2));
    } catch (inspectError) {
      console.log('Cache inspection failed (this is normal):', inspectError.message);
    }
    
    // Step 2: Request the image to populate cache
    console.log('\n📥 STEP 2: Requesting image to populate cache...');
    try {
      const imageResponse = await axios.get(
        `${PROXY_SERVER_URL}/api/r2-image/${username}/${imageKey}?platform=${platform}`,
        { responseType: 'arraybuffer' }
      );
      console.log(`✅ Image fetched successfully: ${imageResponse.data.length} bytes`);
      console.log(`✅ Content-Type: ${imageResponse.headers['content-type']}`);
      console.log(`✅ X-Image-Source: ${imageResponse.headers['x-image-source']}`);
    } catch (imageError) {
      console.log('❌ Image fetch failed:', imageError.message);
      console.log('This might be normal if the image doesn\'t exist');
    }
    
    // Step 3: Request image again to verify cache hit
    console.log('\n🔄 STEP 3: Requesting image again to verify cache hit...');
    try {
      const cachedResponse = await axios.get(
        `${PROXY_SERVER_URL}/api/r2-image/${username}/${imageKey}?platform=${platform}`,
        { responseType: 'arraybuffer' }
      );
      console.log(`✅ Cached image fetched: ${cachedResponse.data.length} bytes`);
      console.log(`✅ X-Image-Source: ${cachedResponse.headers['x-image-source']}`);
    } catch (cachedError) {
      console.log('❌ Cached image fetch failed:', cachedError.message);
    }
    
    // Step 4: Inspect cache after population
    console.log('\n📊 STEP 4: Inspecting cache AFTER population...');
    try {
      const inspectAfterResponse = await axios.get(
        `${PROXY_SERVER_URL}/admin/inspect-cache/${platform}/${username}/${imageKey}`
      );
      console.log('Cache inspection AFTER population:', JSON.stringify(inspectAfterResponse.data, null, 2));
    } catch (inspectError) {
      console.log('Cache inspection failed:', inspectError.message);
    }
    
    // Step 5: Execute nuclear destruction
    console.log('\n💥 STEP 5: Executing NUCLEAR CACHE DESTRUCTION...');
    try {
      const destructionResponse = await axios.post(
        `${PROXY_SERVER_URL}/admin/nuclear-cache-destroy/${platform}/${username}/${imageKey}`
      );
      console.log('Nuclear destruction result:', JSON.stringify(destructionResponse.data, null, 2));
    } catch (destructionError) {
      console.log('❌ Nuclear destruction failed:', destructionError.message);
      return;
    }
    
    // Step 6: Inspect cache after destruction
    console.log('\n📊 STEP 6: Inspecting cache AFTER nuclear destruction...');
    try {
      const inspectAfterDestruction = await axios.get(
        `${PROXY_SERVER_URL}/admin/inspect-cache/${platform}/${username}/${imageKey}`
      );
      console.log('Cache inspection AFTER destruction:', JSON.stringify(inspectAfterDestruction.data, null, 2));
    } catch (inspectError) {
      console.log('Cache inspection failed:', inspectError.message);
    }
    
    // Step 7: Request image again to verify cache miss
    console.log('\n🔍 STEP 7: Requesting image again to verify cache miss...');
    try {
      const freshResponse = await axios.get(
        `${PROXY_SERVER_URL}/api/r2-image/${username}/${imageKey}?platform=${platform}&force=1`,
        { responseType: 'arraybuffer' }
      );
      console.log(`✅ Fresh image fetched: ${freshResponse.data.length} bytes`);
      console.log(`✅ X-Image-Source: ${freshResponse.headers['x-image-source']}`);
      
      if (freshResponse.headers['x-image-source'] === 'r2-direct') {
        console.log('🎉 SUCCESS: Image was fetched directly from R2 (cache bypassed)');
      } else {
        console.log('⚠️  WARNING: Image may still be served from cache');
      }
    } catch (freshError) {
      console.log('❌ Fresh image fetch failed:', freshError.message);
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log('🏁 NUCLEAR CACHE DESTRUCTION TEST COMPLETE');
    
  } catch (error) {
    console.error('❌ TEST FAILED:', error.message);
  }
}

// Run the test
if (require.main === module) {
  testCacheDestruction()
    .then(() => {
      console.log('\n✅ Test script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test script failed:', error);
      process.exit(1);
    });
}

module.exports = { testCacheDestruction };
