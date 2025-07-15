const axios = require('axios');

async function testAIReply() {
  try {
    console.log('Testing AI reply endpoint...');
    
    // Test data with a real user ID that has access tokens
    const testData = {
      notification: {
        from: { id: '17841471786269325' }, // Real user ID from logs
        id: 'test_message_id',
        platform: 'instagram',
        text: 'Hey there! 👋 We\'ve got a whole universe of goodies to explore! ✨ From complexion must-haves to vibrant color pops, we\'ve got you covered. Think island-gal vibes with our juicy lip products 💋 (like in our recent post!), and innovative formulas that are always cruelty-free. You can shop online or find us worldwide at Sephora, Ulta, and more! 😉 What are you most curious about?'
      },
      username: 'fentybeauty'
    };
    
    console.log('Sending test data:', JSON.stringify(testData, null, 2));
    
    const response = await axios.post('http://localhost:3000/api/ai-reply/fentybeauty', testData, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('Response:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Response data:', error.response.data);
    }
  }
}

testAIReply(); 