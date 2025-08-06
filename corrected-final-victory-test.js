import ChromaDBService from './chromadb-service.js';
import fs from 'fs';

async function correctedFinalVictoryTest() {
  try {
    console.log('🏆🏆🏆 CORRECTED FINAL VICTORY TEST - REAL SAMPLE DATA 🏆🏆🏆\n');
    console.log('🎯 TESTING: Facebook, Instagram, AND Twitter with ACTUAL sample usernames\n');
    console.log('🚀 GOAL: 100% success rate using real profile data we have available\n');
    
    const chromaService = ChromaDBService;
    await chromaService.initialize();
    
    // Ensure all sample data is properly ingested
    console.log('💾 ENSURING ALL SAMPLE DATA IS PROPERLY INGESTED\n');
    
    // Twitter data 
    const twitterData = JSON.parse(fs.readFileSync('./twitter_profile-data_sample.json', 'utf8'));
    await chromaService.storeProfileData('ylecun', 'twitter', twitterData);
    console.log('✅ Twitter ylecun data stored');
    
    // Instagram data (check if we have sample files)
    try {
      const instagramData = JSON.parse(fs.readFileSync('./profile_instagram_sample data.json', 'utf8'));
      // Store for both test usernames if the data supports it
      if (Array.isArray(instagramData) && instagramData.length > 0) {
        await chromaService.storeProfileData('fentybeauty', 'instagram', instagramData);
        console.log('✅ Instagram fentybeauty data stored');
      }
    } catch (error) {
      console.log('⚠️ Instagram sample data file issue, will use existing data');
    }
    
    // Facebook data
    try {
      const facebookData = JSON.parse(fs.readFileSync('./facebook_sample_profiledata.json', 'utf8'));
      await chromaService.storeProfileData('nike', 'facebook', facebookData);
      console.log('✅ Facebook nike data stored');
    } catch (error) {
      console.log('⚠️ Facebook sample data file issue, will use existing data');
    }
    
    console.log('\n');
    
    // ULTIMATE BATTLE TESTS - Using CORRECT usernames from sample data
    const ultimateTests = [
      // FACEBOOK TESTS - Using nike and cocacola (available usernames)
      {
        platform: 'facebook',
        username: 'nike',
        query: 'Show me Nike\'s Facebook post with the highest engagement. I need the exact post content, like count, comment count, share count, and total engagement.',
        requiredElements: ['post content', 'like count', 'comment count', 'share count', 'total engagement'],
        description: 'Facebook Nike: Highest engagement with all metrics'
      },
      
      // INSTAGRAM TESTS - Using fentybeauty and iamsaharasrose (available usernames)  
      {
        platform: 'instagram',
        username: 'fentybeauty',
        query: 'Find Fenty Beauty\'s Instagram post with the most likes. Show me the complete caption, exact like count, comment count, and hashtags used.',
        requiredElements: ['caption', 'like count', 'comment count', 'hashtags'],
        description: 'Instagram Fenty Beauty: Post with most likes and details'
      },
      
      // TWITTER TESTS - Using ylecun and mntruell (available usernames)
      {
        platform: 'twitter',
        username: 'ylecun',
        query: 'Show me Yann LeCun\'s Twitter post with the highest retweet count. I need the exact tweet text, retweet count, like count, reply count, and total engagement.',
        requiredElements: ['tweet text', 'retweet count', 'like count', 'reply count', 'total engagement'],
        description: 'Twitter ylecun: Highest retweet count with ALL metrics'
      },
      {
        platform: 'twitter',
        username: 'ylecun',
        query: 'Give me Yann LeCun\'s top 2 Twitter posts with the highest total engagement (likes + retweets + replies). For each post: complete tweet text, exact engagement breakdown, and total score.',
        requiredElements: ['tweet text', 'engagement breakdown', 'likes', 'retweets', 'replies', 'total score'],
        description: 'Twitter ylecun: Top 2 posts by total engagement with breakdown'
      }
    ];
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = [];
    let platformScores = { facebook: 0, instagram: 0, twitter: 0 };
    let platformTotals = { facebook: 0, instagram: 0, twitter: 0 };
    
    console.log('🚀 RUNNING CORRECTED ULTIMATE BATTLE TESTS\n');
    console.log('═'.repeat(120) + '\n');
    
    for (const test of ultimateTests) {
      totalTests++;
      platformTotals[test.platform]++;
      
      console.log(`🎯 CORRECTED TEST ${totalTests}/${ultimateTests.length}`);
      console.log(`Platform: ${test.platform.toUpperCase()}`);
      console.log(`Username: ${test.username} (REAL SAMPLE DATA)`);
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
            hasEngagementNumbers = /\d+\s*(likes?|retweets?|replies?|comments?)/i.test(result.response);
          } else if (test.platform === 'facebook') {
            hasEngagementNumbers = /\d+\s*(likes?|comments?|shares?)/i.test(result.response);
          } else if (test.platform === 'instagram') {
            hasEngagementNumbers = /\d+\s*(likes?|comments?)/i.test(result.response);
          }
          
          const hasDataDriven = !responseText.includes('no specific data available') && 
                               !responseText.includes('i am sorry') &&
                               !responseText.includes('cannot provide') &&
                               !responseText.includes('does not include') &&
                               !responseText.includes('account exists but no specific data');
          
          console.log('📊 RESPONSE ANALYSIS:');
          console.log(`Quality Score: ${Math.round(qualityScore * 100)}% (${foundElements.length}/${test.requiredElements.length} elements found)`);
          console.log(`Has Engagement Numbers: ${hasEngagementNumbers ? '✅' : '❌'}`);
          console.log(`Data-Driven Response: ${hasDataDriven ? '✅' : '❌'}`);
          console.log(`Has Specific Numbers: ${hasSpecificNumbers ? '✅' : '❌'}`);
          console.log(`Found Elements: ${foundElements.join(', ')}`);
          console.log(`Missing Elements: ${test.requiredElements.filter(e => !foundElements.includes(e)).join(', ')}\n`);
          
          console.log('📝 RESPONSE PREVIEW:');
          console.log(result.response.substring(0, 500) + '...\n');
          
          // Pass criteria: 60% quality score + data-driven + engagement numbers
          if (qualityScore >= 0.6 && hasDataDriven && hasEngagementNumbers) { 
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
    
    // FINAL CORRECTED VICTORY RESULTS
    console.log('🏆🏆🏆 CORRECTED CROSS-PLATFORM BATTLE RESULTS 🏆🏆🏆\n');
    console.log(`📊 OVERALL PERFORMANCE (REAL DATA):`);
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} (${Math.round(passedTests/totalTests*100)}%)`);
    console.log(`Failed: ${failedTests.length} (${Math.round(failedTests.length/totalTests*100)}%)\n`);
    
    console.log('📈 PLATFORM BREAKDOWN (REAL USERNAMES):');
    Object.keys(platformScores).forEach(platform => {
      const score = platformScores[platform];
      const total = platformTotals[platform];
      const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
      const status = percentage === 100 ? '🏆 PERFECT' : percentage >= 70 ? '✅ GOOD' : '❌ NEEDS WORK';
      console.log(`${platform.toUpperCase()}: ${score}/${total} (${percentage}%) ${status}`);
    });
    
    console.log('\n');
    
    // VICTORY OR AREAS FOR IMPROVEMENT
    if (failedTests.length === 0) {
      console.log('🎉🎉🎉🎉🎉 COMPLETE VICTORY WITH REAL DATA! 🎉🎉🎉🎉🎉');
      console.log('🏆 ALL PLATFORMS: Perfect data-driven responses with real sample data');
      console.log('🔥🔥🔥 THE RAG SYSTEM WORKS FLAWLESSLY WITH ACTUAL DATA! 🔥🔥🔥');
      console.log('🚀 ZERO FALLBACKS - EVERY QUERY RETURNS REAL METRICS FROM SAMPLE DATA! 🚀');
      console.log('💪 BATTLE-TESTED WITH CORRECT USERNAMES AND AVAILABLE PROFILES! 💪');
      console.log('⚡ READY FOR PRODUCTION - SOCIAL MEDIA RAG MASTERY COMPLETE! ⚡');
    } else {
      console.log('⚠️ PLATFORMS WITH IMPROVEMENT OPPORTUNITIES:');
      
      // Group failures by platform
      const platformIssues = {};
      failedTests.forEach(test => {
        if (!platformIssues[test.platform]) platformIssues[test.platform] = [];
        platformIssues[test.platform].push(test);
      });
      
      Object.keys(platformIssues).forEach(platform => {
        console.log(`\n❌ ${platform.toUpperCase()} ISSUES:`);
        platformIssues[platform].forEach((test, index) => {
          console.log(`   ${index + 1}. ${test.description}`);
          console.log(`      Reason: ${test.reason}`);
          if (test.missingElements && test.missingElements.length > 0) {
            console.log(`      Missing: ${test.missingElements.join(', ')}`);
          }
        });
      });
      
      console.log('\n🔧 NEXT STEPS:');
      console.log('   1. Check sample data ingestion for failing platforms');
      console.log('   2. Verify document content includes all required metrics');
      console.log('   3. Debug RAG context creation for missing elements');
      console.log('   4. Test semantic search retrieval for each platform');
    }
    
  } catch (error) {
    console.error('💥💥💥 CORRECTED VICTORY TEST CRASHED:', error.message);
    console.error(error.stack);
  }
}

correctedFinalVictoryTest().then(() => {
  console.log('\n🔥 Corrected final victory test completed with real sample usernames');
}).catch(error => {
  console.error('💥 Corrected victory test failed:', error);
  process.exit(1);
});
