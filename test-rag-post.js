// Simple test for RAG post endpoint with CORS
import axios from 'axios';

console.log('Testing RAG post endpoint with CORS...');

// Test both localhost and 127.0.0.1 to verify CORS is working properly
const endpoints = [
  'http://localhost:3002/rag-post/maccosmetics',
  'http://127.0.0.1:3002/rag-post/maccosmetics'
];

async function testEndpoint(url) {
  console.log(`\nTesting endpoint: ${url}`);
  try {
    const response = await axios.post(url, {
      query: 'Test post generation with CORS'
    }, {
      headers: {
        'Origin': 'http://127.0.0.1:5173',
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Success! Server responded with status:', response.status);
    console.log('CORS headers received:');
    console.log('  Access-Control-Allow-Origin:', response.headers['access-control-allow-origin']);
    console.log('  Content-Type:', response.headers['content-type']);
    
    // Print part of the response
    console.log('\nResponse preview:');
    const preview = JSON.stringify(response.data).substring(0, 200) + '...';
    console.log(preview);
    
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.response) {
      console.error('Server responded with status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else if (error.request) {
      console.error('No response received from server. This could be a CORS issue.');
    }
    
    return false;
  }
}

// Run tests sequentially
async function runTests() {
  let allSuccessful = true;
  
  for (const endpoint of endpoints) {
    const success = await testEndpoint(endpoint);
    if (!success) {
      allSuccessful = false;
    }
  }
  
  console.log('\nSummary:');
  if (allSuccessful) {
    console.log('✅ All tests passed! CORS is properly configured.');
  } else {
    console.log('❌ Some tests failed. Check the logs above for details.');
  }
}

runTests(); 