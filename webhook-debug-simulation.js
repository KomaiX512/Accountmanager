#!/usr/bin/env node

// Comprehensive webhook debugging script
// This script simulates the exact webhook processing logic

console.log("🔧 COMPREHENSIVE WEBHOOK DEBUG SIMULATION");
console.log("=" * 60);

// Example webhook payload from the logs
const mockPayload = {
  "entry": [{
    "id": "17841474200534903",
    "time": 1756217841,
    "changes": [{
      "value": {
        "from": {
          "id": "17841474200534903",
          "username": "optimes837",
          "self_ig_scoped_id": "746625147735047"
        },
        "media": {
          "id": "18033793664460039",
          "media_product_type": "FEED"
        },
        "id": "18054827132171987",
        "parent_id": "17924743650101722",
        "text": "Great comment! I appreciate you taking the time to engage. I'll share some more insights on this topic soon! 🔥"
      },
      "field": "comments"
    }]
  }],
  "object": "instagram"
};

// Mock token data from logs
const mockToken = {
  instagram_user_id: "17841474200534903",
  instagram_graph_id: "24210109725274111", 
  username: "optimes837",
  access_token: "fake_token"
};

console.log("📨 SIMULATING WEBHOOK PROCESSING");
console.log("Webhook Entry ID:", mockPayload.entry[0].id);

for (const entry of mockPayload.entry) {
  const webhookGraphId = entry.id;
  console.log(`\n🔍 Processing entry for Webhook Graph ID: ${webhookGraphId}`);
  
  // Simulate token lookup
  const matchedToken = mockToken; // In real code, this comes from S3
  console.log("🔑 Matched Token:", {
    instagram_user_id: matchedToken.instagram_user_id,
    instagram_graph_id: matchedToken.instagram_graph_id,
    username: matchedToken.username
  });

  if (Array.isArray(entry.changes)) {
    for (const change of entry.changes) {
      console.log(`\n💬 Processing change: ${change.field}`);
      
      if (change.field !== 'comments' || !change.value?.text) {
        console.log("⏭️ Skipping non-comment change");
        continue;
      }

      console.log("📝 Comment Details:", {
        id: change.value.id,
        author_id: change.value.from.id,
        author_username: change.value.from.username,
        text: change.value.text.substring(0, 100) + "..."
      });

      // APPLY ALL FILTER LAYERS
      if (change.value.from && matchedToken) {
        const commentAuthorId = change.value.from.id;
        const commentText = change.value.text;
        const accountOwnerUserId = matchedToken.instagram_user_id;
        const accountOwnerGraphId = matchedToken.instagram_graph_id;
        const accountUsername = matchedToken.username;
        
        console.log("\n🛡️ APPLYING FILTER LAYERS:");
        
        // LAYER 1: Direct ID Matching
        console.log("🔍 LAYER 1 - ID Matching:");
        const layer1Match = commentAuthorId === accountOwnerUserId || 
                           commentAuthorId === accountOwnerGraphId || 
                           commentAuthorId === webhookGraphId;
        
        console.log(`  Author ID: ${commentAuthorId}`);
        console.log(`  Account User ID: ${accountOwnerUserId} (Match: ${commentAuthorId === accountOwnerUserId})`);
        console.log(`  Account Graph ID: ${accountOwnerGraphId} (Match: ${commentAuthorId === accountOwnerGraphId})`);
        console.log(`  Webhook ID: ${webhookGraphId} (Match: ${commentAuthorId === webhookGraphId})`);
        console.log(`  🛡️ Layer 1 Result: ${layer1Match ? '🚫 BLOCKED' : '✅ PASSED'}`);
        
        if (layer1Match) {
          console.log("🚫 LAYER 1 BLOCK: Own comment by ID match - STOPPING HERE");
          continue;
        }
        
        // LAYER 2: Username Matching
        console.log("\n🔍 LAYER 2 - Username Matching:");
        const commentAuthorUsername = change.value.from?.username;
        const layer2Match = commentAuthorUsername && accountUsername && 
                           commentAuthorUsername === accountUsername;
        
        console.log(`  Author Username: ${commentAuthorUsername}`);
        console.log(`  Account Username: ${accountUsername}`);
        console.log(`  🛡️ Layer 2 Result: ${layer2Match ? '🚫 BLOCKED' : '✅ PASSED'}`);
        
        if (layer2Match) {
          console.log("🚫 LAYER 2 BLOCK: Own comment by username match - STOPPING HERE");
          continue;
        }
        
        // LAYER 3: AI Pattern Detection
        console.log("\n🔍 LAYER 3 - AI Pattern Detection:");
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
        
        console.log(`  Testing: "${commentText}"`);
        let matchedPatterns = [];
        aiReplyPatterns.forEach((pattern, index) => {
          if (pattern.test(commentText)) {
            matchedPatterns.push(`Pattern ${index + 1}: ${pattern}`);
          }
        });
        
        const layer3Match = matchedPatterns.length > 0;
        console.log(`  Matched Patterns: ${matchedPatterns.length}`);
        matchedPatterns.forEach(p => console.log(`    - ${p}`));
        console.log(`  🛡️ Layer 3 Result: ${layer3Match ? '🚫 BLOCKED' : '✅ PASSED'}`);
        
        if (layer3Match) {
          console.log("🚫 LAYER 3 BLOCK: AI-generated reply pattern detected - STOPPING HERE");
          continue;
        }
        
        console.log("\n✅ PASSED ALL FILTERS: Comment from external user - WOULD BE PROCESSED");
        console.log("🔄 This is where the comment would be stored and auto-reply triggered");
      }
    }
  }
}

console.log("\n" + "=" * 60);
console.log("🏁 DEBUG SIMULATION COMPLETE");
console.log("Expected Result: Comments matching AI patterns should be BLOCKED");
console.log("Actual Behavior: Check if any comments reached 'WOULD BE PROCESSED'");
