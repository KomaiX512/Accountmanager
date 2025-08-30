#!/usr/bin/env node

/**
 * Facebook Disconnect Helper Script
 * Helps disconnect current Facebook connection to allow reconnection with business page
 */

import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const S3_CONFIG = {
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '7e15d4a51abb43fff3a7da4a8813044f',
    secretAccessKey: '8fccd5540c85304347cbbd25d8e1f67776a8473c73c4a8811e83d0970bd461e2',
  }
};

const s3Client = new S3Client(S3_CONFIG);

async function disconnectFacebook(userId) {
  console.log(`🔧 Disconnecting Facebook for user: ${userId}`);
  console.log('=' .repeat(50));
  
  try {
    // List of keys to delete
    const keysToDelete = [
      `FacebookConnection/${userId}/connection.json`,
      `FacebookTokens/${userId}/token.json`,
      `FacebookTokens/681487244693083/token.json` // Your current page ID
    ];
    
    let deletedCount = 0;
    
    for (const key of keysToDelete) {
      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: 'tasks',
          Key: key,
        });
        
        await s3Client.send(deleteCommand);
        console.log(`✅ Deleted: ${key}`);
        deletedCount++;
      } catch (error) {
        if (error.name === 'NoSuchKey') {
          console.log(`ℹ️  Not found: ${key}`);
        } else {
          console.log(`❌ Error deleting ${key}: ${error.message}`);
        }
      }
    }
    
    // Also search for any other Facebook-related keys for this user
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: `FacebookTokens/`,
      });
      
      const { Contents } = await s3Client.send(listCommand);
      
      if (Contents) {
        for (const obj of Contents) {
          if (obj.Key.includes(userId) || obj.Key.includes('681487244693083')) {
            try {
              const deleteCommand = new DeleteObjectCommand({
                Bucket: 'tasks',
                Key: obj.Key,
              });
              
              await s3Client.send(deleteCommand);
              console.log(`✅ Deleted additional: ${obj.Key}`);
              deletedCount++;
            } catch (error) {
              console.log(`❌ Error deleting ${obj.Key}: ${error.message}`);
            }
          }
        }
      }
    } catch (searchError) {
      console.log(`⚠️  Error searching for additional keys: ${searchError.message}`);
    }
    
    console.log(`\n📊 Disconnect Summary:`);
    console.log(`  - Total keys deleted: ${deletedCount}`);
    console.log(`  - User ID: ${userId}`);
    console.log(`  - Page ID: 681487244693083`);
    
    console.log(`\n✅ Facebook connection successfully disconnected!`);
    console.log(`\n📝 Next Steps:`);
    console.log(`  1. Go to your app and reconnect Facebook`);
    console.log(`  2. Make sure to select your BUSINESS PAGE (not personal account)`);
    console.log(`  3. Grant all required permissions`);
    console.log(`  4. Run the enhanced test: node test-facebook-detection-enhanced.js ${userId}`);
    
    return {
      success: true,
      deletedCount,
      userId
    };
    
  } catch (error) {
    console.error(`\n❌ Disconnect failed:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Get user ID from command line or use default
const userId = process.argv[2] || '94THUToVmtdKGNcq4A5cTONerxI3';

console.log(`🚀 Starting Facebook disconnect process...`);
console.log(`📝 User ID: ${userId}`);

disconnectFacebook(userId)
  .then(result => {
    if (result.success) {
      console.log(`\n🎉 Disconnect completed successfully!`);
      console.log(`\n💡 Now reconnect your Facebook BUSINESS PAGE for full functionality.`);
    } else {
      console.log(`\n❌ Disconnect failed: ${result.error}`);
    }
  })
  .catch(error => {
    console.error(`\n💥 Script crashed:`, error.message);
  }); 