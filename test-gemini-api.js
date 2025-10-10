import axios from 'axios';
import { readFileSync, writeFileSync } from 'fs';

async function testGeminiAPI() {
  console.log('🧪 Testing Gemini API with Real Image...\n');
  
  // Step 1: Fetch the image from public CDN
  const imageUrl = 'https://pub-27792cbe4fa9441b8fefa0253ea9242c.r2.dev/ready_post/instagram/fentybeauty/campaign_ready_post_1754561649019_edfdd724.jpg';
  
  console.log('📥 Step 1: Fetching image from CDN...');
  console.log('URL:', imageUrl);
  
  let imageBuffer;
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    imageBuffer = Buffer.from(response.data);
    console.log(`✅ Image fetched: ${imageBuffer.length} bytes`);
    console.log(`   Content-Type: ${response.headers['content-type']}\n`);
  } catch (error) {
    console.error('❌ Failed to fetch image:', error.message);
    return;
  }
  
  // Step 2: Convert to base64
  console.log('🔄 Step 2: Converting to base64...');
  const base64Image = imageBuffer.toString('base64');
  console.log(`✅ Base64 created: ${base64Image.length} characters`);
  console.log(`   Preview: ${base64Image.substring(0, 50)}...\n`);
  
  // Step 3: Call Gemini API
  console.log('🤖 Step 3: Calling Gemini 2.0 Flash API...');
  const GEMINI_API_KEY = 'AIzaSyAdap8Q8Srg_AKJXUsDcFChnK5lScWqgEY';
  const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;
  
  const prompt = 'Describe this image in detail';
  console.log(`   Prompt: "${prompt}"`);
  
  const geminiPayload = {
    contents: [{
      parts: [
        { text: prompt },
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
      maxOutputTokens: 8192,
      responseMimeType: "text/plain"
    }
  };
  
  try {
    console.log('   Making API request...');
    const startTime = Date.now();
    
    const geminiResponse = await axios.post(geminiApiUrl, geminiPayload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Gemini API responded in ${duration}s\n`);
    
    // Step 4: Display results
    console.log('📊 Step 4: Gemini API Response:');
    console.log('─'.repeat(80));
    
    if (geminiResponse.data.candidates && geminiResponse.data.candidates[0]) {
      const text = geminiResponse.data.candidates[0].content.parts[0].text;
      console.log(text);
      console.log('─'.repeat(80));
      console.log('\n✅ ALL TESTS PASSED!');
      console.log('   - Image fetch: OK');
      console.log('   - Base64 conversion: OK');
      console.log('   - Gemini API: OK');
      console.log('   - Response generation: OK');
      
      // Save response for inspection
      writeFileSync('gemini-test-response.json', JSON.stringify(geminiResponse.data, null, 2));
      console.log('\n📄 Full response saved to: gemini-test-response.json');
    } else {
      console.log('⚠️  No candidates in response');
      console.log(JSON.stringify(geminiResponse.data, null, 2));
    }
    
  } catch (error) {
    console.error('\n❌ Gemini API FAILED!');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testGeminiAPI();
