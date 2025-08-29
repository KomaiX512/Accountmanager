// COMPREHENSIVE IMAGE REFRESH TEST SUITE
// Run this in browser console to test each stage independently

class ImageRefreshTester {
  constructor() {
    this.testResults = {};
    this.username = 'muhammad_muti'; // Replace with actual username
    this.samplePostKey = 'ready_post_1234.json'; // Replace with actual post key
  }

  // STAGE 1: Test filename extraction
  testFilenameExtraction(postKey = this.samplePostKey) {
    console.log(`[STAGE-1-TEST] 🧪 Testing filename extraction for: "${postKey}"`);
    
    let imageFilename = '';
    const aiMatch = postKey.match(/ai_edited_(\d+)\.json$/);
    if (aiMatch) {
      imageFilename = `ai_edited_${aiMatch[1]}.jpg`;
      console.log(`[STAGE-1-TEST] ✅ AI pattern matched: ${imageFilename}`);
    } else {
      const standardMatch = postKey.match(/ready_post_(\d+)\.json$/);
      if (standardMatch) {
        imageFilename = `image_${standardMatch[1]}.jpg`;
        console.log(`[STAGE-1-TEST] ✅ Standard pattern matched: ${imageFilename}`);
      } else {
        console.error(`[STAGE-1-TEST] ❌ NO PATTERN MATCHED`);
        console.log(`[STAGE-1-TEST] Testing patterns:`, {
          aiPattern: /ai_edited_(\d+)\.json$/.test(postKey),
          standardPattern: /ready_post_(\d+)\.json$/.test(postKey),
          postKey: postKey
        });
      }
    }
    
    this.testResults.stage1 = { postKey, imageFilename, success: !!imageFilename };
    return imageFilename;
  }

  // STAGE 2: Test URL generation
  testUrlGeneration(imageFilename) {
    console.log(`[STAGE-2-TEST] 🧪 Testing URL generation for: "${imageFilename}"`);
    
    const cacheBuster = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    const testUrl = `/api/r2-image/${this.username}/${imageFilename}?test=${cacheBuster}&rnd=${randomId}`;
    
    console.log(`[STAGE-2-TEST] Generated URL:`, testUrl);
    
    try {
      const fullUrl = new URL(testUrl, window.location.origin);
      console.log(`[STAGE-2-TEST] ✅ Valid URL:`, fullUrl.href);
      this.testResults.stage2 = { url: testUrl, valid: true };
      return testUrl;
    } catch (e) {
      console.error(`[STAGE-2-TEST] ❌ Invalid URL:`, e);
      this.testResults.stage2 = { url: testUrl, valid: false, error: e.message };
      return null;
    }
  }

  // STAGE 3: Test backend response
  async testBackendResponse(testUrl) {
    console.log(`[STAGE-3-TEST] 🧪 Testing backend response for: "${testUrl}"`);
    
    try {
      const response = await fetch(testUrl);
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      const cacheControl = response.headers.get('cache-control');
      
      console.log(`[STAGE-3-TEST] Response:`, {
        status: response.status,
        contentType,
        contentLength,
        cacheControl,
        url: response.url
      });
      
      if (response.ok) {
        const blob = await response.blob();
        console.log(`[STAGE-3-TEST] ✅ Image loaded successfully:`, {
          size: blob.size,
          type: blob.type
        });
        
        this.testResults.stage3 = { 
          success: true, 
          status: response.status,
          size: blob.size,
          contentType: blob.type
        };
        return blob;
      } else {
        console.error(`[STAGE-3-TEST] ❌ Backend error:`, response.status, response.statusText);
        this.testResults.stage3 = { 
          success: false, 
          status: response.status,
          error: response.statusText
        };
        return null;
      }
    } catch (error) {
      console.error(`[STAGE-3-TEST] ❌ Network error:`, error);
      this.testResults.stage3 = { success: false, error: error.message };
      return null;
    }
  }

  // STAGE 4: Test DOM image loading
  async testDomImageLoading(testUrl) {
    console.log(`[STAGE-4-TEST] 🧪 Testing DOM image loading`);
    
    return new Promise((resolve) => {
      const testImg = new Image();
      
      testImg.onload = () => {
        console.log(`[STAGE-4-TEST] ✅ DOM image loaded:`, {
          url: testUrl,
          naturalWidth: testImg.naturalWidth,
          naturalHeight: testImg.naturalHeight,
          complete: testImg.complete
        });
        
        this.testResults.stage4 = {
          success: true,
          width: testImg.naturalWidth,
          height: testImg.naturalHeight
        };
        resolve(testImg);
      };
      
      testImg.onerror = (error) => {
        console.error(`[STAGE-4-TEST] ❌ DOM image failed to load:`, error);
        this.testResults.stage4 = { success: false, error: 'Image load failed' };
        resolve(null);
      };
      
      testImg.src = testUrl;
    });
  }

