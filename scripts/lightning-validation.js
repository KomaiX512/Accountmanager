#!/usr/bin/env node

/**
 * ⚡ LIGHTNING FAST R2 VALIDATION - LIGHT SPEED
 */

import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';

const OLD_S3_CONFIG = {
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
  maxAttempts: 1,
  requestHandler: { connectionTimeout: 500, requestTimeout: 1000 }
};

const NEW_S3_CONFIG = {
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: process.env.NEW_R2_ACCESS_KEY,
    secretAccessKey: process.env.NEW_R2_SECRET_KEY,
  },
  maxAttempts: 1,
  requestHandler: { connectionTimeout: 500, requestTimeout: 1000 }
};

const oldS3 = new S3Client(OLD_S3_CONFIG);
const newS3 = new S3Client(NEW_S3_CONFIG);

async function listBucketObjects(s3, bucket) {
  const objects = [];
  let token = null;
  
  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      MaxKeys: 1000,
      ContinuationToken: token
    });
    const response = await s3.send(cmd);
    if (response.Contents) objects.push(...response.Contents);
    token = response.NextContinuationToken;
  } while (token);
  
  return objects;
}

async function validateBucket(bucket) {
  console.log(`⚡ Validating ${bucket}...`);
  
  const [sourceObjects, destObjects] = await Promise.all([
    listBucketObjects(oldS3, bucket),
    listBucketObjects(newS3, bucket)
  ]);
  
  const sourceCount = sourceObjects.length;
  const destCount = destObjects.length;
  const missing = sourceCount - destCount;
  
  console.log(`⚡ ${bucket}: ${sourceCount} → ${destCount} (${missing} missing)`);
  
  return { bucket, sourceCount, destCount, missing, success: missing === 0 };
}

async function main() {
  console.log('⚡ LIGHTNING VALIDATION STARTING');
  
  const buckets = ['tasks', 'structuredb', 'admin'];
  const results = await Promise.all(buckets.map(validateBucket));
  
  console.log('\n🎯 VALIDATION RESULTS:');
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    console.log(`${status} ${r.bucket}: ${r.sourceCount} → ${r.destCount}`);
  });
  
  const allSuccess = results.every(r => r.success);
  console.log(allSuccess ? '🎉 ALL BUCKETS VALIDATED!' : '⚠️ SOME BUCKETS INCOMPLETE');
}

main().catch(console.error);
