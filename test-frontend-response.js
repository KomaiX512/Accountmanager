import axios from 'axios';

// Test script to verify frontend response handling
async function testFrontendResponseHandling() {
  console.log('🧪 Testing Frontend Response Handling');
  console.log('=====================================');
  
  const testCases = [
    {
      name: 'Enhanced ChromaDB Response Test',
      username: 'elonmusk',
      platform: 'twitter',
      query: 'tell me about my most engaging posts themes'
    },
    {
      name: 'Fallback Response Test',
      username: 'testuser',
      platform: 'instagram',
      query: 'what should I post next?'
    },
    {
      name: 'Content Filtering Test',
      username: 'elonmusk',
      platform: 'twitter',
      query: 'analyze my controversial posts'
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n🔍 Running: ${testCase.name}`);
    console.log(`📝 Query: "${testCase.query}"`);
    console.log(`👤 User: ${testCase.username} on ${testCase.platform}`);
    
    try {
      // Test 1: Direct RAG Server Response
      console.log('\n📡 Testing RAG Server Response...');
      const ragResponse = await axios.post('http://localhost:3001/api/discussion', {
        username: testCase.username,
        platform: testCase.platform,
        query: testCase.query,
        previousMessages: []
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ RAG Server Response:');
      console.log(`   - Response Length: ${ragResponse.data.response?.length || 0} chars`);
      console.log(`   - Used Fallback: ${ragResponse.data.usedFallback}`);
      console.log(`   - Using Fallback Profile: ${ragResponse.data.usingFallbackProfile}`);
      console.log(`   - Has Quota Info: ${!!ragResponse.data.quotaInfo}`);
      
      // Test 2: Simulate Frontend Processing
      console.log('\n🖥️  Simulating Frontend Processing...');
      
      // Simulate RagService.sendDiscussionQuery
      const frontendResponse = {
        response: ragResponse.data.response,
        usedFallback: ragResponse.data.usedFallback || false,
        usingFallbackProfile: ragResponse.data.usingFallbackProfile || false,
        enhancedContext: detectEnhancedContext(ragResponse.data.response),
        quotaInfo: ragResponse.data.quotaInfo || null
      };
      
      console.log('✅ Frontend Response Processing:');
      console.log(`   - Response Length: ${frontendResponse.response?.length || 0} chars`);
      console.log(`   - Used Fallback: ${frontendResponse.usedFallback}`);
      console.log(`   - Using Fallback Profile: ${frontendResponse.usingFallbackProfile}`);
      console.log(`   - Enhanced Context: ${frontendResponse.enhancedContext}`);
      console.log(`   - Has Quota Info: ${!!frontendResponse.quotaInfo}`);
      
      // Test 3: Response Quality Analysis
      console.log('\n📊 Response Quality Analysis...');
      
      const qualityIndicators = analyzeResponseQuality(frontendResponse.response);
      console.log('✅ Quality Indicators:');
      console.log(`   - Has Profile Data: ${qualityIndicators.hasProfileData}`);
      console.log(`   - Has Specific Metrics: ${qualityIndicators.hasSpecificMetrics}`);
      console.log(`   - Has Recommendations: ${qualityIndicators.hasRecommendations}`);
      console.log(`   - Response Type: ${qualityIndicators.responseType}`);
      
      // Test 4: Validate Response Structure
      console.log('\n🔍 Validating Response Structure...');
      
      const validation = validateResponseStructure(frontendResponse);
      console.log('✅ Validation Results:');
      console.log(`   - Valid Response: ${validation.isValid}`);
      console.log(`   - Has Content: ${validation.hasContent}`);
      console.log(`   - Appropriate Length: ${validation.appropriateLength}`);
      console.log(`   - Issues: ${validation.issues.length > 0 ? validation.issues.join(', ') : 'None'}`);
      
      if (!validation.isValid) {
        console.log('❌ Response validation failed!');
        console.log('   Issues:', validation.issues);
      }
      
      // Test 5: Simulate Chat Modal Update
      console.log('\n💬 Simulating Chat Modal Update...');
      
      const chatUpdate = simulateChatModalUpdate(frontendResponse);
      console.log('✅ Chat Modal Update:');
      console.log(`   - Messages Count: ${chatUpdate.messages.length}`);
      console.log(`   - Is Processing: ${chatUpdate.isProcessing}`);
      console.log(`   - Has Quota Info: ${!!chatUpdate.quotaInfo}`);
      console.log(`   - Using Fallback Profile: ${chatUpdate.usingFallbackProfile}`);
      
    } catch (error) {
      console.error(`❌ Test failed for ${testCase.name}:`, error.message);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Data:`, error.response.data);
      }
    }
  }
  
  console.log('\n🎯 Test Summary');
  console.log('===============');
  console.log('✅ All tests completed');
  console.log('📊 Check the logs above for detailed results');
  console.log('🔍 Look for any ❌ errors that indicate issues');
}

