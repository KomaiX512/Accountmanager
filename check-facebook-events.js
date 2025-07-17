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
  
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `FacebookEvents/`,
    });
    
    const { Contents } = await s3Client.send(listCommand);
    
    console.log(`📊 Found ${Contents ? Contents.length : 0} Facebook event files`);
    
    if (Contents) {
      // Group events by user ID
      const eventsByUser = {};
      
      for (const obj of Contents) {
        if (obj.Key.endsWith('.json')) {
          const keyParts = obj.Key.split('/');
          const userId = keyParts[1]; // FacebookEvents/{userId}/{eventId}.json
          
          if (!eventsByUser[userId]) {
            eventsByUser[userId] = [];
          }
          
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const event = JSON.parse(await data.Body.transformToString());
            
            eventsByUser[userId].push({
              key: obj.Key,
              event: event
            });
          } catch (error) {
            console.error(`❌ Error reading event from ${obj.Key}:`, error.message);
          }
        }
      }
      
      // Display events by user
      for (const [userId, events] of Object.entries(eventsByUser)) {
        console.log(`\n👤 User ID: ${userId}`);
        console.log(`   📝 Events: ${events.length}`);
        
        // Show recent events (last 5)
        const recentEvents = events.slice(-5);
        for (const { key, event } of recentEvents) {
          console.log(`   - ${event.type || 'unknown'}: ${event.text || event.message_id || 'no text'} (${event.received_at || 'no timestamp'})`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking Facebook events:', error.message);
  }
}

checkFacebookEvents(); 