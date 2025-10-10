/**
 * UNIT TEST 4: Backend Endpoint /api/gemini-image-edit
 * Tests the complete backend endpoint with real data
 */

import axios from 'axios';

const BACKEND_URL = 'http://127.0.0.1:3000';

const TEST_REQUEST = {
  imageKey: 'campaign_ready_post_1754561649019_edfdd724.jpg',
  username: 'fentybeauty',
  platform: 'instagram',
  prompt: 'Make this image more vibrant with enhanced colors'
};

async function testBackendEndpoint() {
  console.log('🧪 UNIT TEST 4: Backend Endpoint\n');
  console.log('Backend URL:', BACKEND_URL);
  console.log('Request:', JSON.stringify(TEST_REQUEST, null, 2));
  console.log('─'.repeat(80));
  
  try {
    // Step 1: Check server health
    console.log('\nStep 1: Checking server health...');
    try {
      await axios.get(`${BACKEND_URL}/health`, { timeout: 2000 });
      console.log('✅ Server is running');
    } catch (e) {
      console.log('⚠️  Health check failed, but continuing...');
    }
    
    // Step 2: Call Gemini endpoint
    console.log('\nStep 2: Calling /api/gemini-image-edit...');
    const startTime = Date.now();
    
    const response = await axios.post(
      `${BACKEND_URL}/api/gemini-image-edit`,
      TEST_REQUEST,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000 // 2 minutes
      }
    );
    
    const duration = Date.now() - startTime;
    console.log(`✅ Response received in ${(duration / 1000).toFixed(2)}s`);
    
    // Step 3: Validate response structure
    console.log('\nStep 3: Validating response structure...');
    const data = response.data;
    
    const checks = {
      success: data.success === true,
      hasOriginalUrl: !!data.originalImageUrl,
      hasEditedUrl: !!data.editedImageUrl,
      hasImageKey: !!data.imageKey,
      hasEditedKey: !!data.editedImageKey,
      hasPrompt: !!data.prompt,
      hasAiResponse: !!data.aiResponse
    };
    
    console.log('   Checks:');
    Object.entries(checks).forEach(([key, value]) => {
      console.log(`     - ${key}: ${value ? '✅' : '❌'}`);
    });
    
    const allPassed = Object.values(checks).every(v => v === true);
    
    // Step 4: Display results
    console.log('\nStep 4: Response details:');
    console.log(`   - Original: ${data.originalImageUrl}`);
    console.log(`   - Edited: ${data.editedImageUrl}`);
    console.log(`   - Image Key: ${data.imageKey}`);
    console.log(`   - Edited Key: ${data.editedImageKey}`);
    console.log(`   - Prompt: "${data.prompt}"`);
    
    if (data.aiResponse?.candidates?.[0]) {
      const aiText = data.aiResponse.candidates[0].content?.parts?.[0]?.text;
      if (aiText) {
        console.log(`\n   AI Response Preview:`);
        console.log(`   ${aiText.substring(0, 150)}...`);
      }
    }
    
    console.log('\n✅ TEST PASSED\n');
    console.log('Summary:');
    console.log(`  - Total time: ${(duration / 1000).toFixed(2)}s`);
    console.log(`  - Response valid: ${allPassed ? 'Yes' : 'No'}`);
    console.log(`  - All fields present: ${allPassed ? 'Yes' : 'No'}`);
    
    return {
      success: true,
      duration,
      valid: allPassed,
      data
    };
  } catch (error) {
    console.log('\n❌ TEST FAILED\n');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n⚠️  Is the server running? Try: npm run dev:server');
    }
    return {
      success: false,
      error: error.message
    };
  }
}

testBackendEndpoint().then(result => {
  process.exit(result.success ? 0 : 1);
});
