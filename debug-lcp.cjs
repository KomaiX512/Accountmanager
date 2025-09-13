const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  console.log('🔍 Debugging LCP issue...');
  
  await page.goto('https://sentientm.com', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForTimeout(5000);
  
  // Check what's actually in the DOM
  const domStructure = await page.evaluate(() => {
    const root = document.getElementById('root');
    const postElements = document.querySelectorAll('[class*="post"], [class*="Post"]');
    const noPostsElements = document.querySelectorAll('.no-posts');
    
    // Find the LCP element specifically
    const allElements = document.querySelectorAll('*');
    let largestElement = null;
    let largestSize = 0;
    
    allElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      const size = rect.width * rect.height;
      if (size > largestSize) {
        largestSize = size;
        largestElement = el;
      }
    });
    
    return {
      rootChildren: root?.children.length || 0,
      postElements: postElements.length,
      noPostsElements: noPostsElements.length,
      noPostsText: Array.from(noPostsElements).map(el => el.textContent).join(' | '),
      largestElementTag: largestElement?.tagName,
      largestElementClass: largestElement?.className,
      largestElementText: largestElement?.textContent?.substring(0, 100)
    };
  });
  
  console.log('🔍 DOM STRUCTURE:', domStructure);
  
  await browser.close();
})();
