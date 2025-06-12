import express from 'express';
import AWS from 'aws-sdk';
import cors from 'cors';
import axios from 'axios';
import fetch from 'node-fetch';
import fs from 'fs';
import { promisify } from 'util';
import { pipeline } from 'stream';
import path from 'path';
import jpeg from 'jpeg-js';
import multer from 'multer';

const app = express();
const port = 3002;

console.log('Setting up server with proxy endpoints...');

// Configure AWS SDK
AWS.config.update({
  httpOptions: {
    connectTimeout: 5000,
    timeout: 10000
  },
  maxRetries: 3,
  retryDelayOptions: { base: 300 }
});

// Create a connection pool for S3 clients to improve stability
const S3_POOL_SIZE = 5;
const s3ClientPool = Array(S3_POOL_SIZE).fill(null).map(() => new AWS.S3({
  endpoint: 'https://b21d96e73b908d7d7b822d41516ccc64.r2.cloudflarestorage.com',
  accessKeyId: '986718fe67d6790c7fe4eeb78943adba',
  secretAccessKey: '08fb3b012163cce35bee80b54d83e3a6924f2679f466790a9c7fdd9456bc44fe',
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
  httpOptions: {
    connectTimeout: 10000,  // Increased timeouts for better reliability
    timeout: 15000
  },
  maxRetries: 5,  // More retries
  retryDelayOptions: { base: 300 }
}));

// Get S3 client from pool with round-robin selection
let currentS3ClientIndex = 0;
function getS3Client() {
  const client = s3ClientPool[currentS3ClientIndex];
  currentS3ClientIndex = (currentS3ClientIndex + 1) % S3_POOL_SIZE;
  return client;
}

// Alias for backward compatibility with wrapped methods that include promise() access
const s3Client = {
  getObject: (params) => getS3Client().getObject(params),
  putObject: (params) => getS3Client().putObject(params),
  listObjectsV2: (params) => getS3Client().listObjectsV2(params),
  listObjects: (params) => getS3Client().listObjects(params)
};

// Setup a memory cache for images to reduce R2 load
const imageCache = new Map();
const IMAGE_CACHE_TTL = 1000 * 60 * 60; // 1 hour
const IMAGE_CACHE_MAX_SIZE = 100; // Maximum number of images to cache

// Set up CORS completely permissively (no restrictions)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
});

// Use cors middleware with widest possible settings
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: '*',
  credentials: true
}));

app.use(express.json({ limit: '50mb' })); // Increased limit for larger images

// Create directory for local image caching if it doesn't exist
const localCacheDir = path.join(process.cwd(), 'image_cache');
if (!fs.existsSync(localCacheDir)) {
  fs.mkdirSync(localCacheDir, { recursive: true });
}

// Create directory for public files
const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Serve static files
app.use(express.static(publicDir));

