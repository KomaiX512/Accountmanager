// Test Gemini 2.5 Flash Image API for image editing
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function testGeminiImageEdit() {
  console.log('🧪 Testing Gemini 2.5 Flash Image API...\n');
  
  // Read sample image
  const imagePath = path.join(__dirname, 'ready_post/twitter/muhammad_muti/image_1756632171022.png');
  if (!fs.existsSync(imagePath)) {
    console.error('❌ Sample image not found:', imagePath);
    return;
  }
  
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  
  console.log(`✅ Loaded image: ${imagePath}`);
  console.log(`📊 Original size: ${imageBuffer.length} bytes\n`);
  
  // Call Gemini API
  const GEMINI_API_KEY = 'AIzaSyAdap8Q8Srg_AKJXUsDcFChnK5lScWqgEY';
  const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`;
  
  const payload = {
    contents: [{
      parts: [
        {
          text: "Add modern typography with bold text overlay that says 'TEST SUCCESS'. Return the edited image."
        },
        {
          inline_data: {
            mime_type: 'image/png',
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
      responseModalities: ["IMAGE", "TEXT"]
    }
  };
  
  console.log('🤖 Calling Gemini 2.5 Flash Image API...\n');
  
  try {
    const response = await axios.post(geminiApiUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    });
    
    console.log('✅ API Response received\n');
    console.log('📦 Response structure:', JSON.stringify(response.data, null, 2).substring(0, 1000));
    
    // Extract generated image
    const candidates = response.data.candidates;
    if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
      let foundImage = false;
      for (const part of candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          foundImage = true;
          const generatedImageBuffer = Buffer.from(part.inlineData.data, 'base64');
          console.log(`\n🎨 ✅ FOUND GENERATED IMAGE!`);
          console.log(`📊 Generated size: ${generatedImageBuffer.length} bytes (vs original: ${imageBuffer.length} bytes)`);
          console.log(`📝 MIME type: ${part.inlineData.mimeType || 'unknown'}`);
          
          // Save to test file
          const outputPath = path.join(__dirname, 'test-edited-image.png');
          fs.writeFileSync(outputPath, generatedImageBuffer);
          console.log(`💾 Saved to: ${outputPath}\n`);
          
          console.log('✅ TEST PASSED: Image generation works!');
          return;
        }
      }
      
      if (!foundImage) {
        console.log('\n❌ TEST FAILED: No image in response');
        console.log('Response parts:', JSON.stringify(candidates[0].content.parts, null, 2));
      }
    } else {
      console.log('\n❌ TEST FAILED: Invalid response structure');
    }
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testGeminiImageEdit().catch(console.error);
