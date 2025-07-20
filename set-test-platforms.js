// Quick test to simulate acquired platforms
// Open browser console and run this code

console.log('🔧 SETTING UP TEST PLATFORMS...');

const userId = 'yMHtLrsREFcQd5mjp3oafctloc72'; // From server logs

// Set Instagram as acquired
localStorage.setItem(`instagram_accessed_${userId}`, 'true');
console.log('✅ Instagram platform marked as acquired');

// Set Facebook as acquired  
localStorage.setItem(`facebook_accessed_${userId}`, 'true');
console.log('✅ Facebook platform marked as acquired');

// Set Twitter as acquired
localStorage.setItem(`twitter_accessed_${userId}`, 'true');
console.log('✅ Twitter platform marked as acquired');

console.log('🎯 Test platforms set! Refresh the page to see the dynamic buttons appear in the top bar.');

// Show current state
console.log('\n📊 Current platform states:');
console.log('Instagram:', localStorage.getItem(`instagram_accessed_${userId}`));
console.log('Facebook:', localStorage.getItem(`facebook_accessed_${userId}`));
console.log('Twitter:', localStorage.getItem(`twitter_accessed_${userId}`));
console.log('LinkedIn:', localStorage.getItem(`linkedin_accessed_${userId}`));
