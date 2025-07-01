import axios from 'axios';

// Test configuration
const TEST_CONFIGS = [
  {
    name: "Basic Profile Test",
    username: "toofaced",
    platform: "instagram", 
    query: "What is my follower count and how many posts do I have?"
  },
  {
    name: "Engagement Analysis Test",
    username: "toofaced",
    platform: "instagram",
    query: "Tell me about my most engaging posts and their metrics. Which posts got the most likes and comments?"
  },
  {
    name: "Content Strategy Test", 
    username: "toofaced",
    platform: "instagram",
    query: "What content themes perform best for my account? Analyze my top posts and tell me what I should post more of."
  },
  {
    name: "Specific Data Test",
    username: "toofaced", 
    platform: "instagram",
    query: "Give me exact numbers: how many likes did my best performing post get? What was the caption?"
  },
  {
    name: "Working Profile Test (hudabeauty)",
    username: "hudabeauty",
    platform: "instagram", 
    query: "Tell me about my most engaging posts with exact metrics and engagement numbers."
  }
];

// Color codes for better output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorLog(color, message) {
  console.log(colors[color] + message + colors.reset);
}

function analyzeResponse(response, testName) {
  const analysis = {
    hasSpecificData: false,
    hasNumbers: false,
    hasEngagementMetrics: false,
    hasPostContent: false,
    isGeneric: false,
    enhancedContext: false
  };

  const responseText = response.toLowerCase();
  
  // Check for specific data indicators
  analysis.hasNumbers = /\d{1,3}(,\d{3})*/.test(response) || /\d+/.test(response);
  analysis.hasEngagementMetrics = /likes|comments|engagement|shares|views/i.test(response);
  analysis.hasPostContent = /caption|post|content|hashtag/i.test(response);
  analysis.hasSpecificData = /exact|specific|actual|real|data|metrics/i.test(response);
  
  // Check for generic fallback indicators
  analysis.isGeneric = /unfortunately|i don't have access|general advice|specific aspect|would you like/i.test(response);
  
  // IMPROVED: Check for enhanced context indicators (ChromaDB working)
  const hasRealEngagementNumbers = /\d{1,3}(,\d{3})+\s*(likes|comments|engagement)/i.test(response);
  const hasSpecificPostData = /post.*\d{1,3}(,\d{3})+/i.test(response) || /"[^"]*".*\d{1,3}(,\d{3})+/i.test(response);
  const hasAverageMetrics = /average.*\d{1,3}(,\d{3})*.*per post/i.test(response);
  const hasDetailedAnalysis = /top performer|individual posts|diving deeper|post performance/i.test(response);
  const hasRealCaptions = /"[^"]{20,}"/g.test(response); // Real captions are usually longer
  
  // Enhanced context means ChromaDB is providing real, detailed data
  analysis.enhancedContext = (hasRealEngagementNumbers || hasSpecificPostData || hasAverageMetrics || hasDetailedAnalysis) && 
                            hasRealCaptions && 
                            analysis.hasNumbers && 
                            !analysis.isGeneric;
  
  return analysis;
}

