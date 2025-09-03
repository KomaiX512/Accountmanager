#!/usr/bin/env node

/**
 * MIGRATION SCRIPT: Fix User Platform Connections After R2 Migration
 * 
 * This script addresses the core issue where usage tracking fails because
 * platform usernames like "instagram_narsissist" cannot be mapped to 
 * Firebase UIDs like "KUvVFxnLanYTWPuSIfphby5hxJQ2".
 * 
 * Problem:
 * - After R2 migration, users are stored in admin bucket with Firebase UIDs
 * - Platform connections (Instagram/Facebook/Twitter usernames) are not linked
 * - Usage tracking falls back to platform_username format which doesn't exist in admin bucket
 * 
 * Solution:
 * - Scan tasks bucket for existing platform connections in AccountInfo/
 * - Extract platform usernames and Firebase UIDs from account info files
 * - Update admin bucket user data to include platform connections
 * - Create proper mapping between platform usernames and Firebase UIDs
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import fs from 'fs';

// R2 Client Configuration
const s3Client = new S3Client({
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '7e15d4a51abb43fff3a7da4a8813044f',
    secretAccessKey: '8fccd5540c85304347cbbd25d8e1f67776a8473c73c4a8811e83d0970bd461e2',
  },
  maxAttempts: 5,
});

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

class PlatformSchemaManager {
  static getPlatformConfig(platform) {
    const configs = {
      instagram: {
        normalizeUsername: (username) => username.toLowerCase().replace(/[@.]/g, '')
      },
      facebook: {
        normalizeUsername: (username) => username.toLowerCase().replace(/[@.]/g, '')
      },
      twitter: {
        normalizeUsername: (username) => username.toLowerCase().replace(/[@.]/g, '')
      }
    };
    return configs[platform] || configs.instagram;
  }

  static buildPath(module, platform, username, filename = '') {
    const normalizedUsername = this.getPlatformConfig(platform).normalizeUsername(username);
    return `${module}/${platform}/${normalizedUsername}/${filename}`.replace(/\/+$/, '');
  }
}

async function fixUserPlatformConnections() {
  console.log('🚀 Starting User Platform Connection Migration...');
  
  const connectionMap = new Map(); // userId -> { platform: username }
  const results = {
    scanned: 0,
    found: 0,
    updated: 0,
    errors: 0
  };

  try {
    // Step 1: Scan tasks bucket for platform connections
    console.log('📊 Step 1: Scanning tasks bucket for platform connections...');
    
    const platforms = ['instagram', 'facebook', 'twitter'];
    
    for (const platform of platforms) {
      console.log(`🔍 Scanning ${platform} connections...`);
      
      // Try new schema first: AccountInfo/platform/
      let platformPrefix = `AccountInfo/${platform}/`;
      let listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: platformPrefix,
        Delimiter: '/'
      });

      try {
        let response = await s3Client.send(listCommand);
        let userPrefixes = response.CommonPrefixes || [];

        // Fallback to legacy schema if no results
        if (userPrefixes.length === 0) {
          console.log(`  📁 No users found in AccountInfo/${platform}/, trying legacy account-info/${platform}/`);
          platformPrefix = `account-info/${platform}/`;
          listCommand = new ListObjectsV2Command({
            Bucket: 'tasks',
            Prefix: platformPrefix,
            Delimiter: '/'
          });
          response = await s3Client.send(listCommand);
          userPrefixes = response.CommonPrefixes || [];
        }

        console.log(`  📊 Found ${userPrefixes.length} ${platform} users`);
        results.scanned += userPrefixes.length;

        // Process each user
        for (const userPrefix of userPrefixes) {
          const usernameRaw = userPrefix.Prefix.replace(platformPrefix, '').replace('/', '');
          const normalizedUsername = PlatformSchemaManager.getPlatformConfig(platform).normalizeUsername(usernameRaw);
          
          try {
            // Get account info to find Firebase UID
            let infoKey;
            if (platformPrefix.startsWith('AccountInfo/')) {
              infoKey = PlatformSchemaManager.buildPath('AccountInfo', platform, normalizedUsername, 'info.json');
            } else {
              infoKey = `account-info/${platform}/${usernameRaw}/info.json`;
            }

            const getCommand = new GetObjectCommand({ Bucket: 'tasks', Key: infoKey });
            const infoResponse = await s3Client.send(getCommand);
            const infoData = JSON.parse(await streamToString(infoResponse.Body));

            if (infoData.firebaseUID) {
              // Found a connection!
              if (!connectionMap.has(infoData.firebaseUID)) {
                connectionMap.set(infoData.firebaseUID, {});
              }
              const userConnections = connectionMap.get(infoData.firebaseUID);
              userConnections[platform] = {
                username: normalizedUsername,
                accountType: infoData.accountType || 'personal',
                connected: true,
                migrationTimestamp: new Date().toISOString()
              };
              
              console.log(`  ✅ Found connection: ${infoData.firebaseUID} -> ${platform}:${normalizedUsername}`);
              results.found++;
            } else {
              console.log(`  ⚠️  No Firebase UID found for ${platform}:${normalizedUsername}`);
            }
            
          } catch (error) {
            console.log(`  ❌ Error processing ${platform}:${usernameRaw}: ${error.message}`);
            results.errors++;
          }
        }
      } catch (error) {
        console.log(`  ❌ Error scanning ${platform}: ${error.message}`);
        results.errors++;
      }
    }

    // Step 2: Update admin bucket user data
    console.log(`\n📝 Step 2: Updating ${connectionMap.size} users in admin bucket...`);
    
    for (const [userId, connections] of connectionMap.entries()) {
      try {
        // Get current user data
        const getUserCommand = new GetObjectCommand({
          Bucket: 'admin',
          Key: `users/${userId}/data.json`
        });

        let userData;
        try {
          const userResponse = await s3Client.send(getUserCommand);
          userData = JSON.parse(await streamToString(userResponse.Body));
        } catch (getUserError) {
          console.log(`  ⚠️  User ${userId} not found in admin bucket, skipping...`);
          continue;
        }

        // Add platform connections to user data
        for (const [platform, connection] of Object.entries(connections)) {
          userData[`${platform}Username`] = connection.username;
          userData[`${platform}AccountType`] = connection.accountType;
          userData[`${platform}Connected`] = connection.connected;
          userData[`${platform}MigrationTimestamp`] = connection.migrationTimestamp;
        }

        userData.lastUpdated = new Date().toISOString();
        userData.migrationVersion = '2.0';

        // Save updated user data
        const putCommand = new PutObjectCommand({
          Bucket: 'admin',
          Key: `users/${userId}/data.json`,
          Body: JSON.stringify(userData, null, 2),
          ContentType: 'application/json'
        });

        await s3Client.send(putCommand);
        
        const platformList = Object.keys(connections).join(', ');
        console.log(`  ✅ Updated ${userId} with connections: ${platformList}`);
        results.updated++;

      } catch (error) {
        console.log(`  ❌ Error updating user ${userId}: ${error.message}`);
        results.errors++;
      }
    }

    // Step 3: Summary
    console.log('\n📊 Migration Summary:');
    console.log(`  👥 Users scanned: ${results.scanned}`);
    console.log(`  🔗 Connections found: ${results.found}`);
    console.log(`  ✅ Users updated: ${results.updated}`);
    console.log(`  ❌ Errors: ${results.errors}`);
    
    if (results.updated > 0) {
      console.log('\n🎉 Migration completed successfully!');
      console.log('   Platform usernames are now properly linked to Firebase UIDs.');
      console.log('   Usage tracking should work correctly now.');
    } else {
      console.log('\n⚠️  No users were updated. Please check the bucket structure and Firebase UIDs.');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration directly
fixUserPlatformConnections()
  .then(() => {
    console.log('\n✨ Migration script completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });

export { fixUserPlatformConnections };
