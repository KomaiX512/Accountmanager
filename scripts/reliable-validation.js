#!/usr/bin/env node

/**
 * ⚡ RELIABLE FAST VALIDATION - OPTIMIZED TIMEOUTS
 */

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const OLD_S3_CONFIG = {
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
  maxAttempts: 3,
  requestHandler: { 
    connectionTimeout: 10000, 
    requestTimeout: 20000,
    maxSockets: 50
  }
};

const NEW_S3_CONFIG = {
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: process.env.NEW_R2_ACCESS_KEY,
    secretAccessKey: process.env.NEW_R2_SECRET_KEY,
  },
  maxAttempts: 3,
  requestHandler: { 
    connectionTimeout: 10000, 
    requestTimeout: 20000,
    maxSockets: 50
  }
};

const oldS3 = new S3Client(OLD_S3_CONFIG);
const newS3 = new S3Client(NEW_S3_CONFIG);

async function countObjects(s3Client, bucket) {
  let count = 0;
  let token = null;
  
  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      MaxKeys: 1000,
      ContinuationToken: token
    });
    const response = await s3Client.send(cmd);
    if (response.Contents) count += response.Contents.length;
    token = response.NextContinuationToken;
  } while (token);
  
  return count;
}

async function validateBucket(bucket) {
  console.log(`⚡ Validating ${bucket}...`);
  
  try {
    const [oldCount, newCount] = await Promise.all([
      countObjects(oldS3, bucket),
      countObjects(newS3, bucket)
    ]);
    
    const missing = oldCount - newCount;
    console.log(`⚡ ${bucket}: ${oldCount} → ${newCount} (${missing} missing)`);
    
    return { bucket, old: oldCount, new: newCount, missing };
  } catch (error) {
    console.error(`❌ ${bucket} validation failed:`, error.message);
    return { bucket, old: 0, new: 0, missing: 0, error: error.message };
  }
}

async function main() {
  console.log('⚡ RELIABLE VALIDATION STARTING');
  
  const buckets = ['tasks', 'structuredb', 'admin'];
  const results = [];
  
  // Validate buckets sequentially to avoid timeout issues
  for (const bucket of buckets) {
    const result = await validateBucket(bucket);
    results.push(result);
  }
  
  console.log('\n🎯 VALIDATION RESULTS:');
  let totalMissing = 0;
  
  results.forEach(r => {
    if (r.error) {
      console.log(`❌ ${r.bucket}: ERROR - ${r.error}`);
    } else {
      console.log(`✅ ${r.bucket}: ${r.new}/${r.old} objects (${r.missing} missing)`);
      totalMissing += r.missing;
    }
  });
  
  console.log(`\n📊 TOTAL MISSING: ${totalMissing} objects`);
  
  if (totalMissing === 0) {
    console.log('🎉 PERFECT MIGRATION - ALL DATA TRANSFERRED!');
  } else {
    console.log('⚠️  Some objects missing - may need retry migration');
  }
}

main().catch(console.error);
