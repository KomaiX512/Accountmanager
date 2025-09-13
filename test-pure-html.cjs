const puppeteer = require('puppeteer');

(async () => {
  console.log('🧪 PURE HTML/CSS PERFORMANCE TEST');
  console.log('=================================');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();
  
  // Enable performance monitoring
  const client = await page.target().createCDPSession();
  await client.send('Performance.enable');
  
  // Realistic network throttling
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: 2000000, // 2 Mbps
    uploadThroughput: 1000000, // 1 Mbps  
    latency: 50 // 50ms latency
  });

  await page.setViewport({ width: 1366, height: 768 });

  console.log('🚀 Testing pure HTML without JavaScript...');

  // Clear all caches
  await client.send('Network.clearBrowserCache');
  await client.send('Storage.clearDataForOrigin', {
    origin: 'https://sentientm.com',
    storageTypes: 'all'
  });

  const navigationStart = Date.now();

  // Navigate to pure HTML version
  try {
    const testUrl = `https://sentientm.com/index-nojs.html?nocache=${Date.now()}`;
    console.log(`📍 Testing URL: ${testUrl}`);
    
    await page.goto(testUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    const domContentLoadedTime = Date.now() - navigationStart;
    console.log(`📄 DOM Content Loaded: ${domContentLoadedTime}ms`);

    // Wait for painting to complete
    await page.waitForTimeout(3000);

    // Measure comprehensive metrics
    const metrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        const measurements = {
          navigationStart: performance.timeOrigin,
          timingData: {},
          paintMetrics: {},
          vitals: { lcp: null, cls: 0, fcp: null },
          resourceCount: 0,
          domElements: 0,
          lcpElementInfo: null
        };

        // Get Navigation Timing
        const navTiming = performance.getEntriesByType('navigation')[0];
        if (navTiming) {
          measurements.timingData = {
            dns: Math.round(navTiming.domainLookupEnd - navTiming.domainLookupStart),
            connect: Math.round(navTiming.connectEnd - navTiming.connectStart),
            ttfb: Math.round(navTiming.responseStart - navTiming.requestStart),
            domInteractive: Math.round(navTiming.domInteractive - navTiming.navigationStart),
            domComplete: Math.round(navTiming.domComplete - navTiming.navigationStart),
            loadComplete: Math.round(navTiming.loadEventEnd - navTiming.navigationStart)
          };
        }

        // Get Paint Timing
        const paintEntries = performance.getEntriesByType('paint');
        paintEntries.forEach(entry => {
          measurements.paintMetrics[entry.name] = Math.round(entry.startTime);
          if (entry.name === 'first-contentful-paint') {
            measurements.vitals.fcp = Math.round(entry.startTime);
          }
        });

        // Count resources and DOM elements
        measurements.resourceCount = performance.getEntriesByType('resource').length;
        measurements.domElements = document.querySelectorAll('*').length;

        let lcpValue = 0;
        let lcpElement = null;

        // LCP Observer
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            if (entry.startTime > lcpValue) {
              lcpValue = entry.startTime;
              lcpElement = entry.element;
              measurements.vitals.lcp = Math.round(lcpValue);
            }
          });
        });
        
        try {
          lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        } catch (e) {
          console.log('LCP observer failed:', e);
        }

        // CLS Observer
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
              measurements.vitals.cls = Math.round(clsValue * 1000) / 1000;
            }
          });
        });
        
        try {
          clsObserver.observe({ entryTypes: ['layout-shift'] });
        } catch (e) {
          console.log('CLS observer failed:', e);
        }

        // Manual LCP detection - find largest visible element
        setTimeout(() => {
          if (!measurements.vitals.lcp) {
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
              measurements.vitals.lcp = Math.round(performance.now());
              lcpElement = largestElement;
            }
          }

          // Get LCP element details
          if (lcpElement) {
            measurements.lcpElementInfo = {
              tagName: lcpElement.tagName,
              id: lcpElement.id || '',
              className: lcpElement.className || '',
              offsetWidth: lcpElement.offsetWidth,
              offsetHeight: lcpElement.offsetHeight,
              innerHTML: lcpElement.innerHTML ? lcpElement.innerHTML.substring(0, 50) + '...' : ''
            };
          }

          // Disconnect observers
          lcpObserver.disconnect();
          clsObserver.disconnect();
          
          resolve(measurements);
        }, 5000);
      });
    });

    const totalTime = Date.now() - navigationStart;

    console.log('\n📊 PURE HTML PERFORMANCE RESULTS:');
    console.log('=================================');
    console.log(`⏱️  Total Test Time: ${totalTime}ms`);
    console.log(`🌐 DNS Lookup: ${metrics.timingData.dns || 0}ms`);
    console.log(`🔗 Connection: ${metrics.timingData.connect || 0}ms`);
    console.log(`⚡ TTFB: ${metrics.timingData.ttfb || 0}ms`);
    console.log(`📄 DOM Interactive: ${metrics.timingData.domInteractive || 0}ms`);
    console.log(`✅ DOM Complete: ${metrics.timingData.domComplete || 0}ms`);
    console.log(`🏁 Load Complete: ${metrics.timingData.loadComplete || 0}ms`);
    
    console.log('\n🎨 PAINT METRICS:');
    console.log(`🎯 FCP: ${metrics.vitals.fcp || 'Not detected'}ms`);
    console.log(`🏆 LCP: ${metrics.vitals.lcp || 'Not detected'}ms`);
    console.log(`📐 CLS: ${metrics.vitals.cls}`);
    
    if (metrics.lcpElementInfo) {
      console.log('\n🎭 LCP ELEMENT:');
      console.log(`   Tag: <${metrics.lcpElementInfo.tagName.toLowerCase()}>`);
      console.log(`   Size: ${metrics.lcpElementInfo.offsetWidth}×${metrics.lcpElementInfo.offsetHeight}px`);
      console.log(`   ID: ${metrics.lcpElementInfo.id || 'none'}`);
      console.log(`   Class: ${metrics.lcpElementInfo.className || 'none'}`);
      if (metrics.lcpElementInfo.innerHTML) {
        console.log(`   Content: ${metrics.lcpElementInfo.innerHTML}`);
      }
    }

    console.log('\n📊 RESOURCE ANALYSIS:');
    console.log(`📦 Total Resources: ${metrics.resourceCount}`);
    console.log(`🏗️  DOM Elements: ${metrics.domElements}`);

    // Grade the performance
    const grades = {
      ttfb: (metrics.timingData.ttfb || 0) < 600 ? 'GOOD' : (metrics.timingData.ttfb || 0) < 1000 ? 'NEEDS IMPROVEMENT' : 'POOR',
      fcp: !metrics.vitals.fcp ? 'NOT DETECTED' : metrics.vitals.fcp < 1800 ? 'GOOD' : metrics.vitals.fcp < 3000 ? 'NEEDS IMPROVEMENT' : 'POOR',
      lcp: !metrics.vitals.lcp ? 'NOT DETECTED' : metrics.vitals.lcp < 2500 ? 'GOOD' : metrics.vitals.lcp < 4000 ? 'NEEDS IMPROVEMENT' : 'POOR',
      cls: metrics.vitals.cls < 0.1 ? 'GOOD' : metrics.vitals.cls < 0.25 ? 'NEEDS IMPROVEMENT' : 'POOR'
    };

    console.log('\n🏆 PERFORMANCE ASSESSMENT:');
    console.log('===========================');
    console.log(`⚡ TTFB: ${grades.ttfb} (${metrics.timingData.ttfb || 0}ms)`);
    console.log(`🎯 FCP: ${grades.fcp} (${metrics.vitals.fcp || 'N/A'}ms)`);
    console.log(`🏆 LCP: ${grades.lcp} (${metrics.vitals.lcp || 'N/A'}ms)`);
    console.log(`📐 CLS: ${grades.cls} (${metrics.vitals.cls})`);

    // Core Web Vitals compliance
    const coreVitalsTargets = [
      { name: 'LCP', value: metrics.vitals.lcp, target: 2500, passed: metrics.vitals.lcp && metrics.vitals.lcp <= 2500 },
      { name: 'CLS', value: metrics.vitals.cls, target: 0.1, passed: metrics.vitals.cls <= 0.1 }
    ];

    console.log('\n🎯 CORE WEB VITALS COMPLIANCE:');
    console.log('==============================');
    coreVitalsTargets.forEach(metric => {
      const status = metric.passed ? '✅ PASS' : '❌ FAIL';
      const valueStr = metric.value !== null ? metric.value + (metric.name === 'CLS' ? '' : 'ms') : 'N/A';
      console.log(`${metric.name}: ${status} (${valueStr} / ${metric.target}${metric.name === 'CLS' ? '' : 'ms'} target)`);
    });

    const passedCount = coreVitalsTargets.filter(m => m.passed).length;
    console.log(`\n🏆 PURE HTML SCORE: ${passedCount}/2 Core Web Vitals targets met`);
    
    console.log('\n🔍 ANALYSIS:');
    if (metrics.vitals.fcp && metrics.vitals.fcp < 1800) {
      console.log('✅ Pure HTML achieves excellent FCP - JavaScript was the bottleneck');
    } else {
      console.log('⚠️  Even pure HTML has slow FCP - server/network optimization needed');
    }
    
    if (metrics.vitals.lcp && metrics.vitals.lcp < 2500) {
      console.log('✅ Pure HTML achieves excellent LCP - React hydration was blocking');
    } else {
      console.log('⚠️  Even pure HTML has slow LCP - content/server optimization needed');
    }

  } catch (error) {
    console.error('❌ Pure HTML test failed:', error.message);
  }

  await browser.close();
})().catch(console.error);
