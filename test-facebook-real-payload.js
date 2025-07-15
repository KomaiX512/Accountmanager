import fetch from 'node-fetch';

async function testFacebookRealPayload() {
  console.log('🧪 TESTING FACEBOOK REAL PAYLOAD STRUCTURES');
  console.log('===========================================');
  
  const webhookUrl = 'http://localhost:3000/webhook/facebook';
  
  // Test different possible Facebook payload structures
  const testPayloads = [
    {
      name: 'Standard Page Object',
      payload: {
        object: 'page',
        entry: [
          {
            id: '681487244693083',
            messaging: [
              {
                sender: { id: '123456789' },
                message: { mid: 'test1', text: 'Hello' },
                timestamp: Date.now()
              }
            ]
          }
        ]
      }
    },
    {
      name: 'Empty Object',
      payload: {}
    },
    {
      name: 'Null Object',
      payload: null
    },
    {
      name: 'String Object',
      payload: 'test'
    },
    {
      name: 'Instagram Object',
      payload: {
        object: 'instagram',
        entry: []
      }
    },
    {
      name: 'Application Object',
      payload: {
        object: 'application',
        entry: []
      }
    },
    {
      name: 'User Object',
      payload: {
        object: 'user',
        entry: []
      }
    },
    {
      name: 'Group Object',
      payload: {
        object: 'group',
        entry: []
      }
    },
    {
      name: 'Unknown Object',
      payload: {
        object: 'unknown',
        entry: []
      }
    }
  ];
  
  for (const test of testPayloads) {
    console.log(`\n🧪 Testing: ${test.name}`);
    console.log('Payload:', JSON.stringify(test.payload, null, 2));
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.payload)
      });
      
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${await response.text()}`);
      
      if (response.status === 200) {
        console.log('✅ PASSED');
      } else {
        console.log('❌ FAILED');
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
    }
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n🎯 SUMMARY:');
  console.log('===========');
  console.log('This test shows which payload structures are accepted/rejected');
  console.log('Check server logs to see the detailed payload analysis');
}

// Run the test
testFacebookRealPayload().then(() => {
  console.log('\n🏁 Test complete!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
}); 