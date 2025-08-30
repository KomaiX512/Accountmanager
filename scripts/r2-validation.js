#!/usr/bin/env node

/**
 * 🔍 ENTERPRISE R2 MIGRATION VALIDATION SCRIPT
 * 
 * This script validates that all data has been successfully migrated from old R2 buckets to new R2 buckets.
 * It performs comprehensive checks including object count, size, metadata, and content integrity.
 * 
 * VALIDATION FLOW:
 * 1. Connect to both old and new R2 accounts
 * 2. Compare object counts and lists between source and destination
 * 3. Validate file sizes and metadata
 * 4. Perform content integrity checks (checksums)
 * 5. Generate detailed validation report
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// OLD R2 CONFIGURATION (SOURCE)
const OLD_S3_CONFIG = {
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
  maxAttempts: 5,
  requestHandler: {
    connectionTimeout: 15000,
    requestTimeout: 30000,
  },
  retryMode: 'adaptive'
};

// NEW R2 CONFIGURATION (DESTINATION)
const NEW_S3_CONFIG = {
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: process.env.NEW_R2_ACCESS_KEY || 'REPLACE_WITH_NEW_ACCESS_KEY',
    secretAccessKey: process.env.NEW_R2_SECRET_KEY || 'REPLACE_WITH_NEW_SECRET_KEY',
  },
  maxAttempts: 5,
  requestHandler: {
    connectionTimeout: 15000,
    requestTimeout: 30000,
  },
  retryMode: 'adaptive'
};

// Create S3 clients
const oldS3Client = new S3Client(OLD_S3_CONFIG);
const newS3Client = new S3Client(NEW_S3_CONFIG);

// Buckets to validate
const BUCKETS_TO_VALIDATE = ['tasks', 'structuredb', 'admin'];

// Validation statistics
const validationStats = {
  totalChecks: 0,
  passedChecks: 0,
  failedChecks: 0,
  startTime: new Date(),
  bucketStats: {},
  errors: [],
  warnings: []
};

// Initialize bucket stats
BUCKETS_TO_VALIDATE.forEach(bucket => {
  validationStats.bucketStats[bucket] = {
    sourceObjects: 0,
    destinationObjects: 0,
    matchingObjects: 0,
    missingObjects: [],
    sizeMatches: 0,
    sizeMismatches: [],
    checksumMatches: 0,
    checksumMismatches: [],
    metadataMatches: 0,
    metadataMismatches: [],
    errors: []
  };
});

/**
 * Convert stream to buffer for AWS SDK v3 compatibility
 */
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Calculate MD5 hash of buffer
 */
function calculateMD5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * List all objects in a bucket with pagination support
 */
async function listAllObjects(s3Client, bucketName, clientType = 'unknown') {
  console.log(`📋 Listing objects in ${clientType} bucket: ${bucketName}`);
  
  const objects = [];
  let continuationToken = null;
  let pageCount = 0;
  
  do {
    try {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        MaxKeys: 1000,
        ContinuationToken: continuationToken
      });
      
      const response = await s3Client.send(command);
      
      if (response.Contents) {
        objects.push(...response.Contents);
        console.log(`   📄 ${clientType} Page ${++pageCount}: Found ${response.Contents.length} objects (Total: ${objects.length})`);
      }
      
      continuationToken = response.NextContinuationToken;
    } catch (error) {
      console.error(`❌ Error listing objects in ${clientType} ${bucketName}:`, error.message);
      throw error;
    }
  } while (continuationToken);
  
  console.log(`✅ Total objects found in ${clientType} ${bucketName}: ${objects.length}`);
  return objects;
}

/**
 * Get object metadata from bucket
 */
