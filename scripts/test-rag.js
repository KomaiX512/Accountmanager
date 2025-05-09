import axios from 'axios';

// Test username - change this to a valid username in your system
const TEST_USERNAME = 'komaix512';
const RAG_SERVER_URL = 'http://localhost:3001';

async function testRagService() {
  console.log('🧪 Testing RAG Service...');
  
  try {
    // 1. Test health check endpoint
    console.log('\n👉 Testing health check endpoint...');
    const healthResponse = await axios.get(`${RAG_SERVER_URL}/health`);
    console.log('✅ Health check successful:', healthResponse.data);
    
    // 2. Test profile data retrieval
    console.log('\n👉 Testing profile data retrieval...');
    try {
      const profileResponse = await axios.get(`${RAG_SERVER_URL}/api/conversations/${TEST_USERNAME}`);
      console.log('✅ Profile retrieval successful:', profileResponse.data);
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('✅ No conversations found - this is normal for a new user');
      } else {
        throw error;
      }
    }
    
    // 3. Test discussion query
    console.log('\n👉 Testing discussion query...');
    const discussionResponse = await axios.post(`${RAG_SERVER_URL}/api/discussion`, {
      username: TEST_USERNAME,
      query: 'How can I improve my Instagram engagement?',
      previousMessages: []
    });
    console.log('✅ Discussion query successful. Response excerpt:');
    console.log(discussionResponse.data.response.substring(0, 200) + '...');
    
    // 4. Test post generator
    console.log('\n👉 Testing post generator...');
    const postResponse = await axios.post(`${RAG_SERVER_URL}/api/post-generator`, {
      username: TEST_USERNAME,
      query: 'Create a post about summer vacation'
    });
    console.log('✅ Post generator successful. Response excerpt:');
    console.log(postResponse.data.response.substring(0, 200) + '...');
    
    // 5. Test saving conversations
    console.log('\n👉 Testing conversation saving...');
    const saveResponse = await axios.post(`${RAG_SERVER_URL}/api/conversations/${TEST_USERNAME}`, {
      messages: [
        { role: 'user', content: 'How can I improve my engagement?' },
        { role: 'assistant', content: 'You can improve engagement by posting regularly and interacting with your followers.' }
      ]
    });
    console.log('✅ Conversation saving successful:', saveResponse.data);
    
    console.log('\n🎉 All tests passed! RAG Service is working correctly.');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response details:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    console.error('Check that the RAG server is running on port 3001.');
  }
}

// Run the tests
testRagService(); 