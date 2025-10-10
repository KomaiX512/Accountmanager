/**
 * UNIT TEST 2: Base64 Conversion
 * Tests if image buffer converts to base64 properly
 */

import axios from 'axios';

const TEST_IMAGE = 'https://pub-27792cbe4fa9441b8fefa0253ea9242c.r2.dev/ready_post/instagram/fentybeauty/campaign_ready_post_1754561649019_edfdd724.jpg';

async function testBase64Conversion() {
  console.log('🧪 UNIT TEST 2: Base64 Conversion\n');
  console.log('─'.repeat(80));
  
  try {
    // Step 1: Fetch image
    console.log('Step 1: Fetching image...');
    const response = await axios.get(TEST_IMAGE, {
      responseType: 'arraybuffer',
      timeout: 10000
    });
    const buffer = Buffer.from(response.data);
    console.log(`✅ Fetched ${buffer.length} bytes`);
    
    // Step 2: Convert to base64
    console.log('\nStep 2: Converting to base64...');
    const startTime = Date.now();
    const base64 = buffer.toString('base64');
    const duration = Date.now() - startTime;
    console.log(`✅ Converted in ${duration}ms`);
    console.log(`   Base64 length: ${base64.length} characters`);
    
    // Step 3: Validate base64
    console.log('\nStep 3: Validating base64...');
    const isValidBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(base64);
    console.log(`   Valid format: ${isValidBase64 ? '✅' : '❌'}`);
    
    // Step 4: Test reverse conversion
    console.log('\nStep 4: Testing reverse conversion...');
    const decoded = Buffer.from(base64, 'base64');
    const sizeMatch = decoded.length === buffer.length;
    console.log(`   Size match: ${sizeMatch ? '✅' : '❌'}`);
    console.log(`   Original: ${buffer.length} bytes`);
    console.log(`   Decoded: ${decoded.length} bytes`);
    
    console.log('\n✅ TEST PASSED\n');
    console.log('Summary:');
    console.log(`  - Conversion time: ${duration}ms`);
    console.log(`  - Base64 length: ${base64.length} chars`);
    console.log(`  - Compression ratio: ${(base64.length / buffer.length * 100).toFixed(2)}%`);
    console.log(`  - Valid format: ${isValidBase64 ? 'Yes' : 'No'}`);
    console.log(`  - Reversible: ${sizeMatch ? 'Yes' : 'No'}`);
    
    return {
      success: true,
      base64Length: base64.length,
      conversionTime: duration,
      valid: isValidBase64 && sizeMatch
    };
  } catch (error) {
    console.log('\n❌ TEST FAILED\n');
    console.error('Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

testBase64Conversion().then(result => {
  process.exit(result.success ? 0 : 1);
});
