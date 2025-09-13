const puppeteer = require('puppeteer');

(async () => {
  console.log('🔍 ADVANCED WEB VITALS DIAGNOSTIC TEST');
  console.log('======================================');

  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
    devtools: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-blink-features=AutomationControlled'
    ]
  });
  
  const page = await browser.newPage();
  
  // Enable performance timeline
  const client = await page.target().createCDPSession();
  await client.send('Performance.enable');
  await client.send('Runtime.enable');
  
  // Throttle network to simulate real conditions
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: 1024000, // 1 Mbps
    uploadThroughput: 512000, // 512 Kbps  
    latency: 100 // 100ms latency
  });

  // Set realistic viewport
  await page.setViewport({ width: 1366, height: 768 });

  console.log('🌐 Navigating to site with network throttling...');

  // Force fresh navigation
  await client.send('Network.clearBrowserCache');
  await page.evaluateOnNewDocument(() => {
    // Clear any cached data
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => registration.unregister());
      });
    }
    localStorage.clear();
    sessionStorage.clear();
  });

  const startTime = Date.now();
  
  // Navigate with detailed timing
  try {
    await page.goto(`https://sentientm.com?t=${Date.now()}`, { 
      waitUntil: 'domcontentloaded',
      timeout: 45000 
    });
    
    console.log('📄 DOM loaded, measuring performance...');
    
    // Wait for additional resources and interactions
    await page.waitForTimeout(3000);
    
    // Measure comprehensive metrics
    const metrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        const measurements = {
          navigationStart: performance.timeOrigin,
          timingData: {},
          paintMetrics: {},
          vitals: { lcp: null, cls: 0, fcp: null, inp: null },
          resourceCount: 0,
          domElements: 0,
          interactions: [],
          errors: []
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

        let clsValue = 0;
        let clsEntries = [];
        let lcpValue = 0;
        let lcpElement = null;
        let inpValue = 0;

        // Enhanced LCP Observer
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            lcpValue = entry.startTime;
            lcpElement = entry.element;
            measurements.vitals.lcp = Math.round(lcpValue);
          });
        });
        
        try {
          lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        } catch (e) {
          measurements.errors.push('LCP observer failed: ' + e.message);
        }

        // Enhanced CLS Observer
        const clsObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
              clsEntries.push({
                value: entry.value,
                time: entry.startTime,
                sources: entry.sources ? entry.sources.length : 0
              });
              measurements.vitals.cls = Math.round(clsValue * 1000) / 1000;
            }
          });
        });
        
        try {
          clsObserver.observe({ entryTypes: ['layout-shift'] });
        } catch (e) {
          measurements.errors.push('CLS observer failed: ' + e.message);
        }

        // Manual interaction testing for INP
        let interactionStartTime = 0;
        const measureInteraction = (eventType) => {
          return (event) => {
            interactionStartTime = performance.now();
            requestIdleCallback(() => {
              const duration = performance.now() - interactionStartTime;
              measurements.interactions.push({
                type: eventType,
                duration: Math.round(duration),
                target: event.target.tagName.toLowerCase()
              });
              inpValue = Math.max(inpValue, duration);
              measurements.vitals.inp = Math.round(inpValue);
            });
          };
        };

        // Add interaction listeners
        ['click', 'keydown', 'pointerdown'].forEach(eventType => {
          document.addEventListener(eventType, measureInteraction(eventType), { passive: true });
        });

        // Simulate realistic user interactions
        setTimeout(() => {
          const buttons = document.querySelectorAll('button, [role="button"], a');
          if (buttons.length > 0) {
            // Click first few buttons with delays
            for (let i = 0; i < Math.min(3, buttons.length); i++) {
              setTimeout(() => {
                if (buttons[i].offsetParent !== null) {
                  buttons[i].click();
                }
              }, 500 + (i * 1000));
            }
          }
        }, 1000);

        // Wait for measurements to stabilize
        setTimeout(() => {
          // Final LCP element details
          if (lcpElement) {
            measurements.lcpElementInfo = {
              tagName: lcpElement.tagName,
              className: lcpElement.className || '',
              id: lcpElement.id || '',
              innerHTML: lcpElement.innerHTML ? lcpElement.innerHTML.substring(0, 100) + '...' : '',
              offsetWidth: lcpElement.offsetWidth,
              offsetHeight: lcpElement.offsetHeight,
              src: lcpElement.src || lcpElement.currentSrc || ''
            };
          }

          measurements.clsEntries = clsEntries;
          
          // Disconnect observers
          lcpObserver.disconnect();
          clsObserver.disconnect();
          
          resolve(measurements);
        }, 8000);
      });
    });

    const totalTime = Date.now() - startTime;

    console.log('\n🔬 DETAILED PERFORMANCE ANALYSIS:');
    console.log('=================================');
    console.log(`⏱️  Total Test Duration: ${totalTime}ms`);
    console.log(`🌐 DNS Lookup: ${metrics.timingData.dns || 0}ms`);
    console.log(`🔗 Connection: ${metrics.timingData.connect || 0}ms`);
    console.log(`⚡ TTFB: ${metrics.timingData.ttfb || 0}ms`);
    console.log(`📄 DOM Interactive: ${metrics.timingData.domInteractive || 0}ms`);
    console.log(`✅ DOM Complete: ${metrics.timingData.domComplete || 0}ms`);
    console.log(`🏁 Load Complete: ${metrics.timingData.loadComplete || 0}ms`);
    
    console.log('\n🎨 PAINT METRICS:');
    console.log(`🎯 FCP: ${metrics.vitals.fcp || 'Not measured'}ms`);
    console.log(`🎯 LCP: ${metrics.vitals.lcp || 'Not measured'}ms`);
    
    if (metrics.lcpElementInfo) {
      console.log('\n🎭 LCP ELEMENT:');
      console.log(`   Tag: <${metrics.lcpElementInfo.tagName.toLowerCase()}>`);
      console.log(`   Size: ${metrics.lcpElementInfo.offsetWidth}x${metrics.lcpElementInfo.offsetHeight}px`);
      console.log(`   Class: ${metrics.lcpElementInfo.className || 'none'}`);
      console.log(`   ID: ${metrics.lcpElementInfo.id || 'none'}`);
      if (metrics.lcpElementInfo.src) {
        console.log(`   Src: ${metrics.lcpElementInfo.src.substring(0, 60)}...`);
      }
    }

    console.log('\n📐 LAYOUT STABILITY:');
    console.log(`📊 CLS Score: ${metrics.vitals.cls}`);
    console.log(`🔄 Layout Shifts: ${metrics.clsEntries.length}`);
    
    if (metrics.clsEntries.length > 0) {
      console.log('   Shift Details:');
      metrics.clsEntries.forEach((shift, i) => {
        console.log(`     ${i + 1}. +${shift.value.toFixed(4)} at ${Math.round(shift.time)}ms (${shift.sources} sources)`);
      });
    }

    console.log('\n⚡ INTERACTIVITY:');
    console.log(`🖱️  INP: ${metrics.vitals.inp || 'No interactions'}ms`);
    console.log(`🎯 Interactions Tested: ${metrics.interactions.length}`);
    
    if (metrics.interactions.length > 0) {
      console.log('   Interaction Details:');
      metrics.interactions.forEach((interaction, i) => {
        console.log(`     ${i + 1}. ${interaction.type} on <${interaction.target}>: ${interaction.duration}ms`);
      });
    }

    console.log('\n📊 RESOURCE ANALYSIS:');
    console.log(`📦 Resources Loaded: ${metrics.resourceCount}`);
    console.log(`🏗️  DOM Elements: ${metrics.domElements}`);

    if (metrics.errors.length > 0) {
      console.log('\n⚠️  MEASUREMENT ISSUES:');
      metrics.errors.forEach(error => console.log(`   • ${error}`));
    }

    // Grade the metrics
    const grades = {
      fcp: !metrics.vitals.fcp ? 'N/A' : metrics.vitals.fcp < 1800 ? 'GOOD' : metrics.vitals.fcp < 3000 ? 'NEEDS IMPROVEMENT' : 'POOR',
      lcp: !metrics.vitals.lcp ? 'N/A' : metrics.vitals.lcp < 2500 ? 'GOOD' : metrics.vitals.lcp < 4000 ? 'NEEDS IMPROVEMENT' : 'POOR',
      cls: metrics.vitals.cls < 0.1 ? 'GOOD' : metrics.vitals.cls < 0.25 ? 'NEEDS IMPROVEMENT' : 'POOR',
      inp: !metrics.vitals.inp ? 'N/A' : metrics.vitals.inp < 200 ? 'GOOD' : metrics.vitals.inp < 500 ? 'NEEDS IMPROVEMENT' : 'POOR'
    };

    console.log('\n🏆 CORE WEB VITALS ASSESSMENT:');
    console.log('==============================');
    console.log(`🎨 FCP: ${grades.fcp} (${metrics.vitals.fcp || 'N/A'}ms)`);
    console.log(`🎯 LCP: ${grades.lcp} (${metrics.vitals.lcp || 'N/A'}ms)`);
    console.log(`📐 CLS: ${grades.cls} (${metrics.vitals.cls})`);
    console.log(`⚡ INP: ${grades.inp} (${metrics.vitals.inp || 'N/A'}ms)`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  // Keep browser open for manual inspection
  console.log('\n🔍 Browser kept open for manual inspection. Press Ctrl+C to close.');
  
  // Don't close browser automatically for debugging
  // await browser.close();
})().catch(console.error);
