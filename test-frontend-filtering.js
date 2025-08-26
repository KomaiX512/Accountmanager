#!/usr/bin/env node

// Test Enhanced Frontend Filtering Logic
console.log('🧪 Testing Enhanced Frontend Filtering Logic\n');

// Mock notification data similar to what would come from Instagram
const mockNotifications = [
  {
    type: 'comment',
    comment_id: '18109580410549986',
    sender_id: '17841474200534903', // This is optimes837's user ID (connected account)
    text: 'Great comment! I appreciate you taking the time to engage.',
    username: 'optimes837',
    status: 'pending'
  },
  {
    type: 'comment', 
    comment_id: '18095732323563984',
    sender_id: '17841471786269325', // This is u2023460's user ID (external user)
    text: 'Love your content! Keep it up!',
    username: 'u2023460',
    status: 'pending'
  },
  {
    type: 'comment',
    comment_id: '18122035417494169', 
    sender_id: '17841474200534903', // Again optimes837 (connected account)
    text: 'Thanks for engaging with this post!',
    username: 'optimes837',
    status: 'pending'
  }
];

// Mock connected account IDs (from token lookup)
const connectedAccountIds = new Set([
  '17841474200534903', // optimes837's user_id
  '24210109725274111', // optimes837's graph_id  
  '17841476072004748', // socialagent321's user_id
  '23992505123711840'  // socialagent321's graph_id
]);

console.log('📊 Input Data:');
console.log('Connected Account IDs:', Array.from(connectedAccountIds));
console.log('Mock Notifications:', mockNotifications.length);
mockNotifications.forEach((notif, i) => {
  console.log(`  ${i+1}. ${notif.comment_id} from ${notif.sender_id} (@${notif.username}): "${notif.text.substring(0, 40)}..."`);
});

console.log('\n🛡️ Applying Filtering Logic:\n');

// Apply the filtering logic
const filteredNotifications = mockNotifications.filter(notification => {
  const notificationId = notification.comment_id;
  const senderId = notification.sender_id;
  const notificationText = notification.text;
  
  // Check if sender ID matches any connected account
  if (senderId && connectedAccountIds.has(senderId)) {
    console.log(`🚫 BLOCKED (Connected Account): ${notificationId} from ${senderId} (@${notification.username})`);
    return false;
  }
  
  // Check for AI reply patterns
  const aiReplyPatterns = [
    /Great comment!/i,
    /Thanks for engaging/i,
    /appreciate you taking the time/i,
    /I'll share some more insights/i,
    /Love this interaction/i,
    /Thanks for commenting/i,
    /🔥.*soon/i,
    /💭.*shortly/i
  ];
  
  const isAIReplyPattern = aiReplyPatterns.some(pattern => pattern.test(notificationText));
  if (isAIReplyPattern) {
    console.log(`🚫 BLOCKED (AI Pattern): ${notificationId} - "${notificationText.substring(0, 50)}..."`);
    return false;
  }
  
  console.log(`✅ ALLOWED: ${notificationId} from ${senderId} (@${notification.username})`);
  return true;
});

console.log('\n📈 Results:');
console.log(`Original notifications: ${mockNotifications.length}`);
console.log(`Filtered notifications: ${filteredNotifications.length}`);
console.log(`Blocked notifications: ${mockNotifications.length - filteredNotifications.length}`);

console.log('\n✅ Allowed Notifications:');
filteredNotifications.forEach((notif, i) => {
  console.log(`  ${i+1}. ${notif.comment_id} from @${notif.username}: "${notif.text.substring(0, 40)}..."`);
});

console.log('\n🎯 Expected Result: Only external user notifications should remain');
console.log('🎯 Expected Count: 1 (only u2023460\'s comment should pass)');

if (filteredNotifications.length === 1 && filteredNotifications[0].username === 'u2023460') {
  console.log('\n✅ TEST PASSED! Filtering logic works correctly.');
} else {
  console.log('\n❌ TEST FAILED! Filtering logic needs adjustment.');
}
