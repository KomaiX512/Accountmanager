// Direct API endpoint test for AI image editing
import axios from 'axios';

async function testAIEndpoint() {
  console.log('🔧 TESTING AI ENDPOINT DIRECTLY');
  console.log('================================');

  const payload = {
    imageKey: 'campaign_ready_post_1756312603276_e3e1e71b.jpg',
    username: 'muhammad_muti',
    platform: 'twitter',
    prompt: 'convert to watercolor painting'
  };

  try {
    console.log('📤 Sending request to backend...');
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    const startTime = Date.now();
    
    const response = await axios.post('http://127.0.0.1:3000/api/ai-image-edit', payload, {
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json'
      },
      validateStatus: () => true
    });
    
    const duration = (Date.now() - startTime) / 1000;
    
    console.log(`\n📊 RESPONSE RECEIVED (${duration.toFixed(1)}s):`);
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    console.log('Data:', JSON.stringify(response.data, null, 2));
    
    if (response.status === 200 && response.data.success) {
      console.log('\n✅ SUCCESS: Backend AI endpoint working!');
      console.log('Original URL:', response.data.originalImageUrl);
      console.log('Edited URL:', response.data.editedImageUrl);
    } else if (response.status === 404) {
      console.log('\n❌ ENDPOINT NOT FOUND: /api/ai-image-edit does not exist');
    } else if (response.status === 500) {
      console.log('\n❌ BACKEND ERROR:', response.data.error || 'Internal server error');
    } else {
      console.log('\n⚠️ UNEXPECTED RESPONSE:', response.status, response.data);
    }
    
  } catch (error) {
    console.log('\n💥 REQUEST FAILED:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Backend server not running');
      console.log('💡 Solution: Start with "npm run dev"');
    } else if (error.code === 'ECONNABORTED') {
      console.log('❌ Request timeout - processing took too long');
    } else {
      console.log('❌ Error details:', error.response?.data || error.message);
    }
  }
}

testAIEndpoint();
