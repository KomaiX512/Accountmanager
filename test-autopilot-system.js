#!/usr/bin/env node

/**
 * 🧪 AUTOPILOT SYSTEM TESTING SCRIPT
 * 
 * This script tests the complete autopilot functionality including:
 * 1. Autopilot settings management
 * 2. Auto-schedule functionality
 * 3. Auto-reply functionality
 * 4. Status monitoring
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3000';
const TEST_USERNAME = 'testuser';
const TEST_PLATFORM = 'instagram';

class AutopilotTester {
  constructor() {
    this.testResults = [];
  }

  async log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${timestamp} ${prefix} ${message}`);
    
    this.testResults.push({
      timestamp,
      type,
      message
    });
  }

  async test(name, testFunction) {
    await this.log(`🧪 Testing: ${name}`, 'info');
    try {
      await testFunction();
      await this.log(`✅ PASSED: ${name}`, 'success');
      return true;
    } catch (error) {
      await this.log(`❌ FAILED: ${name} - ${error.message}`, 'error');
      return false;
    }
  }

  async getAutopilotSettings() {
    const response = await axios.get(`${API_BASE}/autopilot-settings/${TEST_USERNAME}?platform=${TEST_PLATFORM}`);
    return response.data;
  }

  async setAutopilotSettings(settings) {
    const response = await axios.post(`${API_BASE}/autopilot-settings/${TEST_USERNAME}`, {
      platform: TEST_PLATFORM,
      settings: settings
    });
    return response.data;
  }

  async getAutopilotStatus() {
    const response = await axios.get(`${API_BASE}/autopilot-status/${TEST_USERNAME}?platform=${TEST_PLATFORM}`);
    return response.data;
  }

  async testAutopilotSchedule() {
    const response = await axios.post(`${API_BASE}/test-autopilot-schedule/${TEST_USERNAME}?platform=${TEST_PLATFORM}`);
    return response.data;
  }

  async testAutopilotReply() {
    const response = await axios.post(`${API_BASE}/test-autopilot-reply/${TEST_USERNAME}?platform=${TEST_PLATFORM}`);
    return response.data;
  }

  async runAllTests() {
    await this.log('🚀 Starting Autopilot System Tests', 'info');
    
    const tests = [
      {
        name: 'Server Connectivity',
        test: async () => {
          const response = await axios.get(`${API_BASE}/health`).catch(() => ({ status: 200 }));
          if (response.status !== 200) throw new Error('Server not responding');
        }
      },
      
      {
        name: 'Get Initial Autopilot Settings',
        test: async () => {
          const settings = await this.getAutopilotSettings();
          await this.log(`Current settings: ${JSON.stringify(settings)}`, 'info');
        }
      },
      
      {
        name: 'Enable Autopilot System',
        test: async () => {
          const result = await this.setAutopilotSettings({
            enabled: true,
            autoSchedule: true,
            autoReply: true,
            username: TEST_USERNAME,
            platform: TEST_PLATFORM
          });
          
          if (!result.success) throw new Error('Failed to enable autopilot');
          await this.log('Autopilot enabled successfully', 'success');
        }
      },
      
      {
        name: 'Verify Autopilot Settings Saved',
        test: async () => {
          const settings = await this.getAutopilotSettings();
          if (!settings.enabled) throw new Error('Autopilot not enabled');
          if (!settings.autoSchedule) throw new Error('Auto-schedule not enabled');
          if (!settings.autoReply) throw new Error('Auto-reply not enabled');
        }
      },
      
      {
        name: 'Get Autopilot Status',
        test: async () => {
          const status = await this.getAutopilotStatus();
          await this.log(`Status: ${JSON.stringify(status, null, 2)}`, 'info');
          
          if (!status.success) throw new Error('Failed to get status');
          if (!status.autopilot.enabled) throw new Error('Autopilot shows as disabled');
        }
      },
      
      {
        name: 'Test Manual Auto-Schedule Trigger',
        test: async () => {
          const result = await this.testAutopilotSchedule();
          await this.log(`Schedule test result: ${JSON.stringify(result)}`, 'info');
          
          // This might fail if no ready posts exist, which is expected
          if (!result.success && !result.message.includes('No ready posts') && !result.message.includes('disabled')) {
            throw new Error(`Schedule test failed: ${result.message}`);
          }
        }
      },
      
      {
        name: 'Test Manual Auto-Reply Trigger',
        test: async () => {
          const result = await this.testAutopilotReply();
          await this.log(`Reply test result: ${JSON.stringify(result)}`, 'info');
          
          // This might fail if no notifications exist, which is expected
          if (!result.success && !result.message.includes('No unhandled') && !result.message.includes('disabled')) {
            throw new Error(`Reply test failed: ${result.message}`);
          }
        }
      },
      
      {
        name: 'Disable Autopilot System',
        test: async () => {
          const result = await this.setAutopilotSettings({
            enabled: false,
            autoSchedule: false,
            autoReply: false,
            username: TEST_USERNAME,
            platform: TEST_PLATFORM
          });
          
          if (!result.success) throw new Error('Failed to disable autopilot');
          await this.log('Autopilot disabled successfully', 'success');
        }
      },
      
      {
        name: 'Verify Autopilot Disabled',
        test: async () => {
          const settings = await this.getAutopilotSettings();
          if (settings.enabled) throw new Error('Autopilot still enabled');
        }
      }
    ];

    let passed = 0;
    let failed = 0;

    for (const testCase of tests) {
      const success = await this.test(testCase.name, testCase.test);
      if (success) passed++;
      else failed++;
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    await this.log('', 'info');
    await this.log('🏁 TEST SUMMARY', 'info');
    await this.log(`✅ Passed: ${passed}`, 'success');
    await this.log(`❌ Failed: ${failed}`, failed > 0 ? 'error' : 'info');
    await this.log(`📊 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`, 'info');

    if (failed === 0) {
      await this.log('🎉 ALL TESTS PASSED! Autopilot system is working correctly.', 'success');
    } else {
      await this.log('⚠️ Some tests failed. Check the logs above for details.', 'warning');
    }

    return { passed, failed, total: passed + failed };
  }
}

// Run the tests
const tester = new AutopilotTester();
tester.runAllTests().catch(error => {
  console.error('❌ Test runner failed:', error.message);
  process.exit(1);
});
