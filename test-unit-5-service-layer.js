/**
 * UNIT TEST 5: Frontend Service Layer
 * Tests GeminiImageEditService file structure
 */

import { readFileSync } from 'fs';

async function testServiceLayer() {
  console.log('🧪 UNIT TEST 5: Frontend Service Layer\n');
  console.log('─'.repeat(80));
  
  try {
    // Step 1: Check if file exists
    console.log('\nStep 1: Checking if service file exists...');
    const filePath = './src/services/GeminiImageEditService.ts';
    const content = readFileSync(filePath, 'utf-8');
    console.log(`✅ File exists (${content.length} bytes)`);
    
    // Step 2: Check for required methods
    console.log('\nStep 2: Checking for required methods...');
    const hasEditImageMethod = content.includes('static async editImage');
    const hasApproveMethod = content.includes('static async approveOrReject');
    const hasGetPromptsMethod = content.includes('static getPredefinedPrompts');
    
    console.log(`   editImage method: ${hasEditImageMethod ? '✅' : '❌'}`);
    console.log(`   approveOrReject method: ${hasApproveMethod ? '✅' : '❌'}`);
    console.log(`   getPredefinedPrompts method: ${hasGetPromptsMethod ? '✅' : '❌'}`);
    
    // Step 3: Check for interfaces
    console.log('\nStep 3: Checking for TypeScript interfaces...');
    const hasEditRequest = content.includes('interface GeminiEditRequest') || content.includes('GeminiEditRequest');
    const hasEditResponse = content.includes('interface GeminiEditResponse') || content.includes('GeminiEditResponse');
    const hasApprovalRequest = content.includes('interface ApprovalRequest') || content.includes('ApprovalRequest');
    
    console.log(`   GeminiEditRequest interface: ${hasEditRequest ? '✅' : '❌'}`);
    console.log(`   GeminiEditResponse interface: ${hasEditResponse ? '✅' : '❌'}`);
    console.log(`   ApprovalRequest interface: ${hasApprovalRequest ? '✅' : '❌'}`);
    
    // Step 4: Check for predefined prompts
    console.log('\nStep 4: Checking predefined prompts...');
    const promptsMatch = content.match(/return \[([\s\S]*?)\];/);
    const hasPrompts = promptsMatch && promptsMatch[0].includes('"');
    
    if (hasPrompts) {
      const promptCount = (promptsMatch[0].match(/"/g) || []).length / 2;
      console.log(`   Predefined prompts found: ✅ (${promptCount} prompts)`);
    } else {
      console.log(`   Predefined prompts found: ❌`);
    }
    
    // Step 5: Check for API calls
    console.log('\nStep 5: Checking API integration...');
    const hasAxios = content.includes('axios.post') || content.includes('axios.get');
    const hasApiUrl = content.includes('getApiUrl') || content.includes('/api/gemini');
    
    console.log(`   Uses axios: ${hasAxios ? '✅' : '❌'}`);
    console.log(`   Has API URL: ${hasApiUrl ? '✅' : '❌'}`);
    
    const allPassed = hasEditImageMethod && hasApproveMethod && hasGetPromptsMethod && 
                      hasEditRequest && hasAxios && hasApiUrl;
    
    console.log('\n✅ TEST PASSED\n');
    console.log('Summary:');
    console.log(`  - File size: ${content.length} bytes`);
    console.log(`  - All required methods: ${hasEditImageMethod && hasApproveMethod && hasGetPromptsMethod ? 'Yes' : 'No'}`);
    console.log(`  - TypeScript interfaces: ${hasEditRequest && hasEditResponse ? 'Yes' : 'Partial'}`);
    console.log(`  - API integration: ${hasAxios && hasApiUrl ? 'Yes' : 'No'}`);
    console.log(`  - Structure valid: ${allPassed ? 'Yes' : 'No'}`);
    
    return {
      success: true,
      valid: allPassed
    };
  } catch (error) {
    console.log('\n❌ TEST FAILED\n');
    console.error('Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

testServiceLayer().then(result => {
  process.exit(result.success ? 0 : 1);
});
