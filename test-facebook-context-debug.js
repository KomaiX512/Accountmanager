const axios = require('axios');

async function testFacebookContextDebug() {
  console.log('🔧 Testing Facebook Context Debug...');
  
  try {
    // Test 1: Check if the Facebook connection API is working
    console.log('\n📋 Test 1: Facebook Connection API Test');
    
    const firebaseUserId = '94THUToVmtdKGNcq4A5cTONerxI3';
    
    const connectionResponse = await axios.get(`http://localhost:3000/api/facebook-connection/${firebaseUserId}`);
    
    console.log(`📊 Facebook connection response:`, connectionResponse.data);
    
    const facebookPageId = connectionResponse.data.facebook_page_id;
    const username = connectionResponse.data.username;
    const isConnected = !!facebookPageId;
    
    console.log(`📊 Facebook Page ID: ${facebookPageId}`);
    console.log(`📊 Username: ${username}`);
    console.log(`📊 Is Connected: ${isConnected}`);
    
    // Test 2: Simulate what FacebookContext would do
    console.log('\n📋 Test 2: FacebookContext Simulation');
    
    if (connectionResponse.data.facebook_page_id) {
      console.log('✅ FacebookContext would set:');
      console.log(`   - userId: ${connectionResponse.data.facebook_page_id}`);
      console.log(`   - username: ${connectionResponse.data.username || null}`);
      console.log(`   - isConnected: true`);
    } else {
      console.log('❌ FacebookContext would set:');
      console.log(`   - userId: null`);
      console.log(`   - username: null`);
      console.log(`   - isConnected: false`);
    }
    
    // Test 3: Simulate what FacebookDashboard would receive
    console.log('\n📋 Test 3: FacebookDashboard Context Values');
    
    const contextValues = {
      facebookPageId: facebookPageId,
      facebookUsername: username,
      isConnected: isConnected,
      currentUserId: firebaseUserId
    };
    
    console.log(`📊 Context values:`, contextValues);
    
    // Test 4: Check if the conditions for fetchNotifications would be met
    console.log('\n📋 Test 4: fetchNotifications Conditions');
    
    const hasFacebookPageId = !!facebookPageId;
    const hasCurrentUser = !!firebaseUserId;
    const isComponentMounted = true; // Simulate component mounted
    
    console.log(`📊 Conditions for fetchNotifications:`);
    console.log(`   - hasFacebookPageId: ${hasFacebookPageId}`);
    console.log(`   - hasCurrentUser: ${hasCurrentUser}`);
    console.log(`   - isComponentMounted: ${isComponentMounted}`);
    
    const allConditionsMet = hasFacebookPageId && hasCurrentUser && isComponentMounted;
    console.log(`📊 All conditions met: ${allConditionsMet}`);
    
    if (allConditionsMet) {
      console.log('✅ fetchNotifications would be called');
    } else {
      console.log('❌ fetchNotifications would NOT be called');
    }
    
    // Test 5: Check the useEffect conditions
    console.log('\n📋 Test 5: useEffect Conditions');
    
    const isConnectedCondition = isConnected && facebookPageId && isComponentMounted;
    console.log(`📊 isConnected condition: ${isConnectedCondition}`);
    console.log(`   - isConnected: ${isConnected}`);
    console.log(`   - facebookPageId: ${facebookPageId}`);
    console.log(`   - isComponentMounted: ${isComponentMounted}`);
    
    if (isConnectedCondition) {
      console.log('✅ First useEffect would call fetchNotifications');
    } else {
      console.log('❌ First useEffect would NOT call fetchNotifications');
    }
    
    const additionalCondition = facebookPageId && isComponentMounted && firebaseUserId;
    console.log(`📊 Additional condition: ${additionalCondition}`);
    console.log(`   - facebookPageId: ${facebookPageId}`);
    console.log(`   - isComponentMounted: ${isComponentMounted}`);
    console.log(`   - currentUser.uid: ${firebaseUserId}`);
    
    if (additionalCondition) {
      console.log('✅ Additional useEffect would call fetchNotifications');
    } else {
      console.log('❌ Additional useEffect would NOT call fetchNotifications');
    }
    
    console.log('\n🎉 Facebook Context Debug Test COMPLETED!');
    
    if (allConditionsMet) {
      console.log('✅ All conditions are met - notifications should be fetched');
    } else {
      console.log('❌ Some conditions are not met - this explains why notifications are not showing');
    }
    
  } catch (error) {
    console.error('❌ Facebook Context Debug Test FAILED:', error.message);
    process.exit(1);
  }
}

testFacebookContextDebug(); 