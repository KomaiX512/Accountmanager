// BULLETPROOF R2 Fresh Posts API Endpoint
// This endpoint should be implemented in your backend to fetch posts directly from R2 bucket
// without any caching layers to ensure truly fresh data

/*
Example implementation for backend:

app.get('/api/posts-fresh-r2/:username', async (req, res) => {
  const { username } = req.params;
  const { platform, nocache, force, skipcache } = req.query;
  
  try {
    console.log(`[PostsFreshR2] Fetching fresh posts for ${username}/${platform}`);
    
    // STEP 1: Directly access R2 bucket without any cache
    const r2Posts = await fetchPostsDirectlyFromR2(username, platform);
    
    // STEP 2: Ensure we're getting truly fresh data
    const freshPosts = r2Posts.map(post => ({
      ...post,
      // Add metadata to indicate this is fresh from R2
      _freshFromR2: true,
      _fetchedAt: new Date().toISOString()
    }));
    
    console.log(`[PostsFreshR2] ✅ Fetched ${freshPosts.length} fresh posts from R2`);
    
    res.json({
      success: true,
      posts: freshPosts,
      freshFromR2: true,
      count: freshPosts.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[PostsFreshR2] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      posts: []
    });
  }
});

async function fetchPostsDirectlyFromR2(username, platform) {
  // Implementation depends on your R2 setup
  // This should directly access R2 bucket without any intermediate caching
  
  const bucketPath = `generated_content/${username}/${platform}/ready_posts/`;
  
  // List all files in the R2 directory
  const files = await r2Client.listObjects({
    Bucket: 'your-bucket-name',
    Prefix: bucketPath
  });
  
  const posts = [];
  
  for (const file of files.Contents || []) {
    if (file.Key.endsWith('.json')) {
      try {
        const postData = await r2Client.getObject({
          Bucket: 'your-bucket-name',
          Key: file.Key
        });
        
        const postContent = JSON.parse(await postData.Body.transformToString());
        
        posts.push({
          key: file.Key,
          data: postContent,
          lastModified: file.LastModified,
          size: file.Size
        });
      } catch (err) {
        console.warn(`Failed to read post file ${file.Key}:`, err);
      }
    }
  }
  
  return posts.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
}
*/

export const BULLETPROOF_R2_API_NOTES = `
IMPLEMENTATION NOTES FOR BACKEND:

1. Create endpoint: GET /api/posts-fresh-r2/:username
2. Query parameters: platform, nocache, force, skipcache
3. Direct R2 access without any caching
4. Return format: { success: boolean, posts: array, freshFromR2: boolean }

This endpoint is critical for solving the refresh issue where 
users were not getting fresh data from R2 bucket on manual refresh.
`;

export default BULLETPROOF_R2_API_NOTES;
