const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  console.log('🚀 Testing NEW 302KB main bundle performance...');
  
  // Force fresh cache
  await page.setCacheEnabled(false);
  
  // Clear any existing cache
  const client = await page.target().createCDPSession();
  await client.send('Network.clearBrowserCache');
  
  const startTime = Date.now();
  
  await page.goto('https://sentientm.com?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
  
  // Measure LCP with new build
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
      
      setTimeout(() => {
        observer.disconnect();
        resolve({
          lcp: Math.round(lcpValue),
          element: lcpElement?.tagName?.toLowerCase() + (lcpElement?.className ? '.' + lcpElement.className.split(' ')[0] : ''),
          elementText: lcpElement?.textContent?.substring(0, 80)
        });
      }, 8000);
    });
  });
  
  // Check which assets are actually loading
  const resources = await page.evaluate(() => {
    const entries = performance.getEntriesByType('resource');
    return entries
      .filter(entry => entry.name.includes('.js') && entry.name.includes('index-C4HwBj7g'))
      .map(entry => ({
        name: entry.name.split('/').pop(),
        duration: Math.round(entry.duration),
        size: entry.transferSize,
        status: entry.responseStatus
      }));
  });
  
  const totalTime = Date.now() - startTime;
  
  console.log('📊 NEW BUILD LCP:', lcpMeasurement);
  console.log('⏱️  Total Load Time:', totalTime + 'ms');
  console.log('📦 NEW MAIN BUNDLE:', resources);
  
  await browser.close();
})();
