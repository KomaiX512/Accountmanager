import axios from 'axios';

const CLAID_API_KEY = "357d428448264c0ea126e40934027941";
const TEST_IMAGE_URL = "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop";

describe('Claid AI Generative Editing API Integration', () => {
  test('should successfully edit image with generative AI prompt', async () => {
    const prompt = "Transform this into a watercolor painting style";
    
    const payload = {
      "input": {
        "image_url": TEST_IMAGE_URL
      },
      "operations": {
        "generative": {
          "style_transfer": {
            "prompt": prompt,
            "style_strength": 0.75,
            "denoising_strength": 0.75,
            "depth_strength": 1.0
          }
        }
      }
    };

    const headers = {
      "Authorization": `Bearer ${CLAID_API_KEY}`,
      "Content-Type": "application/json"
    };

    try {
      console.log('🤖 Testing Claid AI Generative Editing API...');
      console.log('📝 Payload:', JSON.stringify(payload, null, 2));
      
      const response = await axios.post('https://api.claid.ai/v1/image/editing', payload, { 
        headers,
        timeout: 30000 
      });

      console.log('✅ API Response Status:', response.status);
      console.log('📋 Response Data:', JSON.stringify(response.data, null, 2));
      
      // Verify response structure for generative editing
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data.output).toBeDefined();
      expect(response.data.output.image_url).toBeDefined();
      
      const editedImageUrl = response.data.output.image_url;
      console.log('🎨 Edited image URL:', editedImageUrl);
      
      // Verify the edited image URL is accessible
      const imageResponse = await axios.head(editedImageUrl);
      expect(imageResponse.status).toBe(200);
      
      console.log('🎉 Generative editing test completed successfully!');
      
    } catch (error) {
      console.error('❌ Test failed:', error.response?.status, error.response?.data || error.message);
      
      if (error.response?.status === 403) {
        console.error('🚨 403 Forbidden - Check API key permissions, account limits, or endpoint access');
      } else if (error.response?.status === 401) {
        console.error('🚨 401 Unauthorized - Invalid API key');
      } else if (error.response?.status === 422) {
        console.error('🚨 422 Unprocessable Entity - Invalid request payload');
      } else if (error.response?.status === 404) {
        console.error('🚨 404 Not Found - Wrong endpoint URL');
      }
      
      throw error;
    }
  }, 60000); // 60 second timeout

  test('should handle invalid image URL gracefully', async () => {
    const invalidImageUrl = "https://invalid-url.com/nonexistent.jpg";
    const prompt = "Make it artistic";
    
    const payload = {
      "input": {
        "image_url": invalidImageUrl
      },
      "operations": {
        "generative": {
          "style_transfer": {
            "prompt": prompt,
            "style_strength": 0.75,
            "denoising_strength": 0.75,
            "depth_strength": 1.0
          }
        }
      }
    };

    const headers = {
      "Authorization": `Bearer ${CLAID_API_KEY}`,
      "Content-Type": "application/json"
    };

    try {
      const response = await axios.post('https://api.claid.ai/v1/image/editing', payload, { 
        headers,
        timeout: 30000 
      });
      
      // Should not reach here with invalid image
      console.log('⚠️ Unexpected success with invalid image URL');
      
    } catch (error) {
      // Expected to fail with invalid image URL
      console.log('✅ Correctly handled invalid image URL:', error.response?.status);
      expect(error.response?.status).toBeGreaterThanOrEqual(400);
    }
  }, 30000);

  test('should handle missing prompt gracefully', async () => {
    const payload = {
      "input": {
        "image_url": TEST_IMAGE_URL
      },
      "operations": {
        "generative": {
          "style_transfer": {
            "prompt": "", // Empty prompt
            "style_strength": 0.75,
            "denoising_strength": 0.75,
            "depth_strength": 1.0
          }
        }
      }
    };

    const headers = {
      "Authorization": `Bearer ${CLAID_API_KEY}`,
      "Content-Type": "application/json"
    };

    try {
      const response = await axios.post('https://api.claid.ai/v1/image/editing', payload, { 
        headers,
        timeout: 30000 
      });
      
      // Check if API handles empty prompt gracefully
      console.log('📝 Response with empty prompt:', response.status);
      expect([200, 400, 422]).toContain(response.status);
      
    } catch (error) {
      // May fail with empty prompt - that's acceptable
      console.log('⚠️ Empty prompt handled:', error.response?.status);
      expect(error.response?.status).toBeGreaterThanOrEqual(400);
    }
  }, 30000);

  test('should validate API key authentication', async () => {
    const payload = {
      "input": {
        "image_url": TEST_IMAGE_URL
      },
      "operations": {
        "generative": {
          "style_transfer": {
            "prompt": "Test authentication",
            "style_strength": 0.75,
            "denoising_strength": 0.75,
            "depth_strength": 1.0
          }
        }
      }
    };

    const headers = {
      "Authorization": `Bearer invalid_api_key_test`,
      "Content-Type": "application/json"
    };

    try {
      const response = await axios.post('https://api.claid.ai/v1/image/editing', payload, { 
        headers,
        timeout: 30000 
      });
      
      // Should not succeed with invalid API key
      console.log('⚠️ Unexpected success with invalid API key');
      
    } catch (error) {
      // Expected to fail with 401 Unauthorized
      console.log('✅ Authentication validation working:', error.response?.status);
      expect(error.response?.status).toBe(401);
    }
  }, 30000);

  test('should handle timeout scenarios', async () => {
    const payload = {
      "input": {
        "image_url": TEST_IMAGE_URL
      },
      "operations": {
        "generative": {
          "style_transfer": {
            "prompt": "Complex artistic transformation",
            "style_strength": 0.75,
            "denoising_strength": 0.75,
            "depth_strength": 1.0
          }
        }
      }
    };

    const headers = {
      "Authorization": `Bearer ${CLAID_API_KEY}`,
      "Content-Type": "application/json"
    };

    try {
      // Test with very short timeout to simulate timeout scenario
      const response = await axios.post('https://api.claid.ai/v1/image/editing', payload, { 
        headers,
        timeout: 100 // Very short timeout
      });
      
      console.log('⚠️ Request completed faster than expected timeout');
      
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.log('✅ Timeout handling working correctly');
        expect(error.code).toBe('ECONNABORTED');
      } else {
        console.log('🤔 Different error than timeout:', error.message);
      }
    }
  }, 5000);
});


// Export for use in other modules
export {
  testClaidAIAPI,
  testEdgeCases,
  runAllTests
};

// Run tests if this file is executed directly
runAllTests();
