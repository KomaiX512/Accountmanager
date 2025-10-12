/**
 * SETUP USER DATA IN R2 - Create Proper userId Mappings
 * 
 * This script creates the R2 status files needed for AI Manager to work.
 * It links the existing cache files to a userId.
 */

const axios = require('axios');

const API_URL = 'http://127.0.0.1:3000';

// REAL userId - you can get this from Firebase Auth in browser console:
// console.log(firebase.auth().currentUser.uid);
const REAL_USER_ID = 'KomaiX512'; // Change this to your actual Firebase UID

// Platform usernames from cache diagnostic
const PLATFORM_MAPPINGS = {
  instagram: 'u2023460',
  twitter: 'muhammad_muti',
  facebook: 'AutoPulseGlobalTrading', 
  linkedin: 'devenp'
};

async function setupPlatformStatus(userId, platform, username) {
  console.log(`\n📝 Setting up ${platform} for user ${userId}...`);
  
  // Correct field names for each platform
  const fieldName = `${platform}_username`;
  
  try {
    const response = await axios.post(
      `${API_URL}/api/user-${platform}-status/${userId}`,
      { [fieldName]: username }, // Dynamic field name
      { timeout: 5000, validateStatus: () => true }
    );
    
    if (response.status >= 200 && response.status < 300) {
      console.log(`✅ ${platform.toUpperCase()} linked to @${username}`);
      return true;
    } else {
      console.log(`❌ Failed: ${response.status} - ${response.data?.error || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

async function verifySetup(userId, platform) {
  try {
    const response = await axios.get(
      `${API_URL}/api/user-${platform}-status/${userId}`,
      { timeout: 3000, validateStatus: () => true }
    );
    
    if (response.status === 200) {
      const hasEnteredKey = platform === 'twitter' ? 'hasEnteredTwitterUsername'
        : platform === 'facebook' ? 'hasEnteredFacebookUsername'
        : platform === 'linkedin' ? 'hasEnteredLinkedInUsername'
        : 'hasEnteredInstagramUsername';
      
      const username = response.data[`${platform}_username`];
      const connected = response.data[hasEnteredKey];
      
      if (connected && username) {
        console.log(`  ✅ Verified: ${platform} → @${username}`);
        return true;
      } else {
        console.log(`  ⚠️ Data exists but incomplete:`, response.data);
        return false;
      }
    }
  } catch (error) {
    console.log(`  ❌ Verification failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('═'.repeat(70));
  console.log('🚀 SENTIENT AI MANAGER - USER DATA SETUP');
  console.log('═'.repeat(70));
  console.log(`\nSetting up data for userId: ${REAL_USER_ID}\n`);
  
  const results = {
    success: [],
    failed: []
  };
  
  // Setup all platforms
  for (const [platform, username] of Object.entries(PLATFORM_MAPPINGS)) {
    const success = await setupPlatformStatus(REAL_USER_ID, platform, username);
    
    if (success) {
      results.success.push(platform);
    } else {
      results.failed.push(platform);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Verify all setups
  console.log('\n\n🔍 VERIFYING SETUP...\n');
  
  for (const platform of Object.keys(PLATFORM_MAPPINGS)) {
    await verifySetup(REAL_USER_ID, platform);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('📊 SETUP SUMMARY');
  console.log('═'.repeat(70));
  console.log(`✅ Successfully setup: ${results.success.length} platforms`);
  console.log(`❌ Failed: ${results.failed.length} platforms`);
  
  if (results.success.length > 0) {
    console.log(`\n✅ PLATFORMS READY:`);
    results.success.forEach(p => console.log(`   - ${p}`));
  }
  
  if (results.failed.length > 0) {
    console.log(`\n❌ FAILED PLATFORMS:`);
    results.failed.forEach(p => console.log(`   - ${p}`));
  }
  
  console.log('\n💡 NEXT STEPS:');
  console.log('   1. Run: node BRUTAL_AI_MANAGER_TEST.cjs');
  console.log('   2. Test with real frontend AI Manager');
  console.log('   3. Ask: "Tell me my Instagram competitor analysis"');
  
  console.log('\n' + '═'.repeat(70) + '\n');
}

main().catch(console.error);
