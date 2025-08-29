// Stability AI API Unit Test - Image Editing
import axios from 'axios';
import FormData from 'form-data';

class StabilityAITester {
  constructor() {
    this.apiKey = "sk-SimNOYyuKWM8DYiPmZaTiyd0jowZGh8W0D7ranwwOl54TQff";
    this.baseURL = "https://api.stability.ai/v2beta/stable-image";
    this.results = [];
  }

  async testScenario(name, endpoint, payload, timeoutMs = 60000) {
    console.log(`\n🧪 Testing: ${name}`);
    console.log(`⏰ Timeout: ${timeoutMs/1000} seconds`);
    console.log(`🔗 Endpoint: ${endpoint}`);
    
    const startTime = Date.now();
    
    try {
      console.log(`📤 Sending request at ${new Date().toISOString()}...`);
      
      const response = await axios.postForm(
        `${this.baseURL}${endpoint}`,
        payload,
        {
          validateStatus: undefined,
          timeout: timeoutMs,
          headers: { 
            Authorization: `Bearer ${this.apiKey}`,
            Accept: "image/*"
          }
        }
      );
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      if (response.status === 200) {
        console.log(`✅ SUCCESS! Processing time: ${duration.toFixed(2)} seconds`);
        console.log(`📊 Response size: ${response.data.length} bytes`);
        console.log(`📋 Content-Type: ${response.headers['content-type']}`);
        
        this.results.push({
          scenario: name,
          success: true,
          duration: duration,
          status: response.status,
          responseSize: response.data.length,
          contentType: response.headers['content-type']
        });
        
        return { success: true, duration, data: response.data };
      } else {
        console.log(`❌ API ERROR: ${response.status}`);
        console.log(`📄 Response: ${response.data.toString()}`);
        
        this.results.push({
          scenario: name,
          success: false,
          duration: duration,
          status: response.status,
          error: response.data.toString()
        });
        
        return { success: false, duration, error: response.data.toString() };
      }
      
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
        errorDetails = `${error.response.status}: ${error.response.data?.toString() || error.response.statusText}`;
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorType = 'NETWORK_ERROR';
        errorDetails = 'Cannot reach Stability AI servers';
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
    console.log('🎯 STABILITY AI API COMPREHENSIVE TEST');
    console.log('=====================================\n');

    // Test 1: Image Inpainting (Remove/Replace objects)
    const inpaintPayload = axios.toFormData({
      image: 'https://picsum.photos/512/512',
      prompt: 'beautiful sunset landscape',
      output_format: 'webp'
    }, new FormData());
    
    await this.testScenario("Image Inpainting", "/generate/inpainting", inpaintPayload, 60000);

    // Test 2: Simple Image Generation (Fastest)
    const generatePayload = axios.toFormData({
      prompt: 'a beautiful watercolor painting of a mountain landscape',
      output_format: 'webp',
      aspect_ratio: '1:1'
    }, new FormData());
    
    await this.testScenario("Image Generation", "/generate/core", generatePayload, 30000);

    // Test 3: Image-to-Image (Style transfer)
    const img2imgPayload = axios.toFormData({
      image: 'https://picsum.photos/512/512',
      prompt: 'convert to watercolor painting style',
      strength: 0.7,
      output_format: 'webp'
    }, new FormData());
    
    await this.testScenario("Image-to-Image", "/generate/image-to-image", img2imgPayload, 45000);

    // Test 4: Upscale (Should be fast)
    const upscalePayload = axios.toFormData({
      image: 'https://picsum.photos/256/256',
      output_format: 'webp'
    }, new FormData());
    
    await this.testScenario("Image Upscale", "/upscale/conservative", upscalePayload, 30000);

    this.printSummary();
  }

  printSummary() {
    console.log('\n📊 STABILITY AI TEST RESULTS');
    console.log('============================');
    
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
      const extra = result.success ? `(${(result.responseSize/1024).toFixed(1)}KB)` : `(${result.errorType})`;
      console.log(`${index + 1}. ${status} ${result.scenario}: ${duration}s ${extra}`);
    });

    // Final verdict
    const timeouts = failed.filter(r => r.errorType === 'TIMEOUT').length;
    const apiErrors = failed.filter(r => r.errorType === 'API_ERROR').length;
    const networkErrors = failed.filter(r => r.errorType === 'NETWORK_ERROR').length;

    console.log('\n🎯 STABILITY AI ANALYSIS:');
    if (networkErrors > 0) {
      console.log('❌ NETWORK ISSUE: Cannot reach Stability AI servers');
    } else if (apiErrors > 0) {
      console.log('❌ API ISSUE: Authentication or payload problems');
      console.log('💡 Check API key permissions and endpoint URLs');
    } else if (timeouts > 0 && successful.length === 0) {
      console.log('❌ ALL OPERATIONS TIMEOUT: Stability AI is slow or overloaded');
    } else if (successful.length > 0 && timeouts === 0) {
      console.log('🎉 STABILITY AI WORKING PERFECTLY!');
      console.log('✅ Ready for backend integration');
      console.log(`⚡ Performance: ${Math.min(...successful.map(r => r.duration)).toFixed(1)}s fastest operation`);
    } else {
      console.log('⚠️ MIXED RESULTS: Some operations work, others timeout');
      console.log('💡 Use the working operations for production');
    }

    // Integration readiness
    if (successful.length >= 2) {
      console.log('\n🚀 INTEGRATION STATUS: READY');
      console.log('📝 Recommended operation: Image-to-Image or Generation');
      console.log('⏰ Expected response time: 15-45 seconds');
      console.log('📦 Response format: Binary image data (webp/png)');
    } else {
      console.log('\n❌ INTEGRATION STATUS: NOT READY');
      console.log('🔧 Fix API issues before proceeding');
    }
  }
}

// Run comprehensive Stability AI test
const tester = new StabilityAITester();
tester.runAllTests().catch(err => {
  console.error('❌ Stability AI test failed:', err.message);
});
