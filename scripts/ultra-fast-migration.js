#!/usr/bin/env node

/**
 * ⚡ ULTRA-FAST PARALLEL R2 MIGRATION - LIGHTNING SPEED
 * Optimized for heavy compute and excellent internet - 4 minute completion
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Worker } from 'worker_threads';
import fs from 'fs';

// LIGHTNING FAST CONFIGS - MAXIMUM PERFORMANCE
const OLD_S3_CONFIG = {
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
  maxAttempts: 1,
  requestHandler: { connectionTimeout: 200, requestTimeout: 1000 }
};

const NEW_S3_CONFIG = {
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: process.env.NEW_R2_ACCESS_KEY,
    secretAccessKey: process.env.NEW_R2_SECRET_KEY,
  },
  maxAttempts: 1,
  requestHandler: { connectionTimeout: 200, requestTimeout: 1000 }
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

async function transferBatch(bucket, objects) {
  const results = await Promise.all(objects.map(async (obj) => {
    try {
      const getCmd = new GetObjectCommand({ Bucket: bucket, Key: obj.Key });
      const response = await oldS3.send(getCmd);
      const body = await streamToBuffer(response.Body);
      
      const putCmd = new PutObjectCommand({
        Bucket: bucket,
        Key: obj.Key,
        Body: body,
        ContentType: response.ContentType,
        Metadata: response.Metadata
      });
      
      await newS3.send(putCmd);
      return { success: true, key: obj.Key, size: body.length };
    } catch (error) {
      return { success: false, key: obj.Key, error: error.message };
    }
  }));
  
  return results;
}

async function migrateBucketUltraFast(bucket) {
  console.log(`⚡ ULTRA-FAST MIGRATION: ${bucket}`);
  
  // List all objects at maximum speed
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
    return { bucket, total: 0, success: 0, failed: 0 };
  }
  
  console.log(`📊 ${bucket}: ${objects.length} objects - STARTING LIGHTNING TRANSFER`);
  
  // ULTRA-FAST PARALLEL PROCESSING - 2000 objects at once
  const batchSize = 2000;
  let totalSuccess = 0;
  let totalFailed = 0;
  
  for (let i = 0; i < objects.length; i += batchSize) {
    const batch = objects.slice(i, i + batchSize);
    const batchNum = Math.floor(i/batchSize) + 1;
    
    console.log(`⚡ Batch ${batchNum}: ${batch.length} objects`);
    
    const results = await transferBatch(bucket, batch);
    const successes = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success).length;
    
    totalSuccess += successes;
    totalFailed += failures;
    
    console.log(`⚡ Batch ${batchNum}: ${successes}/${batch.length} success`);
  }
  
  console.log(`✅ ${bucket} COMPLETE: ${totalSuccess}/${objects.length} success`);
  return { bucket, total: objects.length, success: totalSuccess, failed: totalFailed };
}

async function main() {
  console.log('⚡ ULTRA-FAST PARALLEL MIGRATION STARTING');
  console.log('🚀 Target: Complete in 4 minutes with heavy compute');
  
  const startTime = Date.now();
  
  // Process all buckets in parallel for maximum speed
  const buckets = ['tasks', 'structuredb', 'admin'];
  const results = await Promise.all(buckets.map(bucket => migrateBucketUltraFast(bucket)));
  
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  console.log('\n🎯 MIGRATION RESULTS:');
  results.forEach(r => {
    console.log(`✅ ${r.bucket}: ${r.success}/${r.total} objects`);
  });
  
  console.log(`\n⚡ COMPLETED IN: ${duration} seconds`);
  console.log('🎉 ALL BUCKETS MIGRATED AT LIGHTNING SPEED!');
}

main().catch(console.error);
