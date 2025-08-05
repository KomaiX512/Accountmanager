import ChromaDBService from './chromadb-service.js';
import fs from 'fs';

async function diagnoseIngestionIssues() {
  try {
    console.log('🔍 DIAGNOSING INSTAGRAM AND TWITTER INGESTION ISSUES\n');
    
    const chromaService = ChromaDBService;
    await chromaService.initialize();
    
    // Test Instagram data structure
    console.log('📱 TESTING INSTAGRAM DATA STRUCTURE:');
    const instagramFile = './profile_instagram_sample data.json';
    if (fs.existsSync(instagramFile)) {
      const igData = JSON.parse(fs.readFileSync(instagramFile, 'utf8'));
      console.log('✅ Instagram file loaded');
      console.log('📊 Data type:', Array.isArray(igData) ? 'Array' : 'Object');
      console.log('📊 Length/Keys:', Array.isArray(igData) ? igData.length : Object.keys(igData).length);
      
      if (Array.isArray(igData) && igData.length > 0) {
        const firstItem = igData[0];
        console.log('📊 First item keys:', Object.keys(firstItem).slice(0, 10));
        console.log('📊 Has username:', !!firstItem.username);
        console.log('📊 Has latestPosts:', !!firstItem.latestPosts);
        console.log('📊 latestPosts count:', firstItem.latestPosts?.length || 0);
        
        if (firstItem.latestPosts?.[0]) {
          const firstPost = firstItem.latestPosts[0];
          console.log('📊 First post keys:', Object.keys(firstPost).slice(0, 10));
          console.log('📊 Post has caption:', !!firstPost.caption);
          console.log('📊 Post has likesCount:', !!firstPost.likesCount);
          console.log('📊 Post has commentsCount:', !!firstPost.commentsCount);
        }
      }
      
      // Test normalization
      console.log('\n🔧 TESTING INSTAGRAM NORMALIZATION:');
      const normalizedIG = chromaService.normalizeDataStructure(igData, 'instagram');
      console.log('📊 Normalized profile exists:', !!normalizedIG.profile);
      console.log('📊 Normalized posts count:', normalizedIG.posts?.length || 0);
      console.log('📊 Normalized bio length:', normalizedIG.bio?.length || 0);
      
      if (normalizedIG.profile) {
        console.log('📊 Profile username:', normalizedIG.profile.username);
        console.log('📊 Profile fullName:', normalizedIG.profile.fullName);
        console.log('📊 Profile followersCount:', normalizedIG.profile.followersCount);
      }
      
      if (normalizedIG.posts?.[0]) {
        console.log('📊 First post content length:', normalizedIG.posts[0].content?.length || 0);
        console.log('📊 First post likes:', normalizedIG.posts[0].engagement?.likes);
        console.log('📊 First post comments:', normalizedIG.posts[0].engagement?.comments);
      }
      
      // Test document processing
      console.log('\n📄 TESTING INSTAGRAM DOCUMENT CREATION:');
      const igResult = chromaService.processProfileData(igData, 'instagram', 'netflix');
      console.log('📊 Documents created:', igResult.documents.length);
      console.log('📊 Document types:', igResult.metadatas.map(m => m.type));
      
      if (igResult.documents.length > 0) {
        console.log('✅ Instagram ingestion SUCCESS');
        console.log('📄 Sample document preview:');
        console.log(igResult.documents[0].substring(0, 200) + '...\n');
      } else {
        console.log('❌ Instagram ingestion FAILED - no documents created\n');
      }
    } else {
      console.log('❌ Instagram file not found\n');
    }
    
    // Test Twitter data structure
    console.log('🐦 TESTING TWITTER DATA STRUCTURE:');
    const twitterFile = './twitter_profile-data_sample.json';
    if (fs.existsSync(twitterFile)) {
      const twitterData = JSON.parse(fs.readFileSync(twitterFile, 'utf8'));
      console.log('✅ Twitter file loaded');
      console.log('📊 Data type:', Array.isArray(twitterData) ? 'Array' : 'Object');
      console.log('📊 Length/Keys:', Array.isArray(twitterData) ? twitterData.length : Object.keys(twitterData).length);
      
      if (Array.isArray(twitterData) && twitterData.length > 0) {
        const firstTweet = twitterData[0];
        console.log('📊 First tweet keys:', Object.keys(firstTweet).slice(0, 10));
        console.log('📊 Has author:', !!firstTweet.author);
        console.log('📊 Has text:', !!firstTweet.text);
        console.log('📊 Has url:', !!firstTweet.url);
        console.log('📊 Has likeCount:', !!firstTweet.likeCount);
        console.log('📊 Has retweetCount:', !!firstTweet.retweetCount);
        console.log('📊 Has replyCount:', !!firstTweet.replyCount);
        
        if (firstTweet.author) {
          console.log('📊 Author keys:', Object.keys(firstTweet.author).slice(0, 10));
          console.log('📊 Author userName:', firstTweet.author.userName);
          console.log('📊 Author name:', firstTweet.author.name);
          console.log('📊 Author followers:', firstTweet.author.followers);
        }
      }
      
      // Test normalization
      console.log('\n🔧 TESTING TWITTER NORMALIZATION:');
      const normalizedTW = chromaService.normalizeDataStructure(twitterData, 'twitter');
      console.log('📊 Normalized profile exists:', !!normalizedTW.profile);
      console.log('📊 Normalized posts count:', normalizedTW.posts?.length || 0);
      console.log('📊 Normalized bio length:', normalizedTW.bio?.length || 0);
      
      if (normalizedTW.profile) {
        console.log('📊 Profile username:', normalizedTW.profile.userName || normalizedTW.profile.username);
        console.log('📊 Profile name:', normalizedTW.profile.name);
        console.log('📊 Profile followers:', normalizedTW.profile.followers);
      }
      
      if (normalizedTW.posts?.[0]) {
        console.log('📊 First post content length:', normalizedTW.posts[0].content?.length || 0);
        console.log('📊 First post likes:', normalizedTW.posts[0].engagement?.likes);
        console.log('📊 First post retweets:', normalizedTW.posts[0].engagement?.shares);
      }
      
      // Test document processing
      console.log('\n📄 TESTING TWITTER DOCUMENT CREATION:');
      const twResult = chromaService.processProfileData(twitterData, 'twitter', 'netflix');
      console.log('📊 Documents created:', twResult.documents.length);
      console.log('📊 Document types:', twResult.metadatas.map(m => m.type));
      
      if (twResult.documents.length > 0) {
        console.log('✅ Twitter ingestion SUCCESS');
        console.log('📄 Sample document preview:');
        console.log(twResult.documents[0].substring(0, 200) + '...\n');
      } else {
        console.log('❌ Twitter ingestion FAILED - no documents created\n');
      }
    } else {
      console.log('❌ Twitter file not found\n');
    }
    
    console.log('🔍 DIAGNOSIS COMPLETE');
    
  } catch (error) {
    console.error('💥 DIAGNOSIS FAILED:', error.message);
    console.error(error.stack);
  }
}

diagnoseIngestionIssues().then(() => {
  console.log('\n✅ Diagnosis completed');
}).catch(error => {
  console.error('💥 Diagnosis crashed:', error);
  process.exit(1);
});
