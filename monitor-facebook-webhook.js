import express from 'express';

const app = express();
const port = 3002;

// Middleware to capture raw body
app.use(express.raw({ type: 'application/json', limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Monitor webhook endpoint
app.post('/monitor-webhook', (req, res) => {
  console.log('\n🔍 FACEBOOK WEBHOOK MONITOR');
  console.log('============================');
  console.log('Timestamp:', new Date().toISOString());
  console.log('URL:', req.url);
  console.log('Method:', req.method);
  console.log('Content-Type:', req.headers['content-type']);
  console.log('User-Agent:', req.headers['user-agent']);
  console.log('X-Hub-Signature:', req.headers['x-hub-signature']);
  console.log('X-Hub-Signature-256:', req.headers['x-hub-signature-256']);
  
  console.log('\n📦 RAW BODY:');
  console.log('============');
  console.log(req.body);
  
  console.log('\n📋 PARSED BODY:');
  console.log('===============');
  try {
    const parsed = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    console.log(JSON.stringify(parsed, null, 2));
    
    console.log('\n🔍 ANALYSIS:');
    console.log('============');
    console.log('Body type:', typeof req.body);
    console.log('Is object:', typeof req.body === 'object');
    console.log('Has object property:', parsed && parsed.object);
    console.log('Object value:', parsed?.object);
    console.log('Has entry property:', parsed && Array.isArray(parsed.entry));
    console.log('Entry length:', parsed?.entry?.length || 0);
    
    if (parsed && parsed.entry && parsed.entry.length > 0) {
      console.log('First entry:', JSON.stringify(parsed.entry[0], null, 2));
    }
  } catch (error) {
    console.log('❌ Error parsing body:', error.message);
  }
  
  console.log('\n' + '='.repeat(50));
  
  res.status(200).send('Monitored');
});

// Start monitor server
app.listen(port, () => {
  console.log(`🔍 Facebook webhook monitor running on port ${port}`);
  console.log(`📝 Send Facebook webhooks to: http://localhost:${port}/monitor-webhook`);
  console.log('📋 This will log the exact payload structure Facebook sends');
  console.log('\n💡 To test:');
  console.log('1. Configure Facebook App webhook URL to: http://localhost:3002/monitor-webhook');
  console.log('2. Send a real DM to your Facebook page');
  console.log('3. Check this console for the actual payload structure');
});

console.log('Press Ctrl+C to stop monitor'); 