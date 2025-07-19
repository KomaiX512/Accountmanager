const axios = require('axios');

// This should match the port your Vite dev server is running on
const VITE_PORT = 5173; 
const BASE_URL = `http://localhost:${VITE_PORT}`;

const TEST_USERNAME = 'testuser';
const TEST_PLATFORM = 'instagram';

async function testDiscussionApi() {
  console.log('--- Testing Discussion API ---');
  try {
    const url = `${BASE_URL}/api/discussion`;
    console.log(`[Test] Sending POST request to: ${url}`);
    
    const response = await axios.post(url, {
      username: TEST_USERNAME,
      query: 'Hello, this is a test from the frontend simulation.',
      previous_messages: [],
      platform: TEST_PLATFORM
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('[Test] Discussion API Response Status:', response.status);
    console.log('[Test] Discussion API Response Data:', response.data);

    if (response.status === 200 && response.data.response) {
      console.log('✅ Discussion API test PASSED.');
    } else {
      console.error('❌ Discussion API test FAILED. Unexpected response structure.');
    }
  } catch (error) {
    console.error('❌ Discussion API test FAILED.');
    if (error.response) {
      console.error('   Error Status:', error.response.status);
      console.error('   Error Data:', error.response.data);
    } else {
      console.error('   Error Message:', error.message);
    }
  }
}

async function testConversationsApi() {
  console.log('\n--- Testing Conversations API ---');
  try {
    const url = `${BASE_URL}/api/conversations/${TEST_USERNAME}?platform=${TEST_PLATFORM}`;
    console.log(`[Test] Sending GET request to: ${url}`);

    const response = await axios.get(url);

    console.log('[Test] Conversations API Response Status:', response.status);
    console.log('[Test] Conversations API Response Data:', response.data);

    if (response.status === 200 && Array.isArray(response.data.messages)) {
      console.log('✅ Conversations API test PASSED.');
    } else {
      console.error('❌ Conversations API test FAILED. Unexpected response structure.');
    }
  } catch (error) {
    console.error('❌ Conversations API test FAILED.');
    if (error.response) {
      console.error('   Error Status:', error.response.status);
      console.error('   Error Data:', error.response.data);
    } else {
      console.error('   Error Message:', error.message);
    }
  }
}

async function runTests() {
  console.log('Running frontend simulation tests...\n');
  await testDiscussionApi();
  await testConversationsApi();
  console.log('\nTests finished.');
}

runTests();
