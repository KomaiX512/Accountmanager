#!/usr/bin/env node

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '7e15d4a51abb43fff3a7da4a8813044f',
    secretAccessKey: '8fccd5540c85304347cbbd25d8e1f67776a8473c73c4a8811e83d0970bd461e2',
  }
});

async function checkAdminBucket() {
  try {
    console.log('🔍 Checking admin bucket users directory...');
    
    const listCommand = new ListObjectsV2Command({
      Bucket: 'admin',
      Prefix: 'users/',
      Delimiter: '/'
    });
    
    const response = await s3Client.send(listCommand);
    console.log('Admin bucket users found:', response.CommonPrefixes?.length || 0);
    
    if (response.CommonPrefixes) {
      for (const prefix of response.CommonPrefixes.slice(0, 5)) {
        const userId = prefix.Prefix.replace('users/', '').replace('/', '');
        console.log(`\nUser directory: ${userId}`);
        
        // Check if user has data.json
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'admin',
            Key: `users/${userId}/data.json`
          });
          const userData = await s3Client.send(getCommand);
          const data = JSON.parse(await userData.Body.transformToString());
          
          const platforms = Object.keys(data).filter(k => k.includes('Username'));
          console.log(`  - Has data.json with platforms: ${platforms.join(', ')}`);
          console.log(`  - Sample data keys: ${Object.keys(data).slice(0, 5).join(', ')}`);
          
        } catch (e) {
          console.log(`  - Missing or invalid data.json: ${e.message}`);
        }
      }
    }
    
    // Also check connections directory
    console.log('\n🔍 Checking connections directory...');
    const connListCommand = new ListObjectsV2Command({
      Bucket: 'admin',
      Prefix: 'connections/',
      MaxKeys: 10
    });
    
    const connResponse = await s3Client.send(connListCommand);
    console.log('Connection files found:', connResponse.Contents?.length || 0);
    
    if (connResponse.Contents) {
      for (const obj of connResponse.Contents.slice(0, 5)) {
        console.log(`Connection file: ${obj.Key}`);
        
        // Try to read one connection file
        if (obj.Key.endsWith('.json')) {
          try {
            const getConn = new GetObjectCommand({
              Bucket: 'admin',
              Key: obj.Key
            });
            const connData = await s3Client.send(getConn);
            const conn = JSON.parse(await connData.Body.transformToString());
            console.log(`  - Sample connection data keys: ${Object.keys(conn).slice(0, 5).join(', ')}`);
          } catch (e) {
            console.log(`  - Error reading connection: ${e.message}`);
          }
        }
      }
    }
    
    // Check tasks bucket for legacy account-info
    console.log('\n🔍 Checking tasks bucket for legacy account-info...');
    const legacyListCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'account-info/',
      Delimiter: '/'
    });
    
    const legacyResponse = await s3Client.send(legacyListCommand);
    console.log('Legacy account-info platforms found:', legacyResponse.CommonPrefixes?.length || 0);
    
    if (legacyResponse.CommonPrefixes) {
      for (const platformPrefix of legacyResponse.CommonPrefixes.slice(0, 3)) {
        const platform = platformPrefix.Prefix.replace('account-info/', '').replace('/', '');
        console.log(`\nLegacy platform: ${platform}`);
        
        // Get users in this platform
        const platformListCommand = new ListObjectsV2Command({
          Bucket: 'tasks',
          Prefix: platformPrefix.Prefix,
          Delimiter: '/'
        });
        
        const platformResponse = await s3Client.send(platformListCommand);
        console.log(`  - Users found: ${platformResponse.CommonPrefixes?.length || 0}`);
        
        if (platformResponse.CommonPrefixes) {
          for (const userPrefix of platformResponse.CommonPrefixes.slice(0, 3)) {
            const username = userPrefix.Prefix.replace(platformPrefix.Prefix, '').replace('/', '');
            console.log(`    - Username: ${username}`);
            
            // Try to get info.json
            try {
              const infoKey = `${userPrefix.Prefix}info.json`;
              const getInfo = new GetObjectCommand({
                Bucket: 'tasks',
                Key: infoKey
              });
              const infoData = await s3Client.send(getInfo);
              const info = JSON.parse(await infoData.Body.transformToString());
              console.log(`      - Firebase UID: ${info.firebaseUID || 'NOT SET'}`);
              console.log(`      - Account Type: ${info.accountType || 'unknown'}`);
            } catch (e) {
              console.log(`      - No info.json: ${e.message}`);
            }
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Error checking buckets:', error.message);
  }
}

checkAdminBucket();
