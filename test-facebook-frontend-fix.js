const axios = require('axios');

async function testFacebookFrontendFix() {
  const facebookUserId = '681487244693083'; // The Facebook user ID from logs
  
  console.log('🧪 Testing Facebook Frontend Fix...\n');
  
  try {
    // Test 1: Check if backend returns notifications
    console.log('📋 Test 1: Backend API Response');
    const response = await axios.get(`http://localhost:3000/events-list/${facebookUserId}?platform=facebook`);
    console.log(`✅ Backend returned ${response.data.length} notifications`);
    
    if (response.data.length > 0) {
      console.log('📊 Sample notification:', JSON.stringify(response.data[0], null, 2));
    }
    
    // Test 2: Check if notifications have correct structure
    console.log('\n📋 Test 2: Notification Structure Validation');
    if (response.data.length > 0) {
      const notification = response.data[0];
      const requiredFields = ['type', 'platform', 'status', 'text', 'timestamp'];
      const hasRequiredFields = requiredFields.every(field => notification.hasOwnProperty(field));
      console.log(`✅ Notification structure valid: ${hasRequiredFields ? 'PASS' : 'FAIL'}`);
      
      // Check if notifications have Facebook-specific fields
      const facebookFields = ['facebook_user_id', 'facebook_page_id'];
      const hasFacebookFields = facebookFields.some(field => notification.hasOwnProperty(field));
      console.log(`✅ Facebook-specific fields present: ${hasFacebookFields ? 'PASS' : 'FAIL'}`);
    }
    
    // Test 3: Check notification types
    console.log('\n📋 Test 3: Notification Types');
    const types = [...new Set(response.data.map(n => n.type))];
    console.log(`📊 Found notification types: ${types.join(', ')}`);
    
    // Test 4: Check platform field
    console.log('\n📋 Test 4: Platform Field');
    const platforms = [...new Set(response.data.map(n => n.platform))];
    console.log(`📊 Platform field values: ${platforms.join(', ')}`);
    
    console.log('\n🎉 Frontend fix test completed successfully!');
    console.log(`📊 Total notifications available: ${response.data.length}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📊 Error response:', error.response.data);
    }
  }
}

testFacebookFrontendFix(); 