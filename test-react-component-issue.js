const axios = require('axios');

async function testReactComponentIssue() {
  console.log('🔍 Testing React Component Issue...\n');
  
  try {
    // Test 1: Check if the Facebook context is properly initialized
    console.log('📋 Test 1: Facebook Context Initialization');
    
    // Simulate what the Facebook context does
    const firebaseUserId = '94THUToVmtdKGNcq4A5cTONerxI3';
    
    // Step 1: Check connection (like FacebookContext.checkExistingConnection)
    const connectionResponse = await axios.get(`http://localhost:3000/api/facebook-connection/${firebaseUserId}`);
    console.log('✅ Facebook connection check successful');
    
    const facebookPageId = connectionResponse.data.facebook_page_id;
    const username = connectionResponse.data.username;
    const isFacebookConnected = !!facebookPageId;
    
    console.log(`📊 Facebook Page ID: ${facebookPageId}`);
    console.log(`📊 Username: ${username}`);
    console.log(`📊 Is Connected: ${isFacebookConnected}`);
    
    if (!isFacebookConnected) {
      console.log('❌ Facebook not connected - this would prevent notifications from showing');
      return;
    }
    
    // Test 2: Check if PlatformDashboard would receive the correct props
    console.log('\n📋 Test 2: PlatformDashboard Props Simulation');
    
    // These are the props that PlatformDashboard receives
    const platformDashboardProps = {
      platform: 'facebook',
      accountHolder: 'Muhammad Komail', // This would come from the route
      competitors: [],
      accountType: 'branding',
      onOpenChat: null
    };
    
    console.log('📊 PlatformDashboard props:', JSON.stringify(platformDashboardProps, null, 2));
    
    // Test 3: Check if the useEffect dependency array would trigger correctly
    console.log('\n📋 Test 3: useEffect Dependency Array Check');
    
    // The useEffect dependency is: [platform === 'twitter' ? twitterId : platform === 'facebook' ? facebookId : igUserId, platform]
    // For Facebook, it should be: facebookId
    
    const facebookId = facebookPageId; // This comes from useFacebook() hook
    const dependencyValue = platformDashboardProps.platform === 'facebook' ? facebookId : null;
    
    console.log(`📊 Platform: ${platformDashboardProps.platform}`);
    console.log(`📊 Facebook ID: ${facebookId}`);
    console.log(`📊 Dependency Value: ${dependencyValue}`);
    
    if (dependencyValue) {
      console.log('✅ useEffect dependency would trigger correctly');
    } else {
      console.log('❌ useEffect dependency would NOT trigger - this is the issue!');
    }
    
    // Test 4: Check if fetchNotifications would be called with correct user ID
    console.log('\n📋 Test 4: fetchNotifications User ID Check');
    
    const currentUserId = platformDashboardProps.platform === 'facebook' ? facebookId : null;
    console.log(`📊 Current User ID for fetchNotifications: ${currentUserId}`);
    
    if (currentUserId) {
      // Test the actual API call
      const notificationsResponse = await axios.get(`http://localhost:3000/events-list/${currentUserId}?platform=facebook`);
      console.log(`✅ fetchNotifications would work: ${notificationsResponse.data.length} notifications`);
    } else {
      console.log('❌ fetchNotifications would NOT be called - no user ID');
    }
    
    // Test 5: Check if the issue is in the component rendering logic
    console.log('\n📋 Test 5: Component Rendering Logic');
    
    // Simulate the conditions that would prevent rendering
    const hasNotifications = notificationsResponse.data.length > 0;
    const isPlatformFacebook = platformDashboardProps.platform === 'facebook';
    const hasFacebookId = !!facebookId;
    const isConnectedToFacebook = !!facebookPageId;
    
    console.log(`📊 Has Notifications: ${hasNotifications}`);
    console.log(`📊 Is Platform Facebook: ${isPlatformFacebook}`);
    console.log(`📊 Has Facebook ID: ${hasFacebookId}`);
    console.log(`📊 Is Connected: ${isConnectedToFacebook}`);
    
    if (hasNotifications && isPlatformFacebook && hasFacebookId && isConnectedToFacebook) {
      console.log('✅ All conditions met for notifications to show');
    } else {
      console.log('❌ Missing conditions for notifications to show:');
      if (!hasNotifications) console.log('   - No notifications available');
      if (!isPlatformFacebook) console.log('   - Platform is not Facebook');
      if (!hasFacebookId) console.log('   - No Facebook ID');
      if (!isConnected) console.log('   - Not connected to Facebook');
    }
    
    console.log('\n🎉 React component issue test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📊 Error response:', error.response.data);
    }
  }
}

testReactComponentIssue(); 