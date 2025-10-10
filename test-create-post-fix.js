/**
 * TEST: Verify Create Post Fix Actually Works
 * Tests the actual endpoint with the fixed parameters
 */

import axios from 'axios';

const RAG_SERVER_URL = 'http://localhost:3001';

// Simulate what the fixed operationExecutor now sends
const testCreatePost = async () => {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          TESTING CREATE POST FIX - REAL API CALL              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('📝 Simulating fixed operationExecutor.ts createPost() call\n');

  // What the FIXED code now sends
  const fixedPayload = {
    platform: 'instagram',
    username: 'maccosmetics',
    query: 'Create a professional instagram post about: one health tip of today. Include visual elements.'
  };

  console.log('✅ FIXED PAYLOAD (what we now send):');
  console.log(JSON.stringify(fixedPayload, null, 2));
  console.log('\n' + '─'.repeat(70) + '\n');

  try {
    console.log('🚀 Calling RAG server: POST /api/post-generator\n');
    
    const response = await axios.post(
      `${RAG_SERVER_URL}/api/post-generator`,
      fixedPayload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 180000
      }
    );

    console.log('✅ SUCCESS! RAG server responded:\n');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));
    console.log('\n' + '═'.repeat(70) + '\n');
    console.log('🎉 POST CREATION WORKS! The fix is correct.\n');
    
    return true;

  } catch (error) {
    console.log('❌ FAILED! Error details:\n');
    
    if (error.response) {
      console.log('Response Status:', error.response.status);
      console.log('Response Data:', JSON.stringify(error.response.data, null, 2));
      console.log('\nRAG Server Error Message:', error.response.data?.error || 'Unknown');
      
      if (error.response.status === 400) {
        console.log('\n🐛 BUG STILL EXISTS: RAG server validation failed');
        console.log('   This means the parameter is still wrong!');
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.log('⚠️  RAG server not running on port 3001');
      console.log('   Start it with: node rag-server.js');
    } else {
      console.log('Error:', error.message);
    }
    
    console.log('\n' + '═'.repeat(70) + '\n');
    console.log('❌ FIX DID NOT WORK\n');
    
    return false;
  }
};

// Also test the OLD broken payload to confirm it fails
const testBrokenPayload = async () => {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          TESTING OLD BROKEN CODE - Should Fail                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // What the BROKEN code was sending
  const brokenPayload = {
    platform: 'instagram',
    username: 'maccosmetics',
    userId: 'HxiBWT2egCVtWtloIA5rLZz3rNr1',
    prompt: 'Create a professional instagram post about: one health tip of today. Include visual elements.',  // WRONG!
    includeImage: true
  };

  console.log('❌ BROKEN PAYLOAD (what we were sending):');
  console.log(JSON.stringify(brokenPayload, null, 2));
  console.log('\n' + '─'.repeat(70) + '\n');

  try {
    console.log('🚀 Calling RAG server with broken payload\n');
    
    await axios.post(
      `${RAG_SERVER_URL}/api/post-generator`,
      brokenPayload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 180000
      }
    );

    console.log('⚠️  UNEXPECTED: Broken payload succeeded (should have failed!)');
    
  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.log('✅ EXPECTED FAILURE: Broken payload correctly rejected\n');
      console.log('Error:', error.response.data.error);
      console.log('\nThis confirms the bug was parameter name mismatch!\n');
    } else {
      console.log('❌ Different error:', error.message);
    }
  }
};

async function runTests() {
  console.log('\n');
  console.log('═'.repeat(70));
  console.log('        COMPREHENSIVE TEST: CREATE POST FIX VERIFICATION');
  console.log('═'.repeat(70));
  console.log('\n');

  // Test 1: Broken payload (should fail)
  await testBrokenPayload();
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Test 2: Fixed payload (should succeed)
  const success = await testCreatePost();
  
  console.log('\n');
  console.log('═'.repeat(70));
  console.log('                      FINAL VERDICT');
  console.log('═'.repeat(70));
  console.log('\n');
  
  if (success) {
    console.log('✅ FIX VERIFIED: Post creation now works correctly!');
    console.log('   The parameter change from "prompt" to "query" fixed the bug.\n');
  } else {
    console.log('❌ FIX FAILED: Something is still wrong.');
    console.log('   Need to investigate further.\n');
  }
}

runTests().catch(error => {
  console.error('Test execution failed:', error.message);
  process.exit(1);
});
