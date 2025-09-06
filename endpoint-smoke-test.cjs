#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

const baseUrl = 'https://sentientm.com';
const userId = 'DOxZvirgIpXdMjAxnFUbwdm78Qy1';

// Curated set of real endpoints with correct methods and expected statuses
const endpoints = [
  // Health/status (removed /api/health-check - not implemented on any server)

  // User + usage
  { method: 'GET', path: `/api/user/${userId}/usage`, expectedStatus: [200] },
  { method: 'GET', path: `/api/processing-status/${userId}`, expectedStatus: [200, 404] },
  { method: 'POST', path: `/api/validate-dashboard-access/${userId}`, expectedStatus: [200, 400] },
  { method: 'GET', path: `/api/user-instagram-status/${userId}`, expectedStatus: [200, 404] },
  { method: 'GET', path: `/api/instagram-connection/${userId}`, expectedStatus: [200, 404] },
  { method: 'GET', path: `/api/facebook-connection/${userId}`, expectedStatus: [200, 404] },

  // Profile and analytics (Instagram)
  { method: 'GET', path: '/api/profile-info/maccosmetics?platform=instagram', expectedStatus: [200] },
  { method: 'GET', path: '/api/retrieve-strategies/maccosmetics?platform=instagram', expectedStatus: [200] },
  { method: 'GET', path: '/api/news-for-you/maccosmetics?platform=instagram', expectedStatus: [200] },
  { method: 'GET', path: '/api/engagement-metrics/maccosmetics?platform=instagram', expectedStatus: [200] },

  // Posts
  { method: 'GET', path: '/api/posts/maccosmetics?platform=instagram', expectedStatus: [200] },
  { method: 'GET', path: '/posts/maccosmetics?platform=instagram', expectedStatus: [200] },

  // Rules/Responses/AI Replies (dashboard data)
  { method: 'GET', path: '/api/rules/maccosmetics?platform=instagram', expectedStatus: [200, 404] },
  { method: 'GET', path: '/api/responses/maccosmetics?platform=instagram', expectedStatus: [200] },
  { method: 'GET', path: '/api/ai-replies/maccosmetics?platform=instagram', expectedStatus: [200] },

  // RAG server routes via Nginx
  { method: 'POST', path: '/api/post-generator', expectedStatus: [200, 400] },
  { method: 'POST', path: '/api/instant-reply', expectedStatus: [200, 400] },
  { method: 'POST', path: '/api/discussion', expectedStatus: [200, 400] },

  // Webhooks (POST returns 400 without valid payload)
  { method: 'POST', path: '/webhook/facebook', expectedStatus: [200, 400] },

  // SPA routes
  { method: 'GET', path: '/dashboard', expectedStatus: [200] },
  { method: 'GET', path: '/profile/maccosmetics', expectedStatus: [200] },
  { method: 'GET', path: '/analytics', expectedStatus: [200] },
  { method: 'GET', path: '/settings', expectedStatus: [200] },
];

const results = [];
let completed = 0;
let failed = 0;

function makeRequest(endpoint) {
  return new Promise((resolve) => {
    const url = `${baseUrl}${endpoint.path}`;
    const options = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Endpoint-Tester/1.0'
      },
      timeout: 15000
    };

    let postData = '';
    if (endpoint.method === 'POST') {
      postData = JSON.stringify({ test: true });
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const success = endpoint.expectedStatus.includes(res.statusCode);
        const result = {
          method: endpoint.method,
          path: endpoint.path,
          status: res.statusCode,
          success,
          response: data.substring(0, 200)
        };
        if (!success) {
          failed++;
          console.log(`❌ ${endpoint.method} ${endpoint.path} - Status: ${res.statusCode} (Expected: ${endpoint.expectedStatus.join(' or ')})`);
        } else {
          console.log(`✅ ${endpoint.method} ${endpoint.path} - Status: ${res.statusCode}`);
        }
        results.push(result);
        completed++;
        resolve(result);
      });
    });

    req.on('error', (error) => {
      failed++;
      const result = { method: endpoint.method, path: endpoint.path, status: 'ERROR', success: false, error: error.message };
      console.log(`❌ ${endpoint.method} ${endpoint.path} - ERROR: ${error.message}`);
      results.push(result);
      completed++;
      resolve(result);
    });

    req.on('timeout', () => {
      req.destroy();
      failed++;
      const result = { method: endpoint.method, path: endpoint.path, status: 'TIMEOUT', success: false, error: 'Request timeout' };
      console.log(`❌ ${endpoint.method} ${endpoint.path} - TIMEOUT`);
      results.push(result);
      completed++;
      resolve(result);
    });

    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log(`🚀 Endpoint smoke test for ${baseUrl}`);
  console.log(`📊 Testing ${endpoints.length} endpoints...\n`);

  const startTime = Date.now();

  const batchSize = 10;
  for (let i = 0; i < endpoints.length; i += batchSize) {
    const batch = endpoints.slice(i, i + batchSize);
    await Promise.all(batch.map(makeRequest));
    if (i + batchSize < endpoints.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  const successful = completed - failed;
  const successRate = ((successful / completed) * 100).toFixed(2);

  console.log('\n' + '='.repeat(80));
  console.log('📈 SMOKE TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Endpoints Tested: ${completed}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${successRate}%`);
  console.log(`Duration: ${duration}s`);

  if (failed === 0) {
    console.log('\n🎉 100% PASS. All tested endpoints are working as expected.');
  } else {
    console.log('\n⚠️  Some endpoints failed.');
  }

  fs.writeFileSync('endpoint-smoke-report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    baseUrl,
    summary: { total: completed, successful, failed, successRate: successRate + '%', duration: duration + 's' },
    results
  }, null, 2));

  console.log('\n📄 Detailed report saved to: endpoint-smoke-report.json');
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
