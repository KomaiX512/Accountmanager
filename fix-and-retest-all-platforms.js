import ChromaDBService from './chromadb-service.js';
import fs from 'fs';

async function fixAndRetestAllPlatforms() {
  try {
    console.log('🔥🔥🔥 FIXING USERNAME MAPPING AND RETESTING ALL PLATFORMS 🔥🔥🔥\n');
    
    const chromaService = ChromaDBService;
    await chromaService.initialize();
    
    // 1. STORE ALL DATA WITH CORRECT USERNAME MAPPING
    console.log('📊 STEP 1: STORING DATA WITH CORRECT USERNAME MAPPING\n');
    
    // Facebook - Store as cocacola (actual data)
    console.log('📘 FACEBOOK: Storing Coca-Cola data as "cocacola"');
    const fbData = JSON.parse(fs.readFileSync('./facebook_sample_profiledata.json', 'utf8'));
    await chromaService.storeProfileData('cocacola', 'facebook', fbData);
    console.log('✅ Facebook data stored as cocacola\n');
    
    // Instagram - Store as drmarkhyman (actual data)
    console.log('📱 INSTAGRAM: Storing Dr. Mark Hyman data as "drmarkhyman"');
    const igData = JSON.parse(fs.readFileSync('./profile_instagram_sample data.json', 'utf8'));
    await chromaService.storeProfileData('drmarkhyman', 'instagram', igData);
    console.log('✅ Instagram data stored as drmarkhyman\n');
    
    // Twitter - Store as ylecun (actual data)
    console.log('🐦 TWITTER: Storing Yann LeCun data as "ylecun"');
    const twitterData = JSON.parse(fs.readFileSync('./twitter_profile-data_sample.json', 'utf8'));
    await chromaService.storeProfileData('ylecun', 'twitter', twitterData);
    console.log('✅ Twitter data stored as ylecun\n');
    
    // 2. VERIFY CHROMADB STORAGE
    console.log('📊 STEP 2: VERIFYING CHROMADB STORAGE\n');
    
    const collections = ['facebook_profiles', 'instagram_profiles', 'twitter_profiles'];
    for (const collectionName of collections) {
      try {
        const collection = await chromaService.client.getCollection({ name: collectionName });
        const count = await collection.count();
        
        // Get sample documents to verify usernames
        const sample = await collection.get({ 
          limit: 10, 
          include: ['metadatas', 'documents'] 
        });
        
        const usernames = [...new Set(sample.metadatas.map(m => m.username))];
        console.log(`✅ ${collectionName}: ${count} documents`);
        console.log(`   Usernames: ${usernames.join(', ')}\n`);
        
      } catch (error) {
        console.log(`❌ ${collectionName}: Error - ${error.message}\n`);
      }
    }
    
    // 3. ULTIMATE BATTLE TEST WITH CORRECT USERNAMES
    console.log('🚀 STEP 3: ULTIMATE BATTLE TEST WITH CORRECT USERNAMES\n');
    console.log('═'.repeat(100) + '\n');
    
    const ultimateTests = [
      // FACEBOOK TESTS - cocacola
      {
        platform: 'facebook',
        username: 'cocacola',
        query: 'Give me the EXACT post with the highest engagement from Coca-Cola. I need the specific post content, precise like/comment/share counts, and the engagement rate percentage.',
        requiredElements: ['post content', 'likes', 'comments', 'shares', 'engagement'],
        description: 'Facebook: Coca-Cola highest engaging post'
      },
      {
        platform: 'facebook', 
        username: 'cocacola',
        query: 'What are the best trending hashtags used by Coca-Cola based on their post performance? Show me the hashtags and their engagement metrics.',
        requiredElements: ['hashtags', 'engagement', 'performance'],
        description: 'Facebook: Coca-Cola trending hashtags'
      },
      
      // INSTAGRAM TESTS - drmarkhyman
      {
        platform: 'instagram',
        username: 'drmarkhyman',
        query: 'Give me Dr. Mark Hyman\'s Instagram post with the highest likes-to-comments ratio. Show me the exact post content, precise engagement metrics, and calculate the engagement rate.',
        requiredElements: ['post content', 'likes', 'comments', 'engagement rate', 'ratio'],
        description: 'Instagram: Dr. Hyman engagement analysis'
      },
      {
        platform: 'instagram',
        username: 'drmarkhyman',
        query: 'Find Dr. Mark Hyman\'s Instagram post with the most comments. Give me the complete caption, exact comment count, likes count, and hashtags used.',
        requiredElements: ['caption', 'comment count', 'likes count', 'hashtags'],
        description: 'Instagram: Dr. Hyman comment analysis'
      },
      
      // TWITTER TESTS - ylecun
      {
        platform: 'twitter',
        username: 'ylecun',
        query: 'Show me Yann LeCun\'s Twitter post with the highest retweet rate. I need the exact tweet text, retweet count, like count, reply count, and retweet-to-like ratio calculation.',
        requiredElements: ['tweet text', 'retweet count', 'like count', 'reply count', 'ratio'],
        description: 'Twitter: Yann LeCun retweet analysis'
      },
      {
        platform: 'twitter',
        username: 'ylecun', 
        query: 'Give me 2 of Yann LeCun\'s Twitter posts with the best engagement rates. For each: complete tweet text, all engagement metrics, and calculate total engagement score.',
        requiredElements: ['tweet text', 'engagement metrics', 'engagement score'],
        description: 'Twitter: Yann LeCun multi-tweet analysis'
      }
    ];
    
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
          
          // Check for specific data indicators
          const hasSpecificNumbers = /\b\d{1,6}\b/.test(result.response);
          const hasDataDriven = !responseText.includes('no specific data available') && 
                               !responseText.includes('i am sorry') &&
                               !responseText.includes('cannot provide');
          
          console.log('📊 RESPONSE ANALYSIS:');
          console.log(`Quality Score: ${Math.round(qualityScore * 100)}% (${foundElements.length}/${test.requiredElements.length} elements found)`);
          console.log(`Has Specific Numbers: ${hasSpecificNumbers ? '✅' : '❌'}`);
          console.log(`Data-Driven Response: ${hasDataDriven ? '✅' : '❌'}`);
          console.log(`Found Elements: ${foundElements.join(', ')}`);
          console.log(`Missing Elements: ${test.requiredElements.filter(e => !foundElements.includes(e)).join(', ')}\n`);
          
          console.log('📝 RESPONSE PREVIEW:');
          console.log(result.response.substring(0, 400) + '...\n');
          
          if (qualityScore >= 0.6 && hasDataDriven && hasSpecificNumbers) { // Enhanced criteria
            passedTests++;
            console.log('🎉 TEST PASSED - Quality meets enhanced standards\n');
          } else {
            failedTests.push({ 
              ...test, 
              reason: `Quality issues: Score ${Math.round(qualityScore * 100)}%, DataDriven: ${hasDataDriven}, Numbers: ${hasSpecificNumbers}`,
              missingElements: test.requiredElements.filter(e => !foundElements.includes(e))
            });
            console.log('❌ TEST FAILED - Quality below enhanced standards\n');
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
      console.log('✅ Facebook: Perfect data-driven responses with Coca-Cola data');
      console.log('✅ Instagram: Perfect data-driven responses with Dr. Hyman data'); 
      console.log('✅ Twitter: Perfect data-driven responses with Yann LeCun data');
      console.log('\n🔥 THE RAG SYSTEM IS BULLETPROOF ACROSS ALL PLATFORMS! 🔥');
      console.log('🚀 NO MORE FALLBACKS - EVERY QUERY USES REAL DATA! 🚀');
    } else {
      console.log('💥 BATTLE TEST FAILURES STILL DETECTED:');
      failedTests.forEach((test, index) => {
        console.log(`\n❌ Failure ${index + 1}:`);
        console.log(`   Platform: ${test.platform}`);
        console.log(`   Username: ${test.username}`);
        console.log(`   Test: ${test.description}`);
        console.log(`   Reason: ${test.reason}`);
        if (test.missingElements) {
          console.log(`   Missing: ${test.missingElements.join(', ')}`);
        }
      });
      
      console.log('\n🚨 FURTHER DEBUGGING REQUIRED - NOT GIVING UP! 🚨');
    }
    
  } catch (error) {
    console.error('💥💥💥 FIX AND RETEST CRASHED:', error.message);
    console.error(error.stack);
  }
}

fixAndRetestAllPlatforms().then(() => {
  console.log('\n🔥 Fix and retest completed');
}).catch(error => {
  console.error('💥 Fix and retest failed:', error);
  process.exit(1);
});
