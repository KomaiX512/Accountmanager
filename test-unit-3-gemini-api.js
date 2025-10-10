/**
 * UNIT TEST 3: Gemini API Call
 * Tests if Gemini API responds correctly with image analysis
 */

import axios from 'axios';

const TEST_IMAGE = 'https://pub-27792cbe4fa9441b8fefa0253ea9242c.r2.dev/ready_post/instagram/fentybeauty/campaign_ready_post_1754561649019_edfdd724.jpg';
const GEMINI_API_KEY = 'AIzaSyAdap8Q8Srg_AKJXUsDcFChnK5lScWqgEY';

async function testGeminiAPI() {
  console.log('🧪 UNIT TEST 3: Gemini API Call\n');
  console.log('─'.repeat(80));
  
  try {
    // Step 1: Fetch and convert image
    console.log('Step 1: Fetching image...');
    const imgResponse = await axios.get(TEST_IMAGE, {
      responseType: 'arraybuffer',
      timeout: 10000
    });
    const base64Image = Buffer.from(imgResponse.data).toString('base64');
    console.log(`✅ Image prepared: ${base64Image.length} chars`);
    
    // Step 2: Call Gemini API
    console.log('\nStep 2: Calling Gemini API...');
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
      contents: [{
        parts: [
          { text: 'Describe this image briefly' },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Image
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.6,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192
      }
    };
    
    const startTime = Date.now();
    const response = await axios.post(geminiUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    });
    const duration = Date.now() - startTime;
    
    console.log(`✅ API responded in ${duration}ms`);
    
    // Step 3: Validate response
    console.log('\nStep 3: Validating response...');
    const hasCandidate = response.data.candidates && response.data.candidates.length > 0;
    const hasText = hasCandidate && response.data.candidates[0].content?.parts?.[0]?.text;
    const text = hasText ? response.data.candidates[0].content.parts[0].text : null;
    
    console.log(`   Has candidates: ${hasCandidate ? '✅' : '❌'}`);
    console.log(`   Has text: ${hasText ? '✅' : '❌'}`);
    console.log(`   Text length: ${text ? text.length : 0} chars`);
    
    if (text) {
      console.log('\nStep 4: Sample response text:');
      console.log('─'.repeat(80));
      console.log(text.substring(0, 200) + (text.length > 200 ? '...' : ''));
      console.log('─'.repeat(80));
    }
    
    console.log('\n✅ TEST PASSED\n');
    console.log('Summary:');
    console.log(`  - API latency: ${duration}ms`);
    console.log(`  - Response valid: ${hasCandidate && hasText ? 'Yes' : 'No'}`);
    console.log(`  - Text generated: ${text ? text.length : 0} chars`);
    console.log(`  - Model: ${response.data.modelVersion || 'N/A'}`);
    
    return {
      success: true,
      duration,
      responseLength: text ? text.length : 0,
      valid: hasCandidate && hasText
    };
  } catch (error) {
    console.log('\n❌ TEST FAILED\n');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    return {
      success: false,
      error: error.message
    };
  }
}

testGeminiAPI().then(result => {
  process.exit(result.success ? 0 : 1);
});
