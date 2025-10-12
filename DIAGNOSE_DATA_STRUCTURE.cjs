/**
 * DIAGNOSTIC TOOL - Find Real User Data in System
 * 
 * This will help us understand:
 * 1. What userId values actually exist in R2
 * 2. What platform usernames are associated
 * 3. What files exist in local cache
 * 4. Map the correct data structure
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const API_URL = 'http://127.0.0.1:3000';
const CACHE_DIR = '/home/komail/Accountmanager/data/cache';

async function diagnoseCacheFiles() {
  console.log('\n📂 DIAGNOSING LOCAL CACHE FILES...\n');
  
  try {
    const files = await fs.readdir(CACHE_DIR);
    const profileFiles = files.filter(f => f.includes('_profile.json'));
    
    console.log(`Found ${profileFiles.length} profile files:\n`);
    
    const platformUsernames = {
      instagram: new Set(),
      twitter: new Set(),
      facebook: new Set(),
      linkedin: new Set()
    };
    
    for (const file of profileFiles) {
      // Parse: instagram_u2023460_profile.json
      const match = file.match(/^(instagram|twitter|facebook|linkedin)_(.+?)_profile\.json$/);
      if (match) {
        const [, platform, username] = match;
        platformUsernames[platform].add(username);
        console.log(`  ✅ ${platform.padEnd(10)} → @${username}`);
      }
    }
    
    console.log('\n📊 SUMMARY BY PLATFORM:');
    Object.entries(platformUsernames).forEach(([platform, usernames]) => {
      if (usernames.size > 0) {
        console.log(`  ${platform.toUpperCase()}: ${Array.from(usernames).join(', ')}`);
      }
    });
    
    return platformUsernames;
    
  } catch (error) {
    console.error('❌ Error reading cache:', error.message);
    return null;
  }
}

async function testUserIdCombinations(platformUsernames) {
  console.log('\n\n🔍 TESTING USERID COMBINATIONS IN R2...\n');
  
  // Common userId patterns to test
  const testUserIds = [
    'KomaiX512',
    'komail',
    'muhammad_komail',
    'test-user',
    // Extract from email pattern
    'komail_hassan',
    // Try Firebase UID patterns
    'user123',
    'admin'
  ];
  
  const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
  const workingCombinations = [];
  
  for (const userId of testUserIds) {
    console.log(`\nTesting userId: "${userId}"...`);
    
    for (const platform of platforms) {
      try {
        const response = await axios.get(
          `${API_URL}/api/user-${platform}-status/${userId}`,
          { timeout: 3000, validateStatus: () => true }
        );
        
        if (response.status === 200 && response.data) {
          const hasEnteredKey = platform === 'twitter' ? 'hasEnteredTwitterUsername'
            : platform === 'facebook' ? 'hasEnteredFacebookUsername'
            : platform === 'linkedin' ? 'hasEnteredLinkedInUsername'
            : 'hasEnteredInstagramUsername';
          
          const connected = response.data[hasEnteredKey];
          const username = response.data[`${platform}_username`];
          
          if (connected && username) {
            console.log(`  ✅ ${platform.padEnd(10)} → CONNECTED as @${username}`);
            workingCombinations.push({ userId, platform, username });
          } else if (connected) {
            console.log(`  ⚠️  ${platform.padEnd(10)} → Connected but NO username in data`);
          }
        }
      } catch (error) {
        // Silently skip errors
      }
    }
  }
  
  if (workingCombinations.length === 0) {
    console.log('\n❌ NO WORKING COMBINATIONS FOUND IN R2!');
    console.log('\n💡 SOLUTION: You need to acquire platforms first!');
    console.log('   1. Go to frontend dashboard');
    console.log('   2. Navigate to each platform (Instagram, Twitter, etc.)');
    console.log('   3. Enter your username for each platform');
    console.log('   4. This will create the R2 status files');
  } else {
    console.log('\n\n✅ WORKING COMBINATIONS FOUND:');
    console.log('─'.repeat(60));
    workingCombinations.forEach(combo => {
      console.log(`  UserID: ${combo.userId.padEnd(20)} Platform: ${combo.platform.padEnd(10)} Username: @${combo.username}`);
    });
  }
  
  return workingCombinations;
}

async function matchCacheToR2(platformUsernames, workingCombinations) {
  console.log('\n\n🔗 MATCHING CACHE FILES TO R2 DATA...\n');
  
  if (!workingCombinations || workingCombinations.length === 0) {
    console.log('❌ No R2 data to match against');
    return;
  }
  
  const matches = [];
  const mismatches = [];
  
  Object.entries(platformUsernames).forEach(([platform, usernames]) => {
    usernames.forEach(username => {
      const r2Match = workingCombinations.find(
        combo => combo.platform === platform && combo.username === username
      );
      
      if (r2Match) {
        matches.push({ platform, username, userId: r2Match.userId });
        console.log(`  ✅ ${platform}/@${username} → R2 userId: ${r2Match.userId}`);
      } else {
        mismatches.push({ platform, username });
        console.log(`  ⚠️  ${platform}/@${username} → NO R2 MATCH (orphaned cache file)`);
      }
    });
  });
  
  if (matches.length > 0) {
    console.log('\n\n🎯 RECOMMENDED CONFIGURATION:');
    console.log('─'.repeat(60));
    console.log(`\nUse this in your frontend/tests:\n`);
    const userId = matches[0].userId;
    console.log(`const TEST_USER_ID = '${userId}'; // Real userId from R2`);
    console.log(`\nThis userId has access to:`);
    matches.forEach(m => {
      console.log(`  - ${m.platform}: @${m.username}`);
    });
  }
  
  return { matches, mismatches };
}

async function main() {
  console.log('═'.repeat(60));
  console.log('🔬 SENTIENT AI MANAGER - DATA STRUCTURE DIAGNOSTIC');
  console.log('═'.repeat(60));
  
  const platformUsernames = await diagnoseCacheFiles();
  const workingCombinations = await testUserIdCombinations(platformUsernames);
  await matchCacheToR2(platformUsernames, workingCombinations);
  
  console.log('\n' + '═'.repeat(60));
  console.log('✅ DIAGNOSTIC COMPLETE');
  console.log('═'.repeat(60) + '\n');
}

main().catch(console.error);