  // STAGE 5: Test current page images
  testCurrentPageImages() {
    console.log(`[STAGE-5-TEST] 🧪 Testing current page images`);
    
    const allImages = document.querySelectorAll('img');
    console.log(`[STAGE-5-TEST] Found ${allImages.length} images on page`);
    
    const imageAnalysis = Array.from(allImages).map((img, index) => ({
      index,
      src: img.src,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      complete: img.complete,
      containsUsername: img.src.includes(this.username)
    }));
    
    console.log(`[STAGE-5-TEST] Image analysis:`, imageAnalysis);
    
    const targetImages = imageAnalysis.filter(img => img.containsUsername);
    console.log(`[STAGE-5-TEST] Target images (containing "${this.username}"):`, targetImages);
    
    this.testResults.stage5 = {
      totalImages: allImages.length,
      targetImages: targetImages.length,
      analysis: imageAnalysis
    };
    
    return targetImages;
  }

  // RUN ALL TESTS
  async runAllTests(postKey = this.samplePostKey) {
    console.log(`[FULL-TEST] 🚀 Starting comprehensive image refresh test`);
    console.log(`[FULL-TEST] PostKey: "${postKey}", Username: "${this.username}"`);
    
    // Stage 1: Filename extraction
    const imageFilename = this.testFilenameExtraction(postKey);
    if (!imageFilename) {
      console.error(`[FULL-TEST] ❌ STOPPING - Stage 1 failed`);
      return this.testResults;
    }
    
    // Stage 2: URL generation
    const testUrl = this.testUrlGeneration(imageFilename);
    if (!testUrl) {
      console.error(`[FULL-TEST] ❌ STOPPING - Stage 2 failed`);
      return this.testResults;
    }
    
    // Stage 3: Backend response
    const blob = await this.testBackendResponse(testUrl);
    if (!blob) {
      console.error(`[FULL-TEST] ❌ STOPPING - Stage 3 failed`);
      return this.testResults;
    }
    
    // Stage 4: DOM image loading
    const domImg = await this.testDomImageLoading(testUrl);
    if (!domImg) {
      console.error(`[FULL-TEST] ❌ STOPPING - Stage 4 failed`);
      return this.testResults;
    }
    
    // Stage 5: Current page analysis
    this.testCurrentPageImages();
    
    console.log(`[FULL-TEST] ✅ ALL TESTS COMPLETED`);
    console.log(`[FULL-TEST] Results summary:`, this.testResults);
    
    return this.testResults;
  }

  // SIMULATE ACTUAL WORKFLOW
  async simulateActualWorkflow(postKey) {
    console.log(`[SIMULATE] 🎭 Simulating actual AI approval workflow`);
    
    const results = await this.runAllTests(postKey);
    
    if (results.stage1?.success && results.stage2?.valid && results.stage3?.success && results.stage4?.success) {
      console.log(`[SIMULATE] ✅ WORKFLOW SHOULD WORK - All stages passed`);
      
      // Test if we can find and update the actual image
      const targetImages = this.testCurrentPageImages();
      if (targetImages.length > 0) {
        console.log(`[SIMULATE] ✅ Found ${targetImages.length} target images to update`);
      } else {
        console.warn(`[SIMULATE] ⚠️ NO TARGET IMAGES FOUND - This is why refresh isn't working!`);
      }
    } else {
      console.error(`[SIMULATE] ❌ WORKFLOW WILL FAIL - Check failed stages:`, {
        stage1: results.stage1?.success,
        stage2: results.stage2?.valid,
        stage3: results.stage3?.success,
        stage4: results.stage4?.success
      });
    }
    
    return results;
  }
}

// USAGE INSTRUCTIONS:
console.log(`
🧪 IMAGE REFRESH TEST SUITE LOADED

Usage:
1. const tester = new ImageRefreshTester();
2. tester.username = 'your_actual_username';
3. const results = await tester.runAllTests('your_actual_post_key');

Or simulate the actual workflow:
await tester.simulateActualWorkflow('your_actual_post_key');

This will test each stage and show you exactly where the problem occurs.
`);

// Auto-export for console use
window.ImageRefreshTester = ImageRefreshTester;
