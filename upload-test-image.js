const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// R2 configuration
const s3Client = new S3Client({
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '7e15d4a51abb43fff3a7da4a8813044f',
    secretAccessKey: '8fccd5540c85304347cbbd25d8e1f67776a8473c73c4a8811e83d0970bd461e2',
  },
});

async function uploadTestImage() {
  try {
    const imagePath = '/var/www/sentientm/ready_post/instagram/Jack/sample_image.jpg';
    const imageBuffer = fs.readFileSync(imagePath);
    
    console.log(`📸 Uploading test image: ${imageBuffer.length} bytes`);
    
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: 'ready_post/instagram/Jack/sample_image.jpg',
      Body: imageBuffer,
      ContentType: 'image/jpeg',
    });
    
    const startTime = Date.now();
    const result = await s3Client.send(putCommand);
    const uploadTime = Date.now() - startTime;
    
    console.log(`✅ Upload successful in ${uploadTime}ms!`);
    console.log(`ETag: ${result.ETag}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Upload failed: ${error.message}`);
    return false;
  }
}

uploadTestImage();