async function getObjectMetadata(s3Client, bucketName, objectKey) {
  try {
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: objectKey
    });
    
    const response = await s3Client.send(command);
    return {
      contentLength: response.ContentLength,
      contentType: response.ContentType,
      lastModified: response.LastModified,
      etag: response.ETag,
      metadata: response.Metadata || {}
    };
  } catch (error) {
    throw new Error(`Failed to get metadata for ${bucketName}/${objectKey}: ${error.message}`);
  }
}

/**
 * Get object content and calculate checksum
 */
async function getObjectChecksum(s3Client, bucketName, objectKey) {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey
    });
    
    const response = await s3Client.send(command);
    
    let objectBody;
    if (response.Body) {
      objectBody = await streamToBuffer(response.Body);
    } else {
      objectBody = Buffer.alloc(0);
    }
    
    return {
      size: objectBody.length,
      md5: calculateMD5(objectBody)
    };
  } catch (error) {
    throw new Error(`Failed to get content for ${bucketName}/${objectKey}: ${error.message}`);
  }
}

/**
 * Validate a single object between source and destination
 */
async function validateObject(bucketName, objectKey, sourceObject) {
  const validationResult = {
    key: objectKey,
    sizeMatch: false,
    checksumMatch: false,
    metadataMatch: false,
    errors: []
  };
  
  try {
    console.log(`🔍 Validating: ${bucketName}/${objectKey}`);
    
    // Get metadata from both sources
    const [sourceMetadata, destMetadata] = await Promise.all([
      getObjectMetadata(oldS3Client, bucketName, objectKey),
      getObjectMetadata(newS3Client, bucketName, objectKey)
    ]);
    
    // Validate size
    if (sourceMetadata.contentLength === destMetadata.contentLength) {
      validationResult.sizeMatch = true;
      validationStats.bucketStats[bucketName].sizeMatches++;
    } else {
      validationResult.errors.push(`Size mismatch: source=${sourceMetadata.contentLength}, dest=${destMetadata.contentLength}`);
      validationStats.bucketStats[bucketName].sizeMismatches.push({
        key: objectKey,
        sourceSize: sourceMetadata.contentLength,
        destSize: destMetadata.contentLength
      });
    }
    
    // Validate content type
    if (sourceMetadata.contentType === destMetadata.contentType) {
      validationResult.metadataMatch = true;
      validationStats.bucketStats[bucketName].metadataMatches++;
    } else {
      validationResult.errors.push(`Content-Type mismatch: source=${sourceMetadata.contentType}, dest=${destMetadata.contentType}`);
      validationStats.bucketStats[bucketName].metadataMismatches.push({
        key: objectKey,
        field: 'ContentType',
        sourceValue: sourceMetadata.contentType,
        destValue: destMetadata.contentType
      });
    }
    
    // For small files (< 10MB), validate content integrity
    if (sourceMetadata.contentLength < 10 * 1024 * 1024) {
      const [sourceChecksum, destChecksum] = await Promise.all([
        getObjectChecksum(oldS3Client, bucketName, objectKey),
        getObjectChecksum(newS3Client, bucketName, objectKey)
      ]);
      
      if (sourceChecksum.md5 === destChecksum.md5) {
        validationResult.checksumMatch = true;
        validationStats.bucketStats[bucketName].checksumMatches++;
      } else {
        validationResult.errors.push(`Checksum mismatch: source=${sourceChecksum.md5}, dest=${destChecksum.md5}`);
        validationStats.bucketStats[bucketName].checksumMismatches.push({
          key: objectKey,
          sourceMD5: sourceChecksum.md5,
          destMD5: destChecksum.md5
        });
      }
    } else {
      // For large files, trust the size and ETag comparison
      if (sourceMetadata.etag === destMetadata.etag) {
        validationResult.checksumMatch = true;
        validationStats.bucketStats[bucketName].checksumMatches++;
      } else {
        validationResult.errors.push(`ETag mismatch: source=${sourceMetadata.etag}, dest=${destMetadata.etag}`);
        validationStats.bucketStats[bucketName].checksumMismatches.push({
          key: objectKey,
          sourceETag: sourceMetadata.etag,
          destETag: destMetadata.etag
        });
      }
    }
    
    // Overall validation status
    const isValid = validationResult.sizeMatch && validationResult.checksumMatch && validationResult.metadataMatch;
    
    if (isValid) {
      console.log(`✅ Validation passed: ${bucketName}/${objectKey}`);
      validationStats.passedChecks++;
    } else {
      console.log(`❌ Validation failed: ${bucketName}/${objectKey}`);
      console.log(`   Errors: ${validationResult.errors.join(', ')}`);
      validationStats.failedChecks++;
      validationStats.errors.push({
        bucket: bucketName,
        key: objectKey,
        errors: validationResult.errors
      });
    }
    
    validationStats.totalChecks++;
    
    return validationResult;
    
  } catch (error) {
    console.error(`❌ Error validating ${bucketName}/${objectKey}:`, error.message);
    validationResult.errors.push(error.message);
    validationStats.failedChecks++;
    validationStats.totalChecks++;
    validationStats.bucketStats[bucketName].errors.push({
      key: objectKey,
      error: error.message
    });
    
    return validationResult;
  }
}

/**
 * Validate all objects in a bucket
 */
async function validateBucket(bucketName) {
  console.log(`\n🔍 Starting validation for bucket: ${bucketName}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    // List objects in both source and destination
    const [sourceObjects, destObjects] = await Promise.all([
      listAllObjects(oldS3Client, bucketName, 'SOURCE'),
      listAllObjects(newS3Client, bucketName, 'DESTINATION')
    ]);
    
    // Update statistics
    validationStats.bucketStats[bucketName].sourceObjects = sourceObjects.length;
    validationStats.bucketStats[bucketName].destinationObjects = destObjects.length;
    
    // Create maps for easy lookup
    const sourceMap = new Map(sourceObjects.map(obj => [obj.Key, obj]));
    const destMap = new Map(destObjects.map(obj => [obj.Key, obj]));
    
    // Check for missing objects in destination
    const missingInDest = [];
    for (const [key, obj] of sourceMap) {
      if (!destMap.has(key)) {
        missingInDest.push(key);
      }
    }
    
    // Check for extra objects in destination
    const extraInDest = [];
    for (const [key, obj] of destMap) {
      if (!sourceMap.has(key)) {
        extraInDest.push(key);
      }
    }
    
    // Report missing/extra objects
    if (missingInDest.length > 0) {
      console.log(`❌ Missing objects in destination: ${missingInDest.length}`);
      validationStats.bucketStats[bucketName].missingObjects = missingInDest;
      validationStats.errors.push({
        bucket: bucketName,
        type: 'missing_objects',
        count: missingInDest.length,
        objects: missingInDest
      });
    }
    
    if (extraInDest.length > 0) {
      console.log(`⚠️  Extra objects in destination: ${extraInDest.length}`);
      validationStats.warnings.push({
        bucket: bucketName,
        type: 'extra_objects',
        count: extraInDest.length,
        objects: extraInDest
      });
    }
    
    // Validate objects that exist in both
    const commonObjects = sourceObjects.filter(obj => destMap.has(obj.Key));
    validationStats.bucketStats[bucketName].matchingObjects = commonObjects.length;
    
    console.log(`📊 Validation summary for ${bucketName}:`);
    console.log(`   📄 Source objects: ${sourceObjects.length}`);
    console.log(`   📄 Destination objects: ${destObjects.length}`);
    console.log(`   📄 Common objects: ${commonObjects.length}`);
    console.log(`   ❌ Missing in dest: ${missingInDest.length}`);
    console.log(`   ⚠️  Extra in dest: ${extraInDest.length}`);
    
    if (commonObjects.length === 0) {
      console.log(`📭 No common objects to validate in ${bucketName}`);
      return;
    }
    
    // Validate common objects in batches
    const batchSize = 5; // Smaller batch size for validation
    const totalBatches = Math.ceil(commonObjects.length / batchSize);
    
    for (let i = 0; i < commonObjects.length; i += batchSize) {
      const batch = commonObjects.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      
      console.log(`\n🔍 Validating batch ${batchNumber}/${totalBatches} (${batch.length} objects)`);
      
      // Process batch concurrently
      const batchPromises = batch.map(obj => 
        validateObject(bucketName, obj.Key, obj)
      );
      
      const batchResults = await Promise.all(batchPromises);
      
      // Log batch results
      const batchPassed = batchResults.filter(r => r.sizeMatch && r.checksumMatch && r.metadataMatch).length;
      const batchFailed = batchResults.filter(r => !(r.sizeMatch && r.checksumMatch && r.metadataMatch)).length;
      
      console.log(`📊 Batch ${batchNumber} complete: ${batchPassed} passed, ${batchFailed} failed`);
      
      // Small delay between batches
      if (i + batchSize < commonObjects.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`\n✅ Bucket ${bucketName} validation complete!`);
    
  } catch (error) {
    console.error(`❌ Critical error validating bucket ${bucketName}:`, error.message);
    validationStats.bucketStats[bucketName].errors.push({
      type: 'critical_error',
      error: error.message
    });
  }
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration to human readable format
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Generate detailed validation report
 */
function generateValidationReport() {
  const endTime = new Date();
  const duration = endTime - validationStats.startTime;
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 VALIDATION COMPLETE - FINAL REPORT`);
  console.log(`${'='.repeat(80)}`);
  
  console.log(`⏱️  Duration: ${formatDuration(duration)}`);
  console.log(`📊 Total Checks: ${validationStats.totalChecks}`);
  console.log(`✅ Passed Checks: ${validationStats.passedChecks}`);
  console.log(`❌ Failed Checks: ${validationStats.failedChecks}`);
  
  const successRate = validationStats.totalChecks > 0 
    ? ((validationStats.passedChecks / validationStats.totalChecks) * 100).toFixed(2)
    : 0;
  console.log(`🎯 Success Rate: ${successRate}%`);
  
  // Per-bucket validation results
  console.log(`\n📋 PER-BUCKET VALIDATION RESULTS:`);
  console.log(`${'='.repeat(50)}`);
  
  BUCKETS_TO_VALIDATE.forEach(bucket => {
    const stats = validationStats.bucketStats[bucket];
    console.log(`\n🪣 ${bucket.toUpperCase()}:`);
    console.log(`   📊 Source Objects: ${stats.sourceObjects}`);
    console.log(`   📊 Destination Objects: ${stats.destinationObjects}`);
    console.log(`   📊 Matching Objects: ${stats.matchingObjects}`);
    console.log(`   ❌ Missing Objects: ${stats.missingObjects.length}`);
    console.log(`   ✅ Size Matches: ${stats.sizeMatches}`);
    console.log(`   ❌ Size Mismatches: ${stats.sizeMismatches.length}`);
    console.log(`   ✅ Checksum Matches: ${stats.checksumMatches}`);
    console.log(`   ❌ Checksum Mismatches: ${stats.checksumMismatches.length}`);
    console.log(`   ✅ Metadata Matches: ${stats.metadataMatches}`);
    console.log(`   ❌ Metadata Mismatches: ${stats.metadataMismatches.length}`);
    
    if (stats.matchingObjects > 0) {
      const bucketSuccessRate = ((stats.sizeMatches / stats.matchingObjects) * 100).toFixed(2);
      console.log(`   🎯 Validation Success Rate: ${bucketSuccessRate}%`);
    }
  });
  
  // Error summary
  if (validationStats.errors.length > 0) {
    console.log(`\n❌ VALIDATION ERRORS:`);
    console.log(`${'='.repeat(50)}`);
    validationStats.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.bucket}/${error.key || error.type}: ${error.errors?.join(', ') || error.error}`);
    });
  }
  
  // Warning summary
  if (validationStats.warnings.length > 0) {
    console.log(`\n⚠️  VALIDATION WARNINGS:`);
    console.log(`${'='.repeat(50)}`);
    validationStats.warnings.forEach((warning, index) => {
      console.log(`${index + 1}. ${warning.bucket}: ${warning.type} (${warning.count} objects)`);
    });
  }
  
  // Save detailed report to file
  const reportData = {
    summary: {
      startTime: validationStats.startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration: duration,
      totalChecks: validationStats.totalChecks,
      passedChecks: validationStats.passedChecks,
      failedChecks: validationStats.failedChecks,
      successRate: successRate
    },
    bucketStats: validationStats.bucketStats,
    errors: validationStats.errors,
    warnings: validationStats.warnings,
    configuration: {
      oldEndpoint: OLD_S3_CONFIG.endpoint,
      newEndpoint: NEW_S3_CONFIG.endpoint,
      buckets: BUCKETS_TO_VALIDATE
    }
  };
  
  const reportPath = path.join(process.cwd(), 'scripts', `validation-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`\n📄 Detailed validation report saved to: ${reportPath}`);
  
  return validationStats.failedChecks === 0;
}

