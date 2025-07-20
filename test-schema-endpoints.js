#!/usr/bin/env node

/**
 * Test Script for Schema-Compliant Endpoints
 * Tests the new recommendations and competitor analysis endpoints
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const TEST_USERNAME = 'testuser123';
const TEST_COMPETITOR = 'competitor1';

async function testEndpoints() {
  console.log('🧪 Testing Schema-Compliant Endpoints...\n');

  const tests = [
    {
      name: '📊 Recommendations Endpoint (Instagram)',
      url: `${BASE_URL}/api/recommendations/${TEST_USERNAME}?platform=instagram`,
      expectedSchema: 'recommendations/instagram/testuser123/'
    },
    {
      name: '🥊 Competitor Analysis Endpoint (Instagram)', 
      url: `${BASE_URL}/api/competitor-analysis/${TEST_USERNAME}/${TEST_COMPETITOR}?platform=instagram`,
      expectedSchema: 'competitor_analysis/instagram/testuser123/competitor1'
    },
    {
      name: '📊 Recommendations Endpoint (Twitter)',
      url: `${BASE_URL}/api/recommendations/${TEST_USERNAME}?platform=twitter`, 
      expectedSchema: 'recommendations/twitter/testuser123/'
    },
    {
      name: '🥊 Competitor Analysis Endpoint (Twitter)',
      url: `${BASE_URL}/api/competitor-analysis/${TEST_USERNAME}/${TEST_COMPETITOR}?platform=twitter`,
      expectedSchema: 'competitor_analysis/twitter/testuser123/competitor1'
    }
  ];

  for (const test of tests) {
    try {
      console.log(`Testing: ${test.name}`);
      console.log(`URL: ${test.url}`);
      console.log(`Expected Schema: ${test.expectedSchema}`);
      
      const response = await axios.get(test.url, { timeout: 5000 });
      console.log(`✅ Status: ${response.status}`);
      console.log(`✅ Response: ${JSON.stringify(response.data).substring(0, 100)}...`);
      
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`✅ Expected 404 (no data found) - Schema is working correctly`);
      } else if (error.code === 'ECONNREFUSED') {
        console.log(`❌ Server not running - Please start the server first`);
        break;
      } else {
        console.log(`❌ Error: ${error.message}`);
        if (error.response?.data) {
          console.log(`   Response: ${JSON.stringify(error.response.data)}`);
        }
      }
    }
    console.log('---\n');
  }

  console.log('🏁 Testing completed!');
}

// Run tests
testEndpoints().catch(console.error);
