#!/usr/bin/env node

/**
 * Schema Migration Script: Fix Competitor Analysis Schema
 * 
 * CURRENT SCHEMA (incorrect):
 * competitor_analysis/<platform>/<primary_username>/<competitor>/analysis_1.json
 * 
 * TARGET SCHEMA (correct):
 * competitor_analysis/<platform>/<primary_username>/<competitor>.json
 * 
 * This script migrates existing data to the correct simplified schema.
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
});

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function migrateCompetitorAnalysisSchema() {
  console.log('🔍 Starting competitor analysis schema migration...');
  
  try {
    // List all competitor analysis files
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'competitor_analysis/',
    });
    
    const listResponse = await s3Client.send(listCommand);
    const files = listResponse.Contents || [];
    
    console.log(`📋 Found ${files.length} competitor analysis files to check`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const file of files) {
      const currentKey = file.Key;
      
      // Check if this file follows the old schema pattern: 
      // competitor_analysis/<platform>/<username>/<competitor>/analysis_X.json
      const oldSchemaPattern = /^competitor_analysis\/([^\/]+)\/([^\/]+)\/([^\/]+)\/analysis_\d+\.json$/;
      const match = currentKey.match(oldSchemaPattern);
      
      if (match) {
        const [, platform, username, competitor] = match;
        const newKey = `competitor_analysis/${platform}/${username}/${competitor}.json`;
        
        console.log(`🔄 Migrating: ${currentKey} -> ${newKey}`);
        
        try {
          // Get the existing file content
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: currentKey,
          });
          const data = await s3Client.send(getCommand);
          const content = await streamToString(data.Body);
          
          // Put the content in the new location
          const putCommand = new PutObjectCommand({
            Bucket: 'tasks',
            Key: newKey,
            Body: content,
            ContentType: 'application/json',
          });
          await s3Client.send(putCommand);
          
          // Delete the old file
          const deleteCommand = new DeleteObjectCommand({
            Bucket: 'tasks',
            Key: currentKey,
          });
          await s3Client.send(deleteCommand);
          
          console.log(`✅ Successfully migrated: ${competitor} for ${username} on ${platform}`);
          migratedCount++;
          
        } catch (error) {
          console.error(`❌ Failed to migrate ${currentKey}:`, error.message);
        }
      } else {
        console.log(`⏭️  Skipping (already correct schema): ${currentKey}`);
        skippedCount++;
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`✅ Migrated: ${migratedCount} files`);
    console.log(`⏭️  Skipped: ${skippedCount} files`);
    console.log('🎉 Schema migration completed!');
    
    // Verify the new schema works
    console.log('\n🔍 Verifying new schema...');
    await verifyNewSchema();
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

async function verifyNewSchema() {
  try {
    // Test the new schema by listing files
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'competitor_analysis/instagram/fentybeauty/',
    });
    
    const listResponse = await s3Client.send(listCommand);
    const files = listResponse.Contents || [];
    
    console.log('📋 Files in new schema:');
    files.forEach(file => {
      console.log(`  📄 ${file.Key}`);
    });
    
    // Test API endpoint
    console.log('\n🌐 Testing API endpoint...');
    const testResponse = await fetch('http://localhost:3000/api/competitor-analysis/fentybeauty/maccosmetics?platform=instagram');
    if (testResponse.ok) {
      const data = await testResponse.json();
      console.log(`✅ API test successful: Found ${data.length} items`);
      if (data.length > 0) {
        console.log(`📄 New key format: ${data[0].key}`);
      }
    } else {
      console.log(`❌ API test failed: ${testResponse.status}`);
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Run the migration
migrateCompetitorAnalysisSchema().catch(console.error);
