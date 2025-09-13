// 🚀 BRUTAL VPS PERFORMANCE TESTING - UNBIASED CORE WEB VITALS MEASUREMENT
import puppeteer from 'puppeteer';
import fs from 'fs';

const VPS_URL = 'https://sentientm.com';
const TEST_ITERATIONS = 3;

async function measureCoreWebVitals(page) {
  // Inject Core Web Vitals measurement script
  await page.evaluateOnNewDocument(() => {
    window.vitalsData = {
      LCP: null,
      FID: null,
      CLS: null,
      INP: null,
      FCP: null,
      TTFB: null,
      loadTime: null,
      domContentLoaded: null
    };

    // Performance observer for Core Web Vitals
    if ('PerformanceObserver' in window) {
      // Largest Contentful Paint (LCP)
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        window.vitalsData.LCP = Math.round(lastEntry.startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      // First Input Delay (FID) / Interaction to Next Paint (INP)
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (entry.name === 'first-input-delay') {
            window.vitalsData.FID = Math.round(entry.processingStart - entry.startTime);
          }
          if (entry.name === 'inp') {
            window.vitalsData.INP = Math.round(entry.duration);
          }
        });
      }).observe({ type: 'event', buffered: true });

      // Cumulative Layout Shift (CLS)
      new PerformanceObserver((list) => {
        let clsValue = 0;
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });
        window.vitalsData.CLS = Math.round(clsValue * 1000) / 1000;
      }).observe({ type: 'layout-shift', buffered: true });
    }

    // Navigation timing metrics
    window.addEventListener('load', () => {
      setTimeout(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        
        window.vitalsData.TTFB = Math.round(nav.responseStart - nav.requestStart);
        window.vitalsData.loadTime = Math.round(nav.loadEventEnd - nav.navigationStart);
        window.vitalsData.domContentLoaded = Math.round(nav.domContentLoadedEventEnd - nav.navigationStart);
        
        const fcp = paint.find(entry => entry.name === 'first-contentful-paint');
        if (fcp) window.vitalsData.FCP = Math.round(fcp.startTime);
      }, 1000);
    });
  });
}

