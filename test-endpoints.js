#!/usr/bin/env node

/**
 * 🔥 SIMPLE ENDPOINT TEST
 * Tests which endpoints work on the proxy server
 */

import http from 'http';

async function testEndpoint(path, description) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 3002,
            path: path,
            method: 'GET',
            timeout: 5000
        };

        console.log(`🔍 Testing: ${description}`);
        console.log(`   URL: http://localhost:3002${path}`);

        const req = http.request(options, (res) => {
            console.log(`   Status: ${res.statusCode}`);
            console.log(`   Content-Type: ${res.headers['content-type']}`);
            
            if (res.statusCode === 200) {
                console.log(`   ✅ SUCCESS!\n`);
            } else {
                console.log(`   ❌ FAILED\n`);
            }
            
            resolve(res.statusCode);
        });

        req.on('error', (error) => {
            console.log(`   💥 ERROR: ${error.message}\n`);
            resolve(0);
        });

        req.on('timeout', () => {
            console.log(`   ⏰ TIMEOUT\n`);
            req.destroy();
            resolve(0);
        });

        req.end();
    });
}

async function runTests() {
    console.log('🚀 TESTING PROXY SERVER ENDPOINTS\n');
    
    const tests = [
        ['/health', 'Health Check'],
        ['/r2-images/fentybeauty/campaign_ready_post_1753749569483_620ea3e6.jpg', 'Working R2 Image (from logs)'],
        ['/r2-images/testuser/pink_test.png', 'Our Test Image'],
        ['/api/r2-image/testuser/pink_test.png', 'API R2 Image Endpoint'],
        ['/fix-image/testuser/pink_test.png', 'Fix Image Endpoint']
    ];
    
    for (const [path, description] of tests) {
        await testEndpoint(path, description);
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('🎯 CONCLUSION:');
    console.log('If the working R2 image succeeds but ours fails,');
    console.log('then the issue is not with the endpoint but with our test images.');
}

runTests().catch(console.error);
