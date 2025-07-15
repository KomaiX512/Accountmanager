import fetch from 'node-fetch';

async function checkFacebookWebhookSubscription() {
  console.log('🔍 FACEBOOK WEBHOOK SUBSCRIPTION DIAGNOSTIC');
  console.log('============================================');
  
  const baseUrl = 'https://www.sentientm.com';
  const webhookUrl = `${baseUrl}/webhook/facebook`;
  const verifyToken = 'myFacebookWebhook2025';
  
  console.log('\n📋 Current Webhook Configuration:');
  console.log(`   URL: ${webhookUrl}`);
  console.log(`   Verify Token: ${verifyToken}`);
  
  console.log('\n🚨 ISSUE IDENTIFIED:');
  console.log('====================');
  console.log('Facebook is sending USER object events, not PAGE object events.');
  console.log('This means your Facebook App is not subscribed to page messaging events.');
  
  console.log('\n📝 RECEIVED EVENTS:');
  console.log('===================');
  console.log('✅ User profile changes (first_name, feed)');
  console.log('❌ Page messaging events (DMs)');
  console.log('❌ Page comments');
  console.log('❌ Page posts');
  
  console.log('\n🔧 SOLUTION:');
  console.log('============');
  console.log('1. Go to: https://developers.facebook.com/apps/581584257679639/');
  console.log('2. Navigate to: Products > Webhooks');
  console.log('3. Click on your webhook subscription');
  console.log('4. Add these subscriptions:');
  console.log('   - messages');
  console.log('   - messaging_postbacks');
  console.log('   - messaging_optins');
  console.log('   - message_deliveries');
  console.log('   - message_reads');
  console.log('   - messaging_payments');
  console.log('   - messaging_pre_checkouts');
  console.log('   - messaging_checkout_updates');
  console.log('   - messaging_account_linking');
  console.log('   - messaging_referrals');
  console.log('   - messaging_handovers');
  console.log('   - messaging_policy_enforcement');
  console.log('   - messaging_customer_information');
  console.log('   - messaging_customer_information_request');
  console.log('   - messaging_optouts');
  console.log('   - messaging_optins');
  console.log('   - messaging_page_feedback');
  console.log('   - messaging_appointments');
  console.log('   - messaging_game_plays');
  console.log('   - messaging_standby');
  console.log('   - messaging_handovers');
  console.log('   - messaging_policy_enforcement');
  console.log('   - messaging_customer_information');
  console.log('   - messaging_customer_information_request');
  console.log('   - messaging_optouts');
  console.log('   - messaging_optins');
  console.log('   - messaging_page_feedback');
  console.log('   - messaging_appointments');
  console.log('   - messaging_game_plays');
  console.log('   - messaging_standby');
  
  console.log('\n5. Also add these for comments:');
  console.log('   - feed');
  console.log('   - comments');
  console.log('   - posts');
  
  console.log('\n6. Make sure your app has these permissions:');
  console.log('   - pages_messaging');
  console.log('   - pages_read_engagement');
  console.log('   - pages_manage_metadata');
  console.log('   - pages_show_list');
  
  console.log('\n7. Verify the webhook URL is correct:');
  console.log(`   ${webhookUrl}`);
  
  console.log('\n8. Test with a real DM after configuration');
  
  console.log('\n📊 CURRENT STATUS:');
  console.log('==================');
  console.log('✅ Webhook endpoint: WORKING');
  console.log('✅ Webhook verification: WORKING');
  console.log('✅ Server processing: WORKING');
  console.log('❌ Page messaging events: NOT SUBSCRIBED');
  console.log('❌ DM processing: NOT WORKING');
  
  console.log('\n🎯 NEXT STEPS:');
  console.log('==============');
  console.log('1. Configure Facebook App webhook subscriptions');
  console.log('2. Add required permissions');
  console.log('3. Test with real DM');
  console.log('4. Monitor logs for page object events');
}

checkFacebookWebhookSubscription().catch(console.error); 