// Serve our R2 fixer script
app.get('/handle-r2-images.js', (req, res) => {
  res.setHeader('Content-Type', 'text/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(process.cwd(), 'handle-r2-images.js'));
});

// Request logging with truncation for large requests
app.use((req, res, next) => {
  const maxBodyLength = 200;
  const bodyStr = req.body ? 
    JSON.stringify(req.body).substring(0, maxBodyLength) + 
    (JSON.stringify(req.body).length > maxBodyLength ? '...' : '') : '';
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${bodyStr}`);
  
  // Track response completion
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] Completed ${res.statusCode} for ${req.method} ${req.url}`);
  });
  
  // Track response errors
  res.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] Response error for ${req.method} ${req.url}:`, error);
  });
  
  next();
});

// Enhanced health check endpoint with S3 connection test
app.get('/health', async (req, res) => {
  try {
    // Test S3 connection by listing a bucket with a small limit
    const testResult = await s3Client.listObjectsV2({
      Bucket: 'tasks',
      MaxKeys: 1
    }).promise().catch(err => ({ error: err.message }));
    
    const s3Status = testResult.error ? 'error' : 'connected';
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      s3Status,
      imageCache: {
        size: imageCache.size,
        maxSize: IMAGE_CACHE_MAX_SIZE
      },
      memoryUsage: process.memoryUsage()
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Health check error:`, error);
    res.status(500).json({ 
      status: 'error', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Clear image cache endpoint for administrators
app.post('/admin/clear-image-cache', (req, res) => {
  const cacheSize = imageCache.size;
  imageCache.clear();
  console.log(`[${new Date().toISOString()}] Image cache cleared (${cacheSize} items)`);
  res.json({ success: true, message: `Image cache cleared (${cacheSize} items)` });
});

// Simple placeholder image endpoint
app.get('/placeholder.jpg', (req, res) => {
  const message = req.query.message || 'Image Not Available';
  const placeholderImage = generatePlaceholderImage(message);
  
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  res.send(placeholderImage);
});

// Direct handler for the problematic image
app.get('/fix-image-narsissist', (req, res) => {
  // Generate a unique, stable local path for this specific image
  const localFilePath = path.join(process.cwd(), 'ready_post', 'instagram', 'narsissist', 'image_1749203937329.jpg');
  
  // First check if we have a local copy
  if (fs.existsSync(localFilePath)) {
    console.log(`[${new Date().toISOString()}] [SPECIAL HANDLER] Serving local file for problematic image`);
    // Set appropriate headers
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Send the file
    return res.sendFile(localFilePath);
  } else {
    // Generate placeholder
    console.log(`[${new Date().toISOString()}] [SPECIAL HANDLER] Generating placeholder for problematic image`);
    const placeholderImage = generatePlaceholderImage('Image for narsissist');
    
    // Set headers
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Send the placeholder
    res.send(placeholderImage);
    
    // Try to save a placeholder for future use
    try {
      fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
      fs.writeFileSync(localFilePath, placeholderImage);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [SPECIAL HANDLER] Error saving placeholder:`, error);
    }
  }
});

// Function to generate a simple placeholder image when needed
function generatePlaceholderImage(text = 'Image Not Available', width = 512, height = 512) {
  try {
    // Create a simple text-based placeholder image
    const frameData = Buffer.alloc(width * height * 4);
    
    // Fill with a light background color
    for (let i = 0; i < width * height; i++) {
      // RGBA: Light blue background
      frameData[i * 4] = 220;     // R
      frameData[i * 4 + 1] = 230; // G
      frameData[i * 4 + 2] = 240; // B
      frameData[i * 4 + 3] = 255; // A
    }
    
    // Create JPEG image
    const rawImageData = {
      data: frameData,
      width,
      height
    };
    
    // Convert to JPEG
    return jpeg.encode(rawImageData, 90).data;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error generating placeholder image:`, error);
    // Return a minimal 1x1 transparent pixel as ultimate fallback
    return Buffer.from([
      0xFF, 0xD8, // JPEG SOI marker
      0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, // JFIF header
      0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, // DQT marker
      0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, // SOF marker
      0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, // DHT marker
      0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D, 0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08, 0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9, 0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2, 0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, // DHT marker
      0xFF, 0xDA, 0x00, 0x0C, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, // SOS marker
      0x01, 0x51, 0x00, // Image data
      0xFF, 0xD9 // EOI marker
    ]);
  }
}

// Enhanced image retrieval with multi-level fallbacks
async function fetchImageWithFallbacks(key, fallbackImagePath = null, username = null, filename = null) {
  // Check memory cache first
  const cacheKey = `r2_${key}`;
  if (imageCache.has(cacheKey)) {
    const { data, timestamp } = imageCache.get(cacheKey);
    if (Date.now() - timestamp < IMAGE_CACHE_TTL) {
      console.log(`[${new Date().toISOString()}] [IMAGE] Using cached image for ${key}`);
      return { data, source: 'memory-cache' };
    }
    // Cache expired
    imageCache.delete(cacheKey);
  }
  
  // Create path for local file cache
  const hashedKey = Buffer.from(key).toString('base64').replace(/[\/\+\=]/g, '_');
  const localCacheFilePath = path.join(localCacheDir, hashedKey);
  
  try {
    // Try local file cache first
    if (fs.existsSync(localCacheFilePath)) {
      console.log(`[${new Date().toISOString()}] [IMAGE] Using local cached image for ${key}`);
      const data = fs.readFileSync(localCacheFilePath);
      
      // Refresh memory cache
      imageCache.set(cacheKey, { 
        data, 
        timestamp: Date.now() 
      });
      
      // Limit cache size
      if (imageCache.size > IMAGE_CACHE_MAX_SIZE) {
        const oldestKey = Array.from(imageCache.keys())[0];
        imageCache.delete(oldestKey);
      }
      
      return { data, source: 'file-cache' };
    }
    
    // If not in cache, fetch from R2
    console.log(`[${new Date().toISOString()}] [IMAGE] Fetching from R2: ${key}`);
    
    // Use the S3 client pool for better resilience
    const s3 = getS3Client();
    const data = await s3.getObject({
      Bucket: 'tasks',
      Key: key
    }).promise();
    
    // Save to local file cache
    fs.writeFileSync(localCacheFilePath, data.Body);
    
    // Save to memory cache
    imageCache.set(cacheKey, {
      data: data.Body,
      timestamp: Date.now()
    });
    
    // Limit cache size
    if (imageCache.size > IMAGE_CACHE_MAX_SIZE) {
      const oldestKey = Array.from(imageCache.keys())[0];
      imageCache.delete(oldestKey);
    }
    
    return { data: data.Body, source: 'r2' };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [IMAGE] Error fetching from R2: ${key}`, error.message);
    
    // Try fallback image path if provided
    if (fallbackImagePath && fs.existsSync(fallbackImagePath)) {
      console.log(`[${new Date().toISOString()}] [IMAGE] Using fallback image: ${fallbackImagePath}`);
      const data = fs.readFileSync(fallbackImagePath);
      return { data, source: 'fallback-file' };
    }
    
    // If username and filename are provided, check for alternate image names
    if (username && filename) {
      // Try different timestamp formats that might exist
      const timestampMatch = filename.match(/_(\d+)\.jpg$/);
      if (timestampMatch && timestampMatch[1]) {
        const timestamp = parseInt(timestampMatch[1]);
        const alternativeKeys = [
          `ready_post/instagram/${username}/image_${timestamp}.jpg`,
          `ready_post/instagram/${username}/image_${timestamp-1}.jpg`,
          `ready_post/instagram/${username}/image_${timestamp+1}.jpg`
        ];
        
        // Try alternative keys
        for (const altKey of alternativeKeys) {
          if (altKey === key) continue; // Skip the original key
          
          try {
            console.log(`[${new Date().toISOString()}] [IMAGE] Trying alternative key: ${altKey}`);
            const s3 = getS3Client();
            const data = await s3.getObject({
              Bucket: 'tasks',
              Key: altKey
            }).promise();
            
            // Cache the successful result
            const hashedAltKey = Buffer.from(altKey).toString('base64').replace(/[\/\+\=]/g, '_');
            const localCacheAltPath = path.join(localCacheDir, hashedAltKey);
            fs.writeFileSync(localCacheAltPath, data.Body);
            
            // Also save a copy at the original path for future requests
            fs.writeFileSync(localCacheFilePath, data.Body);
            
            return { data: data.Body, source: 'r2-alternative' };
          } catch (altError) {
            // Continue to next alternative
          }
        }
      }
    }
    
    // Generate placeholder as last resort
    console.log(`[${new Date().toISOString()}] [IMAGE] Generating placeholder image for ${key}`);
    const placeholderText = `Image Not Available${username ? `\n${username}` : ''}`;
    const placeholderImage = generatePlaceholderImage(placeholderText);
    return { data: placeholderImage, source: 'placeholder' };
  }
}

// Update the fix-image endpoint with our enhanced fetching and emergency recovery
app.get('/fix-image/:username/:filename', async (req, res) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 15);
  
  // Setup request timeout detector - if the request hasn't completed in 15 seconds, 
  // we'll short-circuit and send a placeholder to prevent blocking threads
  let timeoutTriggered = false;
  const requestTimeout = setTimeout(() => {
    timeoutTriggered = true;
    try {
      console.error(`[${new Date().toISOString()}] [FIX-IMAGE:${requestId}] Request timeout triggered, sending emergency placeholder`);
      
      // Only proceed if headers haven't been sent
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'no-cache, no-store');
        res.setHeader('X-Image-Source', 'timeout-placeholder');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      
        // Send the simplest possible placeholder image
        const placeholderImage = generatePlaceholderImage('Image Timeout');
        res.send(placeholderImage);
      }
    } catch (timeoutError) {
      console.error(`[${new Date().toISOString()}] [FIX-IMAGE:${requestId}] Error in timeout handler:`, timeoutError);
      // If this also fails, try to end the response
      if (!res.finished) {
        res.status(500).end();
      }
    }
  }, 15000); // 15 second timeout
  
  try {
    // Extract and normalize parameters
    const username = (req.params.username || '').trim().toLowerCase();
    let filename = (req.params.filename || '').trim();
    
    // Fix platform extraction - remove any extra query parameters that got mixed in
    let platform = (req.query.platform || 'instagram').toString().trim().toLowerCase();
    if (platform.includes('?')) {
      platform = platform.split('?')[0]; // Remove any additional query params
    }
    if (platform.includes('&')) {
      platform = platform.split('&')[0]; // Remove any additional query params
    }
    
    // Add basic parameter validation with fallbacks
    if (!username) {
      console.error(`[${new Date().toISOString()}] [FIX-IMAGE:${requestId}] Missing username`);
      clearTimeout(requestTimeout);
      return sendPlaceholder(res, 'Missing Username');
    }
    
    if (!filename) {
      console.error(`[${new Date().toISOString()}] [FIX-IMAGE:${requestId}] Missing filename`);
      clearTimeout(requestTimeout);
      return sendPlaceholder(res, 'Missing Filename');
    }
    
    // Normalize the filename - ensure it has correct format
    if (!filename.startsWith('image_') && filename.endsWith('.jpg')) {
      // Try to extract timestamp and rebuild filename
      const timestampMatch = filename.match(/(\d+)\.jpg$/);
      if (timestampMatch) {
        console.log(`[${new Date().toISOString()}] [FIX-IMAGE:${requestId}] Normalizing filename from ${filename} to image_${timestampMatch[1]}.jpg`);
        filename = `image_${timestampMatch[1]}.jpg`;
      }
    }
    
    // Construct the key for R2 storage
    const key = `ready_post/${platform}/${username}/${filename}`;
    
    console.log(`[${new Date().toISOString()}] [FIX-IMAGE:${requestId}] Request for ${platform}/${username}/${filename}`);
    
    // Create fallback path
    const localFallbackPath = path.join(process.cwd(), 'ready_post', platform, username, filename);
    
    // Fetch image with all our fallbacks
    const { data, source } = await fetchImageWithFallbacks(key, localFallbackPath, username, filename);
    
    // If the timeout was triggered, don't continue processing
    if (timeoutTriggered) {
      console.log(`[${new Date().toISOString()}] [FIX-IMAGE:${requestId}] Timeout was triggered, abandoning response`);
      return;
    }
    
    // Clear the timeout since we got a successful response
    clearTimeout(requestTimeout);
    
    // Set appropriate headers if they haven't been sent
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('X-Image-Source', source); // For debugging
      res.setHeader('X-Request-ID', requestId); // For tracing
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'X-Image-Source, X-Request-ID');
      
      // Send the image
      res.send(data);
      
      // Log performance
      const duration = Date.now() - startTime;
      console.log(`[${new Date().toISOString()}] [FIX-IMAGE:${requestId}] Served ${platform}/${username}/${filename} from ${source} in ${duration}ms`);
    }
  } catch (error) {
    // Clear the timeout since we're handling the error
    clearTimeout(requestTimeout);
    
    console.error(`[${new Date().toISOString()}] [FIX-IMAGE:${requestId}] Error serving image:`, error.message);
    
    // Send placeholder if headers haven't been sent
    if (!res.headersSent) {
      return sendPlaceholder(res, 'Image Error', requestId);
    }
  }
  
  // Helper function for sending placeholder images
  function sendPlaceholder(res, message = 'Image Error', requestId = 'unknown') {
    try {
      const placeholderImage = generatePlaceholderImage(message);
      
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'no-cache, no-store');
      res.setHeader('X-Image-Source', 'error-placeholder');
      res.setHeader('X-Request-ID', requestId);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Expose-Headers', 'X-Image-Source, X-Request-ID');
      
      res.send(placeholderImage);
      
      console.log(`[${new Date().toISOString()}] [FIX-IMAGE:${requestId}] Sent placeholder image with message: "${message}"`);
      return true;
    } catch (placeholderError) {
      console.error(`[${new Date().toISOString()}] [FIX-IMAGE:${requestId}] Error generating placeholder:`, placeholderError);
      
      // Last resort: Send a transparent 1x1 GIF
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'image/gif');
        res.setHeader('Cache-Control', 'no-cache, no-store');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
      }
      return false;
    }
  }
});

// Enhance the r2-images endpoint with similar improvements
app.get('/r2-images/:username/:filename', async (req, res) => {
  const startTime = Date.now();
  try {
    const { username, filename } = req.params;
    const platform = req.query.platform || 'instagram';
    const key = `ready_post/${platform}/${username}/${filename}`;
    
    console.log(`[${new Date().toISOString()}] [R2-IMAGES] Requesting image: ${key}`);
    
    // Create fallback path
    const localFallbackPath = path.join(process.cwd(), 'ready_post', platform, username, filename);
    
    // Fetch image with all our fallbacks
    const { data, source } = await fetchImageWithFallbacks(key, localFallbackPath, username, filename);
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Image-Source', source); // For debugging
    res.setHeader('Access-Control-Expose-Headers', 'X-Image-Source');
    
    // Send the image
    res.send(data);
    
    // Log performance
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] [R2-IMAGES] Served ${platform}/${username}/${filename} from ${source} in ${duration}ms`);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [R2-IMAGES] Error:`, error);
    
    // Generate and send placeholder
    try {
      const placeholderImage = generatePlaceholderImage('Image Error');
      
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'no-cache, no-store');
      res.setHeader('X-Image-Source', 'error-placeholder');
      
      res.send(placeholderImage);
    } catch (placeholderError) {
      // Last resort: Send a transparent 1x1 GIF
      res.setHeader('Content-Type', 'image/gif');
      res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    }
  }
});

// Add a middleware to inject our R2 fixer into HTML responses
app.use((req, res, next) => {
  // Save the original send method
  const originalSend = res.send;
  
  // Override the send method
  res.send = function(body) {
    // Only process HTML responses
    if (typeof body === 'string' && body.includes('<!DOCTYPE html>')) {
      console.log(`[${new Date().toISOString()}] [HTML-INJECTOR] Injecting R2 fixer into HTML response`);
      
      // Create a script tag that loads our R2 fixer
      const scriptInjection = `
        <script>
          // Dynamically load the R2 fixer script
          (function() {
            console.log("Loading R2 fixer script...");
            const script = document.createElement('script');
            script.src = "${req.protocol}://${req.get('host') || 'localhost:3002'}/handle-r2-images.js?t=" + Date.now();
            script.async = true;
            script.onerror = function() {
              console.error("Failed to load R2 fixer script");
              // Create a simple inline fixer as backup
              const backupScript = document.createElement('script');
              backupScript.textContent = \`
                // Simple backup fixer
                document.addEventListener('error', function(e) {
                  if (e.target.tagName === 'IMG') {
                    const src = e.target.src;
                    if (src && (src.includes('r2.cloudflarestorage.com') || src.includes('r2.dev'))) {
                      console.log("Fixing R2 image URL:", src);
                      e.preventDefault();
                      
                      // Try to extract username and filename
                      const parts = src.split('/');
                      let username = null;
                      let filename = null;
                      
                      for (let i = 0; i < parts.length; i++) {
                        if (parts[i] === 'narsissist') {
                          username = 'narsissist';
                          // Look for the next part that ends with .jpg
                          for (let j = i + 1; j < parts.length; j++) {
                            if (parts[j].endsWith('.jpg')) {
                              filename = parts[j];
                              break;
                            }
                          }
                          break;
                        }
                      }
                      
                      if (username && filename) {
                        const newSrc = "${req.protocol}://${req.get('host') || 'localhost:3002'}/fix-image/" + username + "/" + filename + "?platform=instagram";
                        console.log("Using proxy URL:", newSrc);
                        e.target.src = newSrc;
                      } else {
                        e.target.src = "${req.protocol}://${req.get('host') || 'localhost:3002'}/placeholder.jpg";
                      }
                    }
                  }
                }, true);
              \`;
              document.head.appendChild(backupScript);
            };
            document.head.appendChild(script);
          })();
        </script>
      `;
      
      // Inject script before closing head tag
      if (body.includes('</head>')) {
        body = body.replace('</head>', scriptInjection + '</head>');
      } else {
        // If no head tag, inject at the beginning of the document
        body = body.replace('<!DOCTYPE html>', '<!DOCTYPE html>' + scriptInjection);
      }
    }
    
    return originalSend.call(this, body);
  };
  
  next();
});

// Update download image function to be more robust
async function downloadImage(imageUrl, outputPath) {
  try {
    console.log(`[${new Date().toISOString()}] [IMAGE DOWNLOAD] Downloading image from: ${imageUrl}...`);
    
    // Create directory if it doesn't exist
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Try different approaches
    let imageData;
    
    // First try with axios
    try {
      const response = await axios({
        method: 'GET',
        url: imageUrl,
        responseType: 'arraybuffer',
        timeout: 15000, // 15 seconds timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (response.status === 200) {
        imageData = Buffer.from(response.data);
      } else {
        throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
      }
    } catch (axiosError) {
      console.log(`[${new Date().toISOString()}] [IMAGE DOWNLOAD] Axios download failed, trying fetch: ${axiosError.message}`);
      
      // Second try with fetch
      const fetchResponse = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 15000
      });
      
      if (!fetchResponse.ok) {
        throw new Error(`Fetch failed with status: ${fetchResponse.status}`);
      }
      
      const arrayBuffer = await fetchResponse.arrayBuffer();
      imageData = Buffer.from(arrayBuffer);
    }
    
    // Validate the image data
    if (!imageData || imageData.length === 0) {
      throw new Error('Empty image data received');
    }
    
    // Check if it's a valid JPEG image
    if (!(imageData[0] === 0xFF && imageData[1] === 0xD8)) {
      console.warn(`[${new Date().toISOString()}] [IMAGE DOWNLOAD] Downloaded data is not a valid JPEG image`);
    }
    
    // Write the image data to file
    fs.writeFileSync(outputPath, imageData);
    console.log(`[${new Date().toISOString()}] [IMAGE DOWNLOAD] Image downloaded successfully to ${outputPath}`);
    
    return outputPath;
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [IMAGE DOWNLOAD] Error downloading image: ${error.message}`);
    
    // Generate a placeholder image and save it instead as fallback
    console.log(`[${new Date().toISOString()}] [IMAGE DOWNLOAD] Generating placeholder image as fallback`);
    
    try {
      const placeholderImage = generatePlaceholderImage('Download Failed');
      fs.writeFileSync(outputPath, placeholderImage);
      console.log(`[${new Date().toISOString()}] [IMAGE DOWNLOAD] Saved placeholder image to ${outputPath}`);
      return outputPath;
    } catch (placeholderError) {
      throw new Error(`Image download failed and placeholder generation failed: ${placeholderError.message}`);
    }
  }
}

// Add a periodic task to clean the image cache
setInterval(() => {
  try {
    const now = Date.now();
    let expiredCount = 0;
    
    // Clean memory cache
    for (const [key, { timestamp }] of imageCache.entries()) {
      if (now - timestamp > IMAGE_CACHE_TTL) {
        imageCache.delete(key);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      console.log(`[${new Date().toISOString()}] [CACHE] Cleared ${expiredCount} expired items from memory cache`);
    }
    
    // Clean disk cache (every hour)
    if (Math.random() < 0.01) { // ~1% chance each time this runs
      console.log(`[${new Date().toISOString()}] [CACHE] Starting disk cache cleanup...`);
      
      // Read all cache files
      const cacheFiles = fs.readdirSync(localCacheDir);
      let diskExpiredCount = 0;
      
      for (const file of cacheFiles) {
        const filePath = path.join(localCacheDir, file);
        try {
          const stats = fs.statSync(filePath);
          // Remove files older than 1 day
          if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
            fs.unlinkSync(filePath);
            diskExpiredCount++;
          }
        } catch (error) {
          console.error(`[${new Date().toISOString()}] [CACHE] Error cleaning cache file ${file}:`, error.message);
        }
      }
      
      if (diskExpiredCount > 0) {
        console.log(`[${new Date().toISOString()}] [CACHE] Cleared ${diskExpiredCount} expired items from disk cache`);
      }
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [CACHE] Error during cache cleanup:`, error);
  }
}, 5 * 60 * 1000); // Run every 5 minutes

