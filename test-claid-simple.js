// Simple standalone test for Claid AI Generative Editing API
import axios from 'axios';

class ClaidAPITester {
  constructor() {
    this.apiKey = "357d428448264c0ea126e40934027941";
    this.baseURL = "https://api.claid.ai/v1-beta1/image/edit";
    this.results = [];
  }

  async testScenario(name, payload, timeoutMs = 300000) {
    console.log(`\n🧪 Testing: ${name}`);
    console.log(`⏰ Timeout: ${timeoutMs/1000} seconds`);
    
    const startTime = Date.now();
    
    try {
      console.log(`📤 Sending request at ${new Date().toISOString()}...`);
      
      const response = await axios.post(this.baseURL, payload, {
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: timeoutMs
      });
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      console.log(`✅ SUCCESS! Processing time: ${duration.toFixed(2)} seconds`);
      console.log(`📸 Output URL: ${response.data.output?.image_url || 'No URL'}`);
      
      this.results.push({
        scenario: name,
        success: true,
        duration: duration,
        status: response.status,
        hasOutput: !!response.data.output?.image_url
      });
      
      return { success: true, duration };
      
    } catch (error) {
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      let errorType = 'UNKNOWN';
      let errorDetails = error.message;
      
      if (error.code === 'ECONNABORTED') {
        errorType = 'TIMEOUT';
        errorDetails = `Request timeout after ${duration.toFixed(2)}s`;
      } else if (error.response) {
        errorType = 'API_ERROR';
        errorDetails = `${error.response.status}: ${error.response.data?.error_message || error.response.statusText}`;
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorType = 'NETWORK_ERROR';
        errorDetails = 'Cannot reach Claid AI servers';
      }
      
      console.log(`❌ ${errorType}: ${errorDetails}`);
      console.log(`⏱️ Failed after: ${duration.toFixed(2)} seconds`);
      
      this.results.push({
        scenario: name,
        success: false,
        duration: duration,
        errorType: errorType,
        errorDetails: errorDetails
      });
      
      return { success: false, duration, errorType };
    }
  }

  async runAllTests() {
    console.log('🎯 COMPREHENSIVE CLAID AI API UNIT TEST');
    console.log('==========================================\n');

    // Test 1: Basic Style Transfer (Original Test)
    const basicPayload = {
      "input": "https://claid.ai/assets/cms/shoe_example_05fb154a3a/shoe_example_05fb154a3a.png",
      "operations": {
        "generative": {
          "style_transfer": {
            "style_reference_image": "https://claid.ai/assets/cms/shoe_example_05fb154a3a/shoe_example_05fb154a3a.png",
            "prompt": "watercolor painting style",
            "style_strength": 0.75,
            "denoising_strength": 0.75,
            "depth_strength": 1.0
          }
        }
      }
    };
    await this.testScenario("Basic Style Transfer", basicPayload, 300000);

    // Test 2: Simple Enhancement (Faster)
    const enhancePayload = {
      "input": "https://claid.ai/assets/cms/shoe_example_05fb154a3a/shoe_example_05fb154a3a.png",
      "operations": {
        "enhance": {
          "lighting": "natural",
          "color_enhance": true,
          "smart_enhance": true
        }
      }
    };
    await this.testScenario("Simple Enhancement", enhancePayload, 60000);

    // Test 3: Background Removal (Fast)
    const bgRemovalPayload = {
      "input": "https://claid.ai/assets/cms/shoe_example_05fb154a3a/shoe_example_05fb154a3a.png",
      "operations": {
        "background": {
          "remove": true
        }
      }
    };
    await this.testScenario("Background Removal", bgRemovalPayload, 60000);

    // Test 4: Quick Resize (Should be fast)
    const resizePayload = {
      "input": "https://claid.ai/assets/cms/shoe_example_05fb154a3a/shoe_example_05fb154a3a.png",
      "operations": {
        "resizing": {
          "width": 512,
          "height": 512,
          "fit": "cover"
        }
      }
    };
    await this.testScenario("Quick Resize", resizePayload, 30000);

    this.printSummary();
  }

  printSummary() {
    console.log('\n📊 TEST RESULTS SUMMARY');
    console.log('========================');
    
    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    
    console.log(`✅ Successful: ${successful.length}/${this.results.length}`);
    console.log(`❌ Failed: ${failed.length}/${this.results.length}`);
    
    if (successful.length > 0) {
      const avgDuration = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
      const minDuration = Math.min(...successful.map(r => r.duration));
      const maxDuration = Math.max(...successful.map(r => r.duration));
      
      console.log(`⏱️ Average success time: ${avgDuration.toFixed(2)}s`);
      console.log(`🚀 Fastest: ${minDuration.toFixed(2)}s`);
      console.log(`🐌 Slowest: ${maxDuration.toFixed(2)}s`);
    }
    
    console.log('\n📋 DETAILED RESULTS:');
    this.results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      const duration = result.duration.toFixed(2);
      console.log(`${index + 1}. ${status} ${result.scenario}: ${duration}s ${result.errorType || ''}`);
    });

    // Final verdict
    const timeouts = failed.filter(r => r.errorType === 'TIMEOUT').length;
    const apiErrors = failed.filter(r => r.errorType === 'API_ERROR').length;
    const networkErrors = failed.filter(r => r.errorType === 'NETWORK_ERROR').length;

    console.log('\n🎯 FINAL ANALYSIS:');
    if (networkErrors > 0) {
      console.log('❌ NETWORK ISSUE: Cannot reach Claid AI servers');
    } else if (apiErrors > 0) {
      console.log('❌ API ISSUE: Authentication or payload problems');
    } else if (timeouts === this.results.length) {
      console.log('❌ ALL OPERATIONS TIMEOUT: Claid AI is extremely slow or broken');
    } else if (timeouts > 0 && successful.length > 0) {
      console.log('⚠️ MIXED RESULTS: Some operations work, complex ones timeout');
      console.log('💡 RECOMMENDATION: Use simpler operations or increase timeout significantly');
    } else if (successful.length === this.results.length) {
      console.log('🎉 ALL TESTS PASSED: Claid AI is working perfectly!');
    }
  }
}

// Run comprehensive test
const tester = new ClaidAPITester();
tester.runAllTests().catch(err => {
  console.error('Test runner failed:', err.message);
});
