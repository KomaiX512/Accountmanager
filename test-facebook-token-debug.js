import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
});

async function debugFacebookTokens() {
  console.log('🔍 DEBUGGING FACEBOOK TOKEN STORAGE');
  console.log('=====================================');

  try {
    // Check FacebookTokens bucket
    console.log('\n📦 Checking FacebookTokens bucket...');
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'FacebookTokens/',
    });
    const { Contents } = await s3Client.send(listCommand);
    
    if (!Contents || Contents.length === 0) {
      console.log('❌ No Facebook tokens found in FacebookTokens/');
    } else {
      console.log(`✅ Found ${Contents.length} Facebook token files:`);
      
      for (const obj of Contents) {
        if (obj.Key.endsWith('/token.json')) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const json = await data.Body.transformToString();
            const token = JSON.parse(json);
            
            console.log(`\n📄 Token File: ${obj.Key}`);
            console.log(`   Firebase User ID: ${obj.Key.split('/')[1]}`);
            console.log(`   Facebook Page ID: ${token.page_id}`);
            console.log(`   Facebook User ID: ${token.user_id}`);
            console.log(`   Page Name: ${token.page_name}`);
            console.log(`   Is Personal: ${token.is_personal_account}`);
            console.log(`   Has Access Token: ${!!token.access_token}`);
            console.log(`   Has User Token: ${!!token.user_access_token}`);
          } catch (error) {
            console.log(`❌ Error reading ${obj.Key}: ${error.message}`);
          }
        }
      }
    }

    // Check FacebookConnection bucket
    console.log('\n📦 Checking FacebookConnection bucket...');
    const connectionListCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'FacebookConnection/',
    });
    const { Contents: connectionContents } = await s3Client.send(connectionListCommand);
    
    if (!connectionContents || connectionContents.length === 0) {
      console.log('❌ No Facebook connections found in FacebookConnection/');
    } else {
      console.log(`✅ Found ${connectionContents.length} Facebook connection files:`);
      
      for (const obj of connectionContents) {
        if (obj.Key.endsWith('/connection.json')) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const json = await data.Body.transformToString();
            const connection = JSON.parse(json);
            
            console.log(`\n📄 Connection File: ${obj.Key}`);
            console.log(`   Firebase User ID: ${obj.Key.split('/')[1]}`);
            console.log(`   Facebook Page ID: ${connection.facebook_page_id}`);
            console.log(`   Facebook User ID: ${connection.facebook_user_id}`);
            console.log(`   Username: ${connection.username}`);
            console.log(`   Has Access Token: ${!!connection.access_token}`);
            console.log(`   Is Personal: ${connection.is_personal_account}`);
          } catch (error) {
            console.log(`❌ Error reading ${obj.Key}: ${error.message}`);
          }
        }
      }
    }

    // Test webhook matching logic
    console.log('\n🧪 TESTING WEBHOOK MATCHING LOGIC');
    console.log('====================================');
    
    const testWebhookPageId = '681487244693083'; // Your Facebook page ID
    console.log(`Testing webhook matching for Page ID: ${testWebhookPageId}`);
    
    if (Contents) {
      let foundMatch = false;
      
      for (const obj of Contents) {
        if (obj.Key.endsWith('/token.json')) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const json = await data.Body.transformToString();
            const token = JSON.parse(json);
            
            console.log(`\n🔍 Checking token: page_id=${token.page_id}, user_id=${token.user_id}`);
            
            if (token.page_id === testWebhookPageId || token.user_id === testWebhookPageId) {
              const firebaseUserId = obj.Key.split('/')[1];
              console.log(`✅ MATCH FOUND!`);
              console.log(`   Firebase User ID: ${firebaseUserId}`);
              console.log(`   Facebook Page ID: ${token.page_id}`);
              console.log(`   Facebook User ID: ${token.user_id}`);
              console.log(`   Page Name: ${token.page_name}`);
              foundMatch = true;
            }
          } catch (error) {
            console.log(`❌ Error reading token: ${error.message}`);
          }
        }
      }
      
      if (!foundMatch) {
        console.log(`❌ NO MATCH FOUND for webhook Page ID ${testWebhookPageId}`);
        console.log('This explains why real webhook events are not being processed!');
      }
    }

  } catch (error) {
    console.error('❌ Error during debugging:', error.message);
  }
}

// Run the debug
debugFacebookTokens().then(() => {
  console.log('\n🏁 Debug complete!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Debug failed:', error);
  process.exit(1);
}); 