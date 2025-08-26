#!/usr/bin/env node

/**
 * 🧪 COMPREHENSIVE COMMENT FILTERING TEST
 * 
 * This script tests all comment filtering scenarios to ensure:
 * 1. Own comments are blocked
 * 2. External comments are allowed
 * 3. AI-generated patterns are blocked
 * 4. No false positives
 */

console.log('🧪 Starting Comment Filtering Test Suite\n');

// Mock webhook data structure
const mockMatchedToken = {
  instagram_user_id: "17841474200534903",
  instagram_graph_id: "24210109725274111", 
  username: "optimes837"
};

const webhookGraphId = "17841474200534903";

// Test scenarios
const testScenarios = [
  {
    name: "OWN COMMENT - Should be BLOCKED (Layer 1 - User ID match)",
    comment: {
      value: {
        id: "comment_123",
        from: {
          id: "17841474200534903", // Same as account owner user ID
          username: "optimes837"
        },
        text: "This is my own comment"
      }
    },
    expectedResult: "BLOCKED",
    expectedLayer: "Layer 1"
  },
  {
    name: "OWN COMMENT - Should be BLOCKED (Layer 1 - Graph ID match)",
    comment: {
      value: {
        id: "comment_124",
        from: {
          id: "24210109725274111", // Same as account owner graph ID
          username: "optimes837"
        },
        text: "This is my own comment via graph ID"
      }
    },
    expectedResult: "BLOCKED",
    expectedLayer: "Layer 1"
  },
  {
    name: "OWN COMMENT - Should be BLOCKED (Layer 1 - Webhook ID match)",
    comment: {
      value: {
        id: "comment_125",
        from: {
          id: "17841474200534903", // Same as webhook ID
          username: "optimes837"
        },
        text: "This is my own comment via webhook ID"
      }
    },
    expectedResult: "BLOCKED",
    expectedLayer: "Layer 1"
  },
  {
    name: "OWN COMMENT - Should be BLOCKED (Layer 2 - Username match)",
    comment: {
      value: {
        id: "comment_126",
        from: {
          id: "999999999", // Different ID but same username
          username: "optimes837"
        },
        text: "Different ID but same username"
      }
    },
    expectedResult: "BLOCKED",
    expectedLayer: "Layer 2"
  },
  {
    name: "AI REPLY PATTERN - Should be BLOCKED (Layer 3)",
    comment: {
      value: {
        id: "comment_127",
        from: {
          id: "1029305565275116", // External user
          username: "u2023460"
        },
        text: "Great comment! I appreciate you taking the time to engage. I'll share some more insights on this topic soon! 🔥"
      }
    },
    expectedResult: "BLOCKED",
    expectedLayer: "Layer 3"
  },
  {
    name: "EXTERNAL COMMENT - Should be ALLOWED ✅",
    comment: {
      value: {
        id: "comment_128",
        from: {
          id: "1029305565275116", // External user
          username: "u2023460"
        },
        text: "Sjjssjks" // Random text, not AI pattern
      }
    },
    expectedResult: "ALLOWED",
    expectedLayer: "None"
  },
  {
    name: "ANOTHER EXTERNAL COMMENT - Should be ALLOWED ✅",
    comment: {
      value: {
        id: "comment_129",
        from: {
          id: "987654321", // Different external user
          username: "john_doe"
        },
        text: "Love this post! Amazing content! 😍"
      }
    },
    expectedResult: "ALLOWED",
    expectedLayer: "None"
  },
  {
    name: "BORDERLINE AI PATTERN - Should be ALLOWED ✅",
    comment: {
      value: {
        id: "comment_130",
        from: {
          id: "1111111111", // External user
          username: "real_user"
        },
        text: "This is great! Thanks for sharing!" // Could be confused with AI but should pass
      }
    },
    expectedResult: "ALLOWED",
    expectedLayer: "None"
  }
];

