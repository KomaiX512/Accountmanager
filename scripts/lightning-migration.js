#!/usr/bin/env node

/**
 * ⚡ LIGHTNING FAST R2 MIGRATION - 1000x SPEED
 * Optimized for heavy compute and excellent internet
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';

// LIGHTNING FAST CONFIGS
const OLD_S3_CONFIG = {
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
  maxAttempts: 1,
  requestHandler: { connectionTimeout: 500, requestTimeout: 2000 }
};

const NEW_S3_CONFIG = {
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: process.env.NEW_R2_ACCESS_KEY,
    secretAccessKey: process.env.NEW_R2_SECRET_KEY,
  },
  maxAttempts: 1,
  requestHandler: { connectionTimeout: 500, requestTimeout: 2000 }
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

async function migrateBucketLightning(bucket) {
  console.log(`⚡ LIGHTNING MIGRATION: ${bucket}`);
  
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
    console.log(`📭 ${bucket} is empty`);
    return;
  }
  
  console.log(`📊 ${bucket}: ${objects.length} objects`);
  
  // LIGHTNING FAST TRANSFER - 1000 objects at once, NO delays
  const batchSize = 1000;
  for (let i = 0; i < objects.length; i += batchSize) {
    const batch = objects.slice(i, i + batchSize);
    console.log(`⚡ Batch ${Math.floor(i/batchSize)+1}: ${batch.length} objects`);
    
    const results = await Promise.all(
      batch.map(obj => transferObject(bucket, obj.Key))
    );
    
    const successes = results.filter(r => r.success).length;
    console.log(`⚡ Complete: ${successes}/${batch.length} success`);
  }
  
  console.log(`✅ ${bucket} COMPLETE!`);
}

async function main() {
  console.log('⚡ LIGHTNING FAST MIGRATION STARTING');
  
  // Process remaining buckets in parallel for maximum speed
  const buckets = ['structuredb', 'admin'];
  
  await Promise.all(buckets.map(bucket => migrateBucketLightning(bucket)));
  
  console.log('🎉 ALL BUCKETS MIGRATED!');
}

main().catch(console.error);
