import ChromaDBService from './chromadb-service.js';

async function debugTwitterDocuments() {
  try {
    console.log('🔍 DEBUGGING TWITTER CHROMADB DOCUMENTS AND SEMANTIC SEARCH\n');
    
    const chromaService = ChromaDBService;
    await chromaService.initialize();
    
    // 1. EXAMINE ACTUAL STORED DOCUMENTS
    console.log('📄 STEP 1: EXAMINING ACTUAL TWITTER DOCUMENTS IN CHROMADB\n');
    
    const twitterCollection = await chromaService.client.getCollection({ name: 'twitter_profiles' });
    
    // Get ylecun documents
    const ylecunResults = await twitterCollection.get({
      where: { username: 'ylecun' },
      limit: 10,
      include: ['metadatas', 'documents']
    });
    
    console.log(`📊 Found ${ylecunResults.documents.length} ylecun documents\n`);
    
    // Examine post documents specifically
    const postDocs = ylecunResults.documents.filter((doc, index) => 
      ylecunResults.metadatas[index].type === 'post'
    );
    
    console.log(`📊 Found ${postDocs.length} post documents\n`);
    
    if (postDocs.length > 0) {
      console.log('📝 SAMPLE POST DOCUMENT CONTENT:');
      console.log(postDocs[0]);
      console.log('\n📊 SAMPLE POST METADATA:');
      const postIndex = ylecunResults.documents.indexOf(postDocs[0]);
      console.log(JSON.stringify(ylecunResults.metadatas[postIndex], null, 2));
      console.log('\n');
    }
    
    // 2. TEST SEMANTIC SEARCH RETRIEVAL
    console.log('🔍 STEP 2: TESTING SEMANTIC SEARCH RETRIEVAL\n');
    
    const testQueries = [
      'highest retweet count engagement metrics',
      'twitter post with most likes and retweets',
      'engagement metrics likes comments shares retweets'
    ];
    
    for (const query of testQueries) {
      console.log(`🔍 Testing query: "${query}"`);
      
      try {
        const searchResults = await chromaService.semanticSearch(query, 'ylecun', 'twitter', 5);
        console.log(`📊 Retrieved ${searchResults.length} documents`);
        
        if (searchResults.length > 0) {
          console.log('📝 Top result preview:');
          console.log(searchResults[0].substring(0, 300) + '...\n');
        } else {
          console.log('❌ No results found\n');
        }
      } catch (error) {
        console.log(`❌ Search error: ${error.message}\n`);
      }
    }
    
    // 3. TEST RAG CONTEXT CREATION
    console.log('🔍 STEP 3: TESTING RAG CONTEXT CREATION\n');
    
    try {
      const ragContext = await chromaService.createEnhancedContext(
        'twitter post with highest retweet count', 
        'ylecun', 
        'twitter'
      );
      
      console.log('📝 RAG CONTEXT PREVIEW:');
      console.log(ragContext.substring(0, 800) + '...\n');
      
      // Check if engagement metrics are in the context
      const hasLikes = /\d+.*likes?/i.test(ragContext);
      const hasRetweets = /\d+.*(retweets?|shares?)/i.test(ragContext);
      const hasComments = /\d+.*(comments?|replies?)/i.test(ragContext);
      
      console.log('📊 ENGAGEMENT METRICS IN CONTEXT:');
      console.log(`Has Likes: ${hasLikes ? '✅' : '❌'}`);
      console.log(`Has Retweets: ${hasRetweets ? '✅' : '❌'}`);
      console.log(`Has Comments: ${hasComments ? '✅' : '❌'}\n`);
      
    } catch (error) {
      console.log(`❌ RAG context error: ${error.message}\n`);
    }
    
    // 4. DIRECT RAG TEST
    console.log('🚀 STEP 4: DIRECT RAG TEST\n');
    
    try {
      const response = await fetch('http://localhost:3001/api/discussion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'Show me the Twitter post with exact retweet count, like count, and reply count. Give me specific numbers.',
          username: 'ylecun',
          platform: 'twitter'
        })
      });
      
      const result = await response.json();
      
      console.log('📝 RAG RESPONSE:');
      console.log(result.response);
      console.log('\n📊 ANALYSIS:');
      console.log(`Used Fallback: ${result.usedFallback ? '❌' : '✅'}`);
      
      const responseText = result.response.toLowerCase();
      const hasSpecificNumbers = /\b\d{1,6}\s*(likes?|retweets?|replies?)/i.test(result.response);
      const isDataDriven = !responseText.includes('does not include') && 
                          !responseText.includes('cannot provide') &&
                          !responseText.includes('no specific data');
      
      console.log(`Has Specific Numbers: ${hasSpecificNumbers ? '✅' : '❌'}`);
      console.log(`Is Data Driven: ${isDataDriven ? '✅' : '❌'}\n`);
      
    } catch (error) {
      console.log(`❌ RAG test error: ${error.message}\n`);
    }
    
    console.log('🔍 TWITTER DEBUGGING COMPLETE');
    
  } catch (error) {
    console.error('💥 TWITTER DEBUGGING FAILED:', error.message);
    console.error(error.stack);
  }
}

debugTwitterDocuments().then(() => {
  console.log('\n✅ Twitter debugging completed');
}).catch(error => {
  console.error('💥 Twitter debugging crashed:', error);
  process.exit(1);
});
