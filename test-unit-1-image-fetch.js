/**
 * UNIT TEST 1: Image Fetching from R2/CDN
 * Tests if we can reliably fetch the test image
 */

import axios from 'axios';

const TEST_IMAGE = {
  url: 'https://pub-27792cbe4fa9441b8fefa0253ea9242c.r2.dev/ready_post/instagram/fentybeauty/campaign_ready_post_1754561649019_edfdd724.jpg',
  expectedSize: 260585,
  expectedType: 'image/jpeg'
};

async function testImageFetch() {
  console.log('🧪 UNIT TEST 1: Image Fetching\n');
  console.log('Test Image:', TEST_IMAGE.url);
  console.log('Expected Size:', TEST_IMAGE.expectedSize, 'bytes');
  console.log('Expected Type:', TEST_IMAGE.expectedType);
  console.log('─'.repeat(80));
  
  try {
    const startTime = Date.now();
    const response = await axios.get(TEST_IMAGE.url, {
      responseType: 'arraybuffer',
      timeout: 10000
    });
    const duration = Date.now() - startTime;
    
    const buffer = Buffer.from(response.data);
    const contentType = response.headers['content-type'];
    
    console.log('\n✅ TEST PASSED\n');
    console.log('Results:');
    console.log(`  - Status: ${response.status}`);
    console.log(`  - Content-Type: ${contentType}`);
    console.log(`  - Size: ${buffer.length} bytes`);
    console.log(`  - Duration: ${duration}ms`);
    console.log(`  - Size Match: ${buffer.length === TEST_IMAGE.expectedSize ? '✅' : '⚠️'}`);
    console.log(`  - Type Match: ${contentType === TEST_IMAGE.expectedType ? '✅' : '⚠️'}`);
    
    return {
      success: true,
      buffer,
      contentType,
      duration
    };
  } catch (error) {
    console.log('\n❌ TEST FAILED\n');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
    return {
      success: false,
      error: error.message
    };
  }
}

testImageFetch().then(result => {
  process.exit(result.success ? 0 : 1);
});
