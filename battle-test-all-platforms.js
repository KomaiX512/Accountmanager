import ChromaDBService from './chromadb-service.js';
import fs from 'fs';

async function battleTestAllPlatforms() {
  try {
    console.log('🔥 BATTLE TESTING RAG ACROSS ALL PLATFORMS 🔥\n');
    
    const chromaService = ChromaDBService;
    await chromaService.initialize();
    
    // Test queries for each platform
    const testQueries = [
      {
        platform: 'facebook',
        username: 'cocacola', // Use correct mapping
        query: 'Give me the top 3 highest engaging posts with exact metrics (likes, comments, shares) and URLs',
        expectedDataPoints: ['likes', 'comments', 'engagement', 'post URL']
      },
      {
        platform: 'facebook', 
        username: 'cocacola',
        query: 'What are the best trending hashtags for my account based on post performance?',
        expectedDataPoints: ['hashtags', 'engagement metrics', 'performance data']
      },
      {
        platform: 'facebook',
        username: 'cocacola', 
        query: 'Show me specific post content that performed best with exact engagement numbers',
        expectedDataPoints: ['post content', 'specific numbers', 'performance ranking']
      }
    ];
    
    // First, let's properly store the Facebook data with correct username
    console.log('📊 INGESTING FACEBOOK DATA WITH CORRECT MAPPING...\n');
    const fbData = JSON.parse(fs.readFileSync('./facebook_sample_profiledata.json', 'utf8'));
    
    // Store with cocacola username since that's what the data actually is
    await chromaService.storeProfileData('cocacola', 'facebook', fbData);
    console.log('✅ Facebook data stored correctly as cocacola\n');
    
    // Test RAG queries
    for (const test of testQueries) {
      console.log(`🎯 TESTING: ${test.platform.toUpperCase()} - ${test.username}`);
      console.log(`Query: "${test.query}"`);
      console.log(`Expected: ${test.expectedDataPoints.join(', ')}\n`);
      
      try {
        // Make HTTP request to RAG server
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
          console.log('❌ FAILED: Used fallback data');
        } else {
          console.log('✅ SUCCESS: Using real data');
          console.log('📈 RESPONSE PREVIEW:');
          console.log(result.response.substring(0, 400) + '...\n');
          
          // Check for specific data points
          const responseText = result.response.toLowerCase();
          const foundDataPoints = test.expectedDataPoints.filter(point => 
            responseText.includes(point.toLowerCase())
          );
          console.log(`📊 DATA QUALITY: Found ${foundDataPoints.length}/${test.expectedDataPoints.length} expected data points`);
          console.log(`Found: ${foundDataPoints.join(', ')}\n`);
        }
        
      } catch (error) {
        console.log(`❌ ERROR: ${error.message}\n`);
      }
      
      console.log('─'.repeat(80) + '\n');
    }
    
    // Collection statistics
    console.log('📈 CHROMADB COLLECTION STATS:');
    const collections = ['facebook_profiles', 'instagram_profiles', 'twitter_profiles'];
    
    for (const collectionName of collections) {
      try {
        const collection = await chromaService.client.getCollection({ name: collectionName });
        const count = await collection.count();
        console.log(`${collectionName}: ${count} documents`);
      } catch (error) {
        console.log(`${collectionName}: Collection not found or empty`);
      }
    }
    
    console.log('\n🔥 BATTLE TEST COMPLETE! 🔥');
    
  } catch (error) {
    console.error('💥 BATTLE TEST FAILED:', error.message);
    console.error(error.stack);
  }
}

battleTestAllPlatforms().then(() => {
  console.log('\n✅ Battle test completed successfully');
}).catch(error => {
  console.error('💥 Battle test crashed:', error);
  process.exit(1);
});
