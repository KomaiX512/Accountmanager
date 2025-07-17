import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
});

async function debugFacebookStorage() {
  const userId = '681487244693083';
  
  console.log('🔍 DEBUGGING FACEBOOK STORAGE');
  console.log('================================');
  console.log(`User ID: ${userId}`);

  try {
    // Check FacebookConnection for this user
    console.log('\n📦 Checking FacebookConnection...');
    const connectionKey = `FacebookConnection/${userId}/connection.json`;
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: connectionKey,
      });
      const data = await s3Client.send(getCommand);
      const connectionData = JSON.parse(await data.Body.transformToString());
      console.log('✅ Found connection data:', {
        hasAccessToken: !!connectionData.access_token,
        facebookPageId: connectionData.facebook_page_id,
        facebookUserId: connectionData.facebook_user_id,
        username: connectionData.username,
        isPersonalAccount: connectionData.is_personal_account
      });
    } catch (error) {
      console.log('❌ No connection data found:', error.message);
    }

    // Check FacebookTokens for this user
    console.log('\n📦 Checking FacebookTokens...');
    const tokenKey = `FacebookTokens/${userId}/token.json`;
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: tokenKey,
      });
      const data = await s3Client.send(getCommand);
      const tokenData = JSON.parse(await data.Body.transformToString());
      console.log('✅ Found token data:', {
        hasAccessToken: !!tokenData.access_token,
        pageId: tokenData.page_id,
        userId: tokenData.user_id,
        username: tokenData.username,
        isPersonalAccount: tokenData.is_personal_account
      });
    } catch (error) {
      console.log('❌ No token data found:', error.message);
    }

    // List all Facebook tokens to see what's available
    console.log('\n📦 Listing all Facebook tokens...');
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'FacebookTokens/',
    });
    const { Contents } = await s3Client.send(listCommand);
    
    if (Contents && Contents.length > 0) {
      console.log(`✅ Found ${Contents.length} Facebook token files:`);
      for (const obj of Contents) {
        if (obj.Key.endsWith('/token.json')) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const token = JSON.parse(await data.Body.transformToString());
            console.log(`\n📄 ${obj.Key}:`);
            console.log(`   Page ID: ${token.page_id}`);
            console.log(`   User ID: ${token.user_id}`);
            console.log(`   Username: ${token.username}`);
            console.log(`   Has Token: ${!!token.access_token}`);
          } catch (error) {
            console.log(`❌ Error reading ${obj.Key}: ${error.message}`);
          }
        }
      }
    } else {
      console.log('❌ No Facebook tokens found');
    }

  } catch (error) {
    console.error('❌ Error during debugging:', error.message);
  }
}

debugFacebookStorage().then(() => {
  console.log('\n🏁 Debug complete!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Debug failed:', error);
  process.exit(1);
}); 