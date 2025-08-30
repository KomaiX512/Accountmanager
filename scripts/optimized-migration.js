#!/usr/bin/env node

/**
 * ⚡ OPTIMIZED PARALLEL R2 MIGRATION - BALANCED LIGHTNING SPEED
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const OLD_S3_CONFIG = {
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
  maxAttempts: 2,
  requestHandler: { 
    connectionTimeout: 3000, 
    requestTimeout: 8000,
    maxSockets: 200  // Increased socket limit
  }
};

const NEW_S3_CONFIG = {
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: process.env.NEW_R2_ACCESS_KEY,
    secretAccessKey: process.env.NEW_R2_SECRET_KEY,
  },
  maxAttempts: 2,
  requestHandler: { 
    connectionTimeout: 3000, 
    requestTimeout: 8000,
    maxSockets: 200  // Increased socket limit
  }
};

const oldS3 = new S3Client(OLD_S3_CONFIG);
const newS3 = new S3Client(NEW_S3_CONFIG);

async function streamToBuffer(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function transferObject(bucket, key) {
  try {
    const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await oldS3.send(getCmd);
    const body = await streamToBuffer(response.Body);
    
    const putCmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: response.ContentType,
      Metadata: response.Metadata
    });
    
    await newS3.send(putCmd);
    return { success: true, size: body.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function migrateBucket(bucket) {
  console.log(`⚡ MIGRATING: ${bucket}`);
  
  // List all objects
  const objects = [];
  let token = null;
  
  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      MaxKeys: 1000,
      ContinuationToken: token
    });
    const response = await oldS3.send(cmd);
    if (response.Contents) objects.push(...response.Contents);
    token = response.NextContinuationToken;
  } while (token);
  
  if (objects.length === 0) {
    console.log(`📭 ${bucket} empty`);
    return { bucket, total: 0, success: 0 };
  }
  
  console.log(`📊 ${bucket}: ${objects.length} objects`);
  
  // OPTIMIZED BATCH PROCESSING - 500 objects per batch
  const batchSize = 500;
  let totalSuccess = 0;
  
  for (let i = 0; i < objects.length; i += batchSize) {
    const batch = objects.slice(i, i + batchSize);
    const batchNum = Math.floor(i/batchSize) + 1;
    
    console.log(`⚡ Batch ${batchNum}: ${batch.length} objects`);
    
    const results = await Promise.all(
      batch.map(obj => transferObject(bucket, obj.Key))
    );
    
    const successes = results.filter(r => r.success).length;
    totalSuccess += successes;
    
    console.log(`⚡ Batch ${batchNum}: ${successes}/${batch.length} success`);
  }
  
  console.log(`✅ ${bucket}: ${totalSuccess}/${objects.length} complete`);
  return { bucket, total: objects.length, success: totalSuccess };
}

async function main() {
  console.log('⚡ OPTIMIZED PARALLEL MIGRATION STARTING');
  
  const startTime = Date.now();
  
  // Process remaining buckets in parallel
  const buckets = ['structuredb', 'admin'];
  const results = await Promise.all(buckets.map(bucket => migrateBucket(bucket)));
  
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  console.log('\n🎯 RESULTS:');
  results.forEach(r => {
    console.log(`✅ ${r.bucket}: ${r.success}/${r.total}`);
  });
  
  console.log(`\n⚡ COMPLETED IN: ${duration} seconds`);
}

main().catch(console.error);