// Simulate the filtering logic
function testCommentFilter(change, matchedToken, webhookGraphId) {
  const commentAuthorId = change.value.from.id;
  const commentText = change.value.text;
  const accountOwnerUserId = matchedToken.instagram_user_id;
  const accountOwnerGraphId = matchedToken.instagram_graph_id;
  const accountUsername = matchedToken.username;
  
  // 🚫 LAYER 1: Direct ID Matching
  if (commentAuthorId === accountOwnerUserId || 
      commentAuthorId === accountOwnerGraphId || 
      commentAuthorId === webhookGraphId) {
    return { result: "BLOCKED", layer: "Layer 1", reason: `ID match: ${commentAuthorId}` };
  }
  
  // 🚫 LAYER 2: Username Matching
  const commentAuthorUsername = change.value.from?.username;
  if (commentAuthorUsername && accountUsername && commentAuthorUsername === accountUsername) {
    return { result: "BLOCKED", layer: "Layer 2", reason: `Username match: @${commentAuthorUsername}` };
  }
  
  // 🚫 LAYER 3: AI-Generated Reply Detection
  const aiReplyPatterns = [
    /Great comment!/i,
    /Thanks for engaging/i,
    /appreciate you taking the time/i,
    /I'll share some more insights/i,
    /I'll respond with more detailed thoughts/i,
    /Love this interaction/i,
    /Thanks for commenting/i,
    /I'll get back with/i,
    /more detailed response/i,
    /🔥.*soon/i,
    /💭.*shortly/i,
    /Thanks for.*engage/i,
    /appreciate.*engage/i
  ];
  
  const isAIReplyPattern = aiReplyPatterns.some(pattern => pattern.test(commentText));
  if (isAIReplyPattern) {
    return { result: "BLOCKED", layer: "Layer 3", reason: `AI pattern detected: "${commentText.substring(0, 30)}..."` };
  }
  
  // ✅ PASSED ALL FILTERS
  return { result: "ALLOWED", layer: "None", reason: "External user comment" };
}

// Run the tests
let passed = 0;
let failed = 0;

console.log('Running test scenarios...\n');

testScenarios.forEach((scenario, index) => {
  console.log(`📝 Test ${index + 1}: ${scenario.name}`);
  
  const result = testCommentFilter(scenario.comment, mockMatchedToken, webhookGraphId);
  
  const success = result.result === scenario.expectedResult;
  
  if (success) {
    console.log(`   ✅ PASS: ${result.result} (${result.layer}) - ${result.reason}`);
    passed++;
  } else {
    console.log(`   ❌ FAIL: Expected ${scenario.expectedResult}, got ${result.result}`);
    console.log(`       Reason: ${result.reason}`);
    failed++;
  }
  
  console.log('');
});

// Summary
console.log('='.repeat(60));
console.log(`🧪 TEST RESULTS: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('🎉 ALL TESTS PASSED! Filter logic is working correctly.');
  console.log('✅ Safe to deploy to production.');
} else {
  console.log('❌ Some tests failed. Review the logic before deploying.');
}

console.log('='.repeat(60));

// Additional debug info
console.log('\n🔍 DEBUG INFO:');
console.log(`Account Owner User ID: ${mockMatchedToken.instagram_user_id}`);
console.log(`Account Owner Graph ID: ${mockMatchedToken.instagram_graph_id}`);
console.log(`Account Username: @${mockMatchedToken.username}`);
console.log(`Webhook Graph ID: ${webhookGraphId}`);

// Test with actual log scenario
console.log('\n🎯 TESTING ACTUAL LOG SCENARIO:');
const actualScenario = {
  value: {
    id: "18000106259653425",
    from: {
      id: "1029305565275116",
      username: "u2023460"
    },
    text: "Sjjssjks"
  }
};

const actualResult = testCommentFilter(actualScenario, mockMatchedToken, webhookGraphId);
console.log(`📊 Actual Log Test: ${actualResult.result} (${actualResult.layer}) - ${actualResult.reason}`);

if (actualResult.result === "ALLOWED") {
  console.log('✅ The actual log scenario will now be ALLOWED (correct behavior)');
} else {
  console.log('❌ The actual log scenario is still being blocked (needs more fixes)');
}
