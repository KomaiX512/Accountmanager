const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
  maxAttempt: 3,
  httpOptions: {
    connectTimeout: 50000,
    timeout: 100000,
  },
});

async function checkFacebookTokens() {
  console.log('🔍 Checking Facebook tokens in R2...\n');
  
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `FacebookTokens/`,
    });
    
    const { Contents } = await s3Client.send(listCommand);
    
    console.log(`📊 Found ${Contents ? Contents.length : 0} Facebook token files`);
    
    if (Contents) {
      for (const obj of Contents) {
        if (obj.Key.endsWith('/token.json')) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const token = JSON.parse(await data.Body.transformToString());
            
            console.log(`📋 Token file: ${obj.Key}`);
            console.log(`   - page_id: ${token.page_id}`);
            console.log(`   - user_id: ${token.user_id}`);
            console.log(`   - page_name: ${token.page_name}`);
            console.log(`   - hasAccessToken: ${!!token.access_token}`);
            console.log('');
          } catch (error) {
            console.error(`❌ Error reading token from ${obj.Key}:`, error.message);
          }
        }
      }
    }
    
    // Also check for any Facebook events
    console.log('🔍 Checking Facebook events in R2...\n');
    
    const eventsListCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `FacebookEvents/`,
    });
    
    const { Contents: eventContents } = await s3Client.send(eventsListCommand);
    
    console.log(`📊 Found ${eventContents ? eventContents.length : 0} Facebook event files`);
    
    if (eventContents) {
      const userIds = new Set();
      for (const obj of eventContents) {
        const parts = obj.Key.split('/');
        if (parts.length >= 2) {
          userIds.add(parts[1]);
        }
      }
      
      console.log(`📋 Facebook events found for user IDs:`, Array.from(userIds));
    }
    
  } catch (error) {
    console.error('❌ Error checking Facebook tokens:', error.message);
  }
}

// Run the check
checkFacebookTokens(); 