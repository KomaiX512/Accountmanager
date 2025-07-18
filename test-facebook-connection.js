const axios = require('axios');

async function testFacebookConnection() {
  try {
    // Test the Facebook connection endpoint
    console.log('🔍 Testing Facebook connection...');
    
    // You'll need to replace 'your-user-id' with your actual Firebase user ID
    const userId = 'your-user-id'; // Replace with your actual user ID
    
    const response = await axios.get(`http://localhost:3000/api/facebook-connection/${userId}`);
    console.log('✅ Facebook connection response:', response.data);
    
    if (response.data.facebook_page_id) {
      console.log('📄 Facebook Page ID:', response.data.facebook_page_id);
      console.log('👤 Facebook Username:', response.data.username);
      
      // Test the RAG endpoint with a sample notification
      console.log('\n🤖 Testing RAG service...');
      
      const testNotification = {
        type: 'message',
        facebook_page_id: response.data.facebook_page_id,
        sender_id: 'test_sender_123',
        message_id: 'test_message_123',
        text: 'Hello, this is a test message',
        timestamp: Date.now(),
        received_at: new Date().toISOString(),
        status: 'pending',
        platform: 'facebook'
      };
      
      const ragResponse = await axios.post(
        `http://localhost:3000/api/rag-instant-reply/${response.data.username}`,
        testNotification,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );
      
      console.log('🎉 RAG service response:', ragResponse.data);
      
    } else {
      console.log('❌ No Facebook connection found');
    }
    
  } catch (error) {
    console.error('💥 Error testing Facebook connection:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
}

testFacebookConnection();
