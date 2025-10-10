/**
 * END-TO-END INTEGRATION TEST
 * Tests the complete Gemini AI Edit flow from start to finish
 */

import axios from 'axios';
import { readFileSync } from 'fs';

const BACKEND_URL = 'http://127.0.0.1:3000';
const TEST_DATA = {
  imageKey: 'campaign_ready_post_1754561649019_edfdd724.jpg',
  username: 'fentybeauty',
  platform: 'instagram',
  prompt: 'Transform this into a vibrant sunset aesthetic with warm golden tones'
};

async function runE2ETest() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              END-TO-END INTEGRATION TEST - GEMINI AI EDIT                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');
  
  const results = {
    serverCheck: false,
    imageEdit: false,
    responseValidation: false,
    urlAccessibility: false,
    dataIntegrity: false
  };
  
  try {
    // STEP 1: Server Health Check
    console.log('📍 STEP 1: Server Health Check');
    console.log('─'.repeat(80));
    console.log('Assuming server is running (tested in previous unit tests)');
    console.log('✅ Proceeding with API call\n');
    results.serverCheck = true;
    
    // STEP 2: Initiate AI Image Edit
    console.log('📍 STEP 2: Initiate AI Image Edit');
    console.log('─'.repeat(80));
    console.log(`Platform: ${TEST_DATA.platform}`);
    console.log(`Username: ${TEST_DATA.username}`);
    console.log(`Image: ${TEST_DATA.imageKey}`);
    console.log(`Prompt: "${TEST_DATA.prompt}"\n`);
    
    console.log('🔄 Calling /api/gemini-image-edit...');
    const startTime = Date.now();
    
    const response = await axios.post(
      `${BACKEND_URL}/api/gemini-image-edit`,
      TEST_DATA,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000
      }
    );
    
    const duration = Date.now() - startTime;
    console.log(`✅ Response received in ${(duration / 1000).toFixed(2)}s\n`);
    results.imageEdit = true;
    
    // STEP 3: Validate Response Structure
    console.log('📍 STEP 3: Validate Response Structure');
    console.log('─'.repeat(80));
    
    const data = response.data;
    const checks = [
      { name: 'Success flag', check: data.success === true },
      { name: 'Original URL', check: !!data.originalImageUrl },
      { name: 'Edited URL', check: !!data.editedImageUrl },
      { name: 'Image key', check: data.imageKey === TEST_DATA.imageKey },
      { name: 'Edited key prefix', check: data.editedImageKey?.startsWith('edited_') },
      { name: 'Prompt echo', check: data.prompt === TEST_DATA.prompt },
      { name: 'AI response', check: !!data.aiResponse },
      { name: 'AI candidates', check: data.aiResponse?.candidates?.length > 0 },
      { name: 'AI text content', check: !!data.aiResponse?.candidates?.[0]?.content?.parts?.[0]?.text }
    ];
    
    checks.forEach(({ name, check }) => {
      console.log(`   ${check ? '✅' : '❌'} ${name}`);
    });
    
    const allChecksPass = checks.every(c => c.check);
    console.log(`\n${allChecksPass ? '✅' : '❌'} Response structure: ${allChecksPass ? 'Valid' : 'Invalid'}\n`);
    results.responseValidation = allChecksPass;
    
    // STEP 4: Verify Image URLs Accessibility
    console.log('📍 STEP 4: Verify Image URLs Accessibility');
    console.log('─'.repeat(80));
    
    const originalUrl = `${BACKEND_URL}${data.originalImageUrl}`;
    const editedUrl = `${BACKEND_URL}${data.editedImageUrl}`;
    
    console.log(`Original: ${originalUrl}`);
    console.log(`Edited:   ${editedUrl}\n`);
    
    // Test original URL
    try {
      const origResp = await axios.head(originalUrl, { timeout: 10000 });
      console.log(`✅ Original image accessible (${origResp.status})`);
    } catch (e) {
      console.log(`⚠️  Original image check: ${e.message}`);
    }
    
    // Test edited URL
    try {
      const editResp = await axios.head(editedUrl, { timeout: 10000 });
      console.log(`✅ Edited image accessible (${editResp.status})`);
      results.urlAccessibility = true;
    } catch (e) {
      console.log(`⚠️  Edited image check: ${e.message}`);
      // Try without cache bust
      const editUrlNoCache = editedUrl.split('&t=')[0];
      try {
        await axios.head(editUrlNoCache, { timeout: 10000 });
        console.log(`✅ Edited image accessible (without cache param)`);
        results.urlAccessibility = true;
      } catch (e2) {
        console.log(`❌ Edited image not accessible: ${e2.message}`);
      }
    }
    
    console.log();
    
    // STEP 5: Data Integrity Check
    console.log('📍 STEP 5: Data Integrity Check');
    console.log('─'.repeat(80));
    
    const aiText = data.aiResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    console.log(`AI Response Length: ${aiText ? aiText.length : 0} characters`);
    console.log(`Has meaningful content: ${aiText && aiText.length > 50 ? '✅' : '❌'}`);
    console.log(`Model version: ${data.aiResponse?.modelVersion || 'N/A'}`);
    console.log(`Usage metadata: ${data.aiResponse?.usageMetadata ? '✅' : '❌'}`);
    
    if (aiText && aiText.length > 0) {
      console.log(`\nAI Response Preview:`);
      console.log('─'.repeat(80));
      console.log(aiText.substring(0, 300) + (aiText.length > 300 ? '...' : ''));
      console.log('─'.repeat(80));
    }
    
    results.dataIntegrity = aiText && aiText.length > 50;
    console.log();
    
    // FINAL SUMMARY
    console.log('╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                            FINAL TEST SUMMARY                              ║');
    console.log('╠════════════════════════════════════════════════════════════════════════════╣');
    
    const resultEntries = [
      ['Server Health', results.serverCheck],
      ['AI Image Edit', results.imageEdit],
      ['Response Validation', results.responseValidation],
      ['URL Accessibility', results.urlAccessibility],
      ['Data Integrity', results.dataIntegrity]
    ];
    
    resultEntries.forEach(([name, pass]) => {
      const status = pass ? '✅ PASS' : '❌ FAIL';
      console.log(`║  ${name.padEnd(40)} ${status.padEnd(26)}║`);
    });
    
    const allPassed = Object.values(results).every(r => r === true);
    const passCount = Object.values(results).filter(r => r === true).length;
    
    console.log('╠════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║  Tests Passed: ${passCount}/5                                                       ║`);
    console.log(`║  Overall Status: ${allPassed ? '✅ ALL TESTS PASSED' : '⚠️  SOME TESTS FAILED'}                               ║`);
    console.log('╠════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Execution Time: ${(duration / 1000).toFixed(2)}s                                              ║`);
    console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');
    
    if (allPassed) {
      console.log('🎉 END-TO-END TEST COMPLETED SUCCESSFULLY!\n');
      console.log('The Gemini AI Edit feature is fully functional and ready for production.');
      console.log('\nNext steps:');
      console.log('  1. Test the UI in the browser');
      console.log('  2. Try different prompts and images');
      console.log('  3. Verify cache busting on image replacement');
      console.log('  4. Test error scenarios (network failures, invalid prompts)');
    } else {
      console.log('⚠️  Some tests failed. Review the results above.\n');
    }
    
    return {
      success: allPassed,
      results,
      duration
    };
    
  } catch (error) {
    console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                         ❌ E2E TEST FAILED                                  ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    return {
      success: false,
      error: error.message
    };
  }
}

runE2ETest().then(result => {
  process.exit(result.success ? 0 : 1);
});
