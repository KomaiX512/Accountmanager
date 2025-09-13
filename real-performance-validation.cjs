const puppeteer = require('puppeteer');

(async () => {
  console.log('🔬 REAL-WORLD CORE WEB VITALS VALIDATION');
  console.log('=========================================');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();

  // Simulate real network conditions via CDP
  const client = await page.target().createCDPSession();
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: 1500000, // 1.5 Mbps in bytes/sec
    uploadThroughput: 750000, // 750 Kbps in bytes/sec
    latency: 40 // 40ms latency
  });

  // Set viewport to standard desktop size
  await page.setViewport({ width: 1920, height: 1080 });

  console.log('📡 Loading page with realistic network throttling...');
  
  // Clear cache and navigate
  await client.send('Network.clearBrowserCache');
  await client.send('Storage.clearDataForOrigin', {
    origin: 'https://sentientm.com',
    storageTypes: 'all'
  });

  const navigationStart = Date.now();
  
  // Navigate and wait for network idle
  await page.goto('https://sentientm.com?perf-test=' + Date.now(), { 
    waitUntil: 'networkidle0',
    timeout: 30000 
  });

  console.log('⏱️  Measuring Web Vitals with 10-second observation window...');

  // Comprehensive Web Vitals measurement using proper APIs
  const webVitals = await page.evaluate(() => {
    return new Promise((resolve) => {
      let lcp = 0, cls = 0, inp = 0, fcp = 0, ttfb = 0;
      let lcpElement = null;
      let clsCount = 0;
      let inpCount = 0;
      let measurements = [];

      // Get TTFB from Navigation Timing
      const navEntry = performance.getEntriesByType('navigation')[0];
      if (navEntry) {
        ttfb = navEntry.responseStart - navEntry.requestStart;
      }

      // FCP Observer
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (entry.name === 'first-contentful-paint') {
            fcp = entry.startTime;
            measurements.push(`FCP: ${Math.round(fcp)}ms`);
          }
        });
      });
      fcpObserver.observe({ entryTypes: ['paint'] });

      // LCP Observer
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          lcp = lastEntry.startTime;
          lcpElement = lastEntry.element;
          measurements.push(`LCP Update: ${Math.round(lcp)}ms`);
        }
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // CLS Observer
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            clsCount++;
            measurements.push(`CLS Shift: +${entry.value.toFixed(4)} (total: ${clsValue.toFixed(4)})`);
          }
        });
        cls = clsValue;
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });

      // INP measurement through interaction
      let interactions = [];
      
      // Event listeners for interactions
      ['click', 'keydown', 'pointerdown'].forEach(eventType => {
        document.addEventListener(eventType, (event) => {
          const startTime = performance.now();
          requestIdleCallback(() => {
            const duration = performance.now() - startTime;
            interactions.push(duration);
            inpCount++;
            measurements.push(`Interaction (${eventType}): ${Math.round(duration)}ms`);
            inp = Math.max(inp, duration);
          });
        }, { passive: true });
      });

      // Simulate user interactions after page load
      setTimeout(() => {
        // Try to click various interactive elements
        const interactiveElements = [
          ...document.querySelectorAll('button'),
          ...document.querySelectorAll('a'),
          ...document.querySelectorAll('[role="button"]'),
          ...document.querySelectorAll('input'),
        ];

        if (interactiveElements.length > 0) {
          // Click first few interactive elements with delays
          interactiveElements.slice(0, 3).forEach((element, index) => {
            setTimeout(() => {
              if (element.offsetParent !== null) { // visible element
                element.click();
              }
            }, 1000 + (index * 500));
          });
        }
      }, 2000);

      // Final measurement after observation period
      setTimeout(() => {
        // Calculate final INP as 98th percentile of interactions
        if (interactions.length > 0) {
          interactions.sort((a, b) => a - b);
          const p98Index = Math.min(Math.floor(interactions.length * 0.98), interactions.length - 1);
          inp = interactions[p98Index] || inp;
        }

        // Disconnect observers
        fcpObserver.disconnect();
        lcpObserver.disconnect();
        clsObserver.disconnect();

        // Get element details
        const lcpElementInfo = lcpElement ? {
          tagName: lcpElement.tagName.toLowerCase(),
          className: lcpElement.className || '',
          id: lcpElement.id || '',
          src: lcpElement.src || lcpElement.currentSrc || '',
          text: lcpElement.textContent ? lcpElement.textContent.substring(0, 50) + '...' : ''
        } : null;

        resolve({
          ttfb: Math.round(ttfb),
          fcp: Math.round(fcp),
          lcp: Math.round(lcp),
          cls: Math.round(cls * 1000) / 1000,
          inp: Math.round(inp),
          lcpElement: lcpElementInfo,
          clsCount,
          inpCount,
          interactionCount: interactions.length,
          measurements: measurements.slice(-10), // Last 10 measurements
          grades: {
            ttfb: ttfb < 600 ? 'GOOD' : ttfb < 1000 ? 'NEEDS IMPROVEMENT' : 'POOR',
            fcp: fcp < 1800 ? 'GOOD' : fcp < 3000 ? 'NEEDS IMPROVEMENT' : 'POOR',
            lcp: lcp < 2500 ? 'GOOD' : lcp < 4000 ? 'NEEDS IMPROVEMENT' : 'POOR',
            cls: cls < 0.1 ? 'GOOD' : cls < 0.25 ? 'NEEDS IMPROVEMENT' : 'POOR',
            inp: inp < 200 ? 'GOOD' : inp < 500 ? 'NEEDS IMPROVEMENT' : 'POOR'
          }
        });
      }, 12000); // 12-second observation window
    });
  });

  const totalTime = Date.now() - navigationStart;

  console.log('\n📊 COMPREHENSIVE PERFORMANCE RESULTS:');
  console.log('======================================');
  console.log(`🚀 Total Page Load: ${totalTime}ms`);
  console.log(`⚡ TTFB: ${webVitals.ttfb}ms (${webVitals.grades.ttfb})`);
  console.log(`🎨 FCP: ${webVitals.fcp}ms (${webVitals.grades.fcp})`);
  console.log(`🎯 LCP: ${webVitals.lcp}ms (${webVitals.grades.lcp})`);
  console.log(`📐 CLS: ${webVitals.cls} (${webVitals.grades.cls}) - ${webVitals.clsCount} shifts`);
  console.log(`⚡ INP: ${webVitals.inp}ms (${webVitals.grades.inp}) - ${webVitals.interactionCount} interactions`);

  if (webVitals.lcpElement) {
    console.log('\n🎭 LCP ELEMENT DETAILS:');
    console.log(`   Tag: <${webVitals.lcpElement.tagName}>`);
    console.log(`   Class: ${webVitals.lcpElement.className || 'none'}`);
    console.log(`   ID: ${webVitals.lcpElement.id || 'none'}`);
    if (webVitals.lcpElement.src) {
      console.log(`   Src: ${webVitals.lcpElement.src.substring(0, 80)}...`);
    }
    if (webVitals.lcpElement.text) {
      console.log(`   Text: ${webVitals.lcpElement.text}`);
    }
  }

  console.log('\n📈 RECENT MEASUREMENTS:');
  webVitals.measurements.forEach(m => console.log(`   ${m}`));

  console.log('\n🎯 CORE WEB VITALS TARGETS:');
  console.log('============================');
  console.log(`LCP: ${webVitals.lcp}ms / 2500ms target (${webVitals.lcp <= 2500 ? '✅ PASSED' : '❌ ' + (webVitals.lcp - 2500) + 'ms over'})`);
  console.log(`CLS: ${webVitals.cls} / 0.1 target (${webVitals.cls <= 0.1 ? '✅ PASSED' : '❌ ' + (webVitals.cls - 0.1).toFixed(3) + ' over'})`);
  console.log(`INP: ${webVitals.inp}ms / 200ms target (${webVitals.inp <= 200 ? '✅ PASSED' : '❌ ' + (webVitals.inp - 200) + 'ms over'})`);

  const passedCount = [
    webVitals.lcp <= 2500,
    webVitals.cls <= 0.1,
    webVitals.inp <= 200
  ].filter(Boolean).length;

  console.log(`\n🏆 OVERALL: ${passedCount}/3 Core Web Vitals targets met`);
  
  if (passedCount === 3) {
    console.log('🎉 CONGRATULATIONS! All Core Web Vitals targets achieved!');
  } else {
    console.log('⚠️  Some metrics need improvement for optimal user experience.');
  }

  await browser.close();
})().catch(console.error);
