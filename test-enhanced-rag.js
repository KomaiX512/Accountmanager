import axios from 'axios';
import fs from 'fs';
import path from 'path';

// 🚀 BATTLE TESTING SCRIPT FOR ENHANCED RAG WITH CHROMADB
// Testing with fentybeauty Instagram account with various challenging queries

const RAG_SERVER_URL = 'http://localhost:3001';
const TEST_USERNAME = 'fentybeauty';
const TEST_PLATFORM = 'instagram';

class EnhancedRAGTester {
  constructor() {
    this.testResults = [];
    this.startTime = Date.now();
    this.testsPassed = 0;
    this.testsFailed = 0;
  }

  // 🔥 CHALLENGING TEST QUERIES FOR FENTYBEAUTY
  getTestQueries() {
    return [
      {
        category: 'Profile Analysis',
        query: 'Tell me about the uniqueness of this account',
        expectedKeywords: ['unique', 'brand', 'cosmetics', 'inclusive', 'diverse']
      },
      {
        category: 'Engagement Analysis', 
        query: 'What are the engagement patterns and performance metrics?',
        expectedKeywords: ['engagement', 'likes', 'comments', 'performance', 'metrics']
      },
      {
        category: 'Content Strategy',
        query: 'What type of content performs best for this brand?',
        expectedKeywords: ['content', 'posts', 'best', 'performing', 'strategy']
      },
      {
        category: 'Brand Voice',
        query: 'Describe the brand personality and communication style',
        expectedKeywords: ['brand', 'personality', 'style', 'voice', 'communication']
      },
      {
        category: 'Audience Insights',
        query: 'Who is the target audience and what do they engage with most?',
        expectedKeywords: ['audience', 'target', 'engage', 'followers', 'community']
      },
      {
        category: 'Product Focus',
        query: 'What are the main product categories and their promotion strategies?',
        expectedKeywords: ['product', 'cosmetics', 'makeup', 'beauty', 'promotion']
      },
      {
        category: 'Competition Analysis',
        query: 'How does this account compare to competitors in the beauty space?',
        expectedKeywords: ['compete', 'comparison', 'beauty', 'market', 'industry']
      },
      {
        category: 'Growth Strategy',
        query: 'What strategies could improve follower growth and engagement?',
        expectedKeywords: ['growth', 'strategies', 'improve', 'followers', 'recommendations']
      },
      {
        category: 'Content Themes',
        query: 'What are the recurring themes and messaging in recent posts?',
        expectedKeywords: ['themes', 'messaging', 'posts', 'content', 'recurring']
      },
      {
        category: 'Influencer Partnerships',
        query: 'Are there any notable collaborations or influencer partnerships?',
        expectedKeywords: ['collaboration', 'partnership', 'influencer', 'brand', 'work']
      }
    ];
  }

  async initializeTest() {
    console.log(`\n🚀 ENHANCED RAG BATTLE TESTING - ${TEST_USERNAME.toUpperCase()} ON ${TEST_PLATFORM.toUpperCase()}`);
    console.log('=' * 80);
    
    try {
      // Test server connection
      console.log('📡 Testing server connection...');
      const healthCheck = await axios.get(`${RAG_SERVER_URL}/health`);
      console.log('✅ Server is running');
      
      // Test ChromaDB status
      console.log('🔍 Checking ChromaDB status...');
      try {
        const chromaTest = await axios.post(`${RAG_SERVER_URL}/admin/test-chromadb`);
        if (chromaTest.data.success) {
          console.log('✅ ChromaDB is connected and ready');
        } else {
          console.log('⚠️ ChromaDB not available - using fallback mode');
        }
      } catch (error) {
        console.log('⚠️ ChromaDB test failed - will use fallback');
      }
      
      // Force reindex the test profile
      console.log(`🔄 Reindexing profile data for ${TEST_USERNAME}...`);
      try {
        const reindexResult = await axios.post(`${RAG_SERVER_URL}/admin/reindex-profile`, {
          username: TEST_USERNAME,
          platform: TEST_PLATFORM
        });
        
        if (reindexResult.data.success) {
          console.log('✅ Profile data successfully indexed in vector database');
        } else {
          console.log('⚠️ Profile indexing failed, but continuing with tests');
        }
      } catch (error) {
        console.log('⚠️ Could not reindex profile data, continuing anyway');
      }
      
      console.log('\n🎯 Starting battle tests...\n');
      return true;
      
    } catch (error) {
      console.error('❌ Failed to initialize test environment:', error.message);
      return false;
    }
  }

