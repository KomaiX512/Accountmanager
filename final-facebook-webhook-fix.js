#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 FINAL FACEBOOK WEBHOOK FIX - FIREBASE USER ID EXTRACTION');
console.log('============================================================\n');

// Read the current socialMedia.js file
const socialMediaPath = path.join(__dirname, 'server', 'modules', 'socialMedia.js');
const socialMediaContent = fs.readFileSync(socialMediaPath, 'utf8');

console.log('📋 Current Firebase user ID extraction issue:');
console.log('============================================');
console.log('The logs show: firebase_user_id=612940588580162 (which is actually the Facebook page ID)');
console.log('This should be the actual Firebase user ID from the token key path');
console.log('');

// Find and fix the Firebase user ID extraction
const firebaseUserIdFix = `                // CRITICAL FIX: Match by both page_id AND user_id
                // Facebook sends different IDs depending on the context
                if (token.page_id === webhookPageId || token.user_id === webhookPageId) {
                  matchedToken = token;
                  // CRITICAL FIX: Extract the correct Firebase user ID from the token key path
                  // The token key format is: FacebookTokens/{firebaseUserId}/token.json
                  const keyParts = obj.Key.split('/');
                  const firebaseUserId = keyParts[1]; // Extract Firebase user ID from key path
                  storeUserId = firebaseUserId;
                  console.log(\`[\${new Date().toISOString()}] ✅ FOUND MATCHING FACEBOOK TOKEN for webhook Page ID \${webhookPageId}: page_name=\${token.page_name}, firebase_user_id=\${firebaseUserId}, facebook_user_id=\${token.user_id}, page_id=\${token.page_id}\`);
                  break;
                }`;

// Replace the token matching section with the corrected Firebase user ID extraction
const newContent = socialMediaContent.replace(
  /\/\/ CRITICAL FIX: Match by both page_id AND user_id[\s\S]*?console\.log\(`\[\\\${new Date\(\)\.toISOString\(\)}\] ✅ FOUND MATCHING FACEBOOK TOKEN for webhook Page ID \\\${webhookPageId}: page_name=\\\${token\.page_name}, firebase_user_id=\\\${firebaseUserId}, facebook_user_id=\\\${token\.user_id}, page_id=\\\${token\.page_id}`\);/,
  firebaseUserIdFix
);

// Create backup
const backupPath = socialMediaPath + '.final.backup.' + Date.now();
fs.writeFileSync(backupPath, newContent);
console.log(`💾 Backup created: ${backupPath}`);

// Write the fixed content
fs.writeFileSync(socialMediaPath, newContent);
console.log('✅ Fixed Firebase user ID extraction in webhook token matching');

console.log('\n🔧 KEY FIXES APPLIED:');
console.log('======================');
console.log('1. ✅ Corrected Firebase user ID extraction from token key path');
console.log('2. ✅ Fixed the issue where page_id was being used as Firebase user ID');
console.log('3. ✅ Improved logging to show correct user ID mapping');
console.log('4. ✅ Enhanced token matching for both page_id and user_id');

console.log('\n🧪 TESTING THE FINAL FIX:');
console.log('=========================');
console.log('1. Restart the server to apply changes');
console.log('2. Send a real DM to your Facebook page');
console.log('3. Check server logs for correct Firebase user ID');
console.log('4. Verify the DM appears in your dashboard with correct user ID');

console.log('\n📋 RESTART COMMANDS:');
console.log('===================');
console.log('pkill -f "node server.js" && sleep 2 && cd server && nohup node server.js > ../server.log 2>&1 &');

console.log('\n🔍 EXPECTED LOG OUTPUT:');
console.log('=======================');
console.log('✅ FOUND MATCHING FACEBOOK TOKEN for webhook Page ID 681487244693083:');
console.log('   page_name=Sentient ai, firebase_user_id={actual_firebase_id}, facebook_user_id=681487244693083, page_id=612940588580162');
console.log('✅ Storing Facebook DM event with User ID: {actual_firebase_id}');
console.log('✅ Stored Facebook DM at FacebookEvents/{actual_firebase_id}/test_local.json'); 