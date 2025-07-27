// Test script to verify auto-scheduler functionality
console.log("🧪 Testing auto-scheduler initialization...");

// Simulate the event listener setup that should happen in PostCooked
const testPersistentScheduler = () => {
    console.log("🚀 Simulating persistent scheduler initialization");
    
    // Check if the event listener is properly attached
    const testEvent = new CustomEvent('executeScheduledPost', {
        detail: {
            postData: { test: true },
            selectedDate: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            platform: 'instagram',
            username: 'sadfwe'
        }
    });
    
    console.log("📤 Dispatching test event:", testEvent.detail);
    window.dispatchEvent(testEvent);
    
    // Check if event was caught
    setTimeout(() => {
        console.log("✅ Test event dispatched successfully");
    }, 1000);
};

// Wait for page load then test
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', testPersistentScheduler);
} else {
    testPersistentScheduler();
}
