import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from 'dotenv';

config();

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '1cf095c2fdea7fe3b2633aef80c0ebe6';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const R2_ENDPOINT = process.env.R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const s3Client = new S3Client({
  endpoint: R2_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function testR2Connection() {
  console.log('🧪 Testing R2 Connection...');
  console.log('Endpoint:', R2_ENDPOINT);
  console.log('Access Key:', R2_ACCESS_KEY_ID?.substring(0, 10) + '...');
  
  const imageKey = 'ready_post/instagram/fentybeauty/campaign_ready_post_1754561649019_edfdd724.jpg';
  
  try {
    console.log(`\n📥 Fetching: ${imageKey}`);
    
    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: imageKey,
    });
    
    const response = await s3Client.send(getCommand);
    const buffer = await streamToBuffer(response.Body);
    
    console.log('✅ SUCCESS!');
    console.log(`  - Size: ${buffer.length} bytes`);
    console.log(`  - Content-Type: ${response.ContentType}`);
    console.log(`  - Base64 preview: ${buffer.toString('base64').substring(0, 50)}...`);
    
    return true;
  } catch (error) {
    console.error('❌ FAILED!');
    console.error('Error:', error.message);
    console.error('Code:', error.Code || error.code);
    console.error('Status:', error.$metadata?.httpStatusCode);
    return false;
  }
}

testR2Connection();
