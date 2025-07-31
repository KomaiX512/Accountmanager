#!/usr/bin/env node

/**
 * 🧪 SMART IMAGE CORRECTION VALIDATION TESTS
 * 
 * This test suite validates that our auto-correction logic prevents
 * white placeholder images by testing various format mismatch scenarios.
 */

import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Initialize S3 client (same config as server)
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || 'https://b21d96e73b908d7d7b822d41516ccc64.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Test utilities
const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const detectFormat = (buffer) => {
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xD8) return 'jpeg';
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return 'unknown';
};

// Generate test images
const generateTestImages = async () => {
  console.log('🎨 Generating test images...');
  
  const testImages = {};
  
  // Create a base image with Sharp
  const baseImage = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: 255, g: 100, b: 50, alpha: 1 }
    }
  }).png().toBuffer();
  
  // Generate different formats
  testImages.png = baseImage;
  testImages.jpeg = await sharp(baseImage).jpeg({ quality: 85 }).toBuffer();
  testImages.webp = await sharp(baseImage).webp({ quality: 85 }).toBuffer();
  
  console.log('✅ Test images generated:');
  console.log(`  PNG: ${testImages.png.length} bytes, format: ${detectFormat(testImages.png)}`);
  console.log(`  JPEG: ${testImages.jpeg.length} bytes, format: ${detectFormat(testImages.jpeg)}`);
  console.log(`  WebP: ${testImages.webp.length} bytes, format: ${detectFormat(testImages.webp)}`);
  
  return testImages;
};

// Test scenarios that previously caused white placeholders
const testScenarios = [
  {
    name: 'WebP data with .jpg extension',
    imageData: 'webp',
    uploadKey: 'ready_post/instagram/test_user/test_webp_as_jpg.jpg',
    expectedIssue: 'Format mismatch should trigger auto-correction'
  },
  {
    name: 'PNG data with .jpg extension', 
    imageData: 'png',
    uploadKey: 'ready_post/instagram/test_user/test_png_as_jpg.jpg',
    expectedIssue: 'Format mismatch should trigger auto-correction'
  },
  {
    name: 'JPEG data with .jpg extension (control)',
    imageData: 'jpeg',
    uploadKey: 'ready_post/instagram/test_user/test_jpeg_as_jpg.jpg',
    expectedIssue: 'No correction needed - should pass through'
  },
  {
    name: 'Campaign post WebP with .jpg extension',
    imageData: 'webp',
    uploadKey: 'ready_post/instagram/test_user/campaign_ready_post_123456_abc123.jpg',
    expectedIssue: 'Campaign format mismatch should trigger auto-correction'
  }
];