/**
 * Test connections to both old and new R2 accounts
 */
async function testConnections() {
  console.log(`🔗 Testing connections to R2 accounts...`);
  
  try {
    // Test old R2 connection
    console.log(`   🔍 Testing OLD R2 connection...`);
    const oldTestCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      MaxKeys: 1
    });
    await oldS3Client.send(oldTestCommand);
    console.log(`   ✅ OLD R2 connection successful`);
    
    // Test new R2 connection
    console.log(`   🔍 Testing NEW R2 connection...`);
    const newTestCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      MaxKeys: 1
    });
    await newS3Client.send(newTestCommand);
    console.log(`   ✅ NEW R2 connection successful`);
    
    return true;
  } catch (error) {
    console.error(`❌ Connection test failed:`, error.message);
    return false;
  }
}

/**
 * Main validation function
 */
async function runValidation() {
  console.log(`🔍 R2 MIGRATION VALIDATION STARTING`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📅 Start Time: ${validationStats.startTime.toISOString()}`);
  console.log(`🪣 Buckets to validate: ${BUCKETS_TO_VALIDATE.join(', ')}`);
  console.log(`🔗 Source: ${OLD_S3_CONFIG.endpoint}`);
  console.log(`🔗 Destination: ${NEW_S3_CONFIG.endpoint}`);
  
  // Test connections first
  const connectionsOk = await testConnections();
  if (!connectionsOk) {
    console.error(`❌ Connection tests failed. Aborting validation.`);
    process.exit(1);
  }
  
  // Validate each bucket
  for (const bucket of BUCKETS_TO_VALIDATE) {
    await validateBucket(bucket);
  }
  
  // Generate final report
  const validationSuccessful = generateValidationReport();
  
  if (validationSuccessful) {
    console.log(`\n🎉 VALIDATION COMPLETED SUCCESSFULLY! 🎉`);
    console.log(`✅ All data has been successfully migrated and validated.`);
    process.exit(0);
  } else {
    console.log(`\n⚠️  VALIDATION COMPLETED WITH ERRORS`);
    console.log(`❌ Some data validation checks failed. Please review the report.`);
    process.exit(1);
  }
}

// Handle process signals gracefully
process.on('SIGINT', () => {
  console.log(`\n⚠️  Validation interrupted by user`);
  generateValidationReport();
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log(`\n⚠️  Validation terminated`);
  generateValidationReport();
  process.exit(1);
});

// Start validation if this script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runValidation().catch(error => {
    console.error(`💥 Critical validation error:`, error);
    generateValidationReport();
    process.exit(1);
  });
}

export { runValidation, testConnections, validationStats };
