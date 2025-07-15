const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: 'auto',
  endpoint: 'https://your-account-id.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: 'your-access-key-id',
    secretAccessKey: 'your-secret-access-key'
  }
});

async function checkWebhookEvents() {
  console.log('🔍 Checking for recent webhook events...\n');
  
  try {
    // Check for recent Facebook events
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'FacebookEvents/',
    });
    
    const { Contents } = await s3Client.send(listCommand);
    
    if (Contents && Contents.length > 0) {
      console.log(`📊 Found ${Contents.length} Facebook events in storage`);
      
      // Get the most recent events
      const recentEvents = Contents
        .filter(obj => obj.Key.includes('681487244693083')) // Your page ID
        .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified))
        .slice(0, 5);
      
      console.log(`\n📋 Most recent events for your page:`);
      
      for (const event of recentEvents) {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: event.Key,
          });
          
          const data = await s3Client.send(getCommand);
          const json = await data.Body.transformToString();
          const eventData = JSON.parse(json);
          
          console.log(`\n📄 Event: ${event.Key}`);
          console.log(`   Type: ${eventData.type}`);
          console.log(`   Timestamp: ${eventData.timestamp || eventData.received_at}`);
          console.log(`   Text: ${eventData.text || eventData.message || 'N/A'}`);
          console.log(`   Status: ${eventData.status}`);
        } catch (err) {
          console.log(`❌ Error reading event ${event.Key}: ${err.message}`);
        }
      }
    } else {
      console.log('❌ No Facebook events found in storage');
    }
    
  } catch (error) {
    console.log(`❌ Error checking webhook events: ${error.message}`);
  }
  
  console.log('\n📊 Webhook Event Status:');
  console.log('==========================');
  console.log('✅ If you see events above, webhooks are working');
  console.log('❌ If no events found, Facebook App may not be configured');
  console.log('\n🔧 Next Steps:');
  console.log('1. Configure Facebook App webhook URL');
  console.log('2. Subscribe to required events (messages, comments)');
  console.log('3. Test by sending a DM to your Facebook page');
}

checkWebhookEvents().catch(console.error); 