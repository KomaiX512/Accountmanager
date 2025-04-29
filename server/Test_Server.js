// test-r2.js
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const s3Client = new S3Client({
  endpoint: 'https://9069781eea9a108d41848d73443b3a87.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: 'b94be077bc48dcc2aec3e4331233327e',
    secretAccessKey: '791d5eeddcd8ed5bf3f41bfaebbd37e58af7dcb12275b1422747605d7dc75bc4',
  }
});
const command = new PutObjectCommand({
  Bucket: 'tasks',
  Key: 'test.jpg',
  Body: fs.readFileSync('~/Downloads/2.jpg'),
  ContentType: 'image/jpeg',
  ACL: 'public-read',
});
client.send(command).then(console.log).catch(console.error);