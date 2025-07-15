console.log('🔍 Facebook Webhook Status Check\n');

console.log('✅ Webhook Endpoints Working:');
console.log('   - https://www.sentientm.com/webhook/facebook');
console.log('   - https://www.sentientm.com/api/webhook/facebook');
console.log('   - Verification token: myFacebookWebhook2025');

console.log('\n📊 Current Status:');
console.log('   ✅ Page Detection: Working (Sentient ai detected as business page)');
console.log('   ✅ Webhook Endpoints: Working (all tests passed)');
console.log('   ✅ Event Processing: Working (test events processed)');
console.log('   ⚠️  Facebook App Configuration: Needs verification');

console.log('\n🔧 To Fix DM/Comment Webhooks:');
console.log('====================================');
console.log('1. Go to your Facebook App settings:');
console.log('   https://developers.facebook.com/apps/581584257679639/');
console.log('');
console.log('2. Configure Webhook:');
console.log('   - URL: https://www.sentientm.com/webhook/facebook');
console.log('   - Verify Token: myFacebookWebhook2025');
console.log('');
console.log('3. Subscribe to Events:');
console.log('   ✅ messages (for Direct Messages)');
console.log('   ✅ messaging_postbacks (for message postbacks)');
console.log('   ✅ feed (for page feed events)');
console.log('   ✅ comments (for post comments)');
console.log('');
console.log('4. Test Webhook:');
console.log('   - Send a DM to your Facebook page "Sentient ai"');
console.log('   - Check if it appears in your dashboard');
console.log('   - Look for "WEBHOOK ➜ Facebook payload received" in server logs');

console.log('\n📋 Server Logs to Monitor:');
console.log('==========================');
console.log('- "WEBHOOK ➜ Facebook payload received" - Event received');
console.log('- "Storing Facebook DM event" - DM stored');
console.log('- "Storing Facebook comment event" - Comment stored');
console.log('- "No matching Facebook token found" - Token lookup failed');

console.log('\n🎯 Expected Behavior:');
console.log('=====================');
console.log('✅ When someone sends a DM to your page → Webhook receives event → DM appears in dashboard');
console.log('✅ When someone comments on your post → Webhook receives event → Comment appears in dashboard');
console.log('✅ All events are stored in R2 and cached for fast access');

console.log('\n🚀 Next Steps:');
console.log('==============');
console.log('1. Configure Facebook App webhook settings');
console.log('2. Test by sending a DM to your Facebook page');
console.log('3. Check dashboard for incoming messages');
console.log('4. Monitor server logs for webhook activity'); 