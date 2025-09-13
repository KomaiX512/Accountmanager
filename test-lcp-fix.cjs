const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  console.log('🔍 Testing LCP fix with PostCooked skeleton...');
  
  await page.goto('https://sentientm.com', { waitUntil: 'networkidle0', timeout: 30000 });
  
  // Measure LCP
  const lcpResults = await page.evaluate(() => {
    return new Promise((resolve) => {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        observer.disconnect();
        resolve({
          lcp: Math.round(lastEntry.startTime),
          element: lastEntry.element?.tagName?.toLowerCase() + (lastEntry.element?.className ? '.' + lastEntry.element.className.split(' ')[0] : '')
        });
      });
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
      
      // Fallback timeout
      setTimeout(() => {
        observer.disconnect();
        resolve({ lcp: 'timeout', element: 'unknown' });
      }, 20000);
    });
  });
  
  console.log('📊 LCP RESULTS:', lcpResults);
  
  // Check for PostCooked skeleton
  const skeletonPresent = await page.evaluate(() => {
    const skeleton = document.querySelector('[style*="background: #e0e0e0"]');
    return {
      found: !!skeleton,
      count: document.querySelectorAll('[style*="background: #e0e0e0"]').length
    };
  });
  
  console.log('🎭 SKELETON STATUS:', skeletonPresent);
  
  await browser.close();
})();