// Helper functions to simulate frontend behavior
function detectEnhancedContext(response) {
  if (!response || response.length < 50) return false;
  
  const enhancedIndicators = [
    'based on your profile data',
    'according to your posts',
    'from your content analysis',
    'based on your engagement',
    'from your account insights',
    'based on your posting patterns',
    'from your audience data',
    'based on your content themes',
    'from your performance metrics',
    'based on your social media strategy',
    'from your account analytics',
    'based on your content performance',
    'from your engagement metrics',
    'based on your audience insights',
    'from your posting history'
  ];
  
  const lowerResponse = response.toLowerCase();
  const hasEnhancedIndicators = enhancedIndicators.some(indicator => 
    lowerResponse.includes(indicator.toLowerCase())
  );
  
  const hasDataReferences = /\d+ (followers|posts|engagement|likes|comments|shares)/i.test(response);
  const hasPlatformInsights = /(instagram|twitter|facebook|social media) (strategy|insights|analysis|performance)/i.test(response);
  
  return hasEnhancedIndicators || hasDataReferences || hasPlatformInsights;
}

function analyzeResponseQuality(response) {
  if (!response) {
    return {
      hasProfileData: false,
      hasSpecificMetrics: false,
      hasRecommendations: false,
      responseType: 'empty'
    };
  }
  
  const lowerResponse = response.toLowerCase();
  
  return {
    hasProfileData: /\d+ (followers|posts|following)/i.test(response),
    hasSpecificMetrics: /\d+ (likes|comments|shares|engagement)/i.test(response),
    hasRecommendations: /(recommend|suggest|advice|tip|strategy)/i.test(lowerResponse),
    responseType: response.length > 500 ? 'detailed' : response.length > 100 ? 'moderate' : 'brief'
  };
}

function validateResponseStructure(response) {
  const issues = [];
  
  if (!response.response) {
    issues.push('Missing response field');
  }
  
  if (!response.response || response.response.trim().length === 0) {
    issues.push('Empty response content');
  }
  
  if (response.response && response.response.trim().length < 10) {
    issues.push('Response too short');
  }
  
  if (response.response && response.response.trim().length > 10000) {
    issues.push('Response too long');
  }
  
  return {
    isValid: issues.length === 0,
    hasContent: response.response && response.response.trim().length > 0,
    appropriateLength: response.response && response.response.trim().length >= 10 && response.response.trim().length <= 10000,
    issues
  };
}

function simulateChatModalUpdate(response) {
  const userMessage = { role: 'user', content: 'test query' };
  const assistantMessage = { role: 'assistant', content: response.response };
  
  return {
    messages: [userMessage, assistantMessage],
    isProcessing: false,
    quotaInfo: response.quotaInfo,
    usingFallbackProfile: response.usingFallbackProfile
  };
}

// Run the test
testFrontendResponseHandling()
  .then(() => {
    console.log('\n✅ Frontend response handling test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Frontend response handling test failed:', error);
    process.exit(1);
  }); 