const now = Date.now();
const endTime = now + (15 * 60 * 1000);

console.log('🔍 CROSS-DEVICE SYNC TEST');
console.log('========================');
console.log('Testing if Device B respects Device A\'s loading state...\n');

console.log('📅 Processing State:');
console.log('  Start:', new Date(now).toLocaleTimeString());
console.log('  End:', new Date(endTime).toLocaleTimeString());
console.log('  Duration: 15 minutes\n');

// Test data
const testData = {
  userId: 'test-sync-user',
  platform: 'instagram',
  startTime: now,
  endTime: endTime,
  totalDuration: 15 * 60 * 1000,
  username: 'testuser'
};

console.log('🚀 Commands to test:');
console.log('1. Create processing state (Device A):');
console.log(`curl -X POST http://localhost:3000/api/processing-status/${testData.userId} \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({
    platform: testData.platform,
    startTime: testData.startTime,
    endTime: testData.endTime,
    totalDuration: testData.totalDuration,
    username: testData.username
  })}'`);

console.log('\n2. Test Device B dashboard access (should be DENIED):');
console.log(`curl -X POST http://localhost:3000/api/validate-dashboard-access/${testData.userId} \\
  -H "Content-Type: application/json" \\
  -d '{"platform":"${testData.platform}"}'`);

console.log('\n3. Check processing status (Device B sync):');
console.log(`curl http://localhost:3000/api/processing-status/${testData.userId}?platform=${testData.platform}`);

console.log('\n4. Cleanup:');
console.log(`curl -X DELETE http://localhost:3000/api/processing-status/${testData.userId} \\
  -H "Content-Type: application/json" \\
  -d '{"platform":"${testData.platform}"}'`);

console.log('\n✅ Expected Results:');
console.log('- Step 1: {"success":true,...}');
console.log('- Step 2: {"success":true,"accessAllowed":false,"reason":"processing_active",...}');
console.log('- Step 3: Active processing data with remaining minutes');
console.log('- Step 4: {"success":true}');
