import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '7e15d4a51abb43fff3a7da4a8813044f',
    secretAccessKey: '8fccd5540c85304347cbbd25d8e1f67776a8473c73c4a8811e83d0970bd461e2',
  },
  maxAttempts: 5,
  retryMode: 'adaptive'
});

async function checkUsageData() {
  console.log('🔍 Checking usage data in tasks bucket...');
  
  try {
    // Check for usage data in tasks bucket
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'usage/',
      MaxKeys: 100
    });
    
    const response = await s3Client.send(listCommand);
    console.log(`Found ${response.Contents?.length || 0} usage files in tasks bucket`);
    
    if (response.Contents && response.Contents.length > 0) {
      console.log('\nUsage files found:');
      for (const item of response.Contents.slice(0, 10)) {
        console.log(`- ${item.Key} (${item.Size} bytes, ${item.LastModified})`);
      }
      
      // Sample a few usage files to understand structure
      console.log('\n📋 Sampling usage file structure...');
      for (const item of response.Contents.slice(0, 3)) {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: item.Key
          });
          const fileResponse = await s3Client.send(getCommand);
          const content = JSON.parse(await fileResponse.Body.transformToString());
          console.log(`\n${item.Key}:`);
          console.log(`  Keys: ${Object.keys(content).join(', ')}`);
          if (content.userId) console.log(`  UserId: ${content.userId}`);
          if (content.platform) console.log(`  Platform: ${content.platform}`);
          if (content.username) console.log(`  Username: ${content.username}`);
          if (content.postsUsed !== undefined) console.log(`  PostsUsed: ${content.postsUsed}`);
        } catch (err) {
          console.log(`  Error reading ${item.Key}: ${err.message}`);
        }
      }
    }
    
    // Check admin bucket for existing usage data
    console.log('\n🔍 Checking usage data in admin bucket...');
    const adminListCommand = new ListObjectsV2Command({
      Bucket: 'admin',
      Prefix: 'usage/',
      MaxKeys: 100
    });
    
    const adminResponse = await s3Client.send(adminListCommand);
    console.log(`Found ${adminResponse.Contents?.length || 0} usage files in admin bucket`);
    
    if (adminResponse.Contents && adminResponse.Contents.length > 0) {
      console.log('\nAdmin usage files found:');
      for (const item of adminResponse.Contents.slice(0, 10)) {
        console.log(`- ${item.Key} (${item.Size} bytes, ${item.LastModified})`);
      }
    }
    
  } catch (error) {
    console.error('Error checking usage data:', error);
  }
}

checkUsageData();