// Enhanced signed URL generator with R2 optimization
app.get('/api/signed-image-url/:username/:imageKey', async (req, res) => {
  const { username, imageKey } = req.params;
  const platform = req.query.platform || 'instagram';
  
  try {
    const key = `ready_post/${platform}/${username}/${imageKey}`;
    console.log(`[${new Date().toISOString()}] [SIGNED-URL] Generating signed URL for: ${key}`);
    
    // Check if the object exists first
    const client = getS3Client();
    try {
      await client.headObject({
        Bucket: 'tasks',
        Key: key,
      }).promise();
    } catch (headError) {
      console.error(`[${new Date().toISOString()}] [SIGNED-URL] Image not found: ${key}`, headError.message);
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Generate signed URL with extended expiry for better UX
    const signedUrl = client.getSignedUrl('getObject', {
      Bucket: 'tasks',
      Key: key,
      Expires: 7200 // 2 hours for better user experience
    });
    
    // Also provide our direct R2 endpoint as fallback
    const directUrl = `${req.protocol}://${req.get('host')}/api/r2-image/${username}/${imageKey}?platform=${platform}`;
    
    res.json({ 
      url: signedUrl,
      directUrl: directUrl,
      key: key
    });
    
    console.log(`[${new Date().toISOString()}] [SIGNED-URL] Generated signed URL successfully for: ${key}`);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [SIGNED-URL] Failed to generate signed URL for`, req.params, error?.message);
    res.status(500).json({ error: 'Failed to generate signed URL' });
  }
});

// Direct R2 Image Renderer - handles JPG images seamlessly from Cloudflare R2
app.get('/api/r2-image/:username/:imageKey', async (req, res) => {
  const { username, imageKey } = req.params;
  const platform = req.query.platform || 'instagram';
  
  try {
    // Construct the R2 key path
    const r2Key = `ready_post/${platform}/${username}/${imageKey}`;
    
    console.log(`[${new Date().toISOString()}] [R2-IMAGE] Fetching image: ${r2Key}`);
    
    // Use our existing fetch mechanism with fallbacks
    const localFallbackPath = path.join(process.cwd(), 'ready_post', platform, username, imageKey);
    const { data, source } = await fetchImageWithFallbacks(r2Key, localFallbackPath, username, imageKey);
    
    // Set appropriate headers for JPG images
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', data.length);
    
    // Check if this is a real-time or cache-busting request
    const isRealTime = req.query.realtime || req.query.nocache || req.query.cb || req.query.updated || req.query.v;
    
    if (isRealTime) {
      // REAL-TIME MODE: Aggressive no-cache for always fresh content
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Last-Modified', new Date().toUTCString());
      res.setHeader('X-Real-Time', 'true');
      console.log(`[${new Date().toISOString()}] [R2-IMAGE] REAL-TIME serving for ${imageKey}`);
    } else {
      // Normal caching for regular requests  
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
    
    res.setHeader('ETag', `"${imageKey}-${Date.now()}"`);
    res.setHeader('Last-Modified', new Date().toUTCString());
    res.setHeader('X-Image-Source', source); // For debugging
    
    // Enable CORS for cross-origin requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Expose-Headers', 'X-Image-Source, ETag, Last-Modified');
    
    // Send the image buffer directly
    res.send(data);
    
    console.log(`[${new Date().toISOString()}] [R2-IMAGE] Successfully served: ${r2Key} (${data.length} bytes) from ${source}`);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [R2-IMAGE] Error serving image ${username}/${imageKey}:`, error);
    
    // Generate and send placeholder
    try {
      const placeholderImage = generatePlaceholderImage('Image Error');
      
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'no-cache, no-store');
      res.setHeader('X-Image-Source', 'error-placeholder');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      
      res.send(placeholderImage);
    } catch (placeholderError) {
      res.status(500).json({ error: 'Failed to retrieve image and generate placeholder' });
    }
  }
});

