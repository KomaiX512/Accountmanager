// Test script for image generation
import axios from 'axios';
import fs from 'fs';
import path from 'path';

async function testImageGeneration() {
  console.log('Testing image generation...');
  
  try {
    // 1. Test post creation with our updated image pipeline
    console.log('Step 1: Testing post creation with image generation');
    const response = await axios.post('http://localhost:3002/rag-post/maccosmetics', {
      query: 'Create a post about new summer lipstick shades'
    });
    
    console.log('Response received:', response.status);
    console.log('Post data:', JSON.stringify(response.data, null, 2).substring(0, 500) + '...');
    
    // 2. Verify the image file was created
    if (response.data && response.data.post && response.data.post.image_path) {
      const imagePath = response.data.post.image_path;
      console.log('Checking image at:', imagePath);
      
      if (fs.existsSync(imagePath)) {
        const stats = fs.statSync(imagePath);
        console.log('Image file exists! Size:', stats.size, 'bytes');
        console.log('Test successful!');
      } else {
        console.error('Image file was not created at the expected path');
      }
    } else {
      console.error('No image path in response data');
    }
    
  } catch (error) {
    console.error('Test failed with error:', error.message);
    if (error.response) {
      console.error('Error response:', error.response.status, error.response.statusText);
      console.error('Error data:', error.response.data);
    }
  }
}

testImageGeneration(); 