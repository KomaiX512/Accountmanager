import ChromaDBService from './chromadb-service.js';
import fs from 'fs';

async function ultimateBattleTest() {
  try {
    console.log('🔥🔥🔥 ULTIMATE RAG BATTLE TEST - NO MERCY 🔥🔥🔥\n');
    console.log('Testing the MOST CHALLENGING queries across all platforms\n');
    
    const chromaService = ChromaDBService;
    await chromaService.initialize();
    
    // Ultra-challenging test queries that demand perfection
    const ultimateTests = [
      // FACEBOOK CHALLENGES
      {
        platform: 'facebook',
        username: 'cocacola',
        query: 'Give me the EXACT post with the highest engagement. I need the specific post content, precise like/comment/share counts, the post URL, and the engagement rate percentage. No approximations.',
        requiredElements: ['specific post content', 'exact likes number', 'exact comments number', 'exact shares number', 'post URL', 'engagement rate'],
        description: 'Facebook: Highest engaging post with all metrics + URL'
      },
      {
        platform: 'facebook', 
        username: 'cocacola',
        query: 'Show me 3 posts with engagement over 1000. For each post, give me: 1) Complete post text 2) Exact engagement numbers 3) Post URL 4) Hashtags used 5) Engagement rate calculation',
        requiredElements: ['post text', 'engagement numbers', 'post URL', 'hashtags', 'engagement rate'],
        description: 'Facebook: Multi-post analysis with complete data'
      },
      
      // INSTAGRAM CHALLENGES  
      {
        platform: 'instagram',
        username: 'netflix', // We need to test with actual Instagram data
        query: 'Give me the Instagram post with the highest likes-to-comments ratio. Show me the exact post content, precise engagement metrics, post URL, and calculate the engagement rate.',
        requiredElements: ['post content', 'likes count', 'comments count', 'post URL', 'engagement rate', 'ratio calculation'],
        description: 'Instagram: Advanced engagement analysis with ratios'
      },
      {
        platform: 'instagram',
        username: 'netflix',
        query: 'Find the Instagram post with the most comments. Give me the complete caption, exact comment count, likes count, post URL, hashtags used, and mention who has the best comment engagement.',
        requiredElements: ['caption', 'comment count', 'likes count', 'post URL', 'hashtags', 'engagement analysis'],
        description: 'Instagram: Comment-focused deep analysis'
      },
      
      // TWITTER CHALLENGES
      {
        platform: 'twitter',
        username: 'netflix', // We need to test with actual Twitter data  
        query: 'Show me the Twitter post with the highest retweet rate. I need the exact tweet text, retweet count, like count, reply count, tweet URL, and retweet-to-like ratio calculation.',
        requiredElements: ['tweet text', 'retweet count', 'like count', 'reply count', 'tweet URL', 'ratio calculation'],
        description: 'Twitter: Retweet performance analysis'
      },
      {
        platform: 'twitter',
        username: 'netflix', 
        query: 'Give me 2 Twitter posts with the best engagement rates. For each: complete tweet text, all engagement metrics, tweet URL, hashtags, mentions, and calculate total engagement score.',
        requiredElements: ['tweet text', 'engagement metrics', 'tweet URL', 'hashtags', 'mentions', 'engagement score'],
        description: 'Twitter: Multi-tweet comprehensive analysis'
      }
    ];
    
    console.log('📊 CHECKING DATA AVAILABILITY FOR ALL PLATFORMS...\n');
    
    // Check what data we actually have
    const collections = ['facebook_profiles', 'instagram_profiles', 'twitter_profiles'];
    const dataAvailability = {};
    
    for (const collectionName of collections) {
      try {
        const collection = await chromaService.client.getCollection({ name: collectionName });
        const count = await collection.count();
        
        if (count > 0) {
          // Get sample data to see what usernames we have
          const sample = await collection.get({ limit: 5, include: ['metadatas'] });
          const usernames = [...new Set(sample.metadatas.map(m => m.username))];
          dataAvailability[collectionName] = { count, usernames };
          
          console.log(`✅ ${collectionName}: ${count} documents`);
          console.log(`   Available usernames: ${usernames.join(', ')}\n`);
        } else {
          dataAvailability[collectionName] = { count: 0, usernames: [] };
          console.log(`❌ ${collectionName}: EMPTY - No data available\n`);
        }
      } catch (error) {
        dataAvailability[collectionName] = { count: 0, usernames: [] };
        console.log(`❌ ${collectionName}: Collection not found\n`);
      }
    }
    
    // Load and ingest sample data for Instagram and Twitter if needed
    const sampleFiles = [
      { file: './instagram_sample_profiledata.json', platform: 'instagram', username: 'netflix' },
      { file: './twitter_sample_profiledata.json', platform: 'twitter', username: 'netflix' }
    ];
    
    for (const { file, platform, username } of sampleFiles) {
      try {
        if (fs.existsSync(file)) {
          console.log(`📥 INGESTING ${platform.toUpperCase()} SAMPLE DATA...`);
          const data = JSON.parse(fs.readFileSync(file, 'utf8'));
          await chromaService.storeProfileData(username, platform, data);
          console.log(`✅ ${platform} data stored successfully\n`);
        } else {
          console.log(`⚠️  ${file} not found - using existing data only\n`);
        }
      } catch (error) {
        console.log(`❌ Failed to load ${file}: ${error.message}\n`);
      }
    }
    
    // Now run the ultimate battle tests
    console.log('🚀 STARTING ULTIMATE BATTLE TESTS...\n');
    console.log('═'.repeat(100) + '\n');
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = [];
    
    for (const test of ultimateTests) {
      totalTests++;
      
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
          console.log('💥 CRITICAL FAILURE: Used fallback data - NOT ACCEPTABLE\n');
          failedTests.push({ ...test, reason: 'Used fallback data' });
        } else {
          console.log('✅ SUCCESS: Using real data\n');
          
          // Analyze response quality
          const responseText = result.response.toLowerCase();
          const foundElements = test.requiredElements.filter(element => {
            const variations = [
              element.toLowerCase(),
              element.replace(/s$/, ''), // Remove plural 's'
              element.replace(/ /g, ''), // Remove spaces
            ];
            return variations.some(variation => responseText.includes(variation));
          });
          
          const qualityScore = foundElements.length / test.requiredElements.length;
          
          console.log('📊 RESPONSE ANALYSIS:');
          console.log(`Quality Score: ${Math.round(qualityScore * 100)}% (${foundElements.length}/${test.requiredElements.length} elements found)`);
          console.log(`Found Elements: ${foundElements.join(', ')}`);
          console.log(`Missing Elements: ${test.requiredElements.filter(e => !foundElements.includes(e)).join(', ')}\n`);
          
          console.log('📝 RESPONSE PREVIEW:');
          console.log(result.response.substring(0, 500) + '...\n');
          
          if (qualityScore >= 0.7) { // 70% threshold for passing
            passedTests++;
            console.log('🎉 TEST PASSED - Quality meets standards\n');
          } else {
            failedTests.push({ 
              ...test, 
              reason: `Low quality score: ${Math.round(qualityScore * 100)}%`,
              missingElements: test.requiredElements.filter(e => !foundElements.includes(e))
            });
            console.log('❌ TEST FAILED - Quality below standards\n');
          }
        }
        
      } catch (error) {
        console.log(`💥 CRITICAL ERROR: ${error.message}\n`);
        failedTests.push({ ...test, reason: `Network/Server error: ${error.message}` });
      }
      
      console.log('═'.repeat(100) + '\n');
    }
    
    // Final results
    console.log('🏆 ULTIMATE BATTLE TEST RESULTS 🏆\n');
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} (${Math.round(passedTests/totalTests*100)}%)`);
    console.log(`Failed: ${failedTests.length} (${Math.round(failedTests.length/totalTests*100)}%)\n`);
    
    if (failedTests.length === 0) {
      console.log('🎉🎉🎉 PERFECT VICTORY! ALL PLATFORMS DELIVER FLAWLESS RAG! 🎉🎉🎉');
      console.log('✅ Facebook: Perfect data-driven responses');
      console.log('✅ Instagram: Perfect data-driven responses'); 
      console.log('✅ Twitter: Perfect data-driven responses');
      console.log('\n🔥 THE RAG SYSTEM IS BULLETPROOF ACROSS ALL PLATFORMS! 🔥');
    } else {
      console.log('💥 BATTLE TEST FAILURES DETECTED:');
      failedTests.forEach((test, index) => {
        console.log(`\n❌ Failure ${index + 1}:`);
        console.log(`   Platform: ${test.platform}`);
        console.log(`   Test: ${test.description}`);
        console.log(`   Reason: ${test.reason}`);
        if (test.missingElements) {
          console.log(`   Missing: ${test.missingElements.join(', ')}`);
        }
      });
      
      console.log('\n🚨 RAG SYSTEM NOT READY - FAILURES MUST BE FIXED 🚨');
    }
    
  } catch (error) {
    console.error('💥💥💥 ULTIMATE BATTLE TEST CRASHED:', error.message);
    console.error(error.stack);
  }
}

ultimateBattleTest().then(() => {
  console.log('\n🔥 Ultimate battle test completed');
}).catch(error => {
  console.error('💥 Ultimate battle test failed:', error);
  process.exit(1);
});
