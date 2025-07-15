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

async function checkFacebookEvents() {
  console.log('🔍 Checking Facebook events in R2...\n');
  
  const userIds = ['612940588580162', '681487244693083'];
  
  for (const userId of userIds) {
    console.log(`📋 Checking events for user ID: ${userId}`);
    
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: `FacebookEvents/${userId}/`,
      });
      
      const { Contents } = await s3Client.send(listCommand);
      
      console.log(`   📊 Found ${Contents ? Contents.length : 0} events`);
      
      if (Contents && Contents.length > 0) {
        for (const obj of Contents) {
          console.log(`   📄 Event file: ${obj.Key}`);
          
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const eventData = JSON.parse(await data.Body.transformToString());
            
            console.log(`      - type: ${eventData.type}`);
            console.log(`      - facebook_page_id: ${eventData.facebook_page_id}`);
            console.log(`      - facebook_user_id: ${eventData.facebook_user_id}`);
            console.log(`      - message_id: ${eventData.message_id || 'N/A'}`);
            console.log(`      - comment_id: ${eventData.comment_id || 'N/A'}`);
            console.log(`      - text: ${eventData.text ? eventData.text.substring(0, 50) + '...' : 'N/A'}`);
            console.log(`      - status: ${eventData.status || 'pending'}`);
            console.log('');
          } catch (error) {
            console.error(`      ❌ Error reading event ${obj.Key}:`, error.message);
          }
        }
      }
      
      console.log('');
    } catch (error) {
      console.error(`❌ Error checking events for ${userId}:`, error.message);
    }
  }
}

// Run the check
checkFacebookEvents(); 