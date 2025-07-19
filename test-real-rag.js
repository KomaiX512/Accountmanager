#!/usr/bin/env node

/**
 * Test the REAL ChromaDB-powered RAG Implementation
 * Tests with Red Bull/Facebook as requested
 */

import axios from 'axios';

const RAG_SERVER_URL = 'http://localhost:3001';
const TEST_USERNAME = 'redbull';
const TEST_PLATFORM = 'facebook';

console.log('🚀 Testing REAL ChromaDB-powered RAG Implementation');
console.log(`Testing with: ${TEST_USERNAME} on ${TEST_PLATFORM}`);
console.log('This should now use semantic search and vector embeddings!\n');

// Test the real RAG implementation
async function testRealRAG() {
  const tests = [
    {
      name: 'Health Check',
      endpoint: '/health',
      method: 'GET',
      test: async () => {
        const response = await axios.get(`${RAG_SERVER_URL}/health`);
        return response.data;
      }
    },
    {
      name: 'Account Theme Analysis (Real RAG)',
      endpoint: '/api/discussion',
      method: 'POST',
      test: async () => {
        const response = await axios.post(`${RAG_SERVER_URL}/api/discussion`, {
          username: TEST_USERNAME,
          platform: TEST_PLATFORM,
          query: 'tell me about account theme',
          previousMessages: []
        });
        return response.data;
      }
    },
    {
      name: 'Post Activities Analysis (Real RAG)',
      endpoint: '/api/discussion',
      method: 'POST',
      test: async () => {
        const response = await axios.post(`${RAG_SERVER_URL}/api/discussion`, {
          username: TEST_USERNAME,
          platform: TEST_PLATFORM,
          query: 'tell me about activities of our posts',
          previousMessages: []
        });
        return response.data;
      }
    },
    {
      name: 'Engagement Strategy (Real RAG)',
      endpoint: '/api/discussion',
      method: 'POST',
      test: async () => {
        const response = await axios.post(`${RAG_SERVER_URL}/api/discussion`, {
          username: TEST_USERNAME,
          platform: TEST_PLATFORM,
          query: 'What is my engagement rate and how can I improve my Facebook strategy based on my actual data?',
          previousMessages: []
        });
        return response.data;
      }
    },
    {
      name: 'Content Performance (Real RAG)',
      endpoint: '/api/discussion',
      method: 'POST',
      test: async () => {
        const response = await axios.post(`${RAG_SERVER_URL}/api/discussion`, {
          username: TEST_USERNAME,
          platform: TEST_PLATFORM,
          query: 'Based on my recent posts and their performance, what content themes work best for my audience?',
          previousMessages: []
        });
        return response.data;
      }
    }
  ];

  console.log('🧪 Running Real RAG Tests...\n');

  for (const { name, test, endpoint, method } of tests) {
    try {
      console.log(`📋 ${name}:`);
      console.log(`   ${method} ${endpoint}`);
      
      const startTime = Date.now();
      const result = await test();
      const duration = Date.now() - startTime;
      
      console.log('✅ SUCCESS');
      console.log(`   Duration: ${duration}ms`);
      
      if (result.response) {
        console.log(`   Response Length: ${result.response.length} characters`);
        console.log(`   Profile Data Used: ${result.profile_data_used || 'N/A'}`);
        console.log(`   Preview: ${result.response.substring(0, 150)}...`);
      } else {
        console.log('   Result:', JSON.stringify(result, null, 2));
      }
      console.log('---\n');
      
      // Add delay between requests to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.log('❌ FAILED');
      console.log('   Error:', error.response?.data || error.message);
      console.log('---\n');
    }
  }
  
  console.log('🎯 Test Summary:');
  console.log('- If responses mention specific post content, engagement numbers, or actual data = ✅ Real RAG working');
  console.log('- If responses are generic templates without specific data = ❌ Still using templates');
  console.log('- Look for ChromaDB semantic search logs in server output');
}

testRealRAG().catch(console.error);
