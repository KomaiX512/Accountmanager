// 🔥 REAL INP PERFORMANCE DIAGNOSIS - FIND ACTUAL BOTTLENECKS
import puppeteer from 'puppeteer';
import fs from 'fs';

const VPS_URL = 'https://sentientm.com';

async function diagnoseINPBottlenecks() {
  console.log('🔍 DIAGNOSING REAL INP BOTTLENECKS...');
  
  const browser = await puppeteer.launch({
    headless: false, // Show browser for real interaction testing
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    devtools: true
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  // Enable detailed performance monitoring
  await page.coverage.startJSCoverage();
  
  // Track long tasks that block interactions
  await page.evaluateOnNewDocument(() => {
    window.performanceIssues = {
      longTasks: [],
      slowInteractions: [],
      blockingScripts: [],
      heavyComponents: []
    };
    
    // Monitor long tasks (>50ms that block interactions)
    if ('PerformanceObserver' in window) {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (entry.duration > 50) {
            window.performanceIssues.longTasks.push({
              name: entry.name,
              duration: Math.round(entry.duration),
              startTime: Math.round(entry.startTime),
              attribution: entry.attribution?.[0]?.name || 'unknown'
            });
            console.warn(`🐌 Long Task Detected: ${entry.name} - ${Math.round(entry.duration)}ms`);
          }
        });
      }).observe({ type: 'longtask', buffered: true });
      
      // Monitor INP specifically
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (entry.name === 'inp' || entry.processingDuration > 16) {
            window.performanceIssues.slowInteractions.push({
              type: entry.name,
              duration: Math.round(entry.duration || entry.processingDuration),
              processingStart: Math.round(entry.processingStart),
              processingEnd: Math.round(entry.processingEnd),
              target: entry.target?.tagName || 'unknown'
            });
          }
        });
      }).observe({ type: 'event', buffered: true });
    }
    
    // Override console.log to catch React/component issues
    const originalLog = console.log;
    console.log = function(...args) {
      const message = args.join(' ');
      if (message.includes('Warning') || message.includes('slow') || message.includes('performance')) {
        window.performanceIssues.blockingScripts.push(message);
      }
      originalLog.apply(console, args);
    };
  });
  
  console.log(' Loading VPS website...');
  await page.goto(VPS_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  
  // Wait for React to fully render and app to be interactive
  await page.waitForTimeout(8000);
  
  // Wait specifically for React app to render
  try {
    await page.waitForSelector('#root .App', { timeout: 10000 });
    console.log(' React app detected, waiting for full render...');
    await page.waitForTimeout(3000);
  } catch (e) {
    console.log(' React app selector not found, proceeding anyway...');
  }
  
  // Wait for initial load
  await page.waitForTimeout(3000);
  
  console.log('  Testing real user interactions...');
  
  // Test clicking various elements that users actually interact with
  const interactions = [
    { selector: 'button', description: 'First button click' },
    { selector: '[role="button"]', description: 'Role button click' },
    { selector: '.btn', description: 'CSS button click' },
    { selector: 'a', description: 'Link click' },
    { selector: 'input', description: 'Input focus' },
    { selector: '.platform-dashboard', description: 'Dashboard click' }
  ];
  
  const interactionResults = [];
  
  for (const interaction of interactions) {
    try {
      console.log(`  Testing: ${interaction.description}`);
      
      const element = await page.$(interaction.selector);
      if (element) {
        const startTime = Date.now();
        
        // Simulate real user interaction with delay
        await element.click();
        await page.waitForTimeout(100); // Wait for interaction to process
        
        const endTime = Date.now();
        const interactionTime = endTime - startTime;
        
        interactionResults.push({
          selector: interaction.selector,
          description: interaction.description,
          time: interactionTime,
          success: true
        });
        
        console.log(`    ⏱️  ${interactionTime}ms`);
        
        // Wait between interactions
        await page.waitForTimeout(500);
      } else {
        console.log(`    ❌ Element not found: ${interaction.selector}`);
      }
    } catch (error) {
      console.log(`    🔥 Error: ${error.message}`);
      interactionResults.push({
        selector: interaction.selector,
        description: interaction.description,
        error: error.message,
        success: false
      });
    }
  }
  
  // Get performance issues collected during interaction
  const performanceIssues = await page.evaluate(() => window.performanceIssues);
  
  // Get JavaScript coverage to find unused code
  const jsCoverage = await page.coverage.stopJSCoverage();
  
  // Calculate unused JavaScript
  let totalBytes = 0;
  let usedBytes = 0;
  
  jsCoverage.forEach(entry => {
    totalBytes += entry.text.length;
    entry.ranges.forEach(range => {
      usedBytes += range.end - range.start - 1;
    });
  });
  
  const unusedBytes = totalBytes - usedBytes;
  const unusedPercentage = ((unusedBytes / totalBytes) * 100).toFixed(1);
  
  await browser.close();
  
  // Generate brutal diagnosis
  console.log('\n' + '='.repeat(80));
  console.log('🔥 BRUTAL INP DIAGNOSIS - REAL BOTTLENECKS FOUND');
  console.log('='.repeat(80));
  
  console.log('\n📊 INTERACTION PERFORMANCE RESULTS:');
  console.log('-'.repeat(50));
  
  interactionResults.forEach(result => {
    if (result.success) {
      if (result.time > 200) {
        console.log(`🔥 SLOW: ${result.description} - ${result.time}ms (NEEDS FIXING)`);
      } else if (result.time > 100) {
        console.log(`⚠️  DECENT: ${result.description} - ${result.time}ms`);
      } else {
        console.log(`✅ FAST: ${result.description} - ${result.time}ms`);
      }
    } else {
      console.log(`❌ FAILED: ${result.description} - ${result.error}`);
    }
  });
  
  console.log('\n🐌 LONG TASKS BLOCKING INTERACTIONS:');
  console.log('-'.repeat(50));
  if (performanceIssues.longTasks.length > 0) {
    performanceIssues.longTasks.forEach(task => {
      console.log(`🔥 ${task.name}: ${task.duration}ms (${task.attribution})`);
    });
  } else {
    console.log('✅ No long tasks detected');
  }
  
  console.log('\n🗑️  UNUSED JAVASCRIPT BLOAT:');
  console.log('-'.repeat(50));
  console.log(`📦 Total JS: ${Math.round(totalBytes / 1024)}KB`);
  console.log(`🗑️  Unused: ${Math.round(unusedBytes / 1024)}KB (${unusedPercentage}%)`);
  
  if (unusedPercentage > 50) {
    console.log('🔥 MASSIVE UNUSED CODE - This is killing performance!');
  } else if (unusedPercentage > 30) {
    console.log('⚠️  SIGNIFICANT UNUSED CODE - Needs cleanup');
  }
  
  console.log('\n🎯 ROOT CAUSES OF SLOW INP:');
  console.log('-'.repeat(50));
  
  const avgInteractionTime = interactionResults
    .filter(r => r.success && r.time)
    .reduce((sum, r) => sum + r.time, 0) / interactionResults.length;
  
  if (avgInteractionTime > 200) {
    console.log('🔥 MAIN THREAD BLOCKING: Heavy JavaScript execution blocking interactions');
  }
  if (performanceIssues.longTasks.length > 5) {
    console.log('🔥 TOO MANY LONG TASKS: React re-renders or heavy computations');
  }
  if (unusedPercentage > 40) {
    console.log('🔥 BUNDLE BLOAT: Unused code still being downloaded and parsed');
  }
  
  console.log('\n💊 SPECIFIC FIXES NEEDED:');
  console.log('-'.repeat(50));
  console.log('1. 🎯 Break up JavaScript bundles further - still too large');
  console.log('2. ⚡ Implement React.memo for heavy components');
  console.log('3. 🔄 Add useCallback/useMemo for expensive operations');
  console.log('4. 🧹 Remove unused JavaScript dependencies');
  console.log('5. 🎭 Implement proper component lazy loading with Suspense');
  
  // Save detailed results
  const diagnosis = {
    timestamp: new Date().toISOString(),
    averageInteractionTime: Math.round(avgInteractionTime),
    interactionResults,
    performanceIssues,
    javascriptStats: {
      totalKB: Math.round(totalBytes / 1024),
      usedKB: Math.round(usedBytes / 1024), 
      unusedKB: Math.round(unusedBytes / 1024),
      unusedPercentage: parseFloat(unusedPercentage)
    }
  };
  
  fs.writeFileSync('./inp-diagnosis-results.json', JSON.stringify(diagnosis, null, 2));
  console.log('\n📁 Detailed diagnosis saved to: inp-diagnosis-results.json');
  console.log('='.repeat(80));
}

diagnoseINPBottlenecks().catch(console.error);
