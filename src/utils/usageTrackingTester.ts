/**
 * Usage Tracking Tester Utility
 * 
 * This utility provides functions to test the usage tracking system
 * and identify issues with feature counting.
 */

import { useUsage } from '../context/UsageContext';
import { useFeatureTracking } from '../hooks/useFeatureTracking';

export interface TestResult {
  feature: string;
  success: boolean;
  beforeCount: number;
  afterCount: number;
  expectedCount: number;
  duration: number;
  error?: string;
  timestamp: string;
}

export interface TestSuiteResult {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: TestResult[];
  summary: string;
}

/**
 * Test a single feature's tracking mechanism
 */
export const testFeatureTracking = async (
  feature: 'posts' | 'discussions' | 'aiReplies' | 'campaigns',
  platform: string = 'test_platform'
): Promise<TestResult> => {
  const startTime = Date.now();
  
  try {
    console.log(`🧪 Testing ${feature} tracking...`);
    
    // Get current usage context
    const { usage, refreshUsage } = useUsage();
    const { 
      trackRealPostCreation, 
      trackRealDiscussion, 
      trackRealAIReply, 
      trackRealCampaign 
    } = useFeatureTracking();
    
    const beforeCount = usage[feature];
    console.log(`📊 Before: ${feature} = ${beforeCount}`);
    
    let success = false;
    let afterCount = beforeCount;
    
    // Execute tracking based on feature type
    switch (feature) {
      case 'posts':
        success = await trackRealPostCreation(platform, { 
          immediate: true, 
          type: 'test_post' 
        });
        break;
        
      case 'discussions':
        success = await trackRealDiscussion(platform, { 
          messageCount: 1, 
          type: 'chat' 
        });
        break;
        
      case 'aiReplies':
        success = await trackRealAIReply(platform, { 
          type: 'dm', 
          mode: 'instant' 
        });
        break;
        
      case 'campaigns':
        success = await trackRealCampaign(platform, { 
          action: 'goal_set' 
        });
        break;
    }
    
    if (!success) {
      throw new Error(`${feature} tracking function returned false`);
    }
    
    // Wait for state update
    await new Promise(resolve => setTimeout(resolve, 1000));
    await refreshUsage();
    
    // Get updated count
    await new Promise(resolve => setTimeout(resolve, 500));
    afterCount = usage[feature];
    
    console.log(`📊 After: ${feature} = ${afterCount}`);
    
    const expectedCount = beforeCount + 1;
    const testSuccess = afterCount === expectedCount;
    
    if (!testSuccess) {
      throw new Error(`Expected count ${expectedCount}, got ${afterCount}`);
    }
    
    const duration = Date.now() - startTime;
    
    const result: TestResult = {
      feature,
      success: true,
      beforeCount,
      afterCount,
      expectedCount,
      duration,
      timestamp: new Date().toISOString()
    };
    
    console.log(`✅ ${feature} tracking test PASSED in ${duration}ms`);
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.error(`❌ ${feature} tracking test FAILED:`, errorMessage);
    
    const result: TestResult = {
      feature,
      success: false,
      beforeCount: 0,
      afterCount: 0,
      expectedCount: 0,
      duration,
      error: errorMessage,
      timestamp: new Date().toISOString()
    };
    
    return result;
  }
};

/**
 * Run comprehensive tests on all features
 */
export const runComprehensiveTests = async (): Promise<TestSuiteResult> => {
  console.log('🚀 Starting comprehensive usage tracking tests...');
  
  const features: ('posts' | 'discussions' | 'aiReplies' | 'campaigns')[] = [
    'posts', 
    'discussions', 
    'aiReplies', 
    'campaigns'
  ];
  
  const results: TestResult[] = [];
  
  for (const feature of features) {
    console.log(`\n--- Testing ${feature} ---`);
    const result = await testFeatureTracking(feature, 'comprehensive_test');
    results.push(result);
    
    // Wait between tests to avoid conflicts
    if (feature !== 'campaigns') {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Calculate summary
  const totalTests = results.length;
  const passedTests = results.filter(r => r.success).length;
  const failedTests = totalTests - passedTests;
  
  let summary = `🏁 Test Suite Complete: ${passedTests}/${totalTests} tests passed`;
  
  if (failedTests > 0) {
    const failedFeatures = results
      .filter(r => !r.success)
      .map(r => r.feature)
      .join(', ');
    summary += `\n❌ Failed features: ${failedFeatures}`;
  } else {
    summary += '\n🎉 All tests passed! Usage tracking is working correctly.';
  }
  
  console.log(`\n${summary}`);
  
  return {
    totalTests,
    passedTests,
    failedTests,
    results,
    summary
  };
};

/**
 * Generate a detailed test report
 */
export const generateTestReport = (results: TestSuiteResult): string => {
  const report = [
    '📊 USAGE TRACKING TEST REPORT',
    '============================',
    '',
    `Test Date: ${new Date().toLocaleString()}`,
    `Total Tests: ${results.totalTests}`,
    `Passed: ${results.passedTests}`,
    `Failed: ${results.failedTests}`,
    `Success Rate: ${((results.passedTests / results.totalTests) * 100).toFixed(1)}%`,
    '',
    'DETAILED RESULTS:',
    '=================',
    ''
  ];
  
  results.results.forEach((result, index) => {
    report.push(`${index + 1}. ${result.feature.toUpperCase()}`);
    report.push(`   Status: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
    report.push(`   Before: ${result.beforeCount}`);
    report.push(`   After: ${result.afterCount}`);
    report.push(`   Expected: ${result.expectedCount}`);
    report.push(`   Duration: ${result.duration}ms`);
    
    if (result.error) {
      report.push(`   Error: ${result.error}`);
    }
    
    report.push('');
  });
  
  report.push('SUMMARY:');
  report.push('========');
  report.push(results.summary);
  
  return report.join('\n');
};

/**
 * Export test results to JSON
 */
export const exportTestResults = (results: TestSuiteResult): void => {
  const data = {
    exportTime: new Date().toISOString(),
    testSuite: results,
    metadata: {
      version: '1.0.0',
      description: 'Usage Tracking Test Results'
    }
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { 
    type: 'application/json' 
  });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `usage-tracking-test-${Date.now()}.json`;
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('📁 Test results exported successfully');
};

/**
 * Quick health check for the tracking system
 */
export const quickHealthCheck = async (): Promise<boolean> => {
  try {
    console.log('🔍 Quick health check...');
    
    // Test just posts tracking as a quick check
    const result = await testFeatureTracking('posts', 'health_check');
    
    if (result.success) {
      console.log('✅ Health check passed - tracking system is working');
      return true;
    } else {
      console.log('❌ Health check failed - tracking system has issues');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Health check error:', error);
    return false;
  }
};

export default {
  testFeatureTracking,
  runComprehensiveTests,
  generateTestReport,
  exportTestResults,
  quickHealthCheck
};
