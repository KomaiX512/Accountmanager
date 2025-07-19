#!/usr/bin/env node

/**
 * Simple Ideogram API Test
 */

import axios from 'axios';

const IDEOGRAM_CONFIG = {
  api_key: "TzHxkD9XaGv-moRmaRAHx0lCXpBjd7quw_savsvNHY6kir1saKdGMp97c52cHF85ANslt4kJycCpfznX_PeYXQ",
  base_url: "https://api.ideogram.ai/v1/ideogram-v3/generate"
};

async function testIdeogramAPI() {
  try {
    console.log('Testing Ideogram API with simple fetch approach...');
    
    // Create FormData as shown in the API docs
    const formData = new FormData();
    formData.append('prompt', 'A photo of a cat');
    formData.append('rendering_speed', 'TURBO');
    
    console.log('FormData created, sending request...');
    
    const response = await fetch(IDEOGRAM_CONFIG.base_url, {
      method: 'POST',
      headers: { 
        'Api-Key': IDEOGRAM_CONFIG.api_key
      },
      body: formData
    });
    
    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (response.ok && data.data && data.data.length > 0) {
      console.log('✅ Success! Image URL:', data.data[0].url);
      return true;
    } else {
      console.log('❌ Failed:', data);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

testIdeogramAPI();
