// Test script to verify Instagram scheduling works
const testSchedule = async () => {
  const testData = {
    userId: 'test_user_123',
    caption: 'Test scheduled post from API',
    image: 'https://via.placeholder.com/1080x1080/FF6B6B/FFFFFF?text=Test+Post',
    scheduleDate: new Date(Date.now() + 2 * 60 * 1000).toISOString(), // 2 minutes from now
    platform: 'instagram'
  };

  try {
    console.log('🧪 Testing Instagram scheduling API...');
    console.log('📅 Schedule time:', testData.scheduleDate);
    console.log('📝 Data being sent:', JSON.stringify(testData, null, 2));
    
    const response = await fetch('http://localhost:3000/api/schedule-post/test_user_123', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Scheduling API test PASSED');
      console.log('📋 Response:', result);
      
      // Check if the post was actually scheduled
      setTimeout(async () => {
        const healthResponse = await fetch('http://localhost:3000/api/scheduler-health/instagram');
        const healthData = await healthResponse.json();
        
        const testPost = healthData.posts.scheduled.find(p => p.userId === 'test_user_123');
        if (testPost) {
          console.log('✅ Test post found in scheduler:', testPost.id);
        } else {
          console.log('❌ Test post not found in scheduler');
        }
      }, 3000);
      
    } else {
      console.log('❌ Scheduling API test FAILED');
      console.log('📋 Error:', result);
    }
    
  } catch (error) {
    console.log('❌ Scheduling API test ERROR:', error.message);
  }
};

testSchedule(); 