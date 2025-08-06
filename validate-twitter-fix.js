import ChromaDBService from './chromadb-service.js';
import fs from 'fs';

async function validateTwitterFix() {
  try {
    console.log('🔥 VALIDATING TWITTER DOCUMENT CONTENT FIX 🔥\n');
    
    const chromaService = ChromaDBService;
    await chromaService.initialize();
    
    // Re-ingest Twitter data with the fixed document creation
    console.log('💾 STEP 1: RE-INGESTING TWITTER DATA WITH FIXED DOCUMENT CONTENT\n');
    
    const twitterData = JSON.parse(fs.readFileSync('./twitter_profile-data_sample.json', 'utf8'));
    await chromaService.storeProfileData('ylecun', 'twitter', twitterData);
    console.log('✅ Twitter data re-stored with engagement fix\n');
    
    // Check document content now includes retweets
    console.log('🔍 STEP 2: VALIDATING DOCUMENT CONTENT INCLUDES RETWEETS\n');
    
    const twitterCollection = await chromaService.client.getCollection({ name: 'twitter_profiles' });
    const ylecunResults = await twitterCollection.get({
      where: { username: 'ylecun' },
      limit: 5,
      include: ['metadatas', 'documents']
    });
    
    const postDocs = ylecunResults.documents.filter((doc, index) => 
      ylecunResults.metadatas[index].type === 'post'
    );
    
    if (postDocs.length > 0) {
      console.log('📝 FIXED DOCUMENT CONTENT SAMPLE:');
      console.log(postDocs[0]);
      console.log('\n');
      
      // Check if retweets are now included
      const hasRetweets = postDocs[0].includes('Retweets:');
      const hasTotalEngagement = postDocs[0].includes('Total Engagement:');
      
      console.log('📊 DOCUMENT CONTENT VALIDATION:');
      console.log(`Has Retweets: ${hasRetweets ? '✅' : '❌'}`);
      console.log(`Has Total Engagement: ${hasTotalEngagement ? '✅' : '❌'}\n`);
    }
    
    // Test RAG context creation
    console.log('🚀 STEP 3: TESTING RAG CONTEXT WITH FIXED DOCUMENTS\n');
    
    const ragContext = await chromaService.createEnhancedContext(
      'twitter post with highest retweet count and engagement metrics', 
      'ylecun', 
      'twitter'
    );
    
    console.log('📝 RAG CONTEXT WITH FIXED DOCUMENTS:');
    console.log(ragContext.substring(0, 1000) + '...\n');
    
    // Check for all engagement metrics in context
    const hasLikes = /\d+.*likes?/i.test(ragContext);
    const hasRetweets = /\d+.*(retweets?|shares?)/i.test(ragContext);
    const hasComments = /\d+.*(comments?|replies?)/i.test(ragContext);
    
    console.log('📊 RAG CONTEXT METRICS:');
    console.log(`Has Likes: ${hasLikes ? '✅' : '❌'}`);
    console.log(`Has Retweets: ${hasRetweets ? '✅' : '❌'}`);
    console.log(`Has Comments: ${hasComments ? '✅' : '❌'}\n`);
    
    // Final RAG test
    console.log('🎯 STEP 4: ULTIMATE RAG TEST WITH FIX\n');
    
    const response = await fetch('http://localhost:3001/api/discussion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'Show me Yann LeCun\'s Twitter post with the highest retweet count. Give me exact retweet count, like count, and reply count.',
        username: 'ylecun',
        platform: 'twitter'
      })
    });
    
    const result = await response.json();
    
    console.log('📝 FINAL RAG RESPONSE:');
    console.log(result.response);
    console.log('\n📊 FINAL ANALYSIS:');
    console.log(`Used Fallback: ${result.usedFallback ? '❌' : '✅'}`);
    
    const responseText = result.response.toLowerCase();
    const hasRetweetCount = /\d+.*(retweets?|shares?)/i.test(result.response);
    const hasLikeCount = /\d+.*likes?/i.test(result.response);
    const hasReplyCount = /\d+.*(replies?|comments?)/i.test(result.response);
    const isDataDriven = !responseText.includes('does not include') && 
                        !responseText.includes('cannot provide');
    
    console.log(`Has Retweet Count: ${hasRetweetCount ? '✅' : '❌'}`);
    console.log(`Has Like Count: ${hasLikeCount ? '✅' : '❌'}`);
    console.log(`Has Reply Count: ${hasReplyCount ? '✅' : '❌'}`);
    console.log(`Is Data Driven: ${isDataDriven ? '✅' : '❌'}\n`);
    
    if (hasRetweetCount && hasLikeCount && hasReplyCount && isDataDriven && !result.usedFallback) {
      console.log('🎉🎉🎉 TWITTER FIX SUCCESSFUL! 🎉🎉🎉');
      console.log('✅ All engagement metrics now present in RAG responses');
      console.log('✅ Ready for final victory test across all platforms');
    } else {
      console.log('❌ Twitter fix needs further work');
      console.log('🔍 Missing elements detected in response');
    }
    
  } catch (error) {
    console.error('💥 TWITTER FIX VALIDATION FAILED:', error.message);
    console.error(error.stack);
  }
}

validateTwitterFix().then(() => {
  console.log('\n🔥 Twitter fix validation completed');
}).catch(error => {
  console.error('💥 Twitter fix validation crashed:', error);
  process.exit(1);
});
