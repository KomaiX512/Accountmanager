#!/usr/bin/env node

// Test script to battle test the discussion API from frontend perspective
import axios from 'axios';

async function testDiscussionAPI() {
  console.log('🔥 BATTLE TESTING Discussion API...\n');
  
  // Test 1: Direct RAG server call (this should work)
  console.log('Test 1: Direct RAG server (/api/discussion)');
  try {
    const response1 = await axios.post('http://localhost:3001/api/discussion', {
      username: 'maccosmetics',
      query: 'What is my top performing content?',
      platform: 'instagram',
      previousMessages: []
    }, { timeout: 10000 });
    console.log('✅ PASS - Direct RAG server working');
    console.log('📝 Response length:', response1.data.response.length);
  } catch (error) {
    console.error('❌ FAIL - Direct RAG server error:', error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 2: Through vite proxy (this is what frontend uses)
  console.log('Test 2: Through vite proxy (/api/rag/discussion)');
  try {
    const response2 = await axios.post('http://localhost:5173/api/rag/discussion', {
      username: 'maccosmetics',
      query: 'What is my top performing content?',
      platform: 'instagram',
      previousMessages: []
    }, { timeout: 10000 });
    console.log('✅ PASS - Vite proxy working');
    console.log('📝 Response length:', response2.data.response.length);
  } catch (error) {
    console.error('❌ FAIL - Vite proxy error:', error.message);
    console.error('   Status:', error.response?.status);
    console.error('   Data:', error.response?.data?.substring?.(0, 200));
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 3: Same pattern as post generator
  console.log('Test 3: Testing if post generator works (for comparison)');
  try {
    const response3 = await axios.post('http://localhost:5173/api/rag/post-generator', {
      username: 'maccosmetics',
      query: 'Create a post about beauty tips',
      platform: 'instagram'
    }, { timeout: 15000 });
    console.log('✅ PASS - Post generator through proxy working');
    console.log('📝 Post caption length:', response3.data.post?.caption?.length || 'No caption');
  } catch (error) {
    console.error('❌ FAIL - Post generator error:', error.message);
    console.error('   Status:', error.response?.status);
  }
  
  console.log('\n🏆 BATTLE TEST COMPLETE');
}

testDiscussionAPI().catch(console.error);
