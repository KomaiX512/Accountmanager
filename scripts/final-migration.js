#!/usr/bin/env node

/**
 * ⚡ FINAL MIGRATION - CAPTURE MISSING OBJECTS
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const OLD_S3_CONFIG = {
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
  maxAttempts: 3,
  requestHandler: { connectionTimeout: 10000, requestTimeout: 20000 }
};

const NEW_S3_CONFIG = {
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: process.env.NEW_R2_ACCESS_KEY,
    secretAccessKey: process.env.NEW_R2_SECRET_KEY,
  },
  maxAttempts: 3,
  requestHandler: { connectionTimeout: 10000, requestTimeout: 20000 }
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

async function objectExists(s3Client, bucket, key) {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function findMissingObjects(bucket) {
  console.log(`🔍 Finding missing objects in ${bucket}...`);
  
  // Get all objects from old bucket
  const oldObjects = [];
  let token = null;
  
  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      MaxKeys: 1000,
      ContinuationToken: token
    });
    const response = await oldS3.send(cmd);
    if (response.Contents) oldObjects.push(...response.Contents);
    token = response.NextContinuationToken;
  } while (token);
  
  console.log(`📊 ${bucket}: Checking ${oldObjects.length} objects...`);
  
  // Find missing objects
  const missing = [];
  for (const obj of oldObjects) {
    const exists = await objectExists(newS3, bucket, obj.Key);
    if (!exists) {
      missing.push(obj);
    }
  }
  
  console.log(`🎯 ${bucket}: ${missing.length} missing objects found`);
  return missing;
}

async function transferMissingObjects(bucket, missingObjects) {
  if (missingObjects.length === 0) {
    console.log(`✅ ${bucket}: No missing objects to transfer`);
    return 0;
  }
  
  console.log(`⚡ Transferring ${missingObjects.length} missing objects for ${bucket}...`);
  
  let transferred = 0;
  
  for (const obj of missingObjects) {
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
      transferred++;
      
      if (transferred % 10 === 0) {
        console.log(`⚡ ${bucket}: ${transferred}/${missingObjects.length} transferred`);
      }
    } catch (error) {
      console.error(`❌ Failed to transfer ${obj.Key}:`, error.message);
    }
  }
  
  console.log(`✅ ${bucket}: ${transferred}/${missingObjects.length} missing objects transferred`);
  return transferred;
}

async function main() {
  console.log('⚡ FINAL MIGRATION - CAPTURING MISSING OBJECTS');
  
  const buckets = ['tasks', 'structuredb', 'admin'];
  
  for (const bucket of buckets) {
    const missing = await findMissingObjects(bucket);
    await transferMissingObjects(bucket, missing);
  }
  
  console.log('\n🎉 FINAL MIGRATION COMPLETE!');
}

main().catch(console.error);