async function runPerformanceTest() {
  console.log('🚀 STARTING BRUTAL VPS PERFORMANCE TESTING...');
  console.log(`📍 Testing URL: ${VPS_URL}`);
  console.log(`🔄 Iterations: ${TEST_ITERATIONS}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  });

  const results = [];
  
  for (let i = 0; i < TEST_ITERATIONS; i++) {
    console.log(`📊 Running test iteration ${i + 1}/${TEST_ITERATIONS}...`);
    
    const page = await browser.newPage();
    
    // Simulate real user conditions
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Enable request/response monitoring
    const requests = [];
    const responses = [];
    
    page.on('request', request => {
      requests.push({
        url: request.url(),
        method: request.method(),
        size: request.postData() ? request.postData().length : 0,
        timestamp: Date.now()
      });
    });
    
    page.on('response', response => {
      responses.push({
        url: response.url(),
        status: response.status(),
        size: response.headers()['content-length'] || 0,
        timestamp: Date.now()
      });
    });

    // Inject Core Web Vitals measurement
    await measureCoreWebVitals(page);
    
    // Start timing
    const startTime = Date.now();
    
    try {
      // Navigate to VPS
      await page.goto(VPS_URL, { 
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      // Wait for critical elements to load
      await page.waitForSelector('body', { timeout: 10000 });
      
      // Simulate user interaction to trigger INP
      await page.click('body');
      
      // Wait for measurements to complete
      await page.waitForTimeout(3000);
      
      // Extract performance data
      const vitals = await page.evaluate(() => window.vitalsData);
      const endTime = Date.now();
      
      const result = {
        iteration: i + 1,
        timestamp: new Date().toISOString(),
        totalTestTime: endTime - startTime,
        vitals: vitals,
        network: {
          totalRequests: requests.length,
          totalResponses: responses.length,
          requestSizes: requests.reduce((sum, req) => sum + req.size, 0),
          responseSizes: responses.reduce((sum, res) => sum + parseInt(res.size || 0), 0)
        },
        errors: []
      };
      
      results.push(result);
      
      console.log(`   ✅ Test ${i + 1} completed - LCP: ${vitals.LCP}ms, TTFB: ${vitals.TTFB}ms`);
      
    } catch (error) {
      console.log(`   ❌ Test ${i + 1} failed: ${error.message}`);
      results.push({
        iteration: i + 1,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
    
    await page.close();
    
    // Wait between iterations
    if (i < TEST_ITERATIONS - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await browser.close();
  
  // Calculate averages and generate brutal assessment
  generateBrutalAssessment(results);
  
  // Save detailed results
  fs.writeFileSync('./vps-performance-results.json', JSON.stringify(results, null, 2));
  console.log('\n📁 Detailed results saved to: vps-performance-results.json');
}

function generateBrutalAssessment(results) {
  console.log('\n' + '='.repeat(80));
  console.log('🔥 BRUTAL PERFORMANCE ASSESSMENT - UNBIASED TRUTH');
  console.log('='.repeat(80));
  
  const validResults = results.filter(r => !r.error && r.vitals);
  
  if (validResults.length === 0) {
    console.log('❌ TOTAL FAILURE: All tests failed. VPS is completely broken.');
    return;
  }
  
  const avgLCP = validResults.reduce((sum, r) => sum + (r.vitals.LCP || 0), 0) / validResults.length;
  const avgCLS = validResults.reduce((sum, r) => sum + (r.vitals.CLS || 0), 0) / validResults.length;
  const avgFCP = validResults.reduce((sum, r) => sum + (r.vitals.FCP || 0), 0) / validResults.length;
  const avgTTFB = validResults.reduce((sum, r) => sum + (r.vitals.TTFB || 0), 0) / validResults.length;
  const avgLoadTime = validResults.reduce((sum, r) => sum + (r.vitals.loadTime || 0), 0) / validResults.length;
  
  console.log('\n📊 CORE WEB VITALS RESULTS:');
  console.log('-'.repeat(50));
  
  // LCP Assessment
  console.log(`🎯 LCP (Largest Contentful Paint): ${Math.round(avgLCP)}ms`);
  if (avgLCP <= 2500) {
    console.log('   ✅ EXCELLENT - Netflix-scale performance achieved!');
  } else if (avgLCP <= 4000) {
    console.log('   ⚠️  DECENT - Better than before but still room for improvement');
  } else if (avgLCP <= 6000) {
    console.log('   🔥 POOR - Still too slow, optimizations failed');  
  } else {
    console.log('   💀 TERRIBLE - Performance is still absolute garbage');
  }
  
  // CLS Assessment  
  console.log(`🎯 CLS (Cumulative Layout Shift): ${avgCLS.toFixed(3)}`);
  if (avgCLS <= 0.1) {
    console.log('   ✅ EXCELLENT - Layout shifts eliminated!');
  } else if (avgCLS <= 0.25) {
    console.log('   ⚠️  DECENT - Some improvement but still noticeable shifts');
  } else {
    console.log('   💀 TERRIBLE - Layout still jumping around like crazy');
  }
  
  // TTFB Assessment
  console.log(`🎯 TTFB (Time To First Byte): ${Math.round(avgTTFB)}ms`);
  if (avgTTFB <= 600) {
    console.log('   ✅ EXCELLENT - Server response is lightning fast!');
  } else if (avgTTFB <= 1200) {
    console.log('   ⚠️  DECENT - Server response acceptable');
  } else {
    console.log('   🔥 POOR - Server is still sluggish');
  }
  
  // Overall Assessment
  console.log('\n🏆 OVERALL BRUTAL VERDICT:');
  console.log('-'.repeat(50));
  
  const previousLCP = 13700; // Previous baseline
  const previousCLS = 0.47;
  
  const lcpImprovement = ((previousLCP - avgLCP) / previousLCP) * 100;
  const clsImprovement = ((previousCLS - avgCLS) / previousCLS) * 100;
  
  console.log(`📈 LCP Improvement: ${lcpImprovement.toFixed(1)}% (${previousLCP}ms → ${Math.round(avgLCP)}ms)`);
  console.log(`📈 CLS Improvement: ${clsImprovement.toFixed(1)}% (${previousCLS} → ${avgCLS.toFixed(3)})`);
  
  if (avgLCP <= 3000 && avgCLS <= 0.1 && avgTTFB <= 800) {
    console.log('\n🎉 SUCCESS: Performance optimizations DELIVERED! This is now Netflix-scale fast.');
  } else if (avgLCP <= 5000 && avgCLS <= 0.25) {
    console.log('\n⚡ PARTIAL SUCCESS: Significant improvements but not quite world-class yet.');
  } else if (lcpImprovement > 50) {
    console.log('\n🔄 PROGRESS: Major improvements made but still needs more work.');
  } else {
    console.log('\n💥 FAILURE: Optimizations barely moved the needle. Back to the drawing board.');
  }
  
  console.log('\n📋 REMAINING BOTTLENECKS TO FIX:');
  if (avgLCP > 2500) console.log('   🔧 LCP still too high - investigate largest content elements');
  if (avgCLS > 0.1) console.log('   🔧 CLS still problematic - fix layout shifts in critical path');  
  if (avgTTFB > 600) console.log('   🔧 TTFB needs server optimization - check backend response times');
  if (avgLoadTime > 5000) console.log('   🔧 Total load time excessive - more aggressive code splitting needed');
  
  console.log('\n' + '='.repeat(80));
}

// Run the brutal test
runPerformanceTest().catch(console.error);