  async runSingleTest(testCase, index) {
    const testStartTime = Date.now();
    console.log(`\n📋 Test ${index + 1}/10: ${testCase.category}`);
    console.log(`❓ Query: "${testCase.query}"`);
    console.log('⏳ Processing...');
    
    try {
      // Send the query to enhanced RAG
      const response = await axios.post(`${RAG_SERVER_URL}/api/discussion`, {
        username: TEST_USERNAME,
        query: testCase.query,
        platform: TEST_PLATFORM,
        previousMessages: []
      });
      
      const processingTime = Date.now() - testStartTime;
      const aiResponse = response.data.response;
      
      // Analyze response quality
      const quality = this.analyzeResponseQuality(aiResponse, testCase);
      
      const testResult = {
        category: testCase.category,
        query: testCase.query,
        response: aiResponse,
        processingTime,
        quality,
        usedFallback: response.data.usedFallback || false,
        quotaInfo: response.data.quotaInfo || null,
        timestamp: new Date().toISOString()
      };
      
      this.testResults.push(testResult);
      
      // Display results
      console.log(`⚡ Response time: ${processingTime}ms`);
      console.log(`🎯 Quality score: ${quality.score}/100`);
      console.log(`📊 Used fallback: ${testResult.usedFallback ? 'Yes' : 'No'}`);
      console.log(`📝 Response preview: "${aiResponse.substring(0, 150)}..."`);
      
      if (quality.score >= 70) {
        console.log('✅ PASSED - High quality response');
        this.testsPassed++;
      } else {
        console.log('❌ FAILED - Response quality below threshold');
        this.testsFailed++;
      }
      
      return testResult;
      
    } catch (error) {
      console.error(`❌ Test failed: ${error.message}`);
      
      const failedResult = {
        category: testCase.category,
        query: testCase.query,
        error: error.message,
        processingTime: Date.now() - testStartTime,
        quality: { score: 0, issues: ['Request failed'] },
        timestamp: new Date().toISOString()
      };
      
      this.testResults.push(failedResult);
      this.testsFailed++;
      return failedResult;
    }
  }

  analyzeResponseQuality(response, testCase) {
    let score = 0;
    const issues = [];
    const strengths = [];
    
    // Check response length (should be substantial but not too long)
    if (response.length < 100) {
      issues.push('Response too short');
    } else if (response.length > 2000) {
      issues.push('Response too long');
      score += 10;
    } else {
      score += 20;
      strengths.push('Appropriate length');
    }
    
    // Check for expected keywords
    let keywordMatches = 0;
    for (const keyword of testCase.expectedKeywords) {
      if (response.toLowerCase().includes(keyword.toLowerCase())) {
        keywordMatches++;
      }
    }
    
    const keywordScore = (keywordMatches / testCase.expectedKeywords.length) * 30;
    score += keywordScore;
    
    if (keywordScore >= 20) {
      strengths.push(`Good keyword coverage (${keywordMatches}/${testCase.expectedKeywords.length})`);
    } else {
      issues.push(`Poor keyword coverage (${keywordMatches}/${testCase.expectedKeywords.length})`);
    }
    
    // Check for specific data points (numbers, percentages, specific metrics)
    const dataPoints = response.match(/\d+[,.]?\d*\s*(followers|likes|comments|posts|%|percent)/gi) || [];
    if (dataPoints.length > 0) {
      score += 20;
      strengths.push(`Contains specific data points (${dataPoints.length})`);
    } else {
      issues.push('Lacks specific data points');
    }
    
    // Check for actionable insights
    const actionWords = ['recommend', 'suggest', 'should', 'could', 'strategy', 'improve', 'optimize'];
    const actionMatches = actionWords.filter(word => 
      response.toLowerCase().includes(word.toLowerCase())
    ).length;
    
    if (actionMatches >= 2) {
      score += 20;
      strengths.push('Contains actionable insights');
    } else {
      issues.push('Lacks actionable insights');
    }
    
    // Check for structure and clarity
    const hasSections = response.includes('•') || response.includes('-') || response.includes('##');
    if (hasSections) {
      score += 10;
      strengths.push('Well-structured response');
    } else {
      issues.push('Poor structure/formatting');
    }
    
    return {
      score: Math.min(score, 100),
      issues,
      strengths,
      keywordMatches,
      dataPoints: dataPoints.length,
      actionWords: actionMatches
    };
  }

  async testSemanticSearch() {
    console.log('\n🔍 TESTING SEMANTIC SEARCH CAPABILITIES');
    console.log('-'.repeat(50));
    
    const semanticQueries = [
      'brand personality',
      'engagement metrics',
      'top performing content',
      'audience demographics',
      'product launches'
    ];
    
    for (const query of semanticQueries) {
      try {
        console.log(`\n🔎 Testing semantic search: "${query}"`);
        
        const response = await axios.post(`${RAG_SERVER_URL}/admin/test-semantic-search`, {
          username: TEST_USERNAME,
          query: query,
          platform: TEST_PLATFORM
        });
        
        if (response.data.success) {
          console.log(`✅ Found ${response.data.resultsCount} relevant documents`);
          console.log(`📊 Context length: ${response.data.contextLength} characters`);
          console.log(`🎯 Top result type: ${response.data.results[0]?.type || 'none'}`);
        } else {
          console.log(`❌ Semantic search failed: ${response.data.error}`);
        }
        
      } catch (error) {
        console.log(`❌ Semantic search error: ${error.message}`);
      }
    }
  }

