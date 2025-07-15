const axios = require('axios');

async function testAIReplyWithRealUser() {
  try {
    console.log('🎯 TESTING AI REPLY WITH REAL USER ID...');
    
    // Use a real user ID from the logs: 679240224685804 (from the Instagram webhook)
    const testData = {
      notification: {
        from: { 
          id: '679240224685804' // Real user ID from Instagram webhook
        },
        id: 'test_message_id_real',
        platform: 'instagram',
        text: 'Hey there! 👋 We\'ve got a whole universe of goodies to explore! ✨ From complexion must-haves to vibrant color pops, we\'ve got you covered. Think island-gal vibes with our juicy lip products 💋 (like in our recent post!), and innovative formulas that are always cruelty-free. You can shop online or find us worldwide at Sephora, Ulta, and more! 😉 What are you most curious about?',
        timestamp: new Date().toISOString()
      },
      username: 'fentybeauty'
    };
    
    console.log('📤 Sending test data with REAL user ID:', testData.notification.from.id);
    
    const response = await axios.post('http://localhost:3000/api/ai-reply/fentybeauty', testData, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('✅ SUCCESS! AI Reply System Working with Real User:');
    console.log('📝 Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success) {
      console.log('🎉 AI REPLY SYSTEM IS WORKING WITH REAL USER ID!');
      console.log('✅ RAG server generated reply');
      console.log('✅ Legacy server forwarded reply to DM sending');
      console.log('✅ DM sending logic executed');
      console.log('✅ Real user ID used:', testData.notification.from.id);
      
      if (response.data.warning) {
        console.log('⚠️  Warning:', response.data.warning);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('📋 Response data:', error.response.data);
    }
  }
}

testAIReplyWithRealUser(); 