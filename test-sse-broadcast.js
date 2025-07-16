const axios = require('axios');

// Test SSE broadcast for Instagram
async function testSSEBroadcast() {
  const testUserId = '17841471786269325'; // From the logs
  const testUsername = 'u2023460'; // From the logs
  
  console.log(`[${new Date().toISOString()}] Testing SSE broadcast for user ID: ${testUserId}`);
  
  try {
    // Simulate a webhook event
    const webhookPayload = {
      object: "instagram",
      entry: [{
        time: Date.now(),
        id: "17841471786269325",
        messaging: [{
          sender: { id: "679240224685804" },
          recipient: { id: "17841471786269325" },
          timestamp: Date.now(),
          message: {
            mid: "test_message_id_" + Date.now(),
            text: "Test message from SSE broadcast test",
            is_echo: false
          }
        }]
      }]
    };
    
    console.log(`[${new Date().toISOString()}] Sending test webhook payload:`, JSON.stringify(webhookPayload, null, 2));
    
    // Send the webhook payload
    const response = await axios.post('http://localhost:3000/instagram/callback', webhookPayload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`[${new Date().toISOString()}] Webhook response status: ${response.status}`);
    
    // Wait a moment for the broadcast to happen
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`[${new Date().toISOString()}] Test completed`);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error testing SSE broadcast:`, error.message);
  }
}

// Run the test
testSSEBroadcast(); 