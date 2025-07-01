import axios from 'axios';

// Simulate the exact RagService.sendDiscussionQuery function
class RagServiceSimulator {
  static RAG_SERVER_URLS = ['http://localhost:3001'];
  
  static async tryServerUrls(endpoint, requestFn, urls) {
    let lastError = null;
    
    for (const baseUrl of urls) {
      try {
        console.log(`[RagService] 🌐 Attempting request to: ${baseUrl}${endpoint}`);
        const response = await requestFn(baseUrl + endpoint);
        return response;
      } catch (error) {
        console.log(`[RagService] ❌ Failed with ${baseUrl}: ${error.message}`);
        lastError = error;
      }
    }
    
    throw lastError || new Error('Failed to connect to any RAG service endpoint');
  }
  
  static detectEnhancedContext(response) {
    if (!response || typeof response !== 'string') return false;
    
    // Check for enhanced context indicators (ChromaDB working)
    const hasRealEngagementNumbers = /\d{1,3}(,\d{3})+\s*(likes|comments|engagement)/i.test(response);
    const hasSpecificPostData = /post.*\d{1,3}(,\d{3})+/i.test(response) || /"[^"]*".*\d{1,3}(,\d{3})+/i.test(response);
    const hasAverageMetrics = /average.*\d{1,3}(,\d{3})*.*per post/i.test(response);
    const hasDetailedAnalysis = /top performer|individual posts|diving deeper|post performance/i.test(response);
    const hasRealCaptions = /"[^"]{20,}"/g.test(response); // Real captions are usually longer
    const isGeneric = /unfortunately|i don't have access|general advice|specific aspect|would you like/i.test(response);
    const hasNumbers = /\d{1,3}(,\d{3})*/.test(response) || /\d+/.test(response);
    
    // Enhanced context means ChromaDB is providing real, detailed data
    return (hasRealEngagementNumbers || hasSpecificPostData || hasAverageMetrics || hasDetailedAnalysis) && 
           hasRealCaptions && 
           hasNumbers && 
           !isGeneric;
  }
  
  static processMarkdownFormatting(response) {
    // Simple markdown processing simulation
    return response.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\*(.*?)\*/g, '<em>$1</em>');
  }
  
  static async sendDiscussionQuery(
    username, 
    query, 
    previousMessages = [],
    platform = 'instagram'
  ) {
    console.log(`[RagService] 🔍 STARTING discussion query for ${platform}/${username}`);
    console.log(`[RagService] 📝 Query: "${query}"`);
    console.log(`[RagService] 📊 Previous messages count: ${previousMessages.length}`);
    console.log(`[RagService] 🎯 Target RAG servers:`, this.RAG_SERVER_URLS);
    
    try {
      const requestPayload = {
        username,
        query,
        previousMessages,
        platform,
        sessionId: `${platform}_${username}_${Date.now()}`,
        timestamp: new Date().toISOString()
      };
      
      console.log(`[RagService] 📦 Request payload:`, {
        username: requestPayload.username,
        platform: requestPayload.platform,
        queryLength: requestPayload.query.length,
        previousMessagesCount: requestPayload.previousMessages.length,
        sessionId: requestPayload.sessionId
      });
      
      const response = await this.tryServerUrls(`/api/discussion`, (url) => {
        return axios.post(url, requestPayload, {
          timeout: 120000,
          withCredentials: false,
          headers: {
            'Content-Type': 'application/json',
            'X-Platform': platform,
            'X-Username': username
          }
        });
      }, this.RAG_SERVER_URLS);
      
      console.log(`[RagService] ✅ RAW response received for ${platform}/${username}`);
      console.log(`[RagService] 📝 Response data structure:`, {
        hasResponse: !!response.data?.response,
        responseLength: response.data?.response?.length || 0,
        usedFallback: response.data?.usedFallback,
        usingFallbackProfile: response.data?.usingFallbackProfile,
        hasQuotaInfo: !!response.data?.quotaInfo,
        dataKeys: Object.keys(response.data || {})
      });
      
      if (response.data?.response) {
        console.log(`[RagService] 📄 Response preview:`, response.data.response.substring(0, 200) + '...');
      }
      
      // Validate response structure
      if (!response.data || !response.data.response) {
        console.error(`[RagService] ❌ INVALID response structure for ${platform}/${username}:`, response.data);
        throw new Error('Invalid response structure from RAG server');
      }
      
      // Check if response contains enhanced context indicators
      const enhancedContext = this.detectEnhancedContext(response.data.response);
      console.log(`[RagService] 🧠 Enhanced context detected: ${enhancedContext} for ${platform}/${username}`);
      
      if (enhancedContext) {
        console.log(`[RagService] 🎯 ENHANCED CONTEXT FOUND - ChromaDB is working!`);
      } else {
        console.log(`[RagService] ⚠️ NO enhanced context detected - basic response`);
      }
      
      // Process markdown formatting
      if (response.data.response) {
        response.data.response = this.processMarkdownFormatting(response.data.response);
        console.log(`[RagService] ✨ Processed markdown formatting for ${platform}/${username}`);
      }
      
      const finalResponse = {
        response: response.data.response,
        usedFallback: response.data.usedFallback || false,
        usingFallbackProfile: response.data.usingFallbackProfile || false,
        enhancedContext: enhancedContext,
        quotaInfo: response.data.quotaInfo || null
      };
      
      console.log(`[RagService] 🎉 FINAL response for ${platform}/${username}:`, {
        responseLength: finalResponse.response.length,
        usedFallback: finalResponse.usedFallback,
        usingFallbackProfile: finalResponse.usingFallbackProfile,
        enhancedContext: finalResponse.enhancedContext,
        hasQuotaInfo: !!finalResponse.quotaInfo
      });
      
      return finalResponse;
      
    } catch (error) {
      console.error(`[RagService] ❌ CRITICAL ERROR in discussion query for ${platform}/${username}:`, {
        errorMessage: error.message,
        errorCode: error.code,
        responseStatus: error.response?.status,
        responseData: error.response?.data
      });
      
      throw error;
    }
  }
}

