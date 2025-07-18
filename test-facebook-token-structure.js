#!/usr/bin/env node

/**
 * FACEBOOK TOKEN STRUCTURE ANALYZER
 * 
 * This script analyzes the structure of Facebook tokens to understand
 * why the username mapping is failing
 */

const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');

// Configure AWS SDK v3 for R2
const s3Client = new S3Client({
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
});

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

async function analyzeFacebookTokens() {
  logSection('FACEBOOK TOKEN STRUCTURE ANALYSIS');
  
  try {
    const listTokens = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'FacebookTokens/',
    });
    const { Contents: tokenContents } = await s3Client.send(listTokens);
    
    if (!tokenContents || tokenContents.length === 0) {
      log('❌ No Facebook tokens found', 'red');
      return;
    }
    
    log(`✅ Found ${tokenContents.length} Facebook token files`, 'green');
    
    for (const obj of tokenContents) {
      if (obj.Key.endsWith('/token.json')) {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: obj.Key,
          });
          const tokenData = await s3Client.send(getCommand);
          const json = await tokenData.Body.transformToString();
          const token = JSON.parse(json);
          
          log(`\n📄 Token: ${obj.Key}`, 'blue');
          log(`   Username: ${token.username || 'NOT SET'}`, token.username ? 'green' : 'red');
          log(`   Page ID: ${token.page_id || 'NOT SET'}`, token.page_id ? 'green' : 'red');
          log(`   User ID: ${token.user_id || 'NOT SET'}`, token.user_id ? 'green' : 'red');
          log(`   Facebook Page ID: ${token.facebook_page_id || 'NOT SET'}`, token.facebook_page_id ? 'green' : 'red');
          log(`   Facebook User ID: ${token.facebook_user_id || 'NOT SET'}`, token.facebook_user_id ? 'green' : 'red');
          log(`   Is Personal Account: ${token.is_personal_account}`, 'blue');
          log(`   Has Access Token: ${!!token.access_token}`, token.access_token ? 'green' : 'red');
          
          // Show all keys for debugging
          log(`   All Keys: ${Object.keys(token).join(', ')}`, 'yellow');
          
        } catch (error) {
          log(`❌ Error reading token ${obj.Key}: ${error.message}`, 'red');
        }
      }
    }
  } catch (error) {
    log(`❌ Error analyzing Facebook tokens: ${error.message}`, 'red');
  }
}

async function analyzeFacebookConnections() {
  logSection('FACEBOOK CONNECTION STRUCTURE ANALYSIS');
  
  try {
    const listConnections = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'FacebookConnection/',
    });
    const { Contents: connectionContents } = await s3Client.send(listConnections);
    
    if (!connectionContents || connectionContents.length === 0) {
      log('❌ No Facebook connections found', 'red');
      return;
    }
    
    log(`✅ Found ${connectionContents.length} Facebook connection files`, 'green');
    
    for (const obj of connectionContents) {
      if (obj.Key.endsWith('/connection.json')) {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: obj.Key,
          });
          const connectionData = await s3Client.send(getCommand);
          const json = await connectionData.Body.transformToString();
          const connection = JSON.parse(json);
          
          log(`\n📄 Connection: ${obj.Key}`, 'blue');
          log(`   Username: ${connection.username || 'NOT SET'}`, connection.username ? 'green' : 'red');
          log(`   Page ID: ${connection.facebook_page_id || 'NOT SET'}`, connection.facebook_page_id ? 'green' : 'red');
          log(`   User ID: ${connection.facebook_user_id || 'NOT SET'}`, connection.facebook_user_id ? 'green' : 'red');
          log(`   Is Personal Account: ${connection.is_personal_account}`, 'blue');
          log(`   Has Access Token: ${!!connection.access_token}`, connection.access_token ? 'green' : 'red');
          
          // Show all keys for debugging
          log(`   All Keys: ${Object.keys(connection).join(', ')}`, 'yellow');
          
        } catch (error) {
          log(`❌ Error reading connection ${obj.Key}: ${error.message}`, 'red');
        }
      }
    }
  } catch (error) {
    log(`❌ Error analyzing Facebook connections: ${error.message}`, 'red');
  }
}

async function findUsernameMapping() {
  logSection('USERNAME MAPPING ANALYSIS');
  
  const testUsername = 'sentientmarketingsol';
  log(`🔍 Looking for username: ${testUsername}`, 'blue');
  
  // Check tokens
  try {
    const listTokens = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'FacebookTokens/',
    });
    const { Contents: tokenContents } = await s3Client.send(listTokens);
    
    if (tokenContents) {
      for (const obj of tokenContents) {
        if (obj.Key.endsWith('/token.json')) {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: obj.Key,
          });
          const tokenData = await s3Client.send(getCommand);
          const json = await tokenData.Body.transformToString();
          const token = JSON.parse(json);
          
          if (token.username === testUsername) {
            log(`✅ Found token with username match: ${obj.Key}`, 'green');
            log(`   Page ID: ${token.page_id}`, 'green');
            return;
          }
        }
      }
    }
  } catch (error) {
    log(`❌ Error checking tokens: ${error.message}`, 'red');
  }
  
  // Check connections
  try {
    const listConnections = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'FacebookConnection/',
    });
    const { Contents: connectionContents } = await s3Client.send(listConnections);
    
    if (connectionContents) {
      for (const obj of connectionContents) {
        if (obj.Key.endsWith('/connection.json')) {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: obj.Key,
          });
          const connectionData = await s3Client.send(getCommand);
          const json = await connectionData.Body.transformToString();
          const connection = JSON.parse(json);
          
          if (connection.username === testUsername) {
            log(`✅ Found connection with username match: ${obj.Key}`, 'green');
            log(`   Page ID: ${connection.facebook_page_id}`, 'green');
            return;
          }
        }
      }
    }
  } catch (error) {
    log(`❌ Error checking connections: ${error.message}`, 'red');
  }
  
  log(`❌ No username mapping found for: ${testUsername}`, 'red');
}

async function main() {
  log('🔍 FACEBOOK TOKEN & CONNECTION ANALYZER', 'bright');
  log('Analyzing Facebook token structure and username mapping', 'blue');
  
  await analyzeFacebookTokens();
  await analyzeFacebookConnections();
  await findUsernameMapping();
  
  log('\n🎯 RECOMMENDATIONS:', 'bright');
  log('1. Check if Facebook tokens have username field', 'yellow');
  log('2. Check if Facebook connections have username field', 'yellow');
  log('3. Ensure username mapping is working correctly', 'yellow');
  log('4. Fix the RAG instant reply endpoint based on findings', 'yellow');
}

if (require.main === module) {
  main().catch(error => {
    log(`\n💥 Analysis failed: ${error.message}`, 'red');
    process.exit(1);
  });
}
