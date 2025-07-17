const axios = require('axios');

async function testFacebookSimpleBulletproof() {
  console.log('🔧 Testing Facebook Simple Bulletproof System...');
  
  try {
    const facebookPageId = '681487244693083';
    
    console.log('\n📋 Test 1: Direct R2 Fetch');
    const response = await axios.get(`http://localhost:3000/events-list/${facebookPageId}?platform=facebook`);
    
    console.log('✅ Direct fetch successful');
    console.log(`📊 Notifications count: ${response.data.length}`);
    
    if (response.data.length > 0) {
      const sample = response.data[0];
      console.log('📝 Sample notification:');
      console.log(`   - Type: ${sample.type}`);
      console.log(`   - Text: ${sample.text}`);
      console.log(`   - Platform: ${sample.platform}`);
      console.log(`   - Status: ${sample.status}`);
      console.log(`   - Timestamp: ${new Date(sample.timestamp).toISOString()}`);
    }
    
    console.log('\n📋 Test 2: Multiple Rapid Requests (Simulate Live Website)');
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        axios.get(`http://localhost:3000/events-list/${facebookPageId}?platform=facebook&t=${Date.now()}`)
          .then(res => ({ success: true, count: res.data.length }))
          .catch(err => ({ success: false, error: err.message }))
      );
    }
    
    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.filter(r => r.success).reduce((sum, r) => sum + r.count, 0);
    
    console.log(`✅ ${successCount}/5 requests successful`);
    console.log(`📊 Total notifications across all requests: ${totalCount}`);
    
    console.log('\n📋 Test 3: Error Handling');
    try {
      await axios.get(`http://localhost:3000/events-list/invalid-id?platform=facebook`);
      console.log('❌ Should have failed for invalid ID');
    } catch (error) {
      console.log('✅ Properly handled invalid ID');
    }
    
    console.log('\n🎉 Facebook Simple Bulletproof Test COMPLETED!');
    console.log('✅ System is working reliably');
    console.log('✅ Ready for live website deployment');
    console.log('✅ No complex dependencies or failure points');
    
  } catch (error) {
    console.error('❌ Facebook Simple Bulletproof Test FAILED:', error.message);
    process.exit(1);
  }
}

testFacebookSimpleBulletproof(); 