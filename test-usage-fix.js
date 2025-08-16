#!/usr/bin/env node

/**
 * Test script to verify the usage tracking fix
 * Run this after restarting your server to test if usage counting works
 */

const testUsageTracking = async () => {
  console.log('🧪 Testing Usage Tracking Fix...\n');
  
  const userId = 'KUvVFxnLanYTWPuSIfphby5hxJQ2'; // Your test user ID
  const baseUrl = 'http://localhost:3000';
  
  try {
    // Step 1: Get current usage
    console.log('1️⃣ Getting current usage...');
    const getResponse = await fetch(`${baseUrl}/api/user/${userId}/usage`);
    const currentUsage = await getResponse.json();
    console.log('   Current usage:', currentUsage);
    
    // Step 2: Increment posts usage
    console.log('\n2️⃣ Incrementing posts usage...');
    const incrementResponse = await fetch(`${baseUrl}/api/usage/increment/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'posts' })
    });
    
    if (!incrementResponse.ok) {
      throw new Error(`Increment failed: ${incrementResponse.status} ${incrementResponse.statusText}`);
    }
    
    const incrementResult = await incrementResponse.json();
    console.log('   Increment result:', incrementResult);
    
    // Step 3: Wait a moment for the update to process
    console.log('\n3️⃣ Waiting for update to process...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 4: Get updated usage
    console.log('\n4️⃣ Getting updated usage...');
    const updatedResponse = await fetch(`${baseUrl}/api/user/${userId}/usage`);
    const updatedUsage = await updatedResponse.json();
    console.log('   Updated usage:', updatedUsage);
    
    // Step 5: Verify the increment worked
    console.log('\n5️⃣ Verifying increment...');
    const postsIncremented = updatedUsage.postsUsed === currentUsage.postsUsed + 1;
    
    if (postsIncremented) {
      console.log('   ✅ SUCCESS: Posts usage incremented correctly!');
      console.log(`   Before: ${currentUsage.postsUsed} → After: ${updatedUsage.postsUsed}`);
    } else {
      console.log('   ❌ FAILED: Posts usage did not increment correctly');
      console.log(`   Expected: ${currentUsage.postsUsed + 1}, Got: ${updatedUsage.postsUsed}`);
    }
    
    // Step 6: Test persistence by getting usage again
    console.log('\n6️⃣ Testing persistence...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const persistenceResponse = await fetch(`${baseUrl}/api/user/${userId}/usage`);
    const persistentUsage = await persistenceResponse.json();
    
    if (persistentUsage.postsUsed === updatedUsage.postsUsed) {
      console.log('   ✅ SUCCESS: Usage persisted correctly!');
    } else {
      console.log('   ❌ FAILED: Usage did not persist!');
      console.log(`   Expected: ${updatedUsage.postsUsed}, Got: ${persistentUsage.postsUsed}`);
    }
    
    console.log('\n🏁 Test Complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
};

// Run the test
testUsageTracking();