async function runComprehensiveTest() {
  colorLog('cyan', '🚀 STARTING COMPREHENSIVE RAG SYSTEM TEST');
  colorLog('cyan', '=' .repeat(60));
  
  const results = [];
  
  for (let i = 0; i < TEST_CONFIGS.length; i++) {
    const config = TEST_CONFIGS[i];
    colorLog('blue', `\n📋 TEST ${i + 1}/${TEST_CONFIGS.length}: ${config.name}`);
    colorLog('blue', `👤 Account: ${config.username} (${config.platform})`);
    colorLog('blue', `❓ Query: "${config.query}"`);
    
    try {
      // Test 1: Direct RAG Server Call
      colorLog('yellow', '\n🔸 Testing Direct RAG Server...');
      const startTime = Date.now();
      
      const ragResponse = await axios.post('http://localhost:3001/api/discussion', {
        username: config.username,
        platform: config.platform,
        query: config.query,
        previousMessages: []
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const responseTime = Date.now() - startTime;
      
      // Analyze the response
      const analysis = analyzeResponse(ragResponse.data.response, config.name);
      
      colorLog('green', `✅ Response received (${responseTime}ms)`);
      console.log(`📊 Response Length: ${ragResponse.data.response?.length || 0} chars`);
      console.log(`🔄 Used Fallback: ${ragResponse.data.usedFallback || false}`);
      console.log(`👤 Using Fallback Profile: ${ragResponse.data.usingFallbackProfile || false}`);
      console.log(`🧠 Enhanced Context: ${analysis.enhancedContext}`);
      
      // Response quality analysis
      colorLog('magenta', '\n📈 RESPONSE QUALITY ANALYSIS:');
      console.log(`   Has Specific Data: ${analysis.hasSpecificData ? '✅' : '❌'}`);
      console.log(`   Has Numbers: ${analysis.hasNumbers ? '✅' : '❌'}`);
      console.log(`   Has Engagement Metrics: ${analysis.hasEngagementMetrics ? '✅' : '❌'}`);
      console.log(`   Has Post Content: ${analysis.hasPostContent ? '✅' : '❌'}`);
      console.log(`   Is Generic Response: ${analysis.isGeneric ? '❌' : '✅'}`);
      console.log(`   Enhanced ChromaDB Context: ${analysis.enhancedContext ? '✅' : '❌'}`);
      
      // Show response preview
      colorLog('cyan', '\n📄 RESPONSE PREVIEW:');
      const preview = ragResponse.data.response.substring(0, 300);
      console.log(`"${preview}${ragResponse.data.response.length > 300 ? '...' : ''}"`);
      
      // Test 2: Frontend Service Simulation
      colorLog('yellow', '\n🔸 Testing Frontend Service Simulation...');
      
      // Simulate what the frontend RagService would do
      const frontendResult = {
        response: ragResponse.data.response,
        usedFallback: ragResponse.data.usedFallback || false,
        usingFallbackProfile: ragResponse.data.usingFallbackProfile || false,
        enhancedContext: analysis.enhancedContext,
        quotaInfo: ragResponse.data.quotaInfo || null
      };
      
      console.log(`📱 Frontend Processing: ${frontendResult.enhancedContext ? '✅ Enhanced' : '⚠️ Basic'}`);
      
      // Store results
      results.push({
        testName: config.name,
        username: config.username,
        platform: config.platform,
        query: config.query,
        responseTime,
        responseLength: ragResponse.data.response?.length || 0,
        usedFallback: ragResponse.data.usedFallback || false,
        usingFallbackProfile: ragResponse.data.usingFallbackProfile || false,
        analysis,
        success: true,
        responsePreview: preview
      });
      
      colorLog('green', `✅ Test ${i + 1} completed successfully`);
      
    } catch (error) {
      colorLog('red', `❌ Test ${i + 1} failed: ${error.message}`);
      console.log(`🔍 Error details:`, {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        stack: error.stack?.split('\n').slice(0, 3)
      });
      
      results.push({
        testName: config.name,
        username: config.username,
        platform: config.platform,
        query: config.query,
        error: error.message,
        errorDetails: {
          code: error.code,
          status: error.response?.status,
          data: error.response?.data
        },
        success: false
      });
    }
    
    // Wait between tests to avoid rate limiting
    if (i < TEST_CONFIGS.length - 1) {
      colorLog('yellow', '\n⏳ Waiting 2 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Final Summary
  colorLog('cyan', '\n' + '='.repeat(60));
  colorLog('cyan', '📊 COMPREHENSIVE TEST RESULTS SUMMARY');
  colorLog('cyan', '='.repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const withEnhancedContext = successful.filter(r => r.analysis?.enhancedContext);
  const withSpecificData = successful.filter(r => r.analysis?.hasSpecificData);
  const withNumbers = successful.filter(r => r.analysis?.hasNumbers);
  const generic = successful.filter(r => r.analysis?.isGeneric);
  
  console.log(`\n📈 Overall Results:`);
  console.log(`   Total Tests: ${results.length}`);
  console.log(`   Successful: ${successful.length} (${Math.round(successful.length/results.length*100)}%)`);
  console.log(`   Failed: ${failed.length} (${Math.round(failed.length/results.length*100)}%)`);
  
  console.log(`\n🧠 ChromaDB Performance:`);
  console.log(`   Enhanced Context: ${withEnhancedContext.length}/${successful.length} (${Math.round(withEnhancedContext.length/successful.length*100)}%)`);
  console.log(`   Specific Data: ${withSpecificData.length}/${successful.length} (${Math.round(withSpecificData.length/successful.length*100)}%)`);
  console.log(`   Has Numbers: ${withNumbers.length}/${successful.length} (${Math.round(withNumbers.length/successful.length*100)}%)`);
  console.log(`   Generic Responses: ${generic.length}/${successful.length} (${Math.round(generic.length/successful.length*100)}%)`);
  
  // Detailed results
  console.log(`\n📋 Detailed Results:`);
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    const context = result.analysis?.enhancedContext ? '🧠' : '📝';
    console.log(`   ${status} ${context} ${result.testName} (${result.username})`);
    
    if (result.success && result.analysis) {
      const quality = result.analysis.enhancedContext ? 'ENHANCED' : 
                     result.analysis.isGeneric ? 'GENERIC' : 'BASIC';
      console.log(`      Quality: ${quality}, Length: ${result.responseLength} chars`);
    }
  });
  
  // Recommendations
  console.log(`\n💡 RECOMMENDATIONS:`);
  
  if (withEnhancedContext.length === 0) {
    colorLog('red', '❌ CRITICAL: No tests showed enhanced ChromaDB context');
    console.log('   → ChromaDB is not working properly');
    console.log('   → Check ChromaDB connection and data indexing');
  } else if (withEnhancedContext.length < successful.length) {
    colorLog('yellow', '⚠️ WARNING: ChromaDB working for some accounts but not others');
    console.log('   → Check data availability for different accounts');
    console.log('   → Verify profile data format consistency');
  } else {
    colorLog('green', '✅ EXCELLENT: ChromaDB enhanced context working for all tests');
  }
  
  if (generic.length > 0) {
    colorLog('yellow', `⚠️ WARNING: ${generic.length} tests returned generic responses`);
    console.log('   → These accounts may lack sufficient data');
    console.log('   → Consider improving fallback data quality');
  }
  
  if (failed.length > 0) {
    colorLog('red', `❌ ERROR: ${failed.length} tests failed completely`);
    console.log('   → Check server connectivity and error handling');
  }
  
  colorLog('cyan', '\n🎯 CONCLUSION:');
  if (withEnhancedContext.length >= successful.length * 0.8) {
    colorLog('green', '✅ RAG system is working well with ChromaDB enhancement');
  } else if (successful.length >= results.length * 0.8) {
    colorLog('yellow', '⚠️ RAG system is working but ChromaDB needs improvement');
  } else {
    colorLog('red', '❌ RAG system has significant issues that need immediate attention');
  }
  
  console.log('\n');
}

// Run the comprehensive test
runComprehensiveTest().catch(error => {
  colorLog('red', `💥 FATAL ERROR: ${error.message}`);
  console.error(error);
  process.exit(1);
});