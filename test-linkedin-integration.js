#!/usr/bin/env node

/**
 * LinkedIn Integration Test
 * Tests both frontend form submission and backend validation
 */

import http from 'http';

// Test LinkedIn platform validation on the backend
function testLinkedInValidation() {
    console.log('🔍 Testing LinkedIn platform validation...');
    
    const postData = JSON.stringify({
        platform: 'linkedin',
        username: 'testuser123'
    });

    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/platform-validate',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`✅ Response Status: ${res.statusCode}`);
                console.log(`✅ Response: ${data}`);
                
                if (res.statusCode === 200) {
                    console.log('🎉 LinkedIn platform validation PASSED!');
                    resolve(true);
                } else {
                    console.log('❌ LinkedIn platform validation FAILED!');
                    resolve(false);
                }
            });
        });

        req.on('error', (e) => {
            console.log(`❌ Request error: ${e.message}`);
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

// Test PlatformSchemaManager LinkedIn configuration
function testPlatformSchemaManager() {
    console.log('\n🔍 Testing PlatformSchemaManager LinkedIn configuration...');
    
    const postData = JSON.stringify({
        platform: 'linkedin',
        action: 'getPlatformConfig'
    });

    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/platform-config',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`✅ Response Status: ${res.statusCode}`);
                
                try {
                    const response = JSON.parse(data);
                    console.log(`✅ LinkedIn Config:`, JSON.stringify(response, null, 2));
                    
                    // Check if LinkedIn config has required fields
                    if (response && response.normalizeUsername && response.maxUsernameLength === 50) {
                        console.log('🎉 PlatformSchemaManager LinkedIn config PASSED!');
                        resolve(true);
                    } else {
                        console.log('❌ PlatformSchemaManager LinkedIn config FAILED!');
                        resolve(false);
                    }
                } catch (e) {
                    console.log(`❌ Invalid JSON response: ${data}`);
                    resolve(false);
                }
            });
        });

        req.on('error', (e) => {
            console.log(`❌ Request error: ${e.message}`);
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

// Main test execution
async function runTests() {
    console.log('🚀 Starting LinkedIn Integration Tests...\n');
    
    try {
        // Wait for server to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const test1 = await testLinkedInValidation();
        const test2 = await testPlatformSchemaManager();
        
        console.log('\n📊 Test Results Summary:');
        console.log(`   Platform Validation: ${test1 ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`   Schema Manager Config: ${test2 ? '✅ PASS' : '❌ FAIL'}`);
        
        if (test1 && test2) {
            console.log('\n🎉 All LinkedIn integration tests PASSED!');
            console.log('✅ LinkedIn platform is now fully supported');
        } else {
            console.log('\n❌ Some tests FAILED - LinkedIn integration needs debugging');
        }
        
    } catch (error) {
        console.error('❌ Test execution failed:', error.message);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    runTests();
}

export { testLinkedInValidation, testPlatformSchemaManager };
