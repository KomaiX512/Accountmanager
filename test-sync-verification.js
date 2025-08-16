#!/usr/bin/env node

// Test script to verify synchronization logic
const TEST_USER_ID = 'test-user-123';
const TEST_PLATFORM = 'instagram';

// Simulate the synchronization logic from MainDashboard
async function testSynchronization() {
    console.log('🧪 Testing synchronization logic...\n');
    
    try {
        // Step 1: Fetch processing status (simulating backend sync)
        console.log('1️⃣ Fetching processing status...');
        const processingResponse = await fetch(`http://localhost:3000/api/processing-status/${TEST_USER_ID}`);
        const processingData = await processingResponse.json();
        console.log('📊 Processing status:', JSON.stringify(processingData, null, 2));
        
        // Step 2: Fetch platform access status (simulating backend sync)
        console.log('\n2️⃣ Fetching platform access status...');
        const accessResponse = await fetch(`http://localhost:3000/api/platform-access/${TEST_USER_ID}`);
        const accessData = await accessResponse.json();
        console.log('🔑 Platform access status:', JSON.stringify(accessData, null, 2));
        
        // Step 3: Simulate the synchronization logic
        console.log('\n3️⃣ Simulating synchronization logic...');
        
        const now = Date.now();
        const platformData = processingData.data[TEST_PLATFORM];
        const accessDataPlatform = accessData.data[TEST_PLATFORM];
        
        if (platformData && platformData.active && now < platformData.endTime) {
            console.log('✅ Platform is in loading state (active timer)');
            console.log(`⏰ Timer ends at: ${new Date(platformData.endTime).toISOString()}`);
            console.log(`⏱️ Remaining time: ${Math.ceil((platformData.endTime - now) / 1000 / 60)} minutes`);
            
            // Check if platform should show as "Acquiring" or "Acquired"
            if (accessDataPlatform && accessDataPlatform.claimed === false) {
                console.log('🎯 Status: Platform should show "Acquiring" (NOT claimed while in loading state)');
            } else {
                console.log('⚠️ Status: Platform might show "Acquired" (claimed status not properly cleared)');
            }
        } else {
            console.log('❌ Platform is NOT in loading state');
        }
        
        // Step 4: Test the timer calculation
        console.log('\n4️⃣ Testing timer calculation...');
        if (platformData) {
            const remainingMs = Math.max(0, platformData.endTime - now);
            const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
            const remainingSeconds = Math.ceil(remainingMs / 1000);
            
            console.log(`⏱️ Remaining: ${remainingMinutes} minutes, ${remainingSeconds} seconds`);
            console.log(`🔄 Progress: ${Math.min(100, Math.max(0, ((now - platformData.startTime) / platformData.totalDuration) * 100)).toFixed(1)}%`);
        }
        
        console.log('\n🎉 Synchronization test completed!');
        
    } catch (error) {
        console.error('❌ Error during test:', error.message);
    }
}

// Run the test
testSynchronization();
