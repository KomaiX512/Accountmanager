import fetch from 'node-fetch';

const testWebhook = async () => {
  const webhookData = {
    object: "instagram",
    entry: [{
      messaging: [{
        sender: { id: "25708013023640456" },
        recipient: { id: "17841476072004748" },
        timestamp: Date.now(),
        message: {
          mid: "test_mid_12345",
          text: "Test DM from u2023460"
        }
      }]
    }]
  };

  try {
    console.log('⚡ Sending test webhook...');
    const response = await fetch('http://localhost:5432/webhooks/instagram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': 'sha256=test'
      },
      body: JSON.stringify(webhookData)
    });

    console.log('📊 Response status:', response.status);
    const responseText = await response.text();
    console.log('📝 Response:', responseText);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

testWebhook();
