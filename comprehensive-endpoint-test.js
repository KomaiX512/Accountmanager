#!/usr/bin/env node

const https = require('https');
const http = require('http');
const fs = require('fs');

// Comprehensive list of all API endpoints from the Nginx configuration
const endpoints = [
    // Health and status endpoints
    { method: 'GET', path: '/health', expectedStatus: [200] },
    { method: 'GET', path: '/api/health', expectedStatus: [200] },
    
    // User management endpoints
    { method: 'GET', path: '/api/user/DOxZvirgIpXdMjAxnFUbwdm78Qy1/usage', expectedStatus: [200] },
    { method: 'GET', path: '/api/processing-status/DOxZvirgIpXdMjAxnFUbwdm78Qy1', expectedStatus: [200] },
    { method: 'POST', path: '/api/validate-dashboard-access/DOxZvirgIpXdMjAxnFUbwdm78Qy1', expectedStatus: [200, 400] },
    { method: 'GET', path: '/api/user-instagram-status/DOxZvirgIpXdMjAxnFUbwdm78Qy1', expectedStatus: [200] },
    { method: 'GET', path: '/api/instagram-connection/DOxZvirgIpXdMjAxnFUbwdm78Qy1', expectedStatus: [200, 404] },
    { method: 'GET', path: '/api/facebook-connection/DOxZvirgIpXdMjAxnFUbwdm78Qy1', expectedStatus: [200, 404] },
    { method: 'GET', path: '/api/twitter-connection/DOxZvirgIpXdMjAxnFUbwdm78Qy1', expectedStatus: [200, 404] },
    
    // Profile and competitor analysis
    { method: 'GET', path: '/api/profile-info/maccosmetics?platform=instagram', expectedStatus: [200] },
    { method: 'GET', path: '/api/list-competitors/maccosmetics?platform=instagram', expectedStatus: [200, 404] },
    { method: 'GET', path: '/api/news-for-you/maccosmetics?platform=instagram', expectedStatus: [200] },
    { method: 'GET', path: '/api/retrieve-strategies/maccosmetics?platform=instagram', expectedStatus: [200] },
    { method: 'GET', path: '/posts/maccosmetics?platform=instagram', expectedStatus: [200] },
    
    // Content generation and AI endpoints
    { method: 'POST', path: '/api/generate-content/maccosmetics', expectedStatus: [200, 400] },
    { method: 'POST', path: '/api/generate-post/maccosmetics', expectedStatus: [200, 400] },
    { method: 'POST', path: '/api/generate-story/maccosmetics', expectedStatus: [200, 400] },
    { method: 'POST', path: '/api/generate-reel/maccosmetics', expectedStatus: [200, 400] },
    { method: 'POST', path: '/api/generate-carousel/maccosmetics', expectedStatus: [200, 400] },
    
    // Scheduling endpoints
    { method: 'POST', path: '/api/schedule-post/maccosmetics', expectedStatus: [200, 400] },
    { method: 'GET', path: '/api/scheduled-posts/maccosmetics', expectedStatus: [200] },
    { method: 'DELETE', path: '/api/cancel-scheduled-post/maccosmetics/test123', expectedStatus: [200, 404] },
    
    // Analytics endpoints
    { method: 'GET', path: '/api/analytics/maccosmetics?platform=instagram', expectedStatus: [200] },
    { method: 'GET', path: '/api/engagement-metrics/maccosmetics?platform=instagram', expectedStatus: [200] },
    { method: 'GET', path: '/api/follower-growth/maccosmetics?platform=instagram', expectedStatus: [200] },
    
    // Image processing endpoints (proxy server - port 3002)
    { method: 'POST', path: '/api/process-image', expectedStatus: [200, 400] },
    { method: 'POST', path: '/api/enhance-image', expectedStatus: [200, 400] },
    { method: 'POST', path: '/api/resize-image', expectedStatus: [200, 400] },
    { method: 'POST', path: '/api/compress-image', expectedStatus: [200, 400] },
    
    // RAG server endpoints (port 3001)
    { method: 'POST', path: '/api/rag/query', expectedStatus: [200, 400] },
    { method: 'POST', path: '/api/rag/embed', expectedStatus: [200, 400] },
    { method: 'GET', path: '/api/rag/status', expectedStatus: [200] },
    
    // Notification endpoints
    { method: 'POST', path: '/send-dm-reply/maccosmetics', expectedStatus: [200, 400] },
    { method: 'POST', path: '/send-comment-reply/maccosmetics', expectedStatus: [200, 400] },
    { method: 'POST', path: '/ignore-notification/maccosmetics', expectedStatus: [200, 400] },
    { method: 'POST', path: '/mark-notification-handled/maccosmetics', expectedStatus: [200, 400] },
    
    // Platform-specific endpoints
    { method: 'GET', path: '/api/instagram/posts/maccosmetics', expectedStatus: [200] },
    { method: 'GET', path: '/api/facebook/posts/maccosmetics', expectedStatus: [200] },
    { method: 'GET', path: '/api/twitter/posts/maccosmetics', expectedStatus: [200] },
    
    // Upload and media endpoints
    { method: 'POST', path: '/api/upload-media', expectedStatus: [200, 400] },
    { method: 'GET', path: '/api/media/maccosmetics', expectedStatus: [200] },
    { method: 'DELETE', path: '/api/media/maccosmetics/test123', expectedStatus: [200, 404] },
    
    // Admin endpoints
    { method: 'GET', path: '/api/admin/users', expectedStatus: [200, 401, 403] },
    { method: 'GET', path: '/api/admin/stats', expectedStatus: [200, 401, 403] },
    { method: 'POST', path: '/api/admin/user/DOxZvirgIpXdMjAxnFUbwdm78Qy1/suspend', expectedStatus: [200, 401, 403] },
    
    // Webhook endpoints
    { method: 'POST', path: '/webhook/instagram', expectedStatus: [200, 400] },
    { method: 'POST', path: '/webhook/facebook', expectedStatus: [200, 400] },
    { method: 'POST', path: '/webhook/twitter', expectedStatus: [200, 400] },
    
    // Static assets (should return 200 or 404)
    { method: 'GET', path: '/assets/logo.png', expectedStatus: [200, 404] },
    { method: 'GET', path: '/assets/favicon.ico', expectedStatus: [200, 404] },
    { method: 'GET', path: '/manifest.json', expectedStatus: [200, 404] },
    
    // SPA routes (should return 200 for index.html)
    { method: 'GET', path: '/dashboard', expectedStatus: [200] },
    { method: 'GET', path: '/profile/maccosmetics', expectedStatus: [200] },
    { method: 'GET', path: '/analytics', expectedStatus: [200] },
    { method: 'GET', path: '/settings', expectedStatus: [200] },
];