// HEAD handler for R2 image endpoint (for testing accessibility)
app.head('/api/r2-image/:username/:imageKey', async (req, res) => {
  const { username, imageKey } = req.params;
  const platform = req.query.platform || 'instagram';
  
  try {
    const r2Key = `ready_post/${platform}/${username}/${imageKey}`;
    
    console.log(`[${new Date().toISOString()}] [R2-IMAGE-HEAD] Checking image accessibility: ${r2Key}`);
    
    // Use our existing fetch mechanism to check if image exists
    const localFallbackPath = path.join(process.cwd(), 'ready_post', platform, username, imageKey);
    const { data, source } = await fetchImageWithFallbacks(r2Key, localFallbackPath, username, imageKey);
    
    // Set headers without body (HEAD request)
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', data.length);
    
    // Check if this is a cache-busting request
    const isCacheBusting = req.query.cb || req.query.updated || req.query.v;
    
    if (isCacheBusting) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
    
    res.setHeader('ETag', `"${imageKey}-${Date.now()}"`);
    res.setHeader('Last-Modified', new Date().toUTCString());
    res.setHeader('X-Image-Source', source);
    
    // Enable CORS for cross-origin requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Expose-Headers', 'X-Image-Source, ETag, Last-Modified');
    
    res.status(200).end(); // HEAD response - no body
    
    console.log(`[${new Date().toISOString()}] [R2-IMAGE-HEAD] Image accessible: ${r2Key} (${data.length} bytes) from ${source}`);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [R2-IMAGE-HEAD] Error checking image ${username}/${imageKey}:`, error);
    
    // Return 404 for HEAD request
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.status(404).end();
  }
});

// OPTIONS handler for R2 image endpoint
app.options('/api/r2-image/:username/:imageKey', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(204).end();
});

// Get posts for a user - essential for PostCooked module refresh
// Add both /posts/ and /api/posts/ for compatibility
app.get('/posts/:username', async (req, res) => {
  return handlePostsEndpoint(req, res);
});

app.get('/api/posts/:username', async (req, res) => {
  return handlePostsEndpoint(req, res);
});

// Combined handler for posts endpoint
async function handlePostsEndpoint(req, res) {
  const { username } = req.params;
  const platform = req.query.platform || 'instagram';
  const forceRefresh = req.query.forceRefresh === 'true';
  const isRealTime = req.query.realtime || req.query.nocache;
  
  try {
    console.log(`[${new Date().toISOString()}] [API-POSTS] Fetching posts for ${username} on ${platform} (forceRefresh: ${forceRefresh}, realTime: ${!!isRealTime})`);
    
    // Set real-time headers if requested
    if (isRealTime) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Real-Time', 'true');
      console.log(`[${new Date().toISOString()}] [API-POSTS] REAL-TIME mode activated for ${username}`);
    }
    
    // Clear cache if force refresh or real-time is requested
    if (forceRefresh || isRealTime) {
      const cacheKey = `ready_post/${platform}/${username}/`;
      console.log(`[${new Date().toISOString()}] [API-POSTS] Clearing ALL caches for: ${cacheKey}`);
      // Clear memory cache
      for (const key of imageCache.keys()) {
        if (key.startsWith(cacheKey)) {
          imageCache.delete(key);
        }
      }
    }
    
    // List all JSON files for this user/platform
    const prefix = `ready_post/${platform}/${username}/`;
    const client = getS3Client();
    
    const listParams = {
      Bucket: 'tasks',
      Prefix: prefix,
      MaxKeys: 1000
    };
    
    const listResult = await client.listObjectsV2(listParams).promise();
    
    if (!listResult.Contents || listResult.Contents.length === 0) {
      console.log(`[${new Date().toISOString()}] [API-POSTS] No posts found for ${username} on ${platform}`);
      return res.json([]);
    }
    
    // Filter for JSON files (posts) and fetch their data
    const jsonFiles = listResult.Contents
      .filter(obj => obj.Key.endsWith('.json'))
      .sort((a, b) => new Date(b.LastModified).getTime() - new Date(a.LastModified).getTime()); // Sort by newest first
    
    console.log(`[${new Date().toISOString()}] [API-POSTS] Found ${jsonFiles.length} posts for ${username}`);
    
    const posts = [];
    
    for (const file of jsonFiles) {
      try {
        // Get the post data
        const getParams = {
          Bucket: 'tasks',
          Key: file.Key
        };
        
        const postResponse = await client.getObject(getParams).promise();
        let postData;
        
        if (postResponse.Body) {
          const bodyString = postResponse.Body.toString('utf-8');
          if (bodyString.trim()) {
            postData = JSON.parse(bodyString);
          } else {
            console.warn(`[${new Date().toISOString()}] [API-POSTS] Empty post data for ${file.Key}`);
            continue;
          }
        } else {
          console.warn(`[${new Date().toISOString()}] [API-POSTS] No body for ${file.Key}`);
          continue;
        }
        
        // Determine image URL
        let imageUrl = null;
        let r2ImageUrl = null;
        
        // Extract image key from post data or file key
        let imageKey = null;
        if (file.Key.includes('ready_post_') && file.Key.endsWith('.json')) {
          const match = file.Key.match(/ready_post_(\d+)\.json$/);
          if (match) {
            imageKey = `image_${match[1]}.jpg`;
          }
        }
        
        if (imageKey) {
          // Use our fix-image endpoint for reliable image serving
          imageUrl = `http://localhost:3002/fix-image/${username}/${imageKey}?platform=${platform}`;
          r2ImageUrl = `http://localhost:3002/api/r2-image/${username}/${imageKey}?platform=${platform}`;
        }
        
        // Extract and properly structure post data for frontend
        const structuredPostData = {
          caption: postData.caption || postData.post?.caption || '',
          hashtags: postData.hashtags || postData.post?.hashtags || [],
          call_to_action: postData.call_to_action || postData.post?.call_to_action || '',
          status: postData.status || 'ready',
          created_at: postData.created_at || postData.timestamp || file.LastModified,
          updated_at: postData.updated_at || postData.last_edited || file.LastModified
        };
        
        // Create post entry with proper structure that matches frontend expectations
        const postEntry = {
          key: file.Key,
          data: {
            post: {
              caption: structuredPostData.caption,
              hashtags: structuredPostData.hashtags,
              call_to_action: structuredPostData.call_to_action,
              ...postData.post // Include any other post fields
            },
            status: structuredPostData.status,
            image_url: imageUrl,
            r2_image_url: r2ImageUrl,
            created_at: structuredPostData.created_at,
            updated_at: structuredPostData.updated_at
          }
        };
        
        posts.push(postEntry);
        console.log(`[${new Date().toISOString()}] [API-POSTS] Added post: ${file.Key} with caption: "${structuredPostData.caption.substring(0, 50)}..."`);
        
      } catch (postError) {
        console.error(`[${new Date().toISOString()}] [API-POSTS] Error processing post ${file.Key}:`, postError.message);
        // Continue with other posts even if one fails
      }
    }
    
    console.log(`[${new Date().toISOString()}] [API-POSTS] Successfully fetched ${posts.length} posts for ${username} with complete JSON data`);
    res.json(posts);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [API-POSTS] Error fetching posts for ${username}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch posts', 
      details: error.message 
    });
  }
}

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Add save edited post endpoint for Canvas Editor
app.post('/api/save-edited-post/:username', upload.single('image'), async (req, res) => {
  const { username } = req.params;
  
  console.log(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Received request for user: ${username}`);
  console.log(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Content-Type: ${req.get('Content-Type')}`);
  console.log(`[${new Date().toISOString()}] [SAVE-EDITED-POST] File:`, req.file ? `${req.file.size} bytes` : 'No file');
  console.log(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Body:`, req.body);
  
  try {
    const imageData = req.file ? req.file.buffer : null;
    const postKey = req.body.postKey;
    const caption = req.body.caption;
    const platform = req.body.platform || 'instagram';
    
    if (!imageData || !postKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing required data: image or postKey'
      });
    }
    
    console.log(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Processing save for postKey: ${postKey}`);
    
    // Extract image key from post key
    // Expected format: ready_post/instagram/username/ready_post_1749203937329.json
    let imageKey = null;
    if (postKey.includes('ready_post_') && postKey.endsWith('.json')) {
      const match = postKey.match(/ready_post_(\d+)\.json$/);
      if (match) {
        imageKey = `image_${match[1]}.jpg`;
      }
    }
    
    if (!imageKey) {
      return res.status(400).json({
        success: false,
        error: 'Could not extract image key from post key'
      });
    }
    
    console.log(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Extracted imageKey: ${imageKey}`);
    
    // Save the edited image to R2 with the EXACT same name and location
    const imageR2Key = `ready_post/${platform}/${username}/${imageKey}`;
    const client = getS3Client();
    
    console.log(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Saving edited image to R2: ${imageR2Key}`);
    
    const putImageParams = {
      Bucket: 'tasks',
      Key: imageR2Key,
      Body: imageData,
      ContentType: 'image/jpeg',
      CacheControl: 'no-cache' // Force refresh
    };
    
    await client.putObject(putImageParams).promise();
    console.log(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Successfully saved edited image to R2: ${imageR2Key}`);
    
    // Also save a local copy to the exact same location for caching
    const localImagePath = path.join(process.cwd(), 'ready_post', platform, username, imageKey);
    const localDir = path.dirname(localImagePath);
    
    // Ensure directory exists
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    
    fs.writeFileSync(localImagePath, imageData);
    console.log(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Successfully saved edited image locally: ${localImagePath}`);
    
    // Update the post JSON data if caption was changed
    if (caption !== null && caption !== undefined) {
      try {
        console.log(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Updating post caption in: ${postKey}`);
        
        // Get the existing post data
        const getPostParams = {
          Bucket: 'tasks',
          Key: postKey
        };
        
        const postResponse = await client.getObject(getPostParams).promise();
        let postData = JSON.parse(postResponse.Body.toString('utf-8'));
        
        // Update the caption in the post data
        if (postData.post && postData.post.caption !== undefined) {
          postData.post.caption = caption;
        }
        if (postData.caption !== undefined) {
          postData.caption = caption;
        }
        
        // Add update timestamp
        postData.updated_at = new Date().toISOString();
        postData.last_edited = new Date().toISOString();
        
        // Save updated post data back to R2
        const putPostParams = {
          Bucket: 'tasks',
          Key: postKey,
          Body: JSON.stringify(postData, null, 2),
          ContentType: 'application/json',
          CacheControl: 'no-cache'
        };
        
        await client.putObject(putPostParams).promise();
        console.log(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Successfully updated post data: ${postKey}`);
        
      } catch (postUpdateError) {
        console.error(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Error updating post data:`, postUpdateError);
        // Continue even if post update fails - the image was saved
      }
    }
    
    // Clear ALL caches for this user/platform to force refresh
    const cacheKey = `ready_post/${platform}/${username}/`;
    console.log(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Clearing all caches for: ${cacheKey}`);
    
    // Clear memory cache
    for (const key of imageCache.keys()) {
      if (key.startsWith(cacheKey)) {
        imageCache.delete(key);
        console.log(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Cleared memory cache key: ${key}`);
      }
    }
    
         // Clear local cache files
     try {
       const cacheFiles = fs.readdirSync(localCacheDir).filter(file => 
         file.startsWith(`${username}_${platform}_`)
       );
       for (const file of cacheFiles) {
         const fullPath = path.join(localCacheDir, file);
         fs.unlinkSync(fullPath);
         console.log(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Cleared local cache file: ${fullPath}`);
       }
     } catch (cacheError) {
       console.warn(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Error clearing local cache:`, cacheError.message);
     }
    
    console.log(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Successfully saved edited post for ${username}/${imageKey}`);
    
    // Set aggressive cache-busting headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Last-Modified', new Date().toUTCString());
    
    res.json({ 
      success: true, 
      message: 'Post edit saved successfully',
      imageKey: imageKey,
      postKey: postKey,
      r2Key: imageR2Key,
      timestamp: new Date().toISOString(),
      cacheBuster: Date.now() // For frontend to use
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [SAVE-EDITED-POST] Error saving edited post:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save edited post',
      details: error.message 
    });
  }
});

// Self-healing mechanism to detect and recover from unresponsive states
// Track request processing health
const healthMetrics = {
  lastRequestTime: Date.now(),
  totalRequests: 0,
  failedRequests: 0,
  responseTimes: []
};

// Middleware to track request processing health
app.use((req, res, next) => {
  const requestStart = Date.now();
  healthMetrics.lastRequestTime = requestStart;
  healthMetrics.totalRequests++;
  
  // Track when the response finishes
  res.on('finish', () => {
    const duration = Date.now() - requestStart;
    healthMetrics.responseTimes.push(duration);
    
    // Keep only the last 100 response times
    if (healthMetrics.responseTimes.length > 100) {
      healthMetrics.responseTimes.shift();
    }
    
    // If this was a slow response, log it
    if (duration > 5000) {
      console.warn(`[${new Date().toISOString()}] [HEALTH] Slow response: ${req.method} ${req.url} - ${duration}ms`);
    }
  });
  
  // Track failed requests
  res.on('error', () => {
    healthMetrics.failedRequests++;
  });
  
  next();
});

// Health watchdog timer to detect freeze or deadlock conditions
let watchdogLastCheckin = Date.now();
const WATCHDOG_INTERVAL = 30000; // 30 seconds
const WATCHDOG_MAX_IDLE = 10 * 60 * 1000; // 10 minutes max with no requests before self-restart

const healthWatchdog = setInterval(() => {
  try {
    const now = Date.now();
    watchdogLastCheckin = now;
    
    // Calculate average response time 
    const avgResponseTime = healthMetrics.responseTimes.length > 0 
      ? healthMetrics.responseTimes.reduce((sum, time) => sum + time, 0) / healthMetrics.responseTimes.length
      : 0;
    
    // Log health status periodically
    console.log(`[${new Date().toISOString()}] [HEALTH] Server health check: ` +
      `Requests: ${healthMetrics.totalRequests}, ` +
      `Failures: ${healthMetrics.failedRequests}, ` +
      `Avg Response: ${avgResponseTime.toFixed(2)}ms, ` +
      `Time since last request: ${now - healthMetrics.lastRequestTime}ms`);
    
    // Check for long idle time (no requests)
    if (now - healthMetrics.lastRequestTime > WATCHDOG_MAX_IDLE) {
      console.warn(`[${new Date().toISOString()}] [HEALTH] No requests for ${WATCHDOG_MAX_IDLE/1000} seconds, restarting server...`);
      // Force exit process - process manager should restart it
      process.exit(1); 
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [HEALTH] Error in health watchdog:`, error);
  }
}, WATCHDOG_INTERVAL);

// Ensure watchdog does cleanup
healthWatchdog.unref();

// Secondary deadlock detector (in case event loop is blocked)
const deadlockDetector = setInterval(() => {
  const now = Date.now();
  if (now - watchdogLastCheckin > WATCHDOG_INTERVAL * 3) {
    console.error(`[${new Date().toISOString()}] [HEALTH] Deadlock detected! Watchdog hasn't checked in for ${(now - watchdogLastCheckin)/1000} seconds, forcing restart...`);
    process.exit(2);
  }
}, WATCHDOG_INTERVAL);

deadlockDetector.unref();

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Ready to receive hierarchical data at POST /scrape');
});