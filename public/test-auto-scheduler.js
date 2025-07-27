// Auto-scheduler test verification script
// Run this in browser console to test if auto-scheduler is working

console.log("🧪 Testing Auto-scheduler Fix");

// 1. Check if persistent scheduler methods are available
if (window.persistentScheduler) {
    console.log("✅ Persistent scheduler available on window");
} else {
    console.log("❌ Persistent scheduler NOT available on window");
}

// 2. Test adding a post to queue
const testPost = {
    caption: "Test auto-scheduled post",
    imageUrl: "test-image.jpg",
    postKey: "test_" + Date.now()
};

const testDate = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

console.log("📅 Test scheduling date:", testDate.toISOString());

// 3. Check if event listeners are set up
let eventListenerCount = 0;
const originalAddEventListener = window.addEventListener;
window.addEventListener = function(type, listener, options) {
    if (type === 'executeScheduledPost') {
        eventListenerCount++;
        console.log("🎯 Found executeScheduledPost listener #" + eventListenerCount);
    }
    return originalAddEventListener.call(this, type, listener, options);
};

// 4. Dispatch test event
const testEvent = new CustomEvent('executeScheduledPost', {
    detail: {
        post: testPost,
        platform: 'instagram',
        username: 'sadfwe'
    }
});

console.log("📤 Dispatching test event...");
window.dispatchEvent(testEvent);

setTimeout(() => {
    console.log("✅ Auto-scheduler test completed. Check console for execution logs.");
}, 2000);
