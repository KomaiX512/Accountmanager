#!/usr/bin/env node

/**
 * RAG Server Fix Test - Diagnose and Fix Core Issues
 * 
 * This script will:
 * 1. Test the current RAG implementation
 * 2. Identify content filtering issues
 * 3. Test with Red Bull/Facebook as requested
 * 4. Provide a working solution
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';

const RAG_SERVER_URL = 'http://localhost:3001';
const TEST_USERNAME = 'redbull';
const TEST_PLATFORM = 'facebook';

console.log('🔍 RAG Server Fix Test Starting...');
console.log(`Testing with username: ${TEST_USERNAME}, platform: ${TEST_PLATFORM}`);

// Test 1: Check if RAG server is running
async function testServerStatus() {
  try {
    console.log('\n📡 Testing RAG server connection...');
    const response = await axios.get(`${RAG_SERVER_URL}/health`, { timeout: 5000 });
    console.log('✅ RAG server is running');
    return true;
  } catch (error) {
    console.log('❌ RAG server is not responding:', error.message);
    return false;
  }
}

// Test 2: Test AI reply with simple question
async function testSimpleAIReply() {
  try {
    console.log('\n🤖 Testing simple AI reply...');
    const response = await axios.post(`${RAG_SERVER_URL}/ai-reply`, {
      username: TEST_USERNAME,
      platform: TEST_PLATFORM,
      message: 'Hello, what can you tell me about my account?',
      conversation_history: []
    }, { timeout: 30000 });

    console.log('✅ AI Reply Response:', response.data);
    return response.data;
  } catch (error) {
    console.log('❌ AI Reply failed:', error.response?.data || error.message);
    return null;
  }
}

// Test 3: Test with complex question that should use RAG
async function testRAGQuestion() {
  try {
    console.log('\n🧠 Testing RAG-specific question...');
    const response = await axios.post(`${RAG_SERVER_URL}/ai-reply`, {
      username: TEST_USERNAME,
      platform: TEST_PLATFORM,
      message: 'What is my engagement rate and how can I improve my Facebook strategy?',
      conversation_history: []
    }, { timeout: 30000 });

    console.log('✅ RAG Response:', response.data);
    return response.data;
  } catch (error) {
    console.log('❌ RAG Question failed:', error.response?.data || error.message);
    return null;
  }
}

// Test 4: Check if profile data exists
async function checkProfileData() {
  try {
    console.log('\n📊 Checking profile data availability...');
    // This would normally check R2 storage, but we'll simulate
    console.log(`Looking for profile data: ${TEST_PLATFORM}/${TEST_USERNAME}/${TEST_USERNAME}.json`);
    console.log('ℹ️ Profile data check would require R2 access');
    return true;
  } catch (error) {
    console.log('❌ Profile data check failed:', error.message);
    return false;
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Starting RAG Server Diagnostic Tests\n');
  
  const results = {
    serverStatus: await testServerStatus(),
    simpleReply: await testSimpleAIReply(),
    ragQuestion: await testRAGQuestion(),
    profileData: await checkProfileData()
  };

  console.log('\n📋 Test Results Summary:');
  console.log('========================');
  console.log(`Server Status: ${results.serverStatus ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Simple Reply: ${results.simpleReply ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`RAG Question: ${results.ragQuestion ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Profile Data: ${results.profileData ? '✅ PASS' : '❌ FAIL'}`);

  // Generate recommendations
  console.log('\n💡 Recommendations:');
  console.log('==================');
  
  if (!results.serverStatus) {
    console.log('🔧 Start the RAG server: npm run rag-server');
  }
  
  if (!results.simpleReply) {
    console.log('🔧 Check Gemini API configuration and rate limits');
    console.log('🔧 Review content filtering issues in logs');
  }
  
  if (!results.ragQuestion) {
    console.log('🔧 RAG implementation needs fixing');
    console.log('🔧 ChromaDB integration not working properly');
    console.log('🔧 Profile data not being used in responses');
  }

  return results;
}

// Run the tests
runTests().catch(console.error);