// Test scenarios that simulate real frontend usage
const FRONTEND_TEST_SCENARIOS = [
  {
    name: "User asks about engagement metrics",
    username: "hudabeauty",
    platform: "instagram",
    query: "tell me about my most engaging posts and their metrics",
    expectedEnhanced: true
  },
  {
    name: "User asks about follower count",
    username: "toofaced", 
    platform: "instagram",
    query: "what is my follower count?",
    expectedEnhanced: false
  },
  {
    name: "User asks for specific post analysis",
    username: "hudabeauty",
    platform: "instagram", 
    query: "which of my posts got the most likes and what was the caption?",
    expectedEnhanced: true
  },
  {
    name: "User asks for content strategy",
    username: "toofaced",
    platform: "instagram",
    query: "what type of content should I post more of?",
    expectedEnhanced: false
  }
];

async function runFrontendSimulationTest() {
  console.log('🚀 STARTING FRONTEND SIMULATION TEST');
  console.log('=' .repeat(60));
  
  const results = [];
  
  for (let i = 0; i < FRONTEND_TEST_SCENARIOS.length; i++) {
    const scenario = FRONTEND_TEST_SCENARIOS[i];
    console.log(`\n📋 FRONTEND TEST ${i + 1}/${FRONTEND_TEST_SCENARIOS.length}: ${scenario.name}`);
    console.log(`👤 Account: ${scenario.username} (${scenario.platform})`);
    console.log(`❓ Query: "${scenario.query}"`);
    console.log(`🎯 Expected Enhanced: ${scenario.expectedEnhanced ? 'YES' : 'NO'}`);
    
    try {
      const startTime = Date.now();
      
      // Simulate exactly what happens in the frontend
      const response = await RagServiceSimulator.sendDiscussionQuery(
        scenario.username,
        scenario.query,
        [], // No previous messages for these tests
        scenario.platform
      );
      
      const responseTime = Date.now() - startTime;
      
      // Analyze results
      const success = !!response.response && response.response.length > 0;
      const enhancedMatched = response.enhancedContext === scenario.expectedEnhanced;
      
      console.log(`\n📊 FRONTEND TEST RESULTS:`);
      console.log(`   ✅ Response received: ${success}`);
      console.log(`   🧠 Enhanced context: ${response.enhancedContext ? 'YES' : 'NO'}`);
      console.log(`   🎯 Expected enhanced: ${scenario.expectedEnhanced ? 'YES' : 'NO'}`);
      console.log(`   ✅ Expectation matched: ${enhancedMatched ? 'YES' : 'NO'}`);
      console.log(`   ⏱️ Response time: ${responseTime}ms`);
      console.log(`   📏 Response length: ${response.response.length} chars`);
      console.log(`   🔄 Used fallback: ${response.usedFallback}`);
      console.log(`   👤 Using fallback profile: ${response.usingFallbackProfile}`);
      
      results.push({
        scenario: scenario.name,
        username: scenario.username,
        platform: scenario.platform,
        success,
        enhancedContext: response.enhancedContext,
        expectedEnhanced: scenario.expectedEnhanced,
        enhancedMatched,
        responseTime,
        responseLength: response.response.length,
        usedFallback: response.usedFallback,
        usingFallbackProfile: response.usingFallbackProfile
      });
      
      console.log(`✅ Frontend test ${i + 1} completed successfully`);
      
    } catch (error) {
      console.log(`❌ Frontend test ${i + 1} failed: ${error.message}`);
      results.push({
        scenario: scenario.name,
        username: scenario.username,
        platform: scenario.platform,
        success: false,
        error: error.message
      });
    }
    
    // Wait between tests
    if (i < FRONTEND_TEST_SCENARIOS.length - 1) {
      console.log('\n⏳ Waiting 2 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 FRONTEND SIMULATION TEST SUMMARY');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success);
  const withEnhanced = successful.filter(r => r.enhancedContext);
  const expectationMatched = successful.filter(r => r.enhancedMatched);
  
  console.log(`\n📈 Results:`);
  console.log(`   Total Tests: ${results.length}`);
  console.log(`   Successful: ${successful.length}/${results.length} (${Math.round(successful.length/results.length*100)}%)`);
  console.log(`   Enhanced Context: ${withEnhanced.length}/${successful.length} (${Math.round(withEnhanced.length/successful.length*100)}%)`);
  console.log(`   Expectations Matched: ${expectationMatched.length}/${successful.length} (${Math.round(expectationMatched.length/successful.length*100)}%)`);
  
  console.log(`\n📋 Detailed Results:`);
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    const enhanced = result.enhancedContext ? '🧠' : '📝';
    const matched = result.enhancedMatched ? '🎯' : '⚠️';
    console.log(`   ${status} ${enhanced} ${matched} ${result.scenario} (${result.username})`);
  });
  
  console.log(`\n🎯 FRONTEND CONCLUSION:`);
  if (successful.length === results.length && expectationMatched.length >= successful.length * 0.8) {
    console.log('✅ Frontend integration is working perfectly with ChromaDB!');
  } else if (successful.length >= results.length * 0.8) {
    console.log('⚠️ Frontend integration is working but ChromaDB detection needs fine-tuning');
  } else {
    console.log('❌ Frontend integration has issues that need immediate attention');
  }
  
  console.log('\n');
}

// Run the frontend simulation test
runFrontendSimulationTest().catch(error => {
  console.error(`💥 FATAL ERROR: ${error.message}`);
  console.error(error);
  process.exit(1);
}); 