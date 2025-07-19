#!/usr/bin/env node

/**
 * BATTLE TEST - Exact API Documentation Implementation
 * Testing the EXACT format from Ideogram docs
 */

console.log('🔥 BATTLE TEST - Ideogram API Exact Implementation');
console.log('Testing with EXACT format from documentation...');

const API_KEY = "TzHxkD9XaGv-moRmaRAHx0lCXpBjd7quw_savsvNHY6kir1saKdGMp97c52cHF85ANslt4kJycCpfznX_PeYXQ";

async function battleTest() {
  try {
    // EXACT implementation from docs
    const formData = new FormData();
    formData.append('prompt', 'A photo of a cat');
    formData.append('rendering_speed', 'TURBO');
    
    const response = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
      method: 'POST',
      headers: { 'Api-Key': API_KEY },
      body: formData
    });
    
    const data = await response.json();
    
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(data, null, 2));
    
    if (response.ok && data.data && data.data[0]?.url) {
      console.log('✅ SUCCESS - API working with exact docs format');
      return true;
    } else {
      console.log('❌ FAILED - API returned:', data);
      return false;
    }
    
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    return false;
  }
}

battleTest();