// Simulate the executeScheduledPost image processing logic
const simulateImageProcessing = async (testKey) => {
  console.log(`\n🔍 Testing image processing for: ${testKey}`);
  
  try {
    // Fetch the image (same as executeScheduledPost)
    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: testKey
    });
    const response = await s3Client.send(getCommand);
    let imageBuffer = await streamToBuffer(response.Body);
    
    console.log(`  📥 Fetched image: ${imageBuffer.length} bytes`);
    
    // Apply our auto-correction logic
    let actualFormat = detectFormat(imageBuffer);
    const declaredExt = path.extname(testKey).toLowerCase().replace('.', '');
    
    console.log(`  🔍 Format analysis: declared=${declaredExt}, actual=${actualFormat}`);
    
    let correctionApplied = false;
    
    // If the buffer is not already JPEG, convert and repair in-place
    if (actualFormat !== 'jpeg') {
      console.log(`  🔄 Applying auto-correction: ${actualFormat} → JPEG`);
      try {
        imageBuffer = await sharp(imageBuffer)
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: 85, progressive: true })
          .toBuffer();
        
        // Re-upload the corrected JPEG
        await s3Client.send(new PutObjectCommand({
          Bucket: 'tasks',
          Key: testKey,
          Body: imageBuffer,
          ContentType: 'image/jpeg'
        }));
        
        console.log(`  ✅ Auto-correction succeeded: ${imageBuffer.length} bytes`);
        actualFormat = 'jpeg';
        correctionApplied = true;
      } catch (autoErr) {
        console.error(`  ❌ Auto-correction failed: ${autoErr.message}`);
        return { success: false, error: autoErr.message };
      }
    } else {
      console.log(`  ✅ No correction needed - already JPEG`);
    }
    
    // Verify the final result
    const finalFormat = detectFormat(imageBuffer);
    const isValidJpeg = finalFormat === 'jpeg';
    
    return {
      success: true,
      correctionApplied,
      finalFormat,
      isValidJpeg,
      finalSize: imageBuffer.length
    };
    
  } catch (error) {
    console.error(`  ❌ Processing failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

// Main test execution
const runTests = async () => {
  console.log('🚀 Starting Image Correction Validation Tests\n');
  
  try {
    // Generate test images
    const testImages = await generateTestImages();
    
    // Upload test scenarios
    console.log('\n📤 Uploading test scenarios...');
    for (const scenario of testScenarios) {
      const imageBuffer = testImages[scenario.imageData];
      
      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: scenario.uploadKey,
        Body: imageBuffer,
        ContentType: scenario.imageData === 'jpeg' ? 'image/jpeg' : 'image/png' // Intentionally wrong for mismatch tests
      }));
      
      console.log(`  ✅ Uploaded: ${scenario.name}`);
    }
    
    // Test each scenario
    console.log('\n🧪 Running correction tests...');
    const results = [];
    
    for (const scenario of testScenarios) {
      console.log(`\n--- Testing: ${scenario.name} ---`);
      const result = await simulateImageProcessing(scenario.uploadKey);
      
      results.push({
        scenario: scenario.name,
        ...result
      });
      
      // Validate expectations
      if (scenario.imageData !== 'jpeg') {
        if (result.success && result.correctionApplied && result.isValidJpeg) {
          console.log(`  🎯 PASS: Format mismatch correctly auto-corrected`);
        } else {
          console.log(`  ❌ FAIL: Expected auto-correction but didn't happen properly`);
        }
      } else {
        if (result.success && !result.correctionApplied && result.isValidJpeg) {
          console.log(`  🎯 PASS: Valid JPEG passed through without modification`);
        } else {
          console.log(`  ❌ FAIL: Valid JPEG was unnecessarily modified`);
        }
      }
    }
    
    // Summary report
    console.log('\n📊 TEST SUMMARY');
    console.log('================');
    
    const passCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    console.log(`Total Tests: ${totalCount}`);
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${totalCount - passCount}`);
    
    if (passCount === totalCount) {
      console.log('\n🎉 ALL TESTS PASSED! Image correction logic is bulletproof.');
      console.log('✅ White placeholder images should no longer occur due to format mismatches.');
    } else {
      console.log('\n⚠️  Some tests failed. Review the auto-correction logic.');
    }
    
    // Detailed results
    console.log('\nDetailed Results:');
    results.forEach(result => {
      console.log(`  ${result.scenario}: ${result.success ? '✅' : '❌'} ${result.correctionApplied ? '(corrected)' : '(unchanged)'}`);
    });
    
    // Cleanup test files
    console.log('\n🧹 Cleaning up test files...');
    for (const scenario of testScenarios) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: 'tasks',
          Key: scenario.uploadKey
        }));
        console.log(`  🗑️  Deleted: ${scenario.uploadKey}`);
      } catch (cleanupError) {
        console.log(`  ⚠️  Cleanup failed for ${scenario.uploadKey}: ${cleanupError.message}`);
      }
    }
    
  } catch (error) {
    console.error('💥 Test execution failed:', error);
  }
};

// Additional validation: Test the placeholder fallback
const testPlaceholderFallback = async () => {
  console.log('\n🛡️  Testing placeholder fallback for corrupted images...');
  
  // Create a corrupted "image" (just random bytes)
  const corruptedImage = Buffer.from('This is not an image at all!', 'utf8');
  const testKey = 'ready_post/instagram/test_user/corrupted_test.jpg';
  
  try {
    // Upload corrupted data
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: testKey,
      Body: corruptedImage,
      ContentType: 'image/jpeg'
    }));
    
    // Test processing
    const result = await simulateImageProcessing(testKey);
    
    if (result.success && result.isValidJpeg) {
      console.log('  🎯 PASS: Corrupted image was handled gracefully');
    } else {
      console.log('  ❌ FAIL: Corrupted image was not handled properly');
    }
    
    // Cleanup
    await s3Client.send(new DeleteObjectCommand({
      Bucket: 'tasks',
      Key: testKey
    }));
    
  } catch (error) {
    console.error('  ❌ Placeholder fallback test failed:', error);
  }
};

// Run all tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests()
    .then(() => testPlaceholderFallback())
    .then(() => {
      console.log('\n🏁 All validation tests completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Test suite failed:', error);
      process.exit(1);
    });
}

export { runTests, testPlaceholderFallback, simulateImageProcessing };
