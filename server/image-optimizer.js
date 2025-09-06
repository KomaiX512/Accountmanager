#!/usr/bin/env node

/**
 * Image Optimization Service
 * Generates multi-resolution images for lightning-fast loading
 * Implements Facebook/Instagram-style image serving
 */

import sharp from 'sharp';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const s3Client = new S3Client({
  endpoint: process.env.R2_ENDPOINT || 'https://3e59de744ba8e99e9e99f5e662a96498.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  region: 'auto',
});

/**
 * Generate multiple image resolutions for progressive loading
 */
export async function generateImageVariants(imageBuffer, key) {
  const variants = {
    // Blur placeholder - base64 data URL (10x10 pixels, ultra compressed)
    blur: {
      width: 10,
      height: 10,
      quality: 20,
      blur: 5,
      format: 'webp'
    },
    // Thumbnail - for instant preview
    thumbnail: {
      width: 150,
      height: 150,
      quality: 60,
      format: 'webp'
    },
    // Small - for mobile devices
    small: {
      width: 480,
      height: 480,
      quality: 75,
      format: 'webp'
    },
    // Medium - for tablets
    medium: {
      width: 1080,
      height: 1080,
      quality: 85,
      format: 'webp'
    },
    // Large - for desktop (original maintains aspect ratio)
    large: {
      width: 1920,
      height: 1920,
      quality: 90,
      format: 'webp'
    }
  };

  const results = {};

  // Generate each variant in parallel
  const operations = Object.entries(variants).map(async ([name, config]) => {
    try {
      let pipeline = sharp(imageBuffer);
      
      // Apply transformations
      if (config.width && config.height) {
        pipeline = pipeline.resize(config.width, config.height, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }
      
      if (config.blur) {
        pipeline = pipeline.blur(config.blur);
      }
      
      // Convert to WebP for best compression
      const optimized = await pipeline
        .webp({ quality: config.quality })
        .toBuffer();
      
      // For blur variant, convert to base64 data URL
      if (name === 'blur') {
        const base64 = optimized.toString('base64');
        results[name] = `data:image/webp;base64,${base64}`;
      } else {
        // Store in R2 with variant suffix
        const variantKey = key.replace(/\.(jpg|jpeg|png|gif|webp)$/i, `-${name}.webp`);
        await s3Client.send(new PutObjectCommand({
          Bucket: 'tasks',
          Key: variantKey,
          Body: optimized,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable', // 1 year cache
          Metadata: {
            variant: name,
            originalKey: key
          }
        }));
        results[name] = variantKey;
      }
      
      console.log(`✅ Generated ${name} variant: ${results[name].substring(0, 100)}...`);
    } catch (error) {
      console.error(`❌ Failed to generate ${name} variant:`, error);
    }
  });
  
  await Promise.all(operations);
  return results;
}

/**
 * Process all existing images to generate variants
 */
export async function processExistingImages() {
  const stats = {
    processed: 0,
    failed: 0,
    skipped: 0
  };
  
  const prefixes = ['readypost/', 'ProfilePics/', 'PostImages/'];
  
  for (const prefix of prefixes) {
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: prefix,
      });
      
      const { Contents } = await s3Client.send(listCommand);
      
      if (!Contents || Contents.length === 0) {
        console.log(`No images found in ${prefix}`);
        continue;
      }
      
      console.log(`Processing ${Contents.length} images from ${prefix}...`);
      
      // Process in batches to avoid memory issues
      const batchSize = 5;
      for (let i = 0; i < Contents.length; i += batchSize) {
        const batch = Contents.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (obj) => {
          // Skip if already a variant or not an image
          if (/-(?:blur|thumbnail|small|medium|large)\.webp$/.test(obj.Key)) {
            stats.skipped++;
            return;
          }
          
          if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(obj.Key)) {
            stats.skipped++;
            return;
          }
          
          try {
            // Get original image
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const buffer = await streamToBuffer(data.Body);
            
            // Generate variants
            await generateImageVariants(buffer, obj.Key);
            stats.processed++;
            console.log(`✅ Processed ${obj.Key}`);
          } catch (error) {
            console.error(`❌ Failed to process ${obj.Key}:`, error.message);
            stats.failed++;
          }
        }));
        
        console.log(`Progress: ${i + batch.length}/${Contents.length}`);
      }
    } catch (error) {
      console.error(`Error processing ${prefix}:`, error);
    }
  }
  
  console.log('\n📊 Image Processing Results:');
  console.log(`- Images processed: ${stats.processed}`);
  console.log(`- Failed: ${stats.failed}`);
  console.log(`- Skipped: ${stats.skipped}`);
  
  return stats;
}

// Helper function to convert stream to buffer
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Generate responsive image srcset for HTML
 */
export function generateSrcSet(baseKey) {
  const variants = ['small', 'medium', 'large'];
  const srcset = variants.map(variant => {
    const variantKey = baseKey.replace(/\.(jpg|jpeg|png|gif|webp)$/i, `-${variant}.webp`);
    const width = variant === 'small' ? 480 : variant === 'medium' ? 1080 : 1920;
    return `${variantKey} ${width}w`;
  }).join(', ');
  
  return srcset;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  processExistingImages().catch(console.error);
}
