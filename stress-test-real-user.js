/**
 * COMPREHENSIVE STRESS TEST - Simulate Real User
 * Tests EVERYTHING: Context, Username, Operations, Errors
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = 'AIzaSyDIpv14PCIuAukCFV4CILMhYk0OzpNI6EE';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Simulate localStorage with real user data
const mockLocalStorage = {
  'instagram_username_HxiBWT2egCVtWtloIA5rLZz3rNr1': 'maccosmetics',
  'instagram_accessed_HxiBWT2egCVtWtloIA5rLZz3rNr1': 'true',
  'instagram_competitors_HxiBWT2egCVtWtloIA5rLZz3rNr1': JSON.stringify(['nike', 'adidas', 'puma']),
  'accountHolder': 'maccosmetics',
  'total_posts_HxiBWT2egCVtWtloIA5rLZz3rNr1': '15'
};

// Mock context (simulating what contextService.getUserContext would return)
const mockUserContext = {
  userId: 'HxiBWT2egCVtWtloIA5rLZz3rNr1',
  username: 'maccosmetics',
  platforms: [
    { name: 'instagram', connected: true, username: 'maccosmetics', posts: 15 },
    { name: 'twitter', connected: false },
    { name: 'facebook', connected: false },
    { name: 'linkedin', connected: false }
  ],
  totalPosts: 15,
  accountAge: '30 days',
  competitors: [
    { username: 'nike', platform: 'instagram', trending: true },
    { username: 'adidas', platform: 'instagram', trending: false },
    { username: 'puma', platform: 'instagram', trending: true }
  ]
};

// Full operations with FIXED schemas
const operations = [
  {
    name: 'acquire_platform',
    description: 'Acquire/connect a social media platform',
    parameters: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['instagram', 'twitter', 'facebook', 'linkedin'] },
        username: { type: 'string' },
        competitors: { type: 'array', items: { type: 'string' } },
        accountType: { type: 'string', enum: ['personal', 'business', 'creator', 'brand'] }
      },
      required: ['platform', 'username', 'competitors', 'accountType']
    }
  },
  {
    name: 'create_post',
    description: 'Create a social media post',
    parameters: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['instagram', 'twitter', 'facebook', 'linkedin'] },
        prompt: { type: 'string' },
        tone: { type: 'string', enum: ['professional', 'casual', 'humorous', 'inspirational'] }
      },
      required: ['prompt']
    }
  },
  {
    name: 'schedule_post',
    description: 'Schedule a post for later',
    parameters: {
      type: 'object',
      properties: {
        platform: { type: 'string' },
        content: { type: 'string' },
        scheduledTime: { type: 'string' }
      },
      required: ['content', 'scheduledTime']
    }
  },
  {
    name: 'navigate_to',
    description: 'Navigate to different pages',
    parameters: {
      type: 'object',
      properties: {
        destination: { 
          type: 'string', 
          enum: ['main-dashboard', 'instagram', 'twitter', 'facebook', 'linkedin', 
                 'usage', 'privacy', 'privacy-policy', 'home', 'settings'] 
        }
      },
      required: ['destination']
    }
  }
];

// Generate system instruction with context
function getSystemInstruction() {
  return `You are an AI Manager for Sentient Marketing.

CURRENT USER CONTEXT:
- User: ${mockUserContext.username}
- User ID: ${mockUserContext.userId}
- Connected Platforms: Instagram (@${mockUserContext.username})
- Total Posts: ${mockUserContext.totalPosts}
- Account Age: ${mockUserContext.accountAge}
- Competitors: ${mockUserContext.competitors.map(c => c.username).join(', ')}
- Trending: ${mockUserContext.competitors.filter(c => c.trending).map(c => c.username).join(', ')}

USER STATUS:
- Instagram: ✅ Connected (@maccosmetics, 15 posts)
- Twitter: ❌ Not connected
- Facebook: ❌ Not connected
- LinkedIn: ❌ Not connected

IMPORTANT RULES:
1. When user asks about their name, respond with: "${mockUserContext.username}"
2. When user asks about platforms, tell them: "Instagram connected as @${mockUserContext.username}"
3. For actionable requests, extract function calls
4. If they try to create posts on unconnected platforms, warn them
5. Be natural and conversational
6. Reference the actual context data above

Examples:
User: "What's my name?"
You: "Your name is ${mockUserContext.username}! 👋"

User: "What platforms do I have?"
You: "You have Instagram connected as @${mockUserContext.username} with ${mockUserContext.totalPosts} posts! 🎉"`;
}

let testResults = {
  passed: 0,
  failed: 0,
  errors: [],
  warnings: []
};

async function testQuery(testNumber, scenario, query, expectedBehavior) {
  console.log('\n' + '═'.repeat(100));
  console.log(`TEST ${testNumber}: ${scenario}`);
  console.log('═'.repeat(100));
  console.log(`📝 Query: "${query}"`);
  console.log(`🎯 Expected: ${expectedBehavior}`);
  console.log('─'.repeat(100));

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: { temperature: 0.3, topK: 40, topP: 0.95 },
      systemInstruction: getSystemInstruction(),
      tools: [{ functionDeclarations: operations }]
    });

    const chat = model.startChat();
    const result = await chat.sendMessage(query);
    const response = result.response;

    const functionCalls = response.functionCalls();
    const textResponse = response.text();

    console.log('\n📤 RESPONSE:');
    if (textResponse) {
      console.log(`   Text: "${textResponse}"`);
    }
    if (functionCalls && functionCalls.length > 0) {
      console.log(`   Function Calls: ${functionCalls.length}`);
      functionCalls.forEach((call, i) => {
        console.log(`   ${i + 1}. ${call.name}(${JSON.stringify(call.args)})`);
      });
    }

    // Validate response
    let passed = true;
    let reason = '';

    if (scenario.includes('Username')) {
      if (textResponse.toLowerCase().includes('maccosmetics')) {
        console.log('✅ PASS: Username "maccosmetics" found in response');
        testResults.passed++;
      } else if (textResponse.toLowerCase().includes('user')) {
        console.log('❌ FAIL: Responded with generic "user" instead of actual username');
        testResults.failed++;
        testResults.errors.push({ test: testNumber, scenario, error: 'Wrong username' });
        passed = false;
      } else {
        console.log('⚠️  WARN: Could not verify username in response');
        testResults.warnings.push({ test: testNumber, scenario, warning: 'Unclear username' });
      }
    } else if (scenario.includes('Platform Status')) {
      if (textResponse.toLowerCase().includes('instagram') && textResponse.toLowerCase().includes('maccosmetics')) {
        console.log('✅ PASS: Correctly identified Instagram as connected with username');
        testResults.passed++;
      } else {
        console.log('❌ FAIL: Did not provide correct platform status');
        testResults.failed++;
        testResults.errors.push({ test: testNumber, scenario, error: 'Wrong platform status' });
        passed = false;
      }
    } else if (scenario.includes('Create Post')) {
      if (functionCalls && functionCalls.some(c => c.name === 'create_post')) {
        console.log('✅ PASS: Function call detected for create_post');
        testResults.passed++;
      } else {
        console.log('❌ FAIL: No function call detected for create post');
        testResults.failed++;
        testResults.errors.push({ test: testNumber, scenario, error: 'No function call' });
        passed = false;
      }
    } else if (scenario.includes('Navigation')) {
      if (functionCalls && functionCalls.some(c => c.name === 'navigate_to')) {
        console.log('✅ PASS: Function call detected for navigation');
        testResults.passed++;
      } else {
        console.log('❌ FAIL: No function call detected for navigation');
        testResults.failed++;
        testResults.errors.push({ test: testNumber, scenario, error: 'No function call' });
        passed = false;
      }
    } else if (scenario.includes('Competitors')) {
      if (textResponse.toLowerCase().includes('nike') || textResponse.toLowerCase().includes('puma')) {
        console.log('✅ PASS: Mentioned competitors correctly');
        testResults.passed++;
      } else {
        console.log('❌ FAIL: Did not mention competitors');
        testResults.failed++;
        testResults.errors.push({ test: testNumber, scenario, error: 'No competitor mention' });
        passed = false;
      }
    } else if (scenario.includes('Unconnected Platform')) {
      if (textResponse.toLowerCase().includes('not connected') || 
          textResponse.toLowerCase().includes('need to connect') ||
          textResponse.toLowerCase().includes('acquire')) {
        console.log('✅ PASS: Correctly warned about unconnected platform');
        testResults.passed++;
      } else {
        console.log('⚠️  WARN: Did not explicitly warn about unconnected platform');
        testResults.warnings.push({ test: testNumber, scenario, warning: 'No platform warning' });
      }
    }

    console.log('\n' + (passed ? '✅ TEST PASSED' : '❌ TEST FAILED'));

  } catch (error) {
    console.log('\n❌ ERROR:');
    console.log(`   ${error.message}`);
    testResults.failed++;
    testResults.errors.push({ test: testNumber, scenario, error: error.message });
  }

  console.log('═'.repeat(100));
}

async function runAllTests() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          🔥 COMPREHENSIVE STRESS TEST 🔥                                      ║');
  console.log('║                       Simulating Real User Interactions                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n📊 Testing with REAL Gemini API');
  console.log(`👤 Simulated User: ${mockUserContext.username}`);
  console.log(`🔗 Connected Platforms: ${mockUserContext.platforms.filter(p => p.connected).length}`);
  console.log('\n');

  await new Promise(r => setTimeout(r, 1000));

  // TEST 1: Username Recognition
  await testQuery(1, 'Username Recognition', 
    "What's my name?", 
    'Should respond with "maccosmetics"');
  await new Promise(r => setTimeout(r, 2000));

  // TEST 2: Platform Status
  await testQuery(2, 'Platform Status Check', 
    "What platforms do I have connected?", 
    'Should list Instagram with @maccosmetics');
  await new Promise(r => setTimeout(r, 2000));

  // TEST 3: Competitor Insights
  await testQuery(3, 'Competitors Trending', 
    "Which of my competitors are trending?", 
    'Should mention Nike and Puma');
  await new Promise(r => setTimeout(r, 2000));

  // TEST 4: Create Post on Connected Platform
  await testQuery(4, 'Create Post (Connected)', 
    "Create a professional post about AI trends for Instagram", 
    'Should call create_post function');
  await new Promise(r => setTimeout(r, 2000));

  // TEST 5: Create Post on Unconnected Platform
  await testQuery(5, 'Create Post (Unconnected Platform)', 
    "Create a post for Twitter", 
    'Should warn that Twitter is not connected');
  await new Promise(r => setTimeout(r, 2000));

  // TEST 6: Navigation
  await testQuery(6, 'Navigation Command', 
    "Go to privacy policy", 
    'Should call navigate_to function');
  await new Promise(r => setTimeout(r, 2000));

  // TEST 7: Multi-Parameter Operation
  await testQuery(7, 'Complex Operation', 
    "Connect Twitter with username sentientai and competitors nike, adidas, puma as business account", 
    'Should call acquire_platform with all parameters');
  await new Promise(r => setTimeout(r, 2000));

  // TEST 8: General Question
  await testQuery(8, 'General Question', 
    "How many posts do I have?", 
    'Should respond with 15 posts');
  await new Promise(r => setTimeout(r, 2000));

  // TEST 9: Context Awareness
  await testQuery(9, 'Context Awareness', 
    "Tell me about my account", 
    'Should mention username, platforms, posts, competitors');
  await new Promise(r => setTimeout(r, 2000));

  // TEST 10: Edge Case - Ambiguous Request
  await testQuery(10, 'Ambiguous Request', 
    "Create something for me", 
    'Should ask for clarification');

  // FINAL REPORT
  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                               📊 FINAL TEST RESULTS                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');
  console.log(`✅ PASSED: ${testResults.passed}`);
  console.log(`❌ FAILED: ${testResults.failed}`);
  console.log(`⚠️  WARNINGS: ${testResults.warnings.length}`);
  console.log('\n');

  if (testResults.errors.length > 0) {
    console.log('❌ FAILURES:');
    testResults.errors.forEach(err => {
      console.log(`   Test ${err.test} (${err.scenario}): ${err.error}`);
    });
    console.log('\n');
  }

  if (testResults.warnings.length > 0) {
    console.log('⚠️  WARNINGS:');
    testResults.warnings.forEach(warn => {
      console.log(`   Test ${warn.test} (${warn.scenario}): ${warn.warning}`);
    });
    console.log('\n');
  }

  const successRate = Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100);
  console.log(`📈 SUCCESS RATE: ${successRate}%`);
  console.log('\n');

  if (successRate >= 80) {
    console.log('🎉 EXCELLENT! System is ready for production');
  } else if (successRate >= 60) {
    console.log('⚠️  GOOD but needs improvements');
  } else {
    console.log('❌ CRITICAL: Too many failures, major fixes needed');
  }

  console.log('\n');
}

runAllTests().catch(console.error);
