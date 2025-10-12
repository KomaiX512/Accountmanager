import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: '7e15d4a51abb43fff3a7da4a8813044f',
    secretAccessKey: '8fccd5540c85304347cbbd25d8e1f67776a8473c73c4a8811e83d0970bd461e2'
  }
});

async function findUser() {
  const listCmd = new ListObjectsV2Command({
    Bucket: 'tasks',
    Prefix: 'UserTwitterStatus/',
    MaxKeys: 50
  });
  const result = await s3Client.send(listCmd);
  
  for (const item of result.Contents || []) {
    try {
      const getCmd = new GetObjectCommand({
        Bucket: 'tasks',
        Key: item.Key
      });
      const response = await s3Client.send(getCmd);
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
      
      if (data.twitter_username === 'muhammad_muti') {
        console.log('✅ FOUND muhammad_muti:');
        console.log('   User ID:', data.uid);
        return data.uid;
      }
    } catch (e) {}
  }
  console.log('❌ NOT FOUND');
}

findUser().catch(console.error);

