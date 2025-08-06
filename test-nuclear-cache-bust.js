const axios = require('axios');

async function testNuclearCacheBust() {
  console.log('🧪 Testing Nuclear Cache-Busting...');
  
  try {
    const response = await axios.post('http://localhost:5173/api/reimagine-image', {
      username: 'mrbeast',
      postKey: 'ready_post/instagram/mrbeast/campaign_ready_post_1754451390339_6ce234f8.json',
      extraPrompt: 'A magical forest with glowing mushrooms and fairy lights',
      platform: 'instagram'
    });
    
    console.log('✅ Backend Response:', response.data);
    console.log('🚀 Nuclear URL:', response.data.newImageUrl);
    console.log('📊 Image Filename:', response.data.imageFilename);
    
    // Check if the image file was updated
    const fs = require('fs');
    const path = require('path');
    const imagePath = path.join('ready_post/instagram/mrbeast', response.data.imageFilename);
    
    if (fs.existsSync(imagePath)) {
      const stats = fs.statSync(imagePath);
      console.log('📁 Image updated at:', stats.mtime);
      console.log('📏 Image size:', stats.size, 'bytes');
    } else {
      console.log('❌ Image file not found');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testNuclearCacheBust(); 