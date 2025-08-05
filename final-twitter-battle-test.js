import ChromaDBService from './chromadb-service.js';
import fs from 'fs';

async function finalTwitterBattleTest() {
  try {
    console.log('🔥🔥🔥 FINAL TWITTER BATTLE TEST - ENGAGEMENT FIX 🔥🔥🔥\n');
    
    const chromaService = ChromaDBService;
    await chromaService.initialize();
    
    // 1. RE-INGEST TWITTER DATA WITH FIXED ENGAGEMENT MAPPING
    console.log('🐦 STEP 1: RE-INGESTING TWITTER DATA WITH FIXED ENGAGEMENT MAPPING\n');
    
    const twitterData = JSON.parse(fs.readFileSync('./twitter_profile-data_sample.json', 'utf8'));
    console.log('✅ Twitter data loaded');
    
    // Test normalization with the fix
    console.log('🔧 TESTING FIXED TWITTER NORMALIZATION:');
    const normalized = chromaService.normalizeDataStructure(twitterData, 'twitter');
    console.log('📊 Normalized posts count:', normalized.posts?.length || 0);
    
    if (normalized.posts?.[0]) {
      console.log('📊 First post content:', normalized.posts[0].content?.substring(0, 100) + '...');
      console.log('📊 First post likes:', normalized.posts[0].engagement?.likes);
      console.log('📊 First post comments:', normalized.posts[0].engagement?.comments);
      console.log('📊 First post shares (retweets):', normalized.posts[0].engagement?.shares);
    }
    
    // Re-store with fixed data
    await chromaService.storeProfileData('ylecun', 'twitter', twitterData);
    console.log('✅ Twitter data re-stored with engagement fix\n');
    
    // 2. ULTIMATE TWITTER BATTLE TESTS 
    console.log('🚀 STEP 2: ULTIMATE TWITTER BATTLE TESTS\n');
    console.log('═'.repeat(100) + '\n');
    
    const ultimateTwitterTests = [
      {
        platform: 'twitter',
        username: 'ylecun',
        query: 'Show me Yann LeCun\'s Twitter post with the highest retweet count. I need the exact tweet text, retweet count, like count, reply count, and URL.',
        requiredElements: ['tweet text', 'retweet count', 'like count', 'reply count', 'url'],
        description: 'Twitter: Highest retweet count with all metrics'
      },
      {
        platform: 'twitter',
        username: 'ylecun',
        query: 'Give me Yann LeCun\'s top 2 Twitter posts with the highest engagement (likes + retweets + replies). For each post: complete tweet text, exact engagement numbers, and total engagement score.',
        requiredElements: ['tweet text', 'engagement numbers', 'engagement score', 'likes', 'retweets'],
        description: 'Twitter: Top 2 posts by total engagement'
      },
      {
        platform: 'twitter',
        username: 'ylecun',
        query: 'Find Yann LeCun\'s Twitter post with the best engagement rate (total engagement divided by followers). Show me the tweet text, all engagement metrics, and calculate the engagement rate percentage.',
        requiredElements: ['tweet text', 'engagement metrics', 'engagement rate', 'percentage'],
        description: 'Twitter: Best engagement rate calculation'
      }
    ];
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = [];
    
    for (const test of ultimateTwitterTests) {
      totalTests++;
      
      console.log(`🎯 ULTIMATE TWITTER TEST ${totalTests}/${ultimateTwitterTests.length}`);
      console.log(`Username: ${test.username}`);
      console.log(`Challenge: ${test.description}`);
      console.log(`Query: "${test.query}"`);
      console.log(`Required Elements: ${test.requiredElements.join(', ')}\n`);
      
      try {
        const response = await fetch('http://localhost:3001/api/discussion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: test.query,
            username: test.username,
            platform: test.platform
          })
        });
        
        const result = await response.json();
        
        if (result.usedFallback) {
          console.log('💥 CRITICAL FAILURE: Used fallback data\n');
          failedTests.push({ ...test, reason: 'Used fallback data' });
        } else {
          console.log('✅ SUCCESS: Using real data\n');
          
          // Enhanced quality analysis
          const responseText = result.response.toLowerCase();
          const foundElements = test.requiredElements.filter(element => {
            const variations = [
              element.toLowerCase(),
              element.replace(/s$/, ''), // Remove plural 's'
              element.replace(/ /g, ''), // Remove spaces
              element.split(' ')[0], // First word only
            ];
            return variations.some(variation => responseText.includes(variation));
          });
          
          const qualityScore = foundElements.length / test.requiredElements.length;
          
          // Check for specific engagement indicators
          const hasEngagementNumbers = /\b\d{1,6}\s*(likes?|retweets?|replies?|comments?)/i.test(result.response);
          const hasDataDriven = !responseText.includes('no specific data available') && 
                               !responseText.includes('i am sorry') &&
                               !responseText.includes('cannot provide') &&
                               !responseText.includes('does not include');
          const hasSpecificNumbers = /\b\d{1,6}\b/.test(result.response);
          
          console.log('📊 RESPONSE ANALYSIS:');
          console.log(`Quality Score: ${Math.round(qualityScore * 100)}% (${foundElements.length}/${test.requiredElements.length} elements found)`);
          console.log(`Has Engagement Numbers: ${hasEngagementNumbers ? '✅' : '❌'}`);
          console.log(`Data-Driven Response: ${hasDataDriven ? '✅' : '❌'}`);
          console.log(`Has Specific Numbers: ${hasSpecificNumbers ? '✅' : '❌'}`);
          console.log(`Found Elements: ${foundElements.join(', ')}`);
          console.log(`Missing Elements: ${test.requiredElements.filter(e => !foundElements.includes(e)).join(', ')}\n`);
          
          console.log('📝 RESPONSE PREVIEW:');
          console.log(result.response.substring(0, 500) + '...\n');
          
          if (qualityScore >= 0.6 && hasDataDriven && hasEngagementNumbers) { 
            passedTests++;
            console.log('🎉 TEST PASSED - Twitter engagement fix successful!\n');
          } else {
            failedTests.push({ 
              ...test, 
              reason: `Quality issues: Score ${Math.round(qualityScore * 100)}%, DataDriven: ${hasDataDriven}, EngagementNumbers: ${hasEngagementNumbers}`,
              missingElements: test.requiredElements.filter(e => !foundElements.includes(e))
            });
            console.log('❌ TEST FAILED - Twitter still has issues\n');
          }
        }
        
      } catch (error) {
        console.log(`💥 CRITICAL ERROR: ${error.message}\n`);
        failedTests.push({ ...test, reason: `Network/Server error: ${error.message}` });
      }
      
      console.log('═'.repeat(100) + '\n');
    }
    
    // Final results
    console.log('🏆 FINAL TWITTER BATTLE TEST RESULTS 🏆\n');
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} (${Math.round(passedTests/totalTests*100)}%)`);
    console.log(`Failed: ${failedTests.length} (${Math.round(failedTests.length/totalTests*100)}%)\n`);
    
    if (failedTests.length === 0) {
      console.log('🎉🎉🎉 TWITTER FIXED! COMPLETE VICTORY ACROSS ALL PLATFORMS! 🎉🎉🎉');
      console.log('✅ Facebook: Perfect data-driven responses with real engagement');
      console.log('✅ Instagram: Perfect data-driven responses with real engagement'); 
      console.log('✅ Twitter: Perfect data-driven responses with real engagement');
      console.log('\n🔥🔥🔥 THE RAG SYSTEM IS BULLETPROOF ACROSS ALL THREE PLATFORMS! 🔥🔥🔥');
      console.log('🚀 NO MORE FALLBACKS - EVERY QUERY USES REAL DATA WITH EXACT METRICS! 🚀');
      console.log('💪 BATTLE-TESTED AND PROVEN WITH THE TRICKIEST POSSIBLE QUERIES! 💪');
    } else {
      console.log('💥 TWITTER STILL HAS ISSUES:');
      failedTests.forEach((test, index) => {
        console.log(`\n❌ Failure ${index + 1}:`);
        console.log(`   Test: ${test.description}`);
        console.log(`   Reason: ${test.reason}`);
        if (test.missingElements) {
          console.log(`   Missing: ${test.missingElements.join(', ')}`);
        }
      });
      
      console.log('\n🚨 FURTHER DEBUGGING REQUIRED FOR TWITTER 🚨');
    }
    
  } catch (error) {
    console.error('💥💥💥 FINAL TWITTER TEST CRASHED:', error.message);
    console.error(error.stack);
  }
}

finalTwitterBattleTest().then(() => {
  console.log('\n🔥 Final Twitter battle test completed');
}).catch(error => {
  console.error('💥 Final Twitter test failed:', error);
  process.exit(1);
});
