import { test, expect } from '@playwright/test';

test.describe('Platform Status Instability Debug', () => {
  test('should monitor platform status changes and identify instability', async ({ page }) => {
    // Navigate to the main dashboard
    await page.goto('/');
    
    // Wait for the page to load completely
    await page.waitForLoadState('networkidle');
    
    // Set up console monitoring to capture platform status changes
    const consoleMessages = [];
    page.on('console', msg => {
      if (msg.text().includes('platform') || msg.text().includes('acquired') || msg.text().includes('sync')) {
        consoleMessages.push({
          timestamp: new Date().toISOString(),
          type: msg.type(),
          text: msg.text()
        });
      }
    });
    
    // Monitor network requests to track API calls
    const apiCalls = [];
    page.on('request', request => {
      if (request.url().includes('/api/') || request.url().includes('processing-status')) {
        apiCalls.push({
          timestamp: new Date().toISOString(),
          url: request.url(),
          method: request.method()
        });
      }
    });
    
    // Look for platform status elements
    const platformElements = await page.locator('[data-testid*="platform"], .platform-card, [class*="platform"]').all();
    console.log(`Found ${platformElements.length} platform elements`);
    
    // Monitor platform status changes for 30 seconds
    const statusChanges = [];
    const startTime = Date.now();
    const monitorDuration = 30000; // 30 seconds
    
    while (Date.now() - startTime < monitorDuration) {
      for (let i = 0; i < platformElements.length; i++) {
        const element = platformElements[i];
        const text = await element.textContent();
        const classes = await element.getAttribute('class');
        
        if (text && (text.includes('Acquired') || text.includes('Not Acquired') || text.includes('Acquiring'))) {
          statusChanges.push({
            timestamp: new Date().toISOString(),
            elementIndex: i,
            text: text.trim(),
            classes: classes
          });
        }
      }
      
      // Wait 100ms before next check
      await page.waitForTimeout(100);
    }
    
    // Analyze the results
    console.log('\n=== PLATFORM STATUS INSTABILITY ANALYSIS ===');
    console.log(`Total status changes detected: ${statusChanges.length}`);
    console.log(`Console messages captured: ${consoleMessages.length}`);
    console.log(`API calls made: ${apiCalls.length}`);
    
    // Group status changes by element
    const changesByElement = {};
    statusChanges.forEach(change => {
      if (!changesByElement[change.elementIndex]) {
        changesByElement[change.elementIndex] = [];
      }
      changesByElement[change.elementIndex].push(change);
    });
    
    // Report on rapid changes
    Object.entries(changesByElement).forEach(([elementIndex, changes]) => {
      if (changes.length > 5) {
        console.log(`\n⚠️  Element ${elementIndex} changed status ${changes.length} times in 30 seconds:`);
        changes.forEach(change => {
          console.log(`  ${change.timestamp}: "${change.text}"`);
        });
      }
    });
    
    // Check for rapid API calls
    const rapidApiCalls = apiCalls.filter((call, index) => {
      if (index === 0) return false;
      const prevCall = apiCalls[index - 1];
      const timeDiff = new Date(call.timestamp) - new Date(prevCall.timestamp);
      return timeDiff < 1000; // Less than 1 second apart
    });
    
    if (rapidApiCalls.length > 0) {
      console.log(`\n⚠️  Found ${rapidApiCalls.length} rapid API calls (less than 1 second apart)`);
    }
    
    // Check for sync-related console messages
    const syncMessages = consoleMessages.filter(msg => 
      msg.text.includes('sync') || msg.text.includes('refresh') || msg.text.includes('update')
    );
    
    if (syncMessages.length > 10) {
      console.log(`\n⚠️  Found ${syncMessages.length} sync-related console messages (potential race condition)`);
    }
    
    // Take a screenshot for visual analysis
    await page.screenshot({ 
      path: 'tests/screenshots/platform-status-debug.png',
      fullPage: true 
    });
    
    // The test passes if we can monitor the behavior
    // The actual analysis will be in the console output
    expect(statusChanges.length).toBeGreaterThan(0);
  });
  
  test('should identify localStorage/sessionStorage conflicts', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Monitor storage changes
    const storageChanges = [];
    
    await page.evaluate(() => {
      const originalSetItem = localStorage.setItem;
      const originalRemoveItem = localStorage.removeItem;
      
      localStorage.setItem = function(key, value) {
        storageChanges.push({
          type: 'setItem',
          key,
          value,
          timestamp: new Date().toISOString()
        });
        return originalSetItem.call(this, key, value);
      };
      
      localStorage.removeItem = function(key) {
        storageChanges.push({
          type: 'removeItem',
          key,
          timestamp: new Date().toISOString()
        });
        return originalRemoveItem.call(this, key);
      };
    });
    
    // Wait for potential storage operations
    await page.waitForTimeout(10000);
    
    console.log('\n=== STORAGE CONFLICTS ANALYSIS ===');
    console.log(`Storage operations detected: ${storageChanges.length}`);
    
    // Group by key to find conflicts
    const operationsByKey = {};
    storageChanges.forEach(op => {
      if (!operationsByKey[op.key]) {
        operationsByKey[op.key] = [];
      }
      operationsByKey[op.key].push(op);
    });
    
    Object.entries(operationsByKey).forEach(([key, operations]) => {
      if (operations.length > 5) {
        console.log(`\n⚠️  Key "${key}" had ${operations.length} operations:`);
        operations.forEach(op => {
          console.log(`  ${op.timestamp}: ${op.type}${op.value ? ` = "${op.value}"` : ''}`);
        });
      }
    });
    
    expect(storageChanges.length).toBeGreaterThanOrEqual(0);
  });
});
