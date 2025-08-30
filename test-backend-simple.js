// Complete End-to-End AI Image Editing Test with Stability AI
import axios from 'axios';

async function testStabilityAIIntegration() {
  console.log(' COMPLETE STABILITY AI INTEGRATION TEST');
  console.log('=========================================\n');

  const baseURL = 'http://localhost:3002';
  const testData = {
    imageKey: 'campaign_ready_post_1756312603276_e3e1e71b.jpg',
    platform: 'twitter',
    username: 'muhammad_muti',
    prompt: 'convert to beautiful watercolor painting style'
  };

  let testsPassed = 0;
  let totalTests = 4;

  // Test 1: Backend Server Health
  console.log('🏥 Test 1: Backend Server Health');
  try {
    await axios.get(`${baseURL}/health`, { timeout: 5000 });
    console.log('✅ Backend server: RUNNING');
    testsPassed++;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('✅ Backend server: RUNNING (404 expected for test endpoint)');
      testsPassed++;
    } else {
      console.log('❌ Backend server: NOT ACCESSIBLE');
      console.log('   Error:', error.code || error.message);
      return;
    }
  }

  // Test 2: AI Image Edit Endpoint
  console.log('\n🤖 Test 2: AI Image Edit Endpoint');
  try {
    const startTime = Date.now();
    console.log(`📤 Requesting AI edit: "${testData.prompt}"`);
    
    const response = await axios.post(`${baseURL}/api/ai-image-edit`, testData, {
      timeout: 60000, // 1 minute timeout
      headers: { 'Content-Type': 'application/json' }
    });
    
    const duration = (Date.now() - startTime) / 1000;
    
    if (response.data.success) {
      console.log(`✅ AI Edit Success: ${duration.toFixed(2)} seconds`);
      console.log(`📸 Original: ${response.data.originalImageUrl}`);
      console.log(`🎨 Edited: ${response.data.editedImageUrl}`);
      console.log(`🔑 Edit Key: ${response.data.editedImageKey}`);
      testsPassed++;
    } else {
      console.log('❌ AI Edit Failed:', response.data.error);
    }
    
  } catch (error) {
    console.log('❌ AI Edit Request Failed:', error.response?.status, error.message);
    console.log('   Response:', error.response?.data);
  }

  // Test 3: Image Access URLs
  console.log('\n🖼️ Test 3: Image Access URLs');
  try {
    const imageUrl = `${baseURL}/api/r2-image/${testData.username}/${testData.imageKey}?platform=${testData.platform}`;
    const response = await axios.head(imageUrl, { timeout: 10000 });
    
    if (response.status === 200) {
      console.log('✅ Original image accessible');
      console.log(`📊 Content-Type: ${response.headers['content-type']}`);
      testsPassed++;
    } else {
      console.log('❌ Original image not accessible');
    }
  } catch (error) {
    console.log('❌ Image access failed:', error.response?.status);
  }

  // Test 4: Complete Workflow Validation
  console.log('\n🔄 Test 4: Complete Workflow Validation');
  try {
    // Simulate frontend workflow
    const workflowData = {
      imageKey: testData.imageKey,
      platform: testData.platform, 
      username: testData.username,
      prompt: 'make it look like a vintage photograph'
    };
    
    console.log('📝 Simulating complete frontend workflow...');
    const startTime = Date.now();
    
    const aiResponse = await axios.post(`${baseURL}/api/ai-image-edit`, workflowData, {
      timeout: 60000
    });
    
    const duration = (Date.now() - startTime) / 1000;
    
    if (aiResponse.data.success) {
      console.log(`✅ Complete workflow: ${duration.toFixed(2)} seconds`);
      console.log('🎯 Ready for frontend testing!');
      testsPassed++;
    } else {
      console.log('❌ Workflow failed:', aiResponse.data.error);
    }
    
  } catch (error) {
    console.log('❌ Workflow test failed:', error.message);
  }

  // Final Results
  console.log('\n📊 INTEGRATION TEST RESULTS');
  console.log('============================');
  console.log(`✅ Passed: ${testsPassed}/${totalTests} tests`);
  console.log(`❌ Failed: ${totalTests - testsPassed}/${totalTests} tests`);
  
  if (testsPassed === totalTests) {
    console.log('\n🎉 STABILITY AI INTEGRATION: FULLY WORKING!');
    console.log('✅ Backend endpoints functional');
    console.log('✅ AI processing operational');
    console.log('✅ Image handling working');
    console.log('✅ Complete workflow validated');
    console.log('\n🚀 READY FOR USER TESTING!');
    console.log('👉 Start frontend: npm run dev');
    console.log('👉 Right-click any image → "Edit with AI"');
  } else {
    console.log('\n⚠️ INTEGRATION ISSUES DETECTED');
    console.log('🔧 Fix the failing tests before user testing');
  }
}

testStabilityAIIntegration();
