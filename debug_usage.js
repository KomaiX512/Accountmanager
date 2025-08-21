// Simple test to check if frontend can get backend data
async function testUsage() {
    console.log('🔍 Testing usage fetch...');
    
    try {
        const response = await fetch('/api/usage/instagram/testuser');
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Backend data received:', data);
            
            const normalizedUsage = {
                posts: data.postsUsed || 0,
                discussions: data.discussionsUsed || 0,
                aiReplies: data.aiRepliesUsed || 0,
                campaigns: data.campaignsUsed || 0,
                views: data.viewsUsed || 0,
                resets: data.resetsUsed || 0
            };
            
            console.log('🔄 Normalized for frontend:', normalizedUsage);
        } else {
            console.error('❌ Response not ok:', response.status);
        }
    } catch (error) {
        console.error('❌ Fetch error:', error);
    }
}

testUsage();
