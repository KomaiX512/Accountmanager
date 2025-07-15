const axios = require('axios');

async function testFacebookAIAutoReply() {
  console.log('🧪 Testing Facebook AI Auto-Reply System...\n');
  
  const testData = {
    username: 'testuser', // Replace with actual username
    notification: {
      type: 'message',
      platform: 'facebook',
      sender_id: '123456789', // Replace with actual sender ID
      message_id: `test_msg_${Date.now()}`,
      text: 'Hello! Can you help me with my question?',
      timestamp: Date.now(),
      received_at: new Date().toISOString(),
      status: 'pending'
    }
  };
  
  try {
    console.log('📤 Sending test request to /api/instant-reply...');
    console.log('📋 Test data:', JSON.stringify(testData, null, 2));
    
    const response = await axios.post('http://localhost:3000/api/instant-reply', testData, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('\n✅ SUCCESS! AI Auto-Reply Response:');
    console.log('📄 Response status:', response.status);
    console.log('📄 Response data:', JSON.stringify(response.data, null, 2));
    
    if (response.data.reply) {
      console.log('\n🤖 Generated AI Reply:', response.data.reply);
    }
    
  } catch (error) {
    console.error('\n❌ ERROR in AI Auto-Reply Test:');
    console.error('🔍 Error details:', error.response?.data || error.message);
    console.error('📊 Status code:', error.response?.status);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 TROUBLESHOOTING:');
      console.error('   - Make sure the OldServer.js is running on port 3000');
      console.error('   - Make sure the RAG server is running on port 3001');
    }
  }
}

async function testRAGServerDirect() {
  console.log('\n🧪 Testing RAG Server Direct Connection...\n');
  
  const testData = {
    username: 'testuser',
    notification: {
      type: 'message',
      platform: 'facebook',
      sender_id: '123456789',
      message_id: `test_rag_${Date.now()}`,
      text: 'Test message for RAG server',
      timestamp: Date.now(),
      received_at: new Date().toISOString(),
      status: 'pending'
    }
  };
  
  try {
    console.log('📤 Sending test request directly to RAG server...');
    
    const response = await axios.post('http://localhost:3001/api/instant-reply', testData, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('\n✅ SUCCESS! RAG Server Response:');
    console.log('📄 Response status:', response.status);
    console.log('📄 Response data:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('\n❌ ERROR in RAG Server Test:');
    console.error('🔍 Error details:', error.response?.data || error.message);
    console.error('📊 Status code:', error.response?.status);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 TROUBLESHOOTING:');
      console.error('   - Make sure the RAG server is running on port 3001');
      console.error('   - Check if rag-server.js is started');
    }
  }
}

async function runTests() {
  console.log('🚀 Starting Facebook AI Auto-Reply Tests...\n');
  
  // Test 1: Direct RAG server connection
  await testRAGServerDirect();
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test 2: Full AI auto-reply system
  await testFacebookAIAutoReply();
  
  console.log('\n🏁 Tests completed!');
}

// Run the tests
runTests().catch(console.error); 