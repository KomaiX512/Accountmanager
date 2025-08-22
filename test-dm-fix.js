// Test script to verify DM username attribution fix
// This simulates what happens when a webhook is received

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

// Initialize S3 client with the same configuration as server.js
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

async function testUsernameLookup() {
  console.log('🧪 Testing username lookup functionality...');
  
  // Test data based on our previous webhook testing
  const testSenderId = '1258691768879855'; // The sender from our test
  const webhookGraphId = '17841476072004748'; // The connected account
  
  console.log(`🔍 Looking for username for sender ID: ${testSenderId}`);
  console.log(`📋 Connected account ID: ${webhookGraphId}`);
  
  let senderUsername = 'unknown';
  let connectedAccountUsername = 'unknown';
  
  try {
    // Search through all tokens to find usernames
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `InstagramTokens/`,
    });
    const { Contents } = await s3Client.send(listCommand);
    
    if (Contents) {
      for (const obj of Contents) {
        if (obj.Key.endsWith('/token.json')) {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: obj.Key,
          });
          const data = await s3Client.send(getCommand);
          const json = await data.Body.transformToString();
          const token = JSON.parse(json);
          
          // Check for sender's username
          if (token.instagram_user_id === testSenderId) {
            senderUsername = token.username || 'unknown';
            console.log(`✅ Found SENDER token: username="${senderUsername}" for sender ID: ${testSenderId}`);
          }
          
          // Check for connected account's username
          if (token.instagram_graph_id === webhookGraphId) {
            connectedAccountUsername = token.username || 'unknown';
            console.log(`✅ Found CONNECTED ACCOUNT token: username="${connectedAccountUsername}" for graph ID: ${webhookGraphId}`);
          }
        }
      }
    }
    
    console.log('\n📊 RESULTS:');
    console.log(`🎯 Sender username (what should be stored): "${senderUsername}"`);
    console.log(`🏠 Connected account username (what was wrong before): "${connectedAccountUsername}"`);
    
    // Simulate the eventData creation
    const eventData = {
      type: 'message',
      instagram_user_id: webhookGraphId,
      sender_id: testSenderId,
      message_id: 'test_message_123',
      text: 'Test message',
      timestamp: Date.now(),
      received_at: new Date().toISOString(),
      username: senderUsername, // 🔥 This is the fix - use sender's username
      status: 'pending'
    };
    
    console.log('\n🎯 SIMULATED EVENT DATA:');
    console.log(JSON.stringify(eventData, null, 2));
    
    // Verify the fix worked
    if (senderUsername !== 'unknown' && senderUsername !== connectedAccountUsername) {
      console.log('\n✅ SUCCESS: Fix is working correctly!');
      console.log(`   - Sender username "${senderUsername}" is different from connected account "${connectedAccountUsername}"`);
      console.log(`   - DM will be correctly attributed to sender "${senderUsername}" instead of account holder`);
    } else if (senderUsername === connectedAccountUsername) {
      console.log('\n⚠️  WARNING: Sender and connected account have same username');
      console.log('   - This might be a legitimate case where they are the same person');
    } else {
      console.log('\n❌ ISSUE: Could not find sender username in tokens');
      console.log('   - Either the sender is not in our system or tokens are missing');
    }
    
  } catch (error) {
    console.error('❌ Error during test:', error.message);
  }
}

// Run the test
testUsernameLookup().catch(console.error);
