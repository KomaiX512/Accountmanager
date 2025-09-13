const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  console.log('🎯 COMPREHENSIVE CORE WEB VITALS TEST');
  console.log('=====================================');
  
  // Force fresh cache
  await page.setCacheEnabled(false);
  const client = await page.target().createCDPSession();
  await client.send('Network.clearBrowserCache');
  
  await page.goto('https://sentientm.com?test=' + Date.now(), { waitUntil: 'networkidle0' });
  
  // Comprehensive Web Vitals measurement
  const webVitals = await page.evaluate(() => {
    return new Promise((resolve) => {
      let lcp = 0, cls = 0, inp = 0;
      let lcpElement = null;
      let clsShifts = [];
      let inpInteraction = null;
      
      // LCP Observer
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          lcp = entry.startTime;
          lcpElement = entry.element;
        });
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      
      // CLS Observer
      const clsObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (!entry.hadRecentInput) {
            cls += entry.value;
            clsShifts.push({
              value: entry.value,
              sources: entry.sources?.length || 0
            });
          }
        });
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      
      // INP Observer
      const inpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (entry.processingDuration > inp) {
            inp = entry.processingDuration;
            inpInteraction = entry.name;
          }
        });
      });
      inpObserver.observe({ entryTypes: ['event'] });
      
      // Test interaction for INP
      setTimeout(() => {
        const button = document.querySelector('button');
        if (button) {
          button.click();
        }
      }, 2000);
      
      setTimeout(() => {
        lcpObserver.disconnect();
        clsObserver.disconnect();
        inpObserver.disconnect();
        
        resolve({
          lcp: Math.round(lcp),
          cls: Math.round(cls * 1000) / 1000,
          inp: Math.round(inp),
          lcpElement: lcpElement?.tagName?.toLowerCase() + (lcpElement?.className ? '.' + lcpElement.className.split(' ')[0] : ''),
          clsShifts: clsShifts.length,
          inpInteraction,
          grades: {
            lcp: lcp < 2500 ? 'GOOD' : lcp < 4000 ? 'NEEDS IMPROVEMENT' : 'POOR',
            cls: cls < 0.1 ? 'GOOD' : cls < 0.25 ? 'NEEDS IMPROVEMENT' : 'POOR',
            inp: inp < 200 ? 'GOOD' : inp < 500 ? 'NEEDS IMPROVEMENT' : 'POOR'
          }
        });
      }, 8000);
    });
  });
  
  console.log('📊 CURRENT WEB VITALS PERFORMANCE:');
  console.log('==================================');
  console.log(`🎯 LCP: ${webVitals.lcp}ms (${webVitals.grades.lcp})`);
  console.log(`📐 CLS: ${webVitals.cls} (${webVitals.grades.cls}) - ${webVitals.clsShifts} shifts`);
  console.log(`⚡ INP: ${webVitals.inp}ms (${webVitals.grades.inp})`);
  console.log(`🎭 LCP Element: ${webVitals.lcpElement}`);
  
  console.log('\n🎯 TARGETS vs CURRENT:');
  console.log('======================');
  console.log(`LCP: ${webVitals.lcp}ms / 2500ms target (${2500 - webVitals.lcp}ms to go)`);
  console.log(`CLS: ${webVitals.cls} / 0.1 target (${(webVitals.cls - 0.1).toFixed(3)} to reduce)`);
  console.log(`INP: ${webVitals.inp}ms / 200ms target (${webVitals.inp - 200}ms to reduce)`);
  
  await browser.close();
})();
