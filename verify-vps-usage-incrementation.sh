#!/bin/bash

# VPS Usage Incrementation Verification Script
# Tests if usage incrementation is actually working on VPS

VPS_URL="https://sentientm.com"
TEST_UID="KUvVFxnLanYTWPuSIfphby5hxJQ2"
TEST_PLATFORM="instagram"
TEST_USERNAME="narsissist"

echo "🔍 VPS USAGE INCREMENTATION VERIFICATION"
echo "======================================="

echo ""
echo "📊 Step 1: Getting baseline usage stats..."
BASELINE=$(curl -s "${VPS_URL}/api/user/${TEST_UID}" | jq '.usage | {postsUsed, discussionsUsed, aiRepliesUsed, campaignsUsed}')
echo "BASELINE STATS:"
echo "$BASELINE"

# Extract specific values for comparison
BASELINE_POSTS=$(echo "$BASELINE" | jq '.postsUsed // 0')
BASELINE_DISCUSSIONS=$(echo "$BASELINE" | jq '.discussionsUsed // 0')
BASELINE_REPLIES=$(echo "$BASELINE" | jq '.aiRepliesUsed // 0')

echo ""
echo "📈 Step 2: Testing discussions increment..."
DISCUSSION_RESULT=$(curl -s -X POST "${VPS_URL}/api/usage/increment/${TEST_UID}" \
  -H "Content-Type: application/json" \
  -d '{"feature": "discussions", "count": 1}')
echo "Discussion increment result: $DISCUSSION_RESULT"

echo ""
echo "📈 Step 3: Testing aiReplies increment (platform-based)..."
REPLIES_RESULT=$(curl -s -X POST "${VPS_URL}/api/usage/increment/${TEST_PLATFORM}/${TEST_USERNAME}" \
  -H "Content-Type: application/json" \
  -d '{"feature": "aiReplies", "count": 1}')
echo "AI Replies increment result: $REPLIES_RESULT"

echo ""
echo "📈 Step 4: Testing posts increment..."
POSTS_RESULT=$(curl -s -X POST "${VPS_URL}/api/usage/increment/${TEST_UID}" \
  -H "Content-Type: application/json" \
  -d '{"feature": "posts", "count": 1}')
echo "Posts increment result: $POSTS_RESULT"

echo ""
echo "⏱️ Waiting 3 seconds for data synchronization..."
sleep 3

echo ""
echo "📊 Step 5: Getting updated usage stats..."
UPDATED=$(curl -s "${VPS_URL}/api/user/${TEST_UID}" | jq '.usage | {postsUsed, discussionsUsed, aiRepliesUsed, campaignsUsed}')
echo "UPDATED STATS:"
echo "$UPDATED"

# Extract updated values for comparison
UPDATED_POSTS=$(echo "$UPDATED" | jq '.postsUsed // 0')
UPDATED_DISCUSSIONS=$(echo "$UPDATED" | jq '.discussionsUsed // 0') 
UPDATED_REPLIES=$(echo "$UPDATED" | jq '.aiRepliesUsed // 0')

echo ""
echo "🔍 VERIFICATION RESULTS:"
echo "========================"

# Check discussions increment
DISCUSSIONS_DIFF=$((UPDATED_DISCUSSIONS - BASELINE_DISCUSSIONS))
if [ "$DISCUSSIONS_DIFF" -gt 0 ]; then
    echo "✅ DISCUSSIONS: Incremented by $DISCUSSIONS_DIFF (${BASELINE_DISCUSSIONS} → ${UPDATED_DISCUSSIONS})"
else
    echo "❌ DISCUSSIONS: No increment detected (${BASELINE_DISCUSSIONS} → ${UPDATED_DISCUSSIONS})"
fi

# Check AI replies increment
REPLIES_DIFF=$((UPDATED_REPLIES - BASELINE_REPLIES))
if [ "$REPLIES_DIFF" -gt 0 ]; then
    echo "✅ AI REPLIES: Incremented by $REPLIES_DIFF (${BASELINE_REPLIES} → ${UPDATED_REPLIES})"
else
    echo "❌ AI REPLIES: No increment detected (${BASELINE_REPLIES} → ${UPDATED_REPLIES})"
fi

# Check posts increment
POSTS_DIFF=$((UPDATED_POSTS - BASELINE_POSTS))
if [ "$POSTS_DIFF" -gt 0 ]; then
    echo "✅ POSTS: Incremented by $POSTS_DIFF (${BASELINE_POSTS} → ${UPDATED_POSTS})"
else
    echo "❌ POSTS: No increment detected (${BASELINE_POSTS} → ${UPDATED_POSTS})"
fi

echo ""
echo "📋 SUMMARY:"
TOTAL_INCREMENTS=$((DISCUSSIONS_DIFF + REPLIES_DIFF + POSTS_DIFF))
if [ "$TOTAL_INCREMENTS" -gt 0 ]; then
    echo "✅ VPS Usage incrementation is WORKING! Total increments: $TOTAL_INCREMENTS"
else
    echo "❌ VPS Usage incrementation is NOT WORKING! No increments detected."
    echo ""
    echo "🔧 Possible issues:"
    echo "   - nginx configuration not applied"
    echo "   - Backend servers not running"
    echo "   - Database connection issues"
    echo "   - Route misconfigurations"
fi
