const axios = require('axios');

async function testFacebookOptimization() {
  console.log('🚀 Testing Facebook Notification Optimization...');
  
  try {
    // Test 1: Check Facebook connection
    console.log('\n📋 Test 1: Facebook Connection');
    const firebaseUserId = '94THUToVmtdKGNcq4A5cTONerxI3';
    
    const connectionResponse = await axios.get(`http://localhost:3000/api/facebook-connection/${firebaseUserId}`);
    console.log('✅ Connection API response:', connectionResponse.data);
    
    if (!connectionResponse.data.facebook_page_id) {
      throw new Error('No Facebook page ID found in connection data');
    }
    
    const facebookPageId = connectionResponse.data.facebook_page_id;
    console.log(`📊 Facebook Page ID: ${facebookPageId}`);
    
    // Test 2: Test optimized notifications fetch (should be fast like ready post)
    console.log('\n📋 Test 2: Optimized Notifications Fetch');
    const startTime = Date.now();
    
    const notificationsResponse = await axios.get(`http://localhost:3000/events-list/${facebookPageId}?platform=facebook`);
    const endTime = Date.now();
    const fetchTime = endTime - startTime;
    
    console.log(`✅ Notifications API response status: ${notificationsResponse.status}`);
    console.log(`📊 Notifications count: ${notificationsResponse.data.length}`);
    console.log(`⚡ Fetch time: ${fetchTime}ms (should be < 500ms for optimization)`);
    
    if (fetchTime > 1000) {
      console.log(`⚠️  WARNING: Fetch time ${fetchTime}ms is slow - optimization may not be working`);
    } else {
      console.log(`✅ SUCCESS: Fetch time ${fetchTime}ms is fast - optimization working!`);
    }
    
    if (notificationsResponse.data.length > 0) {
      console.log('📝 Sample notification structure:');
      console.log(JSON.stringify(notificationsResponse.data[0], null, 2));
      
      // Test 3: Check if notifications have required fields
      const requiredFields = ['type', 'text', 'timestamp', 'platform'];
      const sampleNotification = notificationsResponse.data[0];
      
      const missingFields = requiredFields.filter(field => !sampleNotification.hasOwnProperty(field));
      if (missingFields.length > 0) {
        console.log(`❌ Missing required fields: ${missingFields.join(', ')}`);
      } else {
        console.log('✅ All required fields present');
      }
    }
    
    // Test 4: Test force refresh (should still be fast)
    console.log('\n📋 Test 4: Force Refresh Test');
    const forceStartTime = Date.now();
    
    const forceRefreshResponse = await axios.get(`http://localhost:3000/events-list/${facebookPageId}?platform=facebook&forceRefresh=true`);
    const forceEndTime = Date.now();
    const forceFetchTime = forceEndTime - forceStartTime;
    
    console.log(`✅ Force refresh response status: ${forceRefreshResponse.status}`);
    console.log(`📊 Force refresh notifications count: ${forceRefreshResponse.data.length}`);
    console.log(`⚡ Force refresh fetch time: ${forceFetchTime}ms`);
    
    if (forceFetchTime > 2000) {
      console.log(`⚠️  WARNING: Force refresh time ${forceFetchTime}ms is slow - API fallback may be slow`);
    } else {
      console.log(`✅ SUCCESS: Force refresh time ${forceFetchTime}ms is acceptable`);
    }
    
    // Test 5: Compare with ready post fetch speed
    console.log('\n📋 Test 5: Ready Post Speed Comparison');
    const readyPostStartTime = Date.now();
    
    const readyPostResponse = await axios.get(`http://localhost:3000/posts/${firebaseUserId}?platform=instagram`);
    const readyPostEndTime = Date.now();
    const readyPostFetchTime = readyPostEndTime - readyPostStartTime;
    
    console.log(`✅ Ready post response status: ${readyPostResponse.status}`);
    console.log(`📊 Ready post count: ${readyPostResponse.data.length}`);
    console.log(`⚡ Ready post fetch time: ${readyPostFetchTime}ms`);
    
    // Compare speeds
    const speedRatio = fetchTime / readyPostFetchTime;
    console.log(`📊 Speed comparison: Facebook notifications are ${speedRatio.toFixed(2)}x ${speedRatio > 2 ? 'slower' : 'faster'} than ready posts`);
    
    if (speedRatio > 2) {
      console.log(`⚠️  WARNING: Facebook notifications are significantly slower than ready posts`);
    } else {
      console.log(`✅ SUCCESS: Facebook notifications are performing well compared to ready posts`);
    }
    
    // Test 6: Test multiple rapid requests (should be consistent)
    console.log('\n📋 Test 6: Rapid Request Consistency Test');
    const rapidTimes = [];
    
    for (let i = 0; i < 3; i++) {
      const rapidStartTime = Date.now();
      await axios.get(`http://localhost:3000/events-list/${facebookPageId}?platform=facebook`);
      const rapidEndTime = Date.now();
      rapidTimes.push(rapidEndTime - rapidStartTime);
      
      console.log(`  Request ${i + 1}: ${rapidTimes[i]}ms`);
    }
    
    const avgRapidTime = rapidTimes.reduce((a, b) => a + b, 0) / rapidTimes.length;
    const maxDeviation = Math.max(...rapidTimes) - Math.min(...rapidTimes);
    
    console.log(`📊 Average rapid request time: ${avgRapidTime.toFixed(0)}ms`);
    console.log(`📊 Max deviation: ${maxDeviation}ms`);
    
    if (maxDeviation > 500) {
      console.log(`⚠️  WARNING: High variation in response times - may indicate instability`);
    } else {
      console.log(`✅ SUCCESS: Consistent response times - optimization working well`);
    }
    
    console.log('\n🎉 Facebook Optimization Test Complete!');
    console.log('📋 Summary:');
    console.log(`  - Initial fetch: ${fetchTime}ms`);
    console.log(`  - Force refresh: ${forceFetchTime}ms`);
    console.log(`  - Ready post comparison: ${speedRatio.toFixed(2)}x`);
    console.log(`  - Consistency: ${maxDeviation}ms deviation`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testFacebookOptimization(); 