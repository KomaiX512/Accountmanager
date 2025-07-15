#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 FIXING FACEBOOK WEBHOOK TOKEN MATCHING');
console.log('==========================================\n');

// Read the current socialMedia.js file
const socialMediaPath = path.join(__dirname, 'server', 'modules', 'socialMedia.js');
const socialMediaContent = fs.readFileSync(socialMediaPath, 'utf8');

console.log('📋 Current webhook token matching logic analysis:');
console.log('================================================');

// Find the webhook token matching section
const webhookSection = socialMediaContent.indexOf('// Enhanced token matching with multiple resolution strategies');
if (webhookSection === -1) {
  console.log('❌ Could not find webhook token matching section');
  process.exit(1);
}

console.log('✅ Found webhook token matching section');

// Extract the current token matching logic
const startIndex = socialMediaContent.indexOf('// Enhanced token matching with multiple resolution strategies');
const endIndex = socialMediaContent.indexOf('// Dynamic messaging events processing (DMs)', startIndex);

const currentTokenMatching = socialMediaContent.substring(startIndex, endIndex);
console.log('\n📋 Current token matching logic:');
console.log('===============================');
console.log(currentTokenMatching);

// Create the improved token matching logic
const improvedTokenMatching = `      // Enhanced token matching with multiple resolution strategies
      let matchedToken = null;
      let storeUserId = null;
      
      try {
        // Strategy 1: Direct token lookup by page_id and user_id
        const listCommand = new ListObjectsV2Command({
          Bucket: 'tasks',
          Prefix: \`FacebookTokens/\`,
        });
        const { Contents } = await s3Client.send(listCommand);
        
        if (Contents) {
          console.log(\`[\${new Date().toISOString()}] Available Facebook tokens for webhook lookup:\`);
          for (const obj of Contents) {
            if (obj.Key.endsWith('/token.json')) {
              try {
                const getCommand = new GetObjectCommand({
                  Bucket: 'tasks',
                  Key: obj.Key,
                });
                const data = await s3Client.send(getCommand);
                const json = await data.Body.transformToString();
                const token = JSON.parse(json);
                
                console.log(\`[\${new Date().toISOString()}] Facebook Token: page_id=\${token.page_id}, user_id=\${token.user_id}, page_name=\${token.page_name}\`);
                
                // CRITICAL FIX: Match by both page_id AND user_id
                // Facebook sends different IDs depending on the context
                if (token.page_id === webhookPageId || token.user_id === webhookPageId) {
                  matchedToken = token;
                  // Extract Firebase user ID from the token key path
                  const firebaseUserId = obj.Key.split('/')[1]; // Extract user ID from key path
                  storeUserId = firebaseUserId;
                  console.log(\`[\${new Date().toISOString()}] ✅ FOUND MATCHING FACEBOOK TOKEN for webhook Page ID \${webhookPageId}: page_name=\${token.page_name}, firebase_user_id=\${firebaseUserId}, facebook_user_id=\${token.user_id}, page_id=\${token.page_id}\`);
                  break;
                }
              } catch (tokenError) {
                console.error(\`[\${new Date().toISOString()}] Error reading token file \${obj.Key}:\`, tokenError.message);
                continue;
              }
            }
          }
          
          if (!matchedToken) {
            console.log(\`[\${new Date().toISOString()}] ❌ No matching Facebook token found for webhook Page ID \${webhookPageId}\`);
            
            // Strategy 2: Try to find by connection data
            try {
              const connectionListCommand = new ListObjectsV2Command({
                Bucket: 'tasks',
                Prefix: \`FacebookConnection/\`,
              });
              const { Contents: connectionContents } = await s3Client.send(connectionListCommand);
             
              if (connectionContents) {
                for (const obj of connectionContents) {
                  if (obj.Key.endsWith('/connection.json')) {
                    try {
                      const getCommand = new GetObjectCommand({
                        Bucket: 'tasks',
                        Key: obj.Key,
                      });
                      const data = await s3Client.send(getCommand);
                      const connection = JSON.parse(await data.Body.transformToString());
                      
                      if (connection.facebook_page_id === webhookPageId || connection.facebook_user_id === webhookPageId) {
                        // Extract user ID from connection key
                        const firebaseUserId = obj.Key.split('/')[1];
                        storeUserId = firebaseUserId;
                        console.log(\`[\${new Date().toISOString()}] ✅ Found Facebook connection for webhook Page ID \${webhookPageId}: firebase_user_id=\${firebaseUserId}\`);
                        break;
                      }
                    } catch (connectionError) {
                      console.error(\`[\${new Date().toISOString()}] Error reading connection file \${obj.Key}:\`, connectionError.message);
                      continue;
                    }
                  }
                }
              }
            } catch (connectionSearchError) {
              console.error(\`[\${new Date().toISOString()}] Error searching Facebook connections:\`, connectionSearchError.message);
            }
          }
        }
      } catch (err) {
        console.error(\`[\${new Date().toISOString()}] Error finding Facebook token for webhook Page ID \${webhookPageId}:\`, err.message);
      }`;

// Create the backup file
const backupPath = socialMediaPath + '.backup.' + Date.now();
fs.writeFileSync(backupPath, socialMediaContent);
console.log(`\n💾 Backup created: ${backupPath}`);

// Replace the token matching section
const newContent = socialMediaContent.replace(
  /\/\/ Enhanced token matching with multiple resolution strategies[\s\S]*?\/\/ Dynamic messaging events processing \(DMs\)/,
  improvedTokenMatching + '\n\n      // Dynamic messaging events processing (DMs)'
);

// Write the fixed content
fs.writeFileSync(socialMediaPath, newContent);
console.log('✅ Fixed Facebook webhook token matching logic');

console.log('\n🔧 KEY IMPROVEMENTS MADE:');
console.log('==========================');
console.log('1. ✅ Enhanced token matching to check BOTH page_id AND user_id');
console.log('2. ✅ Better logging to show exactly what tokens are found');
console.log('3. ✅ Improved error handling for token reading');
console.log('4. ✅ Added connection data fallback strategy');
console.log('5. ✅ Clear success/failure indicators in logs');

console.log('\n🧪 TESTING THE FIX:');
console.log('===================');
console.log('1. Restart the server to apply changes');
console.log('2. Send a real DM to your Facebook page');
console.log('3. Check server logs for: "✅ FOUND MATCHING FACEBOOK TOKEN"');
console.log('4. Verify the DM appears in your dashboard');

console.log('\n📋 RESTART COMMANDS:');
console.log('===================');
console.log('cd server && node server.js');
console.log('OR');
console.log('npm run dev');

console.log('\n🔍 MONITORING COMMANDS:');
console.log('=======================');
console.log('tail -f server.log | grep -E "(FOUND MATCHING|No matching|Storing Facebook DM)"'); 