const baseUrl = 'https://sentientm.com';
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
            timeout: 10000
        };

        // Add body for POST requests
        let postData = '';
        if (endpoint.method === 'POST') {
            postData = JSON.stringify({ test: true });
            options.headers['Content-Length'] = Buffer.byteLength(postData);
        }

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const success = endpoint.expectedStatus.includes(res.statusCode);
                const result = {
                    method: endpoint.method,
                    path: endpoint.path,
                    status: res.statusCode,
                    success: success,
                    response: data.substring(0, 200) // Limit response data
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
            const result = {
                method: endpoint.method,
                path: endpoint.path,
                status: 'ERROR',
                success: false,
                error: error.message
            };
            console.log(`❌ ${endpoint.method} ${endpoint.path} - ERROR: ${error.message}`);
            results.push(result);
            completed++;
            resolve(result);
        });

        req.on('timeout', () => {
            req.destroy();
            failed++;
            const result = {
                method: endpoint.method,
                path: endpoint.path,
                status: 'TIMEOUT',
                success: false,
                error: 'Request timeout'
            };
            console.log(`❌ ${endpoint.method} ${endpoint.path} - TIMEOUT`);
            results.push(result);
            completed++;
            resolve(result);
        });

        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

async function runTests() {
    console.log(`🚀 Starting comprehensive endpoint testing for ${baseUrl}`);
    console.log(`📊 Testing ${endpoints.length} endpoints...\n`);

    const startTime = Date.now();
    
    // Run tests in batches to avoid overwhelming the server
    const batchSize = 10;
    for (let i = 0; i < endpoints.length; i += batchSize) {
        const batch = endpoints.slice(i, i + batchSize);
        await Promise.all(batch.map(makeRequest));
        
        // Small delay between batches
        if (i + batchSize < endpoints.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log('\n' + '='.repeat(80));
    console.log('📈 TEST RESULTS SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Endpoints Tested: ${endpoints.length}`);
    console.log(`Successful: ${completed - failed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${((completed - failed) / completed * 100).toFixed(2)}%`);
    console.log(`Duration: ${duration.toFixed(2)} seconds`);

    // Group failures by status code
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
        console.log('\n❌ FAILED ENDPOINTS:');
        console.log('='.repeat(50));
        
        const failuresByStatus = {};
        failures.forEach(f => {
            const status = f.status || 'ERROR';
            if (!failuresByStatus[status]) failuresByStatus[status] = [];
            failuresByStatus[status].push(f);
        });

        Object.keys(failuresByStatus).forEach(status => {
            console.log(`\n${status} Errors (${failuresByStatus[status].length}):`);
            failuresByStatus[status].forEach(f => {
                console.log(`  ${f.method} ${f.path}`);
            });
        });
    }

    // Save detailed results to file
    const reportData = {
        timestamp: new Date().toISOString(),
        baseUrl: baseUrl,
        summary: {
            total: endpoints.length,
            successful: completed - failed,
            failed: failed,
            successRate: ((completed - failed) / completed * 100).toFixed(2) + '%',
            duration: duration.toFixed(2) + 's'
        },
        results: results
    };

    fs.writeFileSync('endpoint-test-report.json', JSON.stringify(reportData, null, 2));
    console.log('\n📄 Detailed report saved to: endpoint-test-report.json');

    if (failed === 0) {
        console.log('\n🎉 ALL ENDPOINTS WORKING! 100% SUCCESS RATE ACHIEVED!');
        process.exit(0);
    } else {
        console.log(`\n⚠️  ${failed} endpoints need attention to achieve 100% success rate.`);
        process.exit(1);
    }
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n\n⏹️  Test interrupted by user');
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Start the tests
runTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
});
