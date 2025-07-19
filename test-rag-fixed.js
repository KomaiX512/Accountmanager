#!/usr/bin/env node

/**
 * Test the Fixed RAG Server Implementation
 * Tests with Red Bull/Facebook as requested
 */

import axios from 'axios';

const RAG_SERVER_URL = 'http://localhost:3001'; // Fixed server is running on 3001
const TEST_USERNAME = 'redbull';
const TEST_PLATFORM = 'facebook';

console.log('🔧 Testing FIXED RAG Server Implementation');
console.log(`Testing with: ${TEST_USERNAME} on ${TEST_PLATFORM}`);

// Test the fixed RAG server
async function testFixedRAGServer() {
  const tests = [
    {
      name: 'Health Check',
      test: async () => {
        const response = await axios.get(`${RAG_SERVER_URL}/health`);
        return response.data;
      }
    },
    {
      name: 'Simple Question',
      test: async () => {
        const response = await axios.post(`${RAG_SERVER_URL}/ai-reply`, {
          username: TEST_USERNAME,
          platform: TEST_PLATFORM,
          message: 'Hello, what can you tell me about my account?'
        });
        return response.data;
      }
    },
    {
      name: 'Engagement Analysis',
      test: async () => {
        const response = await axios.post(`${RAG_SERVER_URL}/ai-reply`, {
          username: TEST_USERNAME,
          platform: TEST_PLATFORM,
          message: 'What is my engagement rate and how can I improve my Facebook strategy?'
        });
        return response.data;
      }
    },
    {
      name: 'Content Strategy',
      test: async () => {
        const response = await axios.post(`${RAG_SERVER_URL}/ai-reply`, {
          username: TEST_USERNAME,
          platform: TEST_PLATFORM,
          message: 'Based on my recent posts, what type of content should I create next?'
        });
        return response.data;
      }
    }
  ];

  console.log('\n🧪 Running Tests...\n');

  for (const { name, test } of tests) {
    try {
      console.log(`📋 ${name}:`);
      const result = await test();
      console.log('✅ SUCCESS');
      console.log('Response:', JSON.stringify(result, null, 2));
      console.log('---\n');
    } catch (error) {
      console.log('❌ FAILED');
      console.log('Error:', error.response?.data || error.message);
      console.log('---\n');
    }
  }
}

testFixedRAGServer().catch(console.error);
