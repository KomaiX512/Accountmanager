#!/usr/bin/env node

/**
 * Test script to verify the competitor update workflow
 * Tests the reset + re-upload mechanism for account info when competitors are modified
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TEST_USERNAME = 'test_competitor_workflow_user';
const TEST_PLATFORM = 'instagram';

// Test configuration
const INITIAL_ACCOUNT_DATA = {
  username: TEST_USERNAME,
  accountType: 'branding',
  postingStyle: 'Tech startup content and product updates',
  competitors: ['competitor1', 'competitor2', 'competitor3'],
  platform: TEST_PLATFORM
};

const UPDATED_COMPETITORS = ['competitor1', 'competitor2', 'new_competitor4'];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testCompetitorUpdateWorkflow() {
  console.log('🧪 Testing Competitor Update Workflow');
  console.log('=====================================\n');

  try {
    // Step 1: Initial setup - save account info (simulating entry form)
    console.log('📝 Step 1: Setting up initial account info...');
    const initialResponse = await axios.post(`${BASE_URL}/api/save-account-info?platform=${TEST_PLATFORM}`, 
      INITIAL_ACCOUNT_DATA, 
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    if (initialResponse.status === 200) {
      console.log('✅ Initial account info saved successfully');
    } else {
      throw new Error(`Failed to save initial account info: ${initialResponse.status}`);
    }

    await sleep(1000);

    // Step 2: Verify initial data was saved correctly
    console.log('\n📋 Step 2: Verifying initial account info...');
    const retrieveResponse = await axios.get(`${BASE_URL}/api/retrieve-account-info/${TEST_USERNAME}?platform=${TEST_PLATFORM}`);
    
    if (retrieveResponse.status === 200) {
      const accountInfo = retrieveResponse.data;
      console.log('✅ Retrieved account info:', {
        username: accountInfo.username,
        accountType: accountInfo.accountType,
        competitors: accountInfo.competitors,
        platform: accountInfo.platform
      });
      
      // Verify competitors match
      const initialCompetitors = INITIAL_ACCOUNT_DATA.competitors.sort();
      const retrievedCompetitors = accountInfo.competitors.sort();
      if (JSON.stringify(initialCompetitors) === JSON.stringify(retrievedCompetitors)) {
        console.log('✅ Initial competitors match perfectly');
      } else {
        throw new Error('Initial competitors do not match!');
      }
    } else {
      throw new Error(`Failed to retrieve account info: ${retrieveResponse.status}`);
    }

    await sleep(1000);

    // Step 3: Test the reset + re-upload workflow (simulating competitor update)
    console.log('\n🔄 Step 3: Testing reset + re-upload workflow...');
    
    // Reset the account info
    console.log('   🗑️  Resetting account info...');
    const resetResponse = await axios.post(`${BASE_URL}/api/reset-account-info`, {
      username: TEST_USERNAME,
      platform: TEST_PLATFORM
    }, { headers: { 'Content-Type': 'application/json' } });
    
    if (resetResponse.status === 200) {
      console.log('   ✅ Account info reset successfully');
    } else {
      throw new Error(`Failed to reset account info: ${resetResponse.status}`);
    }

    await sleep(500);

    // Re-upload with updated competitors (simulating Cs_Analysis component)
    console.log('   📤 Re-uploading with updated competitors...');
    const updatedAccountData = {
      ...INITIAL_ACCOUNT_DATA,
      competitors: UPDATED_COMPETITORS
    };
    
    const reuploadResponse = await axios.post(`${BASE_URL}/api/save-account-info?platform=${TEST_PLATFORM}`, 
      updatedAccountData, 
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    if (reuploadResponse.status === 200) {
      console.log('   ✅ Account info re-uploaded with updated competitors');
    } else {
      throw new Error(`Failed to re-upload account info: ${reuploadResponse.status}`);
    }

    await sleep(1000);

    // Step 4: Verify the updated data
    console.log('\n🔍 Step 4: Verifying updated account info...');
    const finalRetrieveResponse = await axios.get(`${BASE_URL}/api/retrieve-account-info/${TEST_USERNAME}?platform=${TEST_PLATFORM}`);
    
    if (finalRetrieveResponse.status === 200) {
      const finalAccountInfo = finalRetrieveResponse.data;
      console.log('✅ Retrieved updated account info:', {
        username: finalAccountInfo.username,
        accountType: finalAccountInfo.accountType,
        competitors: finalAccountInfo.competitors,
        platform: finalAccountInfo.platform
      });
      
      // Verify updated competitors match
      const expectedCompetitors = UPDATED_COMPETITORS.sort();
      const actualCompetitors = finalAccountInfo.competitors.sort();
      if (JSON.stringify(expectedCompetitors) === JSON.stringify(actualCompetitors)) {
        console.log('✅ Updated competitors match perfectly!');
        console.log(`   📊 Initial: [${INITIAL_ACCOUNT_DATA.competitors.join(', ')}]`);
        console.log(`   📊 Updated: [${finalAccountInfo.competitors.join(', ')}]`);
      } else {
        throw new Error(`Updated competitors do not match! Expected: ${JSON.stringify(expectedCompetitors)}, Got: ${JSON.stringify(actualCompetitors)}`);
      }
      
      // Verify other fields are preserved
      if (finalAccountInfo.username === INITIAL_ACCOUNT_DATA.username &&
          finalAccountInfo.accountType === INITIAL_ACCOUNT_DATA.accountType &&
          finalAccountInfo.postingStyle === INITIAL_ACCOUNT_DATA.postingStyle &&
          finalAccountInfo.platform === INITIAL_ACCOUNT_DATA.platform) {
        console.log('✅ All other account fields preserved correctly');
      } else {
        throw new Error('Some account fields were not preserved correctly');
      }
    } else {
      throw new Error(`Failed to retrieve updated account info: ${finalRetrieveResponse.status}`);
    }

    // Step 5: Cleanup - remove test data
    console.log('\n🧹 Step 5: Cleaning up test data...');
    const cleanupResponse = await axios.post(`${BASE_URL}/api/reset-account-info`, {
      username: TEST_USERNAME,
      platform: TEST_PLATFORM
    }, { headers: { 'Content-Type': 'application/json' } });
    
    if (cleanupResponse.status === 200) {
      console.log('✅ Test data cleaned up successfully');
    }

    console.log('\n🎉 ALL TESTS PASSED! Competitor update workflow is working correctly.');
    console.log('\n📋 Summary:');
    console.log('   ✅ Initial account info save/retrieve works');
    console.log('   ✅ Reset functionality works');
    console.log('   ✅ Re-upload with updated competitors works');
    console.log('   ✅ All account fields are preserved during update');
    console.log('   ✅ Competitor list is updated correctly');
    console.log('\n💡 The Cs_Analysis component should now properly trigger backend re-processing when competitors are modified.');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data);
    }
    
    // Attempt cleanup even if test failed
    try {
      await axios.post(`${BASE_URL}/api/reset-account-info`, {
        username: TEST_USERNAME,
        platform: TEST_PLATFORM
      }, { headers: { 'Content-Type': 'application/json' } });
      console.log('🧹 Cleanup completed');
    } catch (cleanupError) {
      console.log('⚠️  Cleanup failed, test data may remain');
    }
    
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testCompetitorUpdateWorkflow().catch(console.error);
}

module.exports = { testCompetitorUpdateWorkflow };
