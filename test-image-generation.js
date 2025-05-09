// Test script for image generation
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const AI_HORDE_CONFIG = {
  api_key: "VxVGZGSL20PDRbi3mW2D5Q",
  base_url: "https://stablehorde.net/api/v2"
};

// Function to generate an image using Stable Horde API
async function testGenerateImage(prompt) {
  console.log(`[TEST] Starting image generation for prompt: ${prompt.substring(0, 50)}...`);
  
  try {
    // Create the payload for the Stable Horde API
    const payload = {
      prompt: prompt,
      params: {
        width: 512,
        height: 512,
        steps: 50,
        cfg_scale: 7.5
      }
    };

    console.log(`[TEST] Sending request to Stable Horde API`);
    
    // Step 1: Submit the generation request to get a job ID
    const generationResponse = await axios.post(
      'https://stablehorde.net/api/v2/generate/async', 
      payload, 
      {
        headers: { 
          'Content-Type': 'application/json',
          'apikey': AI_HORDE_CONFIG.api_key
        },
        timeout: 15000 // 15 second timeout for initial request
      }
    );
    
    console.log(`[TEST] Initial API response:`, JSON.stringify(generationResponse.data, null, 2));
    
    if (!generationResponse.data || !generationResponse.data.id) {
      throw new Error('No job ID received from Stable Horde API');
    }
    
    const jobId = generationResponse.data.id;
    console.log(`[TEST] Received job ID: ${jobId}`);
    
    // Step 2: Poll for job completion
    let imageUrl = null;
    let attempts = 0;
    const maxAttempts = 20; // Maximum poll attempts
    const pollInterval = 3000; // 3 seconds between polls
    
    while (!imageUrl && attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      console.log(`[TEST] Checking job status (attempt ${attempts}/${maxAttempts})`);
      
      // Check if the job is done
      const checkResponse = await axios.get(
        `https://stablehorde.net/api/v2/generate/check/${jobId}`,
        {
          headers: { 'apikey': AI_HORDE_CONFIG.api_key },
          timeout: 5000
        }
      );
      
      console.log(`[TEST] Check response:`, JSON.stringify(checkResponse.data, null, 2));
      
      if (checkResponse.data && checkResponse.data.done) {
        console.log(`[TEST] Job complete, retrieving result`);
        
        // Get the generation result
        const resultResponse = await axios.get(
          `https://stablehorde.net/api/v2/generate/status/${jobId}`,
          {
            headers: { 'apikey': AI_HORDE_CONFIG.api_key },
            timeout: 5000
          }
        );
        
        console.log(`[TEST] Result response:`, JSON.stringify(resultResponse.data, null, 2));
        
        if (resultResponse.data && 
            resultResponse.data.generations && 
            resultResponse.data.generations.length > 0 &&
            resultResponse.data.generations[0].img) {
          
          imageUrl = resultResponse.data.generations[0].img;
          console.log(`[TEST] Successfully retrieved image URL: ${imageUrl}`);
        }
      } else {
        console.log(`[TEST] Job still processing (attempt ${attempts}/${maxAttempts})`);
      }
    }
    
    if (!imageUrl) {
      throw new Error(`Failed to generate image after ${maxAttempts} attempts`);
    }
    
    return imageUrl;
    
  } catch (error) {
    console.error(`[TEST] API error: ${error.message || 'Unknown error'}`);
    
    if (error.response) {
      console.error(`[TEST] API error details: ${error.response.status} ${error.response.statusText}`);
      console.error(`[TEST] API error response: ${JSON.stringify(error.response.data || {})}`);
    }
    
    throw error;
  }
}

// Function to download the generated image
async function testDownloadImage(imageUrl, outputPath) {
  try {
    console.log(`[TEST] Downloading image from: ${imageUrl}...`);
    
    // Create directory if it doesn't exist
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer',
      timeout: 15000 // 15 seconds timeout
    });
    
    // Write the image data to file directly
    fs.writeFileSync(outputPath, Buffer.from(response.data));
    console.log(`[TEST] Image downloaded successfully to ${outputPath}`);
    return outputPath;
    
  } catch (error) {
    console.error(`[TEST] Error downloading image: ${error.message}`);
    throw error;
  }
}

// Main test function
async function runTest() {
  try {
    console.log('[TEST] Starting image generation test');
    
    const testPrompt = `Professional cosmetic product photography of colorful lipstick shades, 
      on clean white background with soft shadows, makeup, beauty photography, professional studio lighting, 
      8k resolution, advertisement quality, product showcase, vibrant colors, hyper-detailed`;
    
    // Step 1: Generate image and get URL
    const imageUrl = await testGenerateImage(testPrompt);
    console.log('[TEST] ✅ Image generation successful');
    
    // Step 2: Download the image
    const outputPath = path.join(process.cwd(), 'test-output', 'test-image.jpg');
    await testDownloadImage(imageUrl, outputPath);
    console.log('[TEST] ✅ Image download successful');
    
    // Step 3: Verify file exists and has content
    const fileStats = fs.statSync(outputPath);
    console.log(`[TEST] Image file size: ${fileStats.size} bytes`);
    
    if (fileStats.size > 1000) { // Reasonable size for an image
      console.log('[TEST] ✅ Image file size verification successful');
    } else {
      console.log('[TEST] ❌ Image file size too small, may not be a valid image');
    }
    
    console.log('[TEST] All tests completed');
    console.log(`[TEST] Generated image saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('[TEST] Test failed:', error);
  }
}

// Run the test
runTest(); 