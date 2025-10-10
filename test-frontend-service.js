// Test the GeminiImageEditService
import axios from 'axios';

const getApiUrl = (path) => `http://localhost:3000${path}`;

class GeminiImageEditService {
  static async editImage(request) {
    try {
      console.log(`[GeminiEdit] 🚀 Starting image edit for ${request.platform}/${request.username}/${request.imageKey}`);
      console.log(`[GeminiEdit] 📝 Prompt: "${request.prompt}"`);
      
      const response = await axios.post(
        getApiUrl('/api/gemini-image-edit'),
        request,
        { timeout: 60000 }
      );
      
      console.log('[GeminiEdit] ✅ Response received:', response.status);
      return response.data;
    } catch (error) {
      console.error('[GeminiEdit] ❌ Error:', error.message);
      if (error.response) {
        console.error('  Status:', error.response.status);
        console.error('  Data:', error.response.data);
      }
      throw error;
    }
  }

  static getPredefinedPrompts() {
    return [
      "Change the background to a vibrant sunset",
      "Make the outfit more elegant and professional",
      "Add modern typography with bold text overlay",
      "Change to a minimalist white background",
      "Transform into a vintage aesthetic with warm tones"
    ];
  }
}

// Test the service
async function testService() {
  console.log('🧪 Testing GeminiImageEditService\n');
  
  console.log('📋 Predefined Prompts:');
  GeminiImageEditService.getPredefinedPrompts().forEach((prompt, idx) => {
    console.log(`  ${idx + 1}. ${prompt}`);
  });
  console.log();
  
  const testRequest = {
    imageKey: 'campaign_ready_post_1754561649019_edfdd724.jpg',
    username: 'fentybeauty',
    platform: 'instagram',
    prompt: 'Make this image more vibrant with a sunset background'
  };
  
  console.log('🚀 Testing editImage() method...\n');
  
  try {
    const result = await GeminiImageEditService.editImage(testRequest);
    
    console.log('\n✅ SERVICE TEST PASSED!\n');
    console.log('Response structure:');
    console.log('  - success:', result.success);
    console.log('  - originalImageUrl:', result.originalImageUrl);
    console.log('  - editedImageUrl:', result.editedImageUrl);
    console.log('  - imageKey:', result.imageKey);
    console.log('  - editedImageKey:', result.editedImageKey);
    console.log('  - AI Response length:', result.aiResponse?.candidates?.[0]?.content?.parts?.[0]?.text?.length || 0, 'chars');
    
  } catch (error) {
    console.log('\n❌ SERVICE TEST FAILED!');
  }
}

testService();
