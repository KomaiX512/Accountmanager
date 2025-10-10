#!/usr/bin/env node

/**
 * UNIT TEST: R2 Bucket Credentials Fix Verification
 * Tests that correct R2 bucket credentials are being used
 */

const axios = require('axios');

const CORRECT_BUCKET_ID = 'f049515e642b0c91e7679c3d80962686';
const CORRECT_PUBLIC_URL = 'https://pub-27792cbe4fa9441b8fefa0253ea9242c.r2.dev';

console.log('🧪 UNIT TEST: R2 Bucket Credentials Fix\n');
console.log('=' .repeat(60));

async function testR2Credentials() {
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  // TEST 1: Posts API returns multiple posts
  console.log('\n📋 TEST 1: Backend returns multiple posts from correct bucket');
  try {
    const response = await axios.get('http://127.0.0.1:3000/api/posts/fentybeauty?platform=instagram&limit=100');
    const posts = response.data;
    
    if (Array.isArray(posts) && posts.length >= 10) {
      console.log(`✅ PASS: Found ${posts.length} posts (expected >= 10)`);
      results.passed++;
      results.tests.push({ name: 'Multiple posts retrieved', status: 'PASS', details: `${posts.length} posts found` });
    } else {
      console.log(`❌ FAIL: Only found ${posts.length} posts (expected >= 10)`);
      results.failed++;
      results.tests.push({ name: 'Multiple posts retrieved', status: 'FAIL', details: `Only ${posts.length} posts` });
    }
  } catch (error) {
    console.log(`❌ FAIL: API error - ${error.message}`);
    results.failed++;
    results.tests.push({ name: 'Multiple posts retrieved', status: 'FAIL', details: error.message });
  }

  // TEST 2: Posts have complete metadata
  console.log('\n📋 TEST 2: Posts have complete metadata (caption, hashtags, image)');
  try {
    const response = await axios.get('http://127.0.0.1:3000/api/posts/fentybeauty?platform=instagram&limit=5');
    const posts = response.data;
    
    let postsWithMetadata = 0;
    for (const post of posts) {
      const hasCaption = post.data?.post?.caption && post.data.post.caption.length > 0;
      const hasImage = post.data?.image_url || post.data?.r2_image_url;
      
      if (hasCaption && hasImage) {
        postsWithMetadata++;
      }
    }
    
    if (postsWithMetadata >= 3) {
      console.log(`✅ PASS: ${postsWithMetadata}/${posts.length} posts have complete metadata`);
      results.passed++;
      results.tests.push({ name: 'Complete metadata', status: 'PASS', details: `${postsWithMetadata}/${posts.length} posts` });
    } else {
      console.log(`❌ FAIL: Only ${postsWithMetadata}/${posts.length} posts have complete metadata`);
      results.failed++;
      results.tests.push({ name: 'Complete metadata', status: 'FAIL', details: `${postsWithMetadata}/${posts.length} posts` });
    }
  } catch (error) {
    console.log(`❌ FAIL: API error - ${error.message}`);
    results.failed++;
    results.tests.push({ name: 'Complete metadata', status: 'FAIL', details: error.message });
  }

  // TEST 3: Known post from correct bucket exists
  console.log('\n📋 TEST 3: Known post from correct bucket exists');
  try {
    const response = await axios.get('http://127.0.0.1:3000/api/posts/fentybeauty?platform=instagram&limit=100');
    const posts = response.data;
    
    // This is the post from the public URL the user provided
    const knownPost = posts.find(p => p.key && p.key.includes('campaign_ready_post_1754561649019_edfdd724'));
    
    if (knownPost) {
      console.log(`✅ PASS: Found known post: ${knownPost.key.split('/').pop()}`);
      results.passed++;
      results.tests.push({ name: 'Known post exists', status: 'PASS', details: 'campaign_ready_post_1754561649019_edfdd724' });
    } else {
      console.log(`❌ FAIL: Known post not found in results`);
      results.failed++;
      results.tests.push({ name: 'Known post exists', status: 'FAIL', details: 'Post not found' });
    }
  } catch (error) {
    console.log(`❌ FAIL: API error - ${error.message}`);
    results.failed++;
    results.tests.push({ name: 'Known post exists', status: 'FAIL', details: error.message });
  }

  // TEST 4: Campaign posts are included
  console.log('\n📋 TEST 4: Campaign posts are properly retrieved');
  try {
    const response = await axios.get('http://127.0.0.1:3000/api/posts/fentybeauty?platform=instagram&limit=100');
    const posts = response.data;
    
    const campaignPosts = posts.filter(p => p.key && p.key.includes('campaign_ready_post'));
    
    if (campaignPosts.length >= 5) {
      console.log(`✅ PASS: Found ${campaignPosts.length} campaign posts`);
      results.passed++;
      results.tests.push({ name: 'Campaign posts retrieved', status: 'PASS', details: `${campaignPosts.length} campaign posts` });
    } else {
      console.log(`❌ FAIL: Only found ${campaignPosts.length} campaign posts (expected >= 5)`);
      results.failed++;
      results.tests.push({ name: 'Campaign posts retrieved', status: 'FAIL', details: `${campaignPosts.length} campaign posts` });
    }
  } catch (error) {
    console.log(`❌ FAIL: API error - ${error.message}`);
    results.failed++;
    results.tests.push({ name: 'Campaign posts retrieved', status: 'FAIL', details: error.message });
  }

  // TEST 5: Response time is acceptable
  console.log('\n📋 TEST 5: API response time is acceptable');
  try {
    const startTime = Date.now();
    await axios.get('http://127.0.0.1:3000/api/posts/fentybeauty?platform=instagram&limit=10');
    const responseTime = Date.now() - startTime;
    
    if (responseTime < 5000) {
      console.log(`✅ PASS: Response time ${responseTime}ms (< 5000ms)`);
      results.passed++;
      results.tests.push({ name: 'Response time', status: 'PASS', details: `${responseTime}ms` });
    } else {
      console.log(`❌ FAIL: Response time ${responseTime}ms (>= 5000ms)`);
      results.failed++;
      results.tests.push({ name: 'Response time', status: 'FAIL', details: `${responseTime}ms` });
    }
  } catch (error) {
    console.log(`❌ FAIL: API error - ${error.message}`);
    results.failed++;
    results.tests.push({ name: 'Response time', status: 'FAIL', details: error.message });
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
  
  if (results.failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! R2 credentials are correctly configured.');
    console.log(`\n✅ Correct bucket: ${CORRECT_BUCKET_ID}`);
    console.log(`✅ Public URL: ${CORRECT_PUBLIC_URL}`);
  } else {
    console.log('\n⚠️  SOME TESTS FAILED - Review results above');
  }

  console.log('\n' + '='.repeat(60));
  
  return results.failed === 0;
}

// Run tests
testR2Credentials()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  });
