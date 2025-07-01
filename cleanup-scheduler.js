import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: 'https://ba72672df3c041a3844f278dd3c32b22.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: '65f90d35d3f9eed0e3f1ad5240a28c53',
    secretAccessKey: 'f02d81f4eb29ba30b5d4bf42ad98ce9d5e6f6c34b9e7e7b62d2d79b3fbc0d0ff',
  }
});

async function cleanupScheduledPosts() {
  try {
    console.log('🧹 Starting cleanup of scheduled posts...');
    
    // List all scheduled posts
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'scheduled_posts/instagram/',
      MaxKeys: 1000
    });
    
    const response = await s3Client.send(listCommand);
    const files = response.Contents || [];
    
    console.log(`Found ${files.length} files to process`);
    
    let deletedCount = 0;
    let keptCount = 0;
    
    for (const file of files) {
      if (!file.Key?.endsWith('.json')) continue;
      
      try {
        // Get the schedule data to check status
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        const getCommand = new GetObjectCommand({
          Bucket: 'tasks',
          Key: file.Key
        });
        
        const scheduleResponse = await s3Client.send(getCommand);
        const scheduleDataStr = await scheduleResponse.Body.transformToString();
        const scheduleData = JSON.parse(scheduleDataStr);
        
        // Delete if failed, processing, or overdue
        if (scheduleData.status === 'failed' || 
            scheduleData.status === 'processing' || 
            scheduleData.status === 'scheduled') {
          
          // Delete the JSON file
          const deleteJsonCommand = new DeleteObjectCommand({
            Bucket: 'tasks',
            Key: file.Key
          });
          await s3Client.send(deleteJsonCommand);
          
          // Delete the image file if it exists
          if (scheduleData.imageKey) {
            try {
              const deleteImageCommand = new DeleteObjectCommand({
                Bucket: 'tasks',
                Key: scheduleData.imageKey
              });
              await s3Client.send(deleteImageCommand);
              console.log(`🗑️ Deleted image: ${scheduleData.imageKey}`);
            } catch (imgError) {
              console.log(`⚠️ Could not delete image ${scheduleData.imageKey}: ${imgError.message}`);
            }
          }
          
          console.log(`🗑️ Deleted ${scheduleData.status} post: ${scheduleData.id}`);
          deletedCount++;
        } else {
          console.log(`✅ Kept ${scheduleData.status} post: ${scheduleData.id}`);
          keptCount++;
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${file.Key}:`, error.message);
      }
    }
    
    console.log(`\n🎉 Cleanup completed!`);
    console.log(`🗑️ Deleted: ${deletedCount} posts`);
    console.log(`✅ Kept: ${keptCount} posts`);
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}

cleanupScheduledPosts(); 