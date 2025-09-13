const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  console.log('🔍 Measuring LCP after bundle optimization...');
  
  // Enable performance monitoring
  await page.setCacheEnabled(false); // Force fresh load
  
  const startTime = Date.now();
  
  await page.goto('https://sentientm.com', { waitUntil: 'domcontentloaded' });
  
  // Wait and measure LCP
  const lcpMeasurement = await page.evaluate(() => {
    return new Promise((resolve) => {
      let lcpValue = 0;
      let lcpElement = null;
      
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          lcpValue = entry.startTime;
          lcpElement = entry.element;
        });
      });
      
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
      
      // Wait for load completion
      setTimeout(() => {
        observer.disconnect();
        resolve({
          lcp: Math.round(lcpValue),
          element: lcpElement?.tagName?.toLowerCase() + (lcpElement?.className ? '.' + lcpElement.className.split(' ')[0] : ''),
          elementText: lcpElement?.textContent?.substring(0, 100)
        });
      }, 10000);
    });
  });
  
  const totalTime = Date.now() - startTime;
  
  console.log('📊 LCP MEASUREMENT:', lcpMeasurement);
  console.log('⏱️  Total Load Time:', totalTime + 'ms');
  
  // Measure resource loading
  const resources = await page.evaluate(() => {
    const entries = performance.getEntriesByType('resource');
    return entries
      .filter(entry => entry.name.includes('.js') || entry.name.includes('.css'))
      .map(entry => ({
        name: entry.name.split('/').pop(),
        duration: Math.round(entry.duration),
        size: entry.transferSize
      }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
  });
  
  console.log('📦 TOP SLOW RESOURCES:', resources);
  
  await browser.close();
})();
