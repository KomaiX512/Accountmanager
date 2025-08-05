import ChromaDBService from './chromadb-service.js';
import fs from 'fs';

async function testFacebookIngestion() {
  try {
    console.log('[TEST] Initializing ChromaDB service...');
    const chromaService = ChromaDBService;
    await chromaService.initializeEmbeddings();
    await chromaService.initialize();
    
    // Load Facebook sample data
    console.log('[TEST] Loading Facebook sample data...');
    const fbData = JSON.parse(fs.readFileSync('./facebook_sample_profiledata.json', 'utf8'));
    console.log('[TEST] Facebook data loaded successfully');
    console.log('[TEST] Root keys:', Object.keys(fbData));
    console.log('[TEST] ProfileInfo exists:', !!fbData.profileInfo);
    console.log('[TEST] Posts array exists:', Array.isArray(fbData.posts));
    console.log('[TEST] Posts count:', fbData.posts?.length || 0);
    
    if (fbData.profileInfo) {
      console.log('[TEST] Profile pageName:', fbData.profileInfo.pageName);
      console.log('[TEST] Profile followers:', fbData.profileInfo.followers);
      console.log('[TEST] Profile likes:', fbData.profileInfo.likes);
    }
    
    if (fbData.posts?.[0]) {
      console.log('[TEST] First post has text:', !!fbData.posts[0].text);
      console.log('[TEST] First post likes:', fbData.posts[0].likes);
      console.log('[TEST] First post comments:', fbData.posts[0].comments);
    }
    
    // Test normalization
    console.log('\n[TEST] Testing data normalization...');
    const normalized = chromaService.normalizeDataStructure(fbData, 'facebook');
    console.log('[TEST] Normalized profile exists:', !!normalized.profile);
    console.log('[TEST] Normalized posts count:', normalized.posts?.length || 0);
    console.log('[TEST] Normalized bio length:', normalized.bio?.length || 0);
    console.log('[TEST] Normalized engagement exists:', !!normalized.engagement);
    
    if (normalized.profile) {
      console.log('[TEST] Profile username:', normalized.profile.username);
      console.log('[TEST] Profile fullName:', normalized.profile.fullName);
      console.log('[TEST] Profile followersCount:', normalized.profile.followersCount);
    }
    
    if (normalized.posts?.[0]) {
      console.log('[TEST] First normalized post content length:', normalized.posts[0].content?.length || 0);
      console.log('[TEST] First normalized post likes:', normalized.posts[0].engagement?.likes);
    }
    
    // Test document processing
    console.log('\n[TEST] Testing document creation...');
    const result = chromaService.processProfileData(fbData, 'facebook', 'netflix');
    console.log('[TEST] Documents created:', result.documents.length);
    console.log('[TEST] Metadata count:', result.metadatas.length);
    console.log('[TEST] IDs count:', result.ids.length);
    
    if (result.metadatas.length > 0) {
      console.log('[TEST] Document types:', result.metadatas.map(m => m.type));
    }
    
    if (result.documents.length > 0) {
      console.log('[TEST] SUCCESS: Facebook documents created!');
      console.log('[TEST] Sample document preview:');
      console.log(result.documents[0].substring(0, 300) + '...');
      
      // Try to store in ChromaDB
      console.log('\n[TEST] Testing ChromaDB storage...');
      await chromaService.storeProfileData('netflix', 'facebook', fbData);
      console.log('[TEST] Storage completed successfully');
      
    } else {
      console.log('[TEST] FAILURE: No documents created');
      console.log('[TEST] This means the normalization failed');
    }
    
  } catch (error) {
    console.error('[TEST] Error occurred:', error.message);
    console.error('[TEST] Stack trace:', error.stack);
  }
}

testFacebookIngestion().then(() => {
  console.log('[TEST] Test completed');
  process.exit(0);
}).catch(error => {
  console.error('[TEST] Test failed:', error);
  process.exit(1);
});
