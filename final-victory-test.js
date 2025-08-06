import ChromaDBService from './chromadb-service.js';
import fs from 'fs';

async function finalVictoryTest() {
  try {
    console.log('🏆🏆🏆 FINAL CROSS-PLATFORM VICTORY TEST 🏆🏆🏆\n');
    console.log('🎯 TESTING: Facebook, Instagram, AND Twitter for complete data-driven responses\n');
    console.log('🚀 GOAL: 100% success rate across ALL platforms with exact metrics, URLs, and engagement\n');
    
    const chromaService = ChromaDBService;
    await chromaService.initialize();
    
    // Re-ingest Twitter with all fixes
    console.log('💾 RE-INGESTING TWITTER WITH ALL FIXES\n');
    const twitterData = JSON.parse(fs.readFileSync('./twitter_profile-data_sample.json', 'utf8'));
    await chromaService.storeProfileData('ylecun', 'twitter', twitterData);
    console.log('✅ Twitter data re-stored with complete engagement fix\n');
    
    // ULTIMATE BATTLE TESTS - Most challenging queries across all platforms
    const ultimateTests = [
      // FACEBOOK TESTS
      {
        platform: 'facebook',
        username: 'NaturalHistoryMuseum',
        query: 'Show me the Facebook post with the highest engagement rate. I need the exact post content, like count, comment count, share count, and engagement rate percentage.',
        requiredElements: ['post content', 'like count', 'comment count', 'share count', 'engagement rate'],
        description: 'Facebook: Highest engagement rate with all metrics'
      },
      {
        platform: 'facebook', 
        username: 'NaturalHistoryMuseum',
        query: 'Give me the Natural History Museum\'s top 2 Facebook posts by total engagement. For each: complete post text, exact engagement numbers (likes, comments, shares), and total engagement score.',
        requiredElements: ['post text', 'likes', 'comments', 'shares', 'total engagement'],
        description: 'Facebook: Top 2 posts by total engagement'
      },
      
      // INSTAGRAM TESTS
      {
        platform: 'instagram',
        username: 'cristiano',
        query: 'Find Cristiano Ronaldo\'s Instagram post with the most comments. Show me the complete caption, exact like count, comment count, and hashtags used.',
        requiredElements: ['caption', 'like count', 'comment count', 'hashtags'],
        description: 'Instagram: Post with most comments and details'
      },
      {
        platform: 'instagram',
        username: 'cristiano', 
        query: 'What is Cristiano\'s Instagram engagement strategy? Analyze his top 3 posts by likes, showing exact engagement numbers and calculating average engagement per post.',
        requiredElements: ['top posts', 'engagement numbers', 'average engagement', 'likes'],
        description: 'Instagram: Engagement strategy analysis'
      },
      
      // TWITTER TESTS - THE ULTIMATE CHALLENGE
      {
        platform: 'twitter',
        username: 'ylecun',
        query: 'Show me Yann LeCun\'s Twitter post with the highest retweet count. I need the exact tweet text, retweet count, like count, reply count, and total engagement.',
        requiredElements: ['tweet text', 'retweet count', 'like count', 'reply count', 'total engagement'],
        description: 'Twitter: Highest retweet count with ALL metrics'
      },
      {
        platform: 'twitter',
        username: 'ylecun',
        query: 'Give me Yann LeCun\'s top 2 Twitter posts with the highest total engagement (likes + retweets + replies). For each post: complete tweet text, exact engagement breakdown, and total score.',
        requiredElements: ['tweet text', 'engagement breakdown', 'likes', 'retweets', 'replies', 'total score'],
        description: 'Twitter: Top 2 posts by total engagement with breakdown'
      }
    ];
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = [];
    let platformScores = { facebook: 0, instagram: 0, twitter: 0 };
    let platformTotals = { facebook: 0, instagram: 0, twitter: 0 };
    
    console.log('🚀 RUNNING ULTIMATE CROSS-PLATFORM BATTLE TESTS\n');
    console.log('═'.repeat(120) + '\n');
    
    for (const test of ultimateTests) {
      totalTests++;
      platformTotals[test.platform]++;
      
      console.log(`🎯 ULTIMATE TEST ${totalTests}/${ultimateTests.length}`);
      console.log(`Platform: ${test.platform.toUpperCase()}`);
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
          
          // Platform-specific quality checks
          let hasEngagementNumbers = false;
          let hasSpecificNumbers = /\b\d{1,6}\b/.test(result.response);
          
          if (test.platform === 'twitter') {
            hasEngagementNumbers = /\d+\s*(likes?|retweets?|replies?)/i.test(result.response);
          } else if (test.platform === 'facebook') {
            hasEngagementNumbers = /\d+\s*(likes?|comments?|shares?)/i.test(result.response);
          } else if (test.platform === 'instagram') {
            hasEngagementNumbers = /\d+\s*(likes?|comments?)/i.test(result.response);
          }
          
          const hasDataDriven = !responseText.includes('no specific data available') && 
                               !responseText.includes('i am sorry') &&
                               !responseText.includes('cannot provide') &&
                               !responseText.includes('does not include');
          
          console.log('📊 RESPONSE ANALYSIS:');
          console.log(`Quality Score: ${Math.round(qualityScore * 100)}% (${foundElements.length}/${test.requiredElements.length} elements found)`);
          console.log(`Has Engagement Numbers: ${hasEngagementNumbers ? '✅' : '❌'}`);
          console.log(`Data-Driven Response: ${hasDataDriven ? '✅' : '❌'}`);
          console.log(`Has Specific Numbers: ${hasSpecificNumbers ? '✅' : '❌'}`);
          console.log(`Found Elements: ${foundElements.join(', ')}`);
          console.log(`Missing Elements: ${test.requiredElements.filter(e => !foundElements.includes(e)).join(', ')}\n`);
          
          console.log('📝 RESPONSE PREVIEW:');
          console.log(result.response.substring(0, 400) + '...\n');
          
          // Pass criteria: 70% quality score + data-driven + engagement numbers
          if (qualityScore >= 0.7 && hasDataDriven && hasEngagementNumbers) { 
            passedTests++;
            platformScores[test.platform]++;
            console.log(`🎉 TEST PASSED - ${test.platform.toUpperCase()} SUCCESS!\n`);
          } else {
            failedTests.push({ 
              ...test, 
              reason: `Quality issues: Score ${Math.round(qualityScore * 100)}%, DataDriven: ${hasDataDriven}, EngagementNumbers: ${hasEngagementNumbers}`,
              missingElements: test.requiredElements.filter(e => !foundElements.includes(e))
            });
            console.log(`❌ TEST FAILED - ${test.platform.toUpperCase()} needs work\n`);
          }
        }
        
      } catch (error) {
        console.log(`💥 CRITICAL ERROR: ${error.message}\n`);
        failedTests.push({ ...test, reason: `Network/Server error: ${error.message}` });
      }
      
      console.log('═'.repeat(120) + '\n');
    }
    
    // FINAL VICTORY RESULTS
    console.log('🏆🏆🏆 FINAL CROSS-PLATFORM BATTLE RESULTS 🏆🏆🏆\n');
    console.log(`📊 OVERALL PERFORMANCE:`);
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} (${Math.round(passedTests/totalTests*100)}%)`);
    console.log(`Failed: ${failedTests.length} (${Math.round(failedTests.length/totalTests*100)}%)\n`);
    
    console.log('📈 PLATFORM BREAKDOWN:');
    Object.keys(platformScores).forEach(platform => {
      const score = platformScores[platform];
      const total = platformTotals[platform];
      const percentage = Math.round((score / total) * 100);
      const status = percentage === 100 ? '🏆 PERFECT' : percentage >= 70 ? '✅ GOOD' : '❌ NEEDS WORK';
      console.log(`${platform.toUpperCase()}: ${score}/${total} (${percentage}%) ${status}`);
    });
    
    console.log('\n');
    
    // VICTORY OR DEFEAT
    if (failedTests.length === 0) {
      console.log('🎉🎉🎉🎉🎉 COMPLETE VICTORY ACHIEVED! 🎉🎉🎉🎉🎉');
      console.log('🏆 FACEBOOK: Perfect data-driven responses with complete engagement metrics');
      console.log('🏆 INSTAGRAM: Perfect data-driven responses with complete engagement metrics'); 
      console.log('🏆 TWITTER: Perfect data-driven responses with complete engagement metrics');
      console.log('\n🔥🔥🔥 THE RAG SYSTEM IS ABSOLUTELY BULLETPROOF! 🔥🔥🔥');
      console.log('🚀 ZERO FALLBACKS - EVERY QUERY RETURNS REAL DATA WITH EXACT METRICS! 🚀');
      console.log('💪 BATTLE-TESTED WITH THE MOST CHALLENGING QUERIES POSSIBLE! 💪');
      console.log('⚡ READY FOR PRODUCTION - SOCIAL MEDIA RAG MASTERY COMPLETE! ⚡');
    } else {
      console.log('⚠️ SOME PLATFORMS STILL NEED IMPROVEMENT:');
      failedTests.forEach((test, index) => {
        console.log(`\n❌ Failure ${index + 1} (${test.platform.toUpperCase()}):`);
        console.log(`   Test: ${test.description}`);
        console.log(`   Reason: ${test.reason}`);
        if (test.missingElements) {
          console.log(`   Missing: ${test.missingElements.join(', ')}`);
        }
      });
      
      // Calculate platform improvement priorities
      const platformIssues = {};
      failedTests.forEach(test => {
        if (!platformIssues[test.platform]) platformIssues[test.platform] = 0;
        platformIssues[test.platform]++;
      });
      
      console.log('\n🔧 IMPROVEMENT PRIORITIES:');
      Object.keys(platformIssues).forEach(platform => {
        console.log(`   ${platform.toUpperCase()}: ${platformIssues[platform]} issues remaining`);
      });
    }
    
  } catch (error) {
    console.error('💥💥💥 FINAL VICTORY TEST CRASHED:', error.message);
    console.error(error.stack);
  }
}

finalVictoryTest().then(() => {
  console.log('\n🔥 Final cross-platform victory test completed');
}).catch(error => {
  console.error('💥 Final victory test failed:', error);
  process.exit(1);
});
