const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: 'auto',
  endpoint: 'https://ba72672df3c041a3844f278dd3c32b22.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: '65f90d35d3f9eed0e3f1ad5240a28c53',
    secretAccessKey: 'f02d81f4eb29ba30b5d4bf42ad98ce9d5e6f6c34b9e7e7b62d2d79b3fbc0d0ff',
  }
});

async function checkScheduledPosts() {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'InstagramScheduled/'
    });
    
    const listResponse = await s3Client.send(listCommand);
    const files = listResponse.Contents || [];
    
    console.log('=== INSTAGRAM SCHEDULED POSTS ===');
    console.log('Found', files.length, 'files in InstagramScheduled/');
    
    for (const file of files.slice(0, 3)) {
      if (file.Key.endsWith('.json')) {
        try {
          console.log('\n--- FILE:', file.Key, '---');
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: file.Key
          });
          const data = await s3Client.send(getCommand);
          const content = await data.Body.transformToString();
          const scheduledPost = JSON.parse(content);
          
          console.log('Status:', scheduledPost.status);
          console.log('Schedule Time (key):', Object.keys(scheduledPost).find(k => k.includes('Time') || k.includes('time')));
          console.log('Actual scheduledTime:', scheduledPost.scheduledTime);
          console.log('Actual scheduled_time:', scheduledPost.scheduled_time);
          console.log('User ID:', scheduledPost.userId);
          console.log('Instagram Graph ID:', scheduledPost.instagram_graph_id);
          console.log('Caption:', scheduledPost.caption?.substring(0, 50) + '...');
          console.log('All keys:', Object.keys(scheduledPost));
        } catch (parseError) {
          console.log('Error parsing', file.Key, ':', parseError.message);
        }
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkScheduledPosts(); 