const puppeteer = require('puppeteer');

(async () => {
  console.log('🎯 ROBUST CORE WEB VITALS MEASUREMENT');
  console.log('=====================================');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions'
    ]
  });
  
  const page = await browser.newPage();
  
  // Enable performance monitoring
  const client = await page.target().createCDPSession();
  await client.send('Performance.enable');
  await client.send('Runtime.enable');
  
  // Realistic network throttling
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: 2000000, // 2 Mbps
    uploadThroughput: 1000000, // 1 Mbps  
    latency: 50 // 50ms latency
  });

  await page.setViewport({ width: 1366, height: 768 });

  console.log('🚀 Navigating and measuring performance...');

  // Clear all caches
  await client.send('Network.clearBrowserCache');
  await client.send('Storage.clearDataForOrigin', {
    origin: 'https://sentientm.com',
    storageTypes: 'all'
  });

  const navigationStart = Date.now();
  let fcpTime = null;
  let lcpTime = null;
  let domContentLoadedTime = null;
  let loadEventTime = null;

  // Listen for paint events via CDP
  client.on('Runtime.consoleAPICalled', (data) => {
    if (data.args && data.args[0] && data.args[0].value) {
      const message = data.args[0].value;
      if (message.includes('FCP:')) {
        fcpTime = parseInt(message.split('FCP:')[1]);
      } else if (message.includes('LCP:')) {
        lcpTime = parseInt(message.split('LCP:')[1]);
      }
    }
  });

  // Navigate and start measurement
  try {
    await page.goto(`https://sentientm.com?perf=${Date.now()}`, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    domContentLoadedTime = Date.now() - navigationStart;
    console.log(`📄 DOM Content Loaded: ${domContentLoadedTime}ms`);

    // Inject performance measurement script
    await page.addScriptTag({
      content: `
        // Enhanced performance measurement
        let fcpObserved = false, lcpObserved = false;
        let clsScore = 0, clsShifts = [];
        let interactions = [];

        // FCP Observer
        const fcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            if (entry.name === 'first-contentful-paint' && !fcpObserved) {
              fcpObserved = true;
              console.log('FCP:' + Math.round(entry.startTime));
              window.__FCP_TIME = Math.round(entry.startTime);
            }
          });
        });
        
        try {
          fcpObserver.observe({ entryTypes: ['paint'] });
        } catch (e) {
          console.log('FCP observer failed:', e);
        }

        // LCP Observer with better detection
        let lcpValue = 0;
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry && lastEntry.startTime > lcpValue) {
            lcpValue = lastEntry.startTime;
            console.log('LCP:' + Math.round(lcpValue));
            window.__LCP_TIME = Math.round(lcpValue);
            window.__LCP_ELEMENT = lastEntry.element;
          }
        });
        
        try {
          lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        } catch (e) {
          console.log('LCP observer failed:', e);
        }

        // CLS Observer
        const clsObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            if (!entry.hadRecentInput) {
              clsScore += entry.value;
              clsShifts.push({
                value: entry.value,
                time: entry.startTime
              });
              window.__CLS_SCORE = clsScore;
              window.__CLS_SHIFTS = clsShifts.length;
            }
          });
        });
        
        try {
          clsObserver.observe({ entryTypes: ['layout-shift'] });
        } catch (e) {
          console.log('CLS observer failed:', e);
        }

        // Manual LCP fallback - measure largest visible element
        setTimeout(() => {
          if (!window.__LCP_TIME) {
            const elements = document.querySelectorAll('*');
            let largestElement = null;
            let largestSize = 0;
            
            elements.forEach(el => {
              if (el.offsetParent !== null) { // visible element
                const size = el.offsetWidth * el.offsetHeight;
                if (size > largestSize) {
                  largestSize = size;
                  largestElement = el;
                }
              }
            });
            
            if (largestElement) {
              // Estimate LCP time as when this element would have been painted
              const estimatedLcp = performance.now();
              window.__LCP_TIME = Math.round(estimatedLcp);
              window.__LCP_ELEMENT = largestElement;
              console.log('Fallback LCP:' + window.__LCP_TIME);
            }
          }
        }, 2000);

        // Interaction measurement
        let interactionCount = 0;
        let maxInputDelay = 0;
        
        ['click', 'keydown', 'pointerdown'].forEach(eventType => {
          document.addEventListener(eventType, (e) => {
            const start = performance.now();
            interactionCount++;
            
            requestIdleCallback(() => {
              const delay = performance.now() - start;
              maxInputDelay = Math.max(maxInputDelay, delay);
              window.__INP_TIME = Math.round(maxInputDelay);
              window.__INTERACTION_COUNT = interactionCount;
            });
          }, { passive: true });
        });
      `
    });

    // Wait for page to fully load
    await page.waitForLoadState?.('networkidle') || page.waitForTimeout(3000);
    loadEventTime = Date.now() - navigationStart;

    console.log(`🏁 Load Event: ${loadEventTime}ms`);

    // Wait for measurements to stabilize
    await page.waitForTimeout(5000);

    // Simulate realistic user interaction
    console.log('🖱️  Simulating user interactions...');
    try {
      // Click first few interactive elements
      const buttons = await page.$$('button, [role="button"], a');
      for (let i = 0; i < Math.min(3, buttons.length); i++) {
        try {
          await buttons[i].click();
          await page.waitForTimeout(500);
        } catch (e) {
          // Element might not be clickable
        }
      }
    } catch (e) {
      console.log('Interaction simulation failed:', e.message);
    }

    // Wait for interaction measurements
    await page.waitForTimeout(2000);

    // Get final measurements
    const finalMetrics = await page.evaluate(() => {
      // Get Navigation Timing API data
      const navTiming = performance.getEntriesByType('navigation')[0] || {};
      
      // Get Paint Timing
      const paintEntries = performance.getEntriesByType('paint');
      const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
      const fpEntry = paintEntries.find(entry => entry.name === 'first-paint');

      // Get resource timing
      const resources = performance.getEntriesByType('resource');
      const jsResources = resources.filter(r => r.name.includes('.js'));
      const cssResources = resources.filter(r => r.name.includes('.css'));

      return {
        // Navigation timing
        ttfb: navTiming.responseStart ? Math.round(navTiming.responseStart - navTiming.requestStart) : 0,
        domInteractive: navTiming.domInteractive ? Math.round(navTiming.domInteractive - navTiming.navigationStart) : 0,
        domComplete: navTiming.domComplete ? Math.round(navTiming.domComplete - navTiming.navigationStart) : 0,
        loadComplete: navTiming.loadEventEnd ? Math.round(navTiming.loadEventEnd - navTiming.navigationStart) : 0,
        
        // Paint metrics
        fp: fpEntry ? Math.round(fpEntry.startTime) : null,
        fcp: fcpEntry ? Math.round(fcpEntry.startTime) : window.__FCP_TIME || null,
        lcp: window.__LCP_TIME || null,
        
        // Layout stability
        cls: Math.round((window.__CLS_SCORE || 0) * 1000) / 1000,
        clsShifts: window.__CLS_SHIFTS || 0,
        
        // Interactivity
        inp: window.__INP_TIME || null,
        interactionCount: window.__INTERACTION_COUNT || 0,
        
        // Resource counts
        totalResources: resources.length,
        jsResources: jsResources.length,
        cssResources: cssResources.length,
        
        // LCP element info
        lcpElement: window.__LCP_ELEMENT ? {
          tagName: window.__LCP_ELEMENT.tagName,
          className: window.__LCP_ELEMENT.className || '',
          id: window.__LCP_ELEMENT.id || '',
          offsetWidth: window.__LCP_ELEMENT.offsetWidth,
          offsetHeight: window.__LCP_ELEMENT.offsetHeight
        } : null
      };
    });

    const totalTestTime = Date.now() - navigationStart;

    console.log('\n📊 COMPREHENSIVE PERFORMANCE RESULTS:');
    console.log('======================================');
    console.log(`⏱️  Total Test Time: ${totalTestTime}ms`);
    console.log(`🌐 TTFB: ${finalMetrics.ttfb}ms`);
    console.log(`🎨 First Paint: ${finalMetrics.fp || 'N/A'}ms`);
    console.log(`🎯 First Contentful Paint: ${finalMetrics.fcp || 'Not detected'}ms`);
    console.log(`🏆 Largest Contentful Paint: ${finalMetrics.lcp || 'Not detected'}ms`);
    console.log(`📐 Cumulative Layout Shift: ${finalMetrics.cls} (${finalMetrics.clsShifts} shifts)`);
    console.log(`⚡ Interaction to Next Paint: ${finalMetrics.inp || 'No interactions'}ms`);
    
    console.log('\n🏗️  RESOURCE ANALYSIS:');
    console.log(`📦 Total Resources: ${finalMetrics.totalResources}`);
    console.log(`🟨 JavaScript Files: ${finalMetrics.jsResources}`);
    console.log(`🎨 CSS Files: ${finalMetrics.cssResources}`);

    if (finalMetrics.lcpElement) {
      console.log('\n🎭 LCP ELEMENT DETAILS:');
      console.log(`   Tag: <${finalMetrics.lcpElement.tagName.toLowerCase()}>`);
      console.log(`   Size: ${finalMetrics.lcpElement.offsetWidth}×${finalMetrics.lcpElement.offsetHeight}px`);
      console.log(`   Class: ${finalMetrics.lcpElement.className || 'none'}`);
      console.log(`   ID: ${finalMetrics.lcpElement.id || 'none'}`);
    }

    // Grade the performance
    const grades = {
      ttfb: finalMetrics.ttfb < 600 ? 'GOOD' : finalMetrics.ttfb < 1000 ? 'NEEDS IMPROVEMENT' : 'POOR',
      fcp: !finalMetrics.fcp ? 'NOT DETECTED' : finalMetrics.fcp < 1800 ? 'GOOD' : finalMetrics.fcp < 3000 ? 'NEEDS IMPROVEMENT' : 'POOR',
      lcp: !finalMetrics.lcp ? 'NOT DETECTED' : finalMetrics.lcp < 2500 ? 'GOOD' : finalMetrics.lcp < 4000 ? 'NEEDS IMPROVEMENT' : 'POOR',
      cls: finalMetrics.cls < 0.1 ? 'GOOD' : finalMetrics.cls < 0.25 ? 'NEEDS IMPROVEMENT' : 'POOR',
      inp: !finalMetrics.inp ? 'NO INTERACTIONS' : finalMetrics.inp < 200 ? 'GOOD' : finalMetrics.inp < 500 ? 'NEEDS IMPROVEMENT' : 'POOR'
    };

    console.log('\n🏆 CORE WEB VITALS ASSESSMENT:');
    console.log('==============================');
    console.log(`⚡ TTFB: ${grades.ttfb} (${finalMetrics.ttfb}ms)`);
    console.log(`🎯 FCP: ${grades.fcp} (${finalMetrics.fcp || 'N/A'}ms)`);
    console.log(`🏆 LCP: ${grades.lcp} (${finalMetrics.lcp || 'N/A'}ms)`);
    console.log(`📐 CLS: ${grades.cls} (${finalMetrics.cls})`);
    console.log(`⚡ INP: ${grades.inp} (${finalMetrics.inp || 'N/A'}ms)`);

    // Count passing metrics
    const coreVitalsTargets = [
      { name: 'LCP', value: finalMetrics.lcp, target: 2500, passed: finalMetrics.lcp && finalMetrics.lcp <= 2500 },
      { name: 'CLS', value: finalMetrics.cls, target: 0.1, passed: finalMetrics.cls <= 0.1 },
      { name: 'INP', value: finalMetrics.inp, target: 200, passed: finalMetrics.inp && finalMetrics.inp <= 200 }
    ];

    console.log('\n🎯 CORE WEB VITALS COMPLIANCE:');
    console.log('==============================');
    coreVitalsTargets.forEach(metric => {
      const status = metric.passed ? '✅ PASS' : '❌ FAIL';
      const valueStr = metric.value !== null ? metric.value + (metric.name === 'CLS' ? '' : 'ms') : 'N/A';
      console.log(`${metric.name}: ${status} (${valueStr} / ${metric.target}${metric.name === 'CLS' ? '' : 'ms'} target)`);
    });

    const passedCount = coreVitalsTargets.filter(m => m.passed).length;
    console.log(`\n🏆 OVERALL SCORE: ${passedCount}/3 Core Web Vitals targets met`);
    
    if (passedCount === 3) {
      console.log('🎉 EXCELLENT! All Core Web Vitals targets achieved!');
    } else {
      console.log('⚠️  Performance optimization needed for better user experience.');
    }

  } catch (error) {
    console.error('❌ Performance test failed:', error.message);
  }

  await browser.close();
})().catch(console.error);