  async runAllTests() {
    const initialized = await this.initializeTest();
    if (!initialized) {
      console.log('❌ Initialization failed, aborting tests');
      return;
    }
    
    // Test semantic search capabilities
    await this.testSemanticSearch();
    
    // Run main RAG tests
    const testQueries = this.getTestQueries();
    
    for (let i = 0; i < testQueries.length; i++) {
      await this.runSingleTest(testQueries[i], i);
      
      // Add delay between tests to respect rate limits
      if (i < testQueries.length - 1) {
        console.log('⏸️ Waiting 3 seconds...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    this.generateReport();
  }

  generateReport() {
    const totalTime = Date.now() - this.startTime;
    const totalTests = this.testsPassed + this.testsFailed;
    const successRate = (this.testsPassed / totalTests * 100).toFixed(1);
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 ENHANCED RAG BATTLE TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`🎯 Account tested: ${TEST_USERNAME} (${TEST_PLATFORM})`);
    console.log(`⏱️ Total test time: ${(totalTime / 1000).toFixed(1)} seconds`);
    console.log(`✅ Tests passed: ${this.testsPassed}/${totalTests}`);
    console.log(`❌ Tests failed: ${this.testsFailed}/${totalTests}`);
    console.log(`📈 Success rate: ${successRate}%`);
    
    // Calculate average quality score
    const qualityScores = this.testResults.filter(r => r.quality?.score).map(r => r.quality.score);
    const avgQuality = qualityScores.length > 0 ? 
      (qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length).toFixed(1) : 0;
    console.log(`🎯 Average quality score: ${avgQuality}/100`);
    
    // Response time analysis
    const responseTimes = this.testResults.filter(r => r.processingTime).map(r => r.processingTime);
    if (responseTimes.length > 0) {
      const avgResponseTime = (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(0);
      const maxResponseTime = Math.max(...responseTimes);
      console.log(`⚡ Average response time: ${avgResponseTime}ms`);
      console.log(`⚡ Max response time: ${maxResponseTime}ms`);
    }
    
    // Fallback usage analysis
    const fallbackUsed = this.testResults.filter(r => r.usedFallback).length;
    console.log(`🔄 Fallback responses: ${fallbackUsed}/${totalTests}`);
    
    console.log('\n🏆 TOP PERFORMING CATEGORIES:');
    const categoriesByScore = this.testResults
      .filter(r => r.quality?.score)
      .sort((a, b) => b.quality.score - a.quality.score)
      .slice(0, 3);
    
    categoriesByScore.forEach((result, index) => {
      console.log(`${index + 1}. ${result.category}: ${result.quality.score}/100`);
    });
    
    console.log('\n⚠️ AREAS FOR IMPROVEMENT:');
    const lowPerforming = this.testResults
      .filter(r => r.quality?.score && r.quality.score < 70)
      .slice(0, 3);
    
    if (lowPerforming.length === 0) {
      console.log('🎉 All tests passed quality threshold!');
    } else {
      lowPerforming.forEach((result, index) => {
        console.log(`${index + 1}. ${result.category}: ${result.quality.score}/100`);
        console.log(`   Issues: ${result.quality.issues.join(', ')}`);
      });
    }
    
    // Save detailed results
    this.saveResults();
    
    console.log('\n🎯 FINAL VERDICT:');
    if (successRate >= 80 && avgQuality >= 75) {
      console.log('🏆 EXCELLENT - Enhanced RAG is working superbly!');
    } else if (successRate >= 60 && avgQuality >= 60) {
      console.log('👍 GOOD - Enhanced RAG shows significant improvement');
    } else if (successRate >= 40) {
      console.log('⚠️ NEEDS WORK - Some improvements but not quite there yet');
    } else {
      console.log('❌ POOR - Major issues need to be addressed');
    }
    
    console.log('\n✨ Enhanced RAG with ChromaDB battle testing completed!');
  }

  saveResults() {
    const resultsDir = path.join(process.cwd(), 'test-results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `enhanced-rag-test-${TEST_USERNAME}-${timestamp}.json`;
    const filepath = path.join(resultsDir, filename);
    
    const report = {
      metadata: {
        username: TEST_USERNAME,
        platform: TEST_PLATFORM,
        testDate: new Date().toISOString(),
        totalTests: this.testsPassed + this.testsFailed,
        testsPassed: this.testsPassed,
        testsFailed: this.testsFailed,
        successRate: (this.testsPassed / (this.testsPassed + this.testsFailed) * 100).toFixed(1),
        avgQuality: this.testResults.filter(r => r.quality?.score).length > 0 ?
          (this.testResults.filter(r => r.quality?.score).reduce((sum, r) => sum + r.quality.score, 0) / 
           this.testResults.filter(r => r.quality?.score).length).toFixed(1) : 0
      },
      results: this.testResults
    };
    
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Detailed results saved to: ${filename}`);
  }
}

// 🚀 RUN THE BATTLE TESTS
const tester = new EnhancedRAGTester();
tester.runAllTests().catch(error => {
  console.error('❌ Battle testing failed:', error);
  process.exit(1);
}); 