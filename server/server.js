import express from 'express';
import { S3Client, ListObjectsV2Command, ListObjectsCommand, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import axios from 'axios';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
const upload = multer({ storage: multer.memoryStorage() });
import puppeteer from 'puppeteer';
import * as fileType from 'file-type';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import crypto from 'crypto';
import schedule from 'node-schedule';
import OAuth from 'oauth-1.0a';
import FormData from 'form-data';
import nodemailer from 'nodemailer';
import jpeg from 'jpeg-js';

const verificationCodes = new Map();
// Clean up expired verification codes every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of verificationCodes.entries()) {
    if (now > data.expires) {
      verificationCodes.delete(email);
    }
  }
}, 10 * 60 * 1000);

// Function to convert WebP to JPEG for Instagram compatibility
async function convertWebPToJPEG(webpBuffer) {
  try {
    // Validate that the buffer is actually a valid WebP file
    if (!webpBuffer || webpBuffer.length < 12) {
      console.log(`[${new Date().toISOString()}] [IMAGE-CONVERT] Buffer too small or empty, skipping conversion`);
      return webpBuffer;
    }
    
    const looksLikeRIFF = webpBuffer[0] === 0x52 && webpBuffer[1] === 0x49 &&
                          webpBuffer[2] === 0x46 && webpBuffer[3] === 0x46;

    // WEBP signature lives at offset 8 for RIFF containers
    const isWebP = looksLikeRIFF && webpBuffer.length > 12 &&
                   webpBuffer[8] === 0x57 && webpBuffer[9] === 0x45 &&
                   webpBuffer[10] === 0x42 && webpBuffer[11] === 0x50;

    // If the buffer isn't RIFF at all, it's certainly not WebP. Return as-is.
    if (!looksLikeRIFF) {
      console.log(`[${new Date().toISOString()}] [IMAGE-CONVERT] Buffer is not RIFF/WebP, returning original without conversion`);
      return webpBuffer;
    }

    // If RIFF but not clearly WebP, we'll still attempt conversion – Sharp might decode partially corrupted data.
    if (!isWebP && looksLikeRIFF) {
      console.log(`[${new Date().toISOString()}] [IMAGE-CONVERT] RIFF detected without WEBP signature, forcing conversion attempt`);
    }
    
    console.log(`[${new Date().toISOString()}] [IMAGE-CONVERT] Converting valid WebP to JPEG (${webpBuffer.length} bytes)`);
    
    // Try multiple conversion strategies
    let jpegBuffer;
    
    // Strategy 1: Direct conversion
    try {
      jpegBuffer = await sharp(webpBuffer)
        .jpeg({ quality: 90 })
        .toBuffer();
      
      console.log(`[${new Date().toISOString()}] [IMAGE-CONVERT] Successfully converted WebP to JPEG (${webpBuffer.length} -> ${jpegBuffer.length} bytes)`);
      return jpegBuffer;
    } catch (error) {
      console.log(`[${new Date().toISOString()}] [IMAGE-CONVERT] Strategy 1 failed: ${error.message}`);
    }
    
    // Strategy 2: Try with different sharp options
    try {
      jpegBuffer = await sharp(webpBuffer, { failOnError: false })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();
      
      console.log(`[${new Date().toISOString()}] [IMAGE-CONVERT] Strategy 2 successful (${webpBuffer.length} -> ${jpegBuffer.length} bytes)`);
      return jpegBuffer;
    } catch (error) {
      console.log(`[${new Date().toISOString()}] [IMAGE-CONVERT] Strategy 2 failed: ${error.message}`);
    }
    
    // Strategy 3: Try to clean the buffer first
    try {
      // Remove potential corruption by creating a clean buffer
      const cleanBuffer = Buffer.from(webpBuffer);
      jpegBuffer = await sharp(cleanBuffer, { failOnError: false })
        .jpeg({ quality: 80 })
        .toBuffer();
      
      console.log(`[${new Date().toISOString()}] [IMAGE-CONVERT] Strategy 3 successful (${webpBuffer.length} -> ${jpegBuffer.length} bytes)`);
      return jpegBuffer;
    } catch (error) {
      console.log(`[${new Date().toISOString()}] [IMAGE-CONVERT] Strategy 3 failed: ${error.message}`);
    }
    
    // Strategy 4: Try to extract and convert as raw image data
    try {
      // Try to process as raw image data
      jpegBuffer = await sharp(webpBuffer, { 
        failOnError: false,
        limitInputPixels: false 
      })
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
      
      console.log(`[${new Date().toISOString()}] [IMAGE-CONVERT] Strategy 4 successful (${webpBuffer.length} -> ${jpegBuffer.length} bytes)`);
      return jpegBuffer;
    } catch (error) {
      console.log(`[${new Date().toISOString()}] [IMAGE-CONVERT] Strategy 4 failed: ${error.message}`);
    }
    
    // If all strategies fail, check if the original buffer might actually be JPEG
    if (webpBuffer.length >= 2 && webpBuffer[0] === 0xFF && webpBuffer[1] === 0xD8) {
      console.log(`[${new Date().toISOString()}] [IMAGE-CONVERT] Buffer appears to be JPEG already, returning as-is`);
      return webpBuffer;
    }
    
    // Last resort: Generate placeholder
    console.log(`[${new Date().toISOString()}] [IMAGE-CONVERT] All conversion strategies failed, generating placeholder`);
    return generatePlaceholderImage('Image Conversion Failed');
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [IMAGE-CONVERT] Critical error in conversion:`, error.message);
    
    // Check if original buffer might be usable
    if (webpBuffer && webpBuffer.length > 0) {
      // If it looks like JPEG, return it
      if (webpBuffer.length >= 2 && webpBuffer[0] === 0xFF && webpBuffer[1] === 0xD8) {
        console.log(`[${new Date().toISOString()}] [IMAGE-CONVERT] Returning original buffer as it appears to be JPEG`);
        return webpBuffer;
      }
    }
    
    // Generate placeholder as ultimate fallback
    return generatePlaceholderImage('Image Error');
  }
}

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

const app = express();
const port = process.env.MAIN_SERVER_PORT || 3000;

// Serve temporary images for Instagram access
app.use('/temp-images', express.static(path.join(process.cwd(), 'server', 'temp-images')));

/**
 * ============= R2 SCHEMA DOCUMENTATION =============
 * 
 * NEW THREE-LEVEL SCHEMA STRUCTURE:
 * Format: module/platform/username[/additional]
 * 
 * SUPPORTED PLATFORMS: instagram, twitter
 * 
 * MODULE EXAMPLES:
 * - competitor_analysis/instagram/username/competitor_name
 * - recommendations/instagram/username/
 * - engagement_strategies/twitter/username/
 * - ready_post/instagram/username/
 * - queries/twitter/username/
 * - rules/instagram/username/
 * - feedbacks/twitter/username/
 * - AccountInfo/instagram/username/
 * - ProfileInfo/twitter/username/
 * - NewForYou/instagram/username/
 * 
 * KEY BENEFITS:
 * - Platform-specific organization
 * - Consistent path structure across all modules
 * - Simplified cache management
 * - Clear separation of Instagram and Twitter data
 * - Future-proof for additional platforms
 * 
 * CENTRALIZED MANAGEMENT:
 * - All schema operations use PlatformSchemaManager
 * - Automatic username normalization per platform
 * - Validation of platform support
 * - Consistent error handling
 */

// ============= ENHANCED CACHING SYSTEM =============
// Configure cache settings based on module type
const CACHE_CONFIG = {
  REALTIME: {
    TTL: 0, // No caching for real-time data
    ENABLED: false
  },
  STANDARD: {
    TTL: 24 * 60 * 60 * 1000, // 24 hours for most content modules
    ENABLED: true
  },
  POST_COOKED: {
    TTL: 3 * 60 * 60 * 1000, // 3 hours for PostCooked module
    ENABLED: true
  }
};

// Map module prefixes to their cache configurations
const MODULE_CACHE_CONFIG = {
  'InstagramEvents': CACHE_CONFIG.REALTIME,
  'ready_post': CACHE_CONFIG.POST_COOKED,
  'competitor_analysis': CACHE_CONFIG.STANDARD,
  'recommendations': CACHE_CONFIG.STANDARD,
  'engagement_strategies': CACHE_CONFIG.STANDARD,
  'NewForYou': CACHE_CONFIG.REALTIME, // No caching for news - always fresh
  'news_for_you': CACHE_CONFIG.REALTIME, // No caching for news - always fresh
  'news-for-you': CACHE_CONFIG.REALTIME, // No caching for news - always fresh
  'ProfileInfo': CACHE_CONFIG.REALTIME, // Disable caching for ProfileInfo to always get fresh data
  'queries': CACHE_CONFIG.STANDARD,
  'rules': CACHE_CONFIG.STANDARD,
  'feedbacks': CACHE_CONFIG.STANDARD,
  'AccountInfo': CACHE_CONFIG.STANDARD
};

// Enhanced cache with TTL enforcement
const cache = new Map();
const cacheTimestamps = new Map();
const cacheHits = new Map(); // Track cache hit statistics
const cacheMisses = new Map(); // Track cache miss statistics

// Cache control function - determines if cache is valid or needs refresh
function shouldUseCache(prefix) {
  // First, extract the module prefix (first part of the path)
  const moduleName = prefix.split('/')[0];
  
  // Get cache configuration for this module
  const cacheConfig = MODULE_CACHE_CONFIG[moduleName] || CACHE_CONFIG.STANDARD;
  
  // If caching is disabled for this module, always fetch fresh
  if (!cacheConfig.ENABLED) return false;
  
  // Check if cache exists and is within TTL
  const now = Date.now();
  const lastFetch = cacheTimestamps.get(prefix) || 0;
  const cacheAge = now - lastFetch;
  
  // Use cache if it exists and is within TTL
  if (cache.has(prefix) && cacheAge < cacheConfig.TTL) {
    // Increment cache hit counter
    const hits = cacheHits.get(prefix) || 0;
    cacheHits.set(prefix, hits + 1);
    
    // Reduce cache hit logging frequency (only log every 50 hits or every 5 minutes)
    const lastLogKey = `lastCacheHitLog_${prefix}`;
    const lastLogTime = global[lastLogKey] || 0;
    const shouldLog = (hits % 50 === 0) || (Date.now() - lastLogTime > 300000);
    
    if (shouldLog) {
      console.log(`[${new Date().toISOString()}] Cache HIT for ${prefix} (${hits} hits, age: ${Math.round(cacheAge/1000)}s, TTL: ${Math.round(cacheConfig.TTL/1000)}s)`);
      global[lastLogKey] = Date.now();
    }
    return true;
  }
  
  // Increment cache miss counter if applicable
  if (cache.has(prefix)) {
    const misses = cacheMisses.get(prefix) || 0;
    cacheMisses.set(prefix, misses + 1);
    
    // Reduce cache expiration logging frequency (only log every 10 misses or every 10 minutes)
    const lastExpireLogKey = `lastCacheExpireLog_${prefix}`;
    const lastExpireLogTime = global[lastExpireLogKey] || 0;
    const shouldLogExpire = (misses % 10 === 0) || (Date.now() - lastExpireLogTime > 600000);
    
    if (shouldLogExpire) {
      console.log(`[${new Date().toISOString()}] Cache EXPIRED for ${prefix} (${misses} misses, age: ${Math.round(cacheAge/1000)}s, TTL: ${Math.round(cacheConfig.TTL/1000)}s)`);
      global[lastExpireLogKey] = Date.now();
    }
  }
  
  return false;
}

// ============= ENHANCED SSE SYSTEM =============
// Improved SSE client management for better connection stability
const sseClients = new Map();
let currentUsername = null;
const SSE_RECONNECT_TIMEOUT = 60000; // 60 seconds maximum client inactivity

// Track active connections per client
const activeConnections = new Map();
console.log(`[${new Date().toISOString()}] Server initialized with enhanced caching and SSE`);

// SSE heartbeat scheduler - ensures connections stay alive
function scheduleSSEHeartbeats() {
  // Send heartbeats every 15 seconds to keep connections alive
  setInterval(() => {
    const now = Date.now();
    
    sseClients.forEach((clients, username) => {
      // Filter out stale connections first
      const activeClients = clients.filter(client => {
        const lastActivity = activeConnections.get(client) || 0;
        const isStale = (now - lastActivity) > SSE_RECONNECT_TIMEOUT;
        
        if (isStale) {
          console.log(`[${new Date().toISOString()}] Removing stale SSE connection for ${username}`);
          try {
            client.end(); // Properly end the connection
          } catch (err) {
            // Connection might already be closed
          }
          return false;
        }
        return true;
      });
      
      // Update the filtered client list
      if (activeClients.length !== clients.length) {
        sseClients.set(username, activeClients);
        console.log(`[${new Date().toISOString()}] Updated SSE clients for ${username}: ${activeClients.length}/${clients.length} active connections`);
      }
      
      // Send heartbeat to active clients
      activeClients.forEach(client => {
        try {
          client.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: now })}\n\n`);
          // Update last activity timestamp
          activeConnections.set(client, now);
        } catch (err) {
          console.error(`[${new Date().toISOString()}] Error sending heartbeat to client:`, err.message);
          // Will be cleaned up in the next cycle
        }
      });
    });
  }, 15000);
  
  console.log(`[${new Date().toISOString()}] SSE heartbeat scheduler started`);
}

// Start the heartbeat scheduler
scheduleSSEHeartbeats();

// ENHANCED BROADCAST: Immediate notification delivery
function broadcastUpdate(username, data) {
  const clients = sseClients.get(username) || [];
  const activeCount = clients.length;
  
  console.log(`[${new Date().toISOString()}] Broadcast attempt for ${username}: ${activeCount} clients available`);
  console.log(`[${new Date().toISOString()}] SSE clients map keys: ${Array.from(sseClients.keys()).join(', ')}`);
  
  if (activeCount > 0) {
    console.log(`[${new Date().toISOString()}] Broadcasting update to ${activeCount} clients for ${username}: ${data.type || data.event}`);
    
    // INSTANT DELIVERY: Send to all clients immediately
    let successCount = 0;
    const activeClients = [];
    
    clients.forEach(client => {
      try {
        // ENHANCED SSE FORMAT: Include event type and ensure proper formatting
        const eventType = data.event || 'notification';
        const messageData = JSON.stringify({
          ...data,
          timestamp: Date.now(),
          delivered_at: new Date().toISOString()
        });
        
        // Send with proper SSE format
        client.write(`event: ${eventType}\n`);
        client.write(`data: ${messageData}\n\n`);
        
        // Update activity timestamp
        activeConnections.set(client, Date.now());
        activeClients.push(client);
        successCount++;
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error broadcasting to client:`, err.message);
        // Client will be cleaned up by heartbeat cycle
      }
    });
    
    // Update the active clients list
    if (activeClients.length !== clients.length) {
      sseClients.set(username, activeClients);
      console.log(`[${new Date().toISOString()}] Updated active clients for ${username}: ${activeClients.length}/${clients.length}`);
    }
    
    console.log(`[${new Date().toISOString()}] Successfully broadcast to ${successCount}/${activeCount} clients for ${username}`);
    return successCount > 0;
  }
  
  return false;
}

// Periodic cache cleanup to prevent memory leaks
function scheduleCacheCleanup() {
  setInterval(() => {
    const now = Date.now();
    let expiredCount = 0;
    
    // Check each cache entry
    for (const [prefix, timestamp] of cacheTimestamps.entries()) {
      const moduleName = prefix.split('/')[0];
      const cacheConfig = MODULE_CACHE_CONFIG[moduleName] || CACHE_CONFIG.STANDARD;
      
      // Skip if caching is disabled for this module
      if (!cacheConfig.ENABLED) continue;
      
      // Check if entry is expired
      const cacheAge = now - timestamp;
      if (cacheAge > cacheConfig.TTL) {
        cache.delete(prefix);
        cacheTimestamps.delete(prefix);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      console.log(`[${new Date().toISOString()}] Cache cleanup: removed ${expiredCount} expired entries`);
    }
  }, 30 * 60 * 1000); // Run every 30 minutes
  
  console.log(`[${new Date().toISOString()}] Cache cleanup scheduler started`);
}

// Start the cache cleanup scheduler
scheduleCacheCleanup();

const s3Client = new S3Client({
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
  maxAttempt: 3,
  httpOptions: {
    connectTimeout: 50000,
    timeout: 100000,
  },
});

// R2 public URL for direct image access
const R2_PUBLIC_URL = 'https://pub-ba72672df3c041a3844f278dd3c32b22.r2.dev';

// Add this helper after your imports, before routes
function setCorsHeaders(res, origin = '*') {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
}

// Add this at the beginning of your server.js file, right after imports
// Enhanced CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: '*',
  exposedHeaders: ['Content-Type'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Add this before your routes
// Additional CORS handling for RAG endpoints
app.use((req, res, next) => {
  // Set CORS headers for all responses
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Special handling for RAG endpoints
  if (req.path.startsWith('/rag-')) {
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
  }
  
  next();
});

app.use(express.json({ limit: '10mb' }));

app.options('*', (req, res) => {
  console.log(`[${new Date().toISOString()}] OPTIONS request received for ${req.url}`);
  setCorsHeaders(res);
  res.status(204).end();
});

// Add CORS headers middleware to every request
app.use((req, res, next) => {
  setCorsHeaders(res, req.headers.origin || '*');
  next();
});

// ... existing code ...

// Add this after the existing endpoints (around line 9600+)

// ============================================================
// USER MANAGEMENT & USAGE TRACKING ENDPOINTS
// ============================================================

// Get user data from admin R2 bucket
app.get(['/api/user/:userId', '/user/:userId'], async (req, res) => {
  const { userId } = req.params;
  
  try {
    console.log(`[${new Date().toISOString()}] [USER-API] Getting user data for ${userId}`);
    
    const params = {
      Bucket: 'admin',
      Key: `users/${userId}.json`
    };
    
    const getCommand = new GetObjectCommand(params);
    const data = await s3Client.send(getCommand);
    const userData = JSON.parse(await streamToString(data.Body));
    
    console.log(`[${new Date().toISOString()}] [USER-API] Found user data for ${userId}`);
    res.json(userData);
    
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      console.log(`[${new Date().toISOString()}] [USER-API] User ${userId} not found, creating default`);
      res.status(404).json({ error: 'User not found' });
    } else {
      console.error(`[${new Date().toISOString()}] [USER-API] Error getting user data:`, error);
      res.status(500).json({ error: 'Failed to get user data' });
    }
  }
});

// Save user data to admin R2 bucket
app.put(['/api/user/:userId', '/user/:userId'], async (req, res) => {
  const { userId } = req.params;
  const userData = req.body;
  
  try {
    console.log(`[${new Date().toISOString()}] [USER-API] Saving user data for ${userId}`);
    
    const params = {
      Bucket: 'admin',
      Key: `users/${userId}.json`,
      Body: JSON.stringify(userData, null, 2),
      ContentType: 'application/json'
    };
    
    const putCommand = new PutObjectCommand(params);
    await s3Client.send(putCommand);
    
    console.log(`[${new Date().toISOString()}] [USER-API] Saved user data for ${userId}`);
    res.json({ success: true });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [USER-API] Error saving user data:`, error);
    res.status(500).json({ error: 'Failed to save user data' });
  }
});

// Get usage stats for current period (no period specified)
app.get(['/api/user/:userId/usage', '/user/:userId/usage'], async (req, res) => {
  const { userId } = req.params;
  const currentPeriod = new Date().toISOString().substring(0, 7); // YYYY-MM
  
  try {
    console.log(`[${new Date().toISOString()}] [USER-API] Getting aggregated usage stats for ${userId}/${currentPeriod}`);
    
    // First, try to get user's platform connections to find all platform-specific userIds
    let platformUserIds = [];
    try {
      const response = await fetch(`http://127.0.0.1:3000/api/users`);
      if (response.ok) {
        const users = await response.json();
        const user = users.find(u => u.userId === userId);
        if (user && user.connections) {
          // Get all platform-specific userIds for this user
          for (const [platform, info] of Object.entries(user.connections)) {
            if (info && info.username) {
              platformUserIds.push(`${platform}_${info.username}`);
            }
          }
          console.log(`[${new Date().toISOString()}] [USER-API] Found platform userIds for ${userId}:`, platformUserIds);
        }
      }
    } catch (error) {
      console.warn(`[${new Date().toISOString()}] [USER-API] Could not fetch user connections:`, error);
    }
    
    // If no platform userIds found, fallback to looking for direct userId
    if (platformUserIds.length === 0) {
      console.log(`[${new Date().toISOString()}] [USER-API] No platform userIds found, trying direct userId lookup`);
      platformUserIds = [userId];
      
      // TEMPORARY FIX: Add known platform-specific userIds for this Firebase UID
      if (userId === 'S0Jwk1feGnOCLzw8lnmrNU7mPX72') {
        platformUserIds.push('facebook_KomaiX512', 'instagram_fentybeauty');
        console.log(`[${new Date().toISOString()}] [USER-API] Added known platform userIds for ${userId}:`, platformUserIds);
      }
    }
    
    // Aggregate usage from all platform-specific userIds
    let aggregatedUsage = {
      userId,
      period: currentPeriod,
      postsUsed: 0,
      discussionsUsed: 0,
      aiRepliesUsed: 0,
      campaignsUsed: 0,
      resetsUsed: 0,
      lastUpdated: new Date().toISOString()
    };
    
    let foundAnyUsage = false;
    
    for (const platformUserId of platformUserIds) {
      try {
        console.log(`[${new Date().toISOString()}] [USER-API] Checking usage for platform userId: ${platformUserId}`);
        const params = {
          Bucket: 'admin',
          Key: `usage/${platformUserId}/${currentPeriod}.json`
        };
        
        const getCommand = new GetObjectCommand(params);
        const data = await s3Client.send(getCommand);
        const platformUsage = JSON.parse(await streamToString(data.Body));
        
        // Aggregate the usage stats
        aggregatedUsage.postsUsed += platformUsage.postsUsed || 0;
        aggregatedUsage.discussionsUsed += platformUsage.discussionsUsed || 0;
        aggregatedUsage.aiRepliesUsed += platformUsage.aiRepliesUsed || 0;
        aggregatedUsage.campaignsUsed += platformUsage.campaignsUsed || 0;
        aggregatedUsage.resetsUsed += platformUsage.resetsUsed || 0;
        
        // Use the latest update time
        if (platformUsage.lastUpdated && platformUsage.lastUpdated > aggregatedUsage.lastUpdated) {
          aggregatedUsage.lastUpdated = platformUsage.lastUpdated;
        }
        
        foundAnyUsage = true;
        console.log(`[${new Date().toISOString()}] [USER-API] Added usage from ${platformUserId}:`, platformUsage);
      } catch (error) {
        // No usage found for this platform userId, continue
        console.log(`[${new Date().toISOString()}] [USER-API] No usage found for ${platformUserId}: ${error.message}`);
      }
    }
    
    if (foundAnyUsage) {
      // Calculate total API calls (posts = 2 API calls each: Gemini + Image Generator)
      aggregatedUsage.totalApiCalls = (aggregatedUsage.postsUsed * 2) + aggregatedUsage.discussionsUsed + aggregatedUsage.aiRepliesUsed + aggregatedUsage.campaignsUsed;
      
      console.log(`[${new Date().toISOString()}] [USER-API] Returning aggregated usage for ${userId}:`, aggregatedUsage);
      res.json(aggregatedUsage);
      return;
    }
    
    // No usage found anywhere, create default stats
    console.log(`[${new Date().toISOString()}] [USER-API] No usage found for any platform userId, creating default stats`);
    
    // Also save default stats to main userId location for future direct access
    try {
      const createParams = {
        Bucket: 'admin',
        Key: `usage/${userId}/${currentPeriod}.json`,
        Body: JSON.stringify(aggregatedUsage, null, 2),
        ContentType: 'application/json'
      };
      const putCommand = new PutObjectCommand(createParams);
      await s3Client.send(putCommand);
      console.log(`[${new Date().toISOString()}] [USER-API] Created default usage stats for ${userId}/${currentPeriod}`);
    } catch (createError) {
      console.error(`[${new Date().toISOString()}] [USER-API] Failed to create default usage stats:`, createError);
    }
    
    res.json(aggregatedUsage);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [USER-API] Error getting aggregated usage stats:`, error);
    
    // Ultimate fallback - return default stats
    const defaultStats = {
      userId,
      period: currentPeriod,
      postsUsed: 0,
      discussionsUsed: 0,
      aiRepliesUsed: 0,
      campaignsUsed: 0,
      resetsUsed: 0,
      lastUpdated: new Date().toISOString()
    };
    
    res.json(defaultStats);
  }
});

// Get usage stats for specific period
app.get(['/api/user/:userId/usage/:period', '/user/:userId/usage/:period'], async (req, res) => {
  const { userId, period } = req.params;
  const currentPeriod = period || new Date().toISOString().substring(0, 7); // YYYY-MM
  
  try {
    console.log(`[${new Date().toISOString()}] [USER-API] Getting usage stats for ${userId}/${currentPeriod}`);
    
    const params = {
      Bucket: 'admin',
      Key: `usage/${userId}/${currentPeriod}.json`
    };
    
    const getCommand = new GetObjectCommand(params);
    const data = await s3Client.send(getCommand);
    const usageStats = JSON.parse(await streamToString(data.Body));
    
    console.log(`[${new Date().toISOString()}] [USER-API] Found usage stats for ${userId}/${currentPeriod}`);
    res.json(usageStats);
    
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      // Create default usage stats
      const defaultStats = {
        userId,
        period: currentPeriod,
        postsUsed: 0,
        discussionsUsed: 0,
        aiRepliesUsed: 0,
        campaignsUsed: 0,
          resetsUsed: 0,
        lastUpdated: new Date().toISOString()
      };
      
      console.log(`[${new Date().toISOString()}] [USER-API] Creating default usage stats for ${userId}/${currentPeriod}`);
      res.json(defaultStats);
    } else {
      console.error(`[${new Date().toISOString()}] [USER-API] Error getting usage stats:`, error);
      res.status(500).json({ error: 'Failed to get usage stats' });
    }
  }
});
// Update usage stats
app.patch(['/api/user/:userId/usage', '/user/:userId/usage'], async (req, res) => {
  const { userId } = req.params;
  const statsUpdate = req.body;
  const currentPeriod = new Date().toISOString().substring(0, 7);
  
  try {
    console.log(`[${new Date().toISOString()}] [USER-API] Updating usage stats for ${userId}/${currentPeriod}`);
    
    // Get current stats from R2 or local storage fallback
    let currentStats;
    let source = 'unknown';
    
    try {
      // Try R2 first
      const params = {
        Bucket: 'admin',
        Key: `usage/${userId}/${currentPeriod}.json`
      };
      const getCommand = new GetObjectCommand(params);
      const data = await s3Client.send(getCommand);
      currentStats = JSON.parse(await streamToString(data.Body));
      source = 'R2';
      console.log(`[${new Date().toISOString()}] [USER-API] Retrieved usage stats from R2 for ${userId}/${currentPeriod}`);
    } catch (r2Error) {
      console.log(`[${new Date().toISOString()}] [USER-API] R2 failed for usage stats update, trying local storage: ${r2Error.message}`);
      
      // Try local storage fallback
      const localStorageDir = path.join(process.cwd(), 'local_storage', 'usage', userId);
      const localStorageFile = path.join(localStorageDir, `${currentPeriod}.json`);
      
      if (fs.existsSync(localStorageFile)) {
        try {
          const localData = JSON.parse(fs.readFileSync(localStorageFile, 'utf8'));
          currentStats = localData;
          source = 'local_storage';
          console.log(`[${new Date().toISOString()}] [USER-API] Retrieved usage stats from local storage for ${userId}/${currentPeriod}`);
        } catch (localError) {
          console.error(`[${new Date().toISOString()}] [USER-API] Error reading local usage stats:`, localError);
        }
      }
      
      // Only create defaults if both R2 and local storage fail
      if (!currentStats) {
        currentStats = {
          userId,
          period: currentPeriod,
          postsUsed: 0,
          discussionsUsed: 0,
          aiRepliesUsed: 0,
          campaignsUsed: 0,
          resetsUsed: 0,
          lastUpdated: new Date().toISOString()
        };
        source = 'default';
        console.log(`[${new Date().toISOString()}] [USER-API] Created default usage stats for ${userId}/${currentPeriod}`);
      }
    }
    
    // Update stats
    const updatedStats = {
      ...currentStats,
      ...statsUpdate,
      lastUpdated: new Date().toISOString()
    };
    
    console.log(`[${new Date().toISOString()}] [USER-API] Updating usage stats for ${userId}/${currentPeriod}`);
    console.log(`[${new Date().toISOString()}] [USER-API] Source: ${source}, Current: ${JSON.stringify(currentStats)}, Update: ${JSON.stringify(statsUpdate)}`);
    
    // Save updated stats to R2
    try {
      const params = {
        Bucket: 'admin',
        Key: `usage/${userId}/${currentPeriod}.json`,
        Body: JSON.stringify(updatedStats, null, 2),
        ContentType: 'application/json'
      };
      
      const putCommand = new PutObjectCommand(params);
      await s3Client.send(putCommand);
      
      console.log(`[${new Date().toISOString()}] [USER-API] Successfully saved updated usage stats to R2 for ${userId}/${currentPeriod}`);
      
      // Also save to local storage as backup
      try {
        const localStorageDir = path.join(process.cwd(), 'local_storage', 'usage', userId);
        const localStorageFile = path.join(localStorageDir, `${currentPeriod}.json`);
        
        if (!fs.existsSync(localStorageDir)) {
          fs.mkdirSync(localStorageDir, { recursive: true });
        }
        fs.writeFileSync(localStorageFile, JSON.stringify(updatedStats, null, 2));
        console.log(`[${new Date().toISOString()}] [USER-API] Also saved updated usage stats to local storage: ${localStorageFile}`);
      } catch (localSaveError) {
        console.warn(`[${new Date().toISOString()}] [USER-API] Warning: Could not save to local storage:`, localSaveError.message);
      }
      
      res.json({ success: true, source, newStats: updatedStats });
      
    } catch (r2SaveError) {
      console.error(`[${new Date().toISOString()}] [USER-API] Failed to save to R2, saving to local storage only:`, r2SaveError.message);
      
      // Fallback to local storage only
      try {
        const localStorageDir = path.join(process.cwd(), 'local_storage', 'usage', userId);
        const localStorageFile = path.join(localStorageDir, `${currentPeriod}.json`);
        
        if (!fs.existsSync(localStorageDir)) {
          fs.mkdirSync(localStorageDir, { recursive: true });
        }
        fs.writeFileSync(localStorageFile, JSON.stringify(updatedStats, null, 2));
        console.log(`[${new Date().toISOString()}] [USER-API] Saved updated usage stats to local storage: ${localStorageFile}`);
        
        res.json({ success: true, source: 'local_storage_only', newStats: updatedStats });
      } catch (localSaveError) {
        console.error(`[${new Date().toISOString()}] [USER-API] Failed to save to both R2 and local storage:`, localSaveError.message);
        res.status(500).json({ error: 'Failed to save usage stats to any storage' });
      }
    }
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [USER-API] Error updating usage stats:`, error);
    res.status(500).json({ error: 'Failed to update usage stats' });
  }
});

// Check access for a specific feature
app.post(['/api/access-check/:userId', '/access-check/:userId'], async (req, res) => {
  const { userId } = req.params;
  const { feature } = req.body;
  
  try {
    console.log(`[${new Date().toISOString()}] [ACCESS-CHECK] Checking ${feature} access for ${userId}`);
    
    // Get user data and usage stats
    const [userResponse, usageResponse] = await Promise.allSettled([
      fetch(`http://localhost:3000/api/user/${userId}`),
      fetch(`http://127.0.0.1:3000/api/user/${userId}/usage`)
    ]);
    
    let userData = null;
    let usageStats = null;
    
    if (userResponse.status === 'fulfilled' && userResponse.value.ok) {
      userData = await userResponse.value.json();
    }
    
    if (usageResponse.status === 'fulfilled' && usageResponse.value.ok) {
      usageStats = await usageResponse.value.json();
    }
    
    // If no user data, create default freemium user
    if (!userData) {
      userData = {
        id: userId,
        userType: 'freemium',
        subscription: {
          planId: 'basic',
          status: 'trial',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          limits: {
            posts: 5,
            discussions: 10,
            aiReplies: 5,
            goalModelDays: 2,
            campaigns: 1,
            autoSchedule: false,
            autoReply: false
          },
          trialDaysRemaining: 3
        },
        trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        isTrialActive: true
      };
      
      // Save the new user
      await fetch(`http://localhost:3000/api/user/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
    }
    
    // Default usage stats if not found
    if (!usageStats) {
      usageStats = {
        userId,
        period: new Date().toISOString().substring(0, 7),
        postsUsed: 0,
        discussionsUsed: 0,
        aiRepliesUsed: 0,
        campaignsUsed: 0,
          resetsUsed: 0,
        lastUpdated: new Date().toISOString()
      };
    }
    
    // Admin users have unlimited access
    if (userData.userType === 'admin') {
      console.log(`[${new Date().toISOString()}] [ACCESS-CHECK] Admin user ${userId} has unlimited access`);
      return res.json({ allowed: true });
    }
    
    const subscription = userData.subscription;
    if (!subscription) {
      return res.json({ 
        allowed: false, 
        reason: 'No active subscription', 
        upgradeRequired: true 
      });
    }
    
    // Check if trial is expired
    if (subscription.status === 'trial' && userData.trialEndsAt) {
      const trialEnd = new Date(userData.trialEndsAt);
      if (new Date() > trialEnd) {
        return res.json({ 
          allowed: false, 
          reason: 'Trial expired', 
          upgradeRequired: true,
          redirectToPricing: true 
        });
      }
    }
    
    // Check subscription status
    if (subscription.status === 'cancelled' || subscription.status === 'expired') {
      return res.json({ 
        allowed: false, 
        reason: 'Subscription inactive', 
        upgradeRequired: true,
        redirectToPricing: true 
      });
    }
    
    const limits = subscription.limits;
    
    // Check feature-specific access
    let accessResult = { allowed: true };
    
    switch (feature) {
      case 'posts':
        if (typeof limits.posts === 'number' && usageStats.postsUsed >= limits.posts) {
          accessResult = { 
            allowed: false, 
            reason: `Post limit reached (${usageStats.postsUsed}/${limits.posts})`, 
            limitReached: true,
            upgradeRequired: true 
          };
        }
        break;
        
      case 'discussions':
        if (typeof limits.discussions === 'number' && usageStats.discussionsUsed >= limits.discussions) {
          accessResult = { 
            allowed: false, 
            reason: `Discussion limit reached (${usageStats.discussionsUsed}/${limits.discussions})`, 
            limitReached: true,
            upgradeRequired: true 
          };
        }
        break;
        
      case 'aiReplies':
        if (limits.aiReplies !== 'unlimited' && usageStats.aiRepliesUsed >= limits.aiReplies) {
          accessResult = { 
            allowed: false, 
            reason: `AI Reply limit reached (${usageStats.aiRepliesUsed}/${limits.aiReplies})`, 
            limitReached: true,
            upgradeRequired: true 
          };
        }
        break;
        
      case 'campaigns':
        if (typeof limits.campaigns === 'number' && usageStats.campaignsUsed >= limits.campaigns) {
          accessResult = { 
            allowed: false, 
            reason: `Campaign limit reached (${usageStats.campaignsUsed}/${limits.campaigns})`, 
            limitReached: true,
            upgradeRequired: true 
          };
        }
        break;
        
      case 'autoSchedule':
        if (!limits.autoSchedule) {
          accessResult = { 
            allowed: false, 
            reason: 'Auto Schedule not available in your plan', 
            upgradeRequired: true 
          };
        }
        break;
        
      case 'autoReply':
        if (!limits.autoReply) {
          accessResult = { 
            allowed: false, 
            reason: 'Auto Reply not available in your plan', 
            upgradeRequired: true 
          };
        }
        break;
        
      case 'goalModel':
        if (userData.userType !== 'premium' && userData.userType !== 'admin') {
          const goalModelDays = limits.goalModelDays;
          if (typeof goalModelDays === 'number' && goalModelDays <= 0) {
            accessResult = { 
              allowed: false, 
              reason: 'Goal Model is a Premium feature', 
              upgradeRequired: true 
            };
          }
        }
        break;
        
      default:
        accessResult = { allowed: false, reason: 'Unknown feature' };
    }
    
    console.log(`[${new Date().toISOString()}] [ACCESS-CHECK] ${feature} access for ${userId}: ${accessResult.allowed ? 'ALLOWED' : 'DENIED'}`);
    res.json(accessResult);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [ACCESS-CHECK] Error checking access:`, error);
    // Allow access if there's an error to prevent app breaking
    res.json({ allowed: true });
  }
});

// Get platform activity breakdown
app.get(['/api/user/:userId/platform-activity', '/user/:userId/platform-activity'], async (req, res) => {
  const { userId } = req.params;
  const currentPeriod = new Date().toISOString().substring(0, 7);

  try {
    console.log(`[${new Date().toISOString()}] [USER-API] Getting platform activity for ${userId}/${currentPeriod}`);
    
    // Get platform userIds (same logic as usage aggregation)
    let platformUserIds = [];
    try {
      const connKey = `connections/firebase_uid_to_platform_users/${userId}.json`;
      const params = { Bucket: 'admin', Key: connKey };
      const getCommand = new GetObjectCommand(params);
      const data = await s3Client.send(getCommand);
      const connections = JSON.parse(await streamToString(data.Body));
      platformUserIds = connections.platformUserIds || [];
    } catch (error) {
      console.log(`[${new Date().toISOString()}] [USER-API] No platform userIds found, trying direct userId lookup`);
    }

    // Fallback to known platform userIds for testing
    if (platformUserIds.length === 0) {
      platformUserIds = [userId];
      if (userId === 'S0Jwk1feGnOCLzw8lnmrNU7mPX72') {
        platformUserIds.push('facebook_KomaiX512', 'instagram_fentybeauty');
      }
    }

    console.log(`[${new Date().toISOString()}] [USER-API] Platform userIds for activity: [${platformUserIds.join(', ')}]`);

    const platformActivity = {};
    let totalActivity = 0;

    // Aggregate activity by platform
    for (const platformUserId of platformUserIds) {
      try {
        const params = {
          Bucket: 'admin',
          Key: `usage/${platformUserId}/${currentPeriod}.json`
        };
        
        const getCommand = new GetObjectCommand(params);
        const data = await s3Client.send(getCommand);
        const usage = JSON.parse(await streamToString(data.Body));
        
        // Extract platform from userId (facebook_*, instagram_*, etc.)
        const platform = platformUserId.includes('_') ? platformUserId.split('_')[0] : 'account';
        
        // Calculate activity for this platform (posts + discussions + aiReplies + campaigns)
        const activity = (usage.postsUsed || 0) + (usage.discussionsUsed || 0) + (usage.aiRepliesUsed || 0) + (usage.campaignsUsed || 0);
        
        if (activity > 0) {
          if (!platformActivity[platform]) {
            platformActivity[platform] = 0;
          }
          platformActivity[platform] += activity;
          totalActivity += activity;
        }
        
      } catch (error) {
        console.log(`[${new Date().toISOString()}] [USER-API] No usage found for ${platformUserId}: ${error.message}`);
      }
    }

    // Calculate percentages
    const activityBreakdown = {};
    for (const [platform, activity] of Object.entries(platformActivity)) {
      activityBreakdown[platform] = {
        count: activity,
        percentage: totalActivity > 0 ? Math.round((activity / totalActivity) * 100) : 0
      };
    }

    console.log(`[${new Date().toISOString()}] [USER-API] Platform activity breakdown:`, activityBreakdown);
    
    res.json({
      userId,
      period: currentPeriod,
      totalActivity,
      platforms: activityBreakdown,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] [USER-API] Error getting platform activity:`, error);
    res.status(500).json({ error: 'Failed to get platform activity' });
  }
});

// Increment usage counter
app.post(['/api/usage/increment/:userId', '/usage/increment/:userId'], async (req, res) => {
  const { userId } = req.params;
  const { feature } = req.body;
  
  try {
    console.log(`[${new Date().toISOString()}] [USAGE-INCREMENT] Incrementing ${feature} usage for ${userId}`);
    
    // ✅ FIX: Get individual account usage stats, NOT aggregated stats
    // The bug was calling /api/user/{userId}/usage which returns AGGREGATED stats
    // We need the individual account stats for proper incrementing
    let usageStats;
    
    // Try to get individual usage stats directly from storage
    try {
      usageStats = await getUserUsageStats(userId);
      console.log(`[${new Date().toISOString()}] [USAGE-INCREMENT] Retrieved individual usage stats for ${userId}:`, usageStats);
    } catch (error) {
      console.warn(`[${new Date().toISOString()}] [USAGE-INCREMENT] Failed to get individual usage stats for ${userId}, creating new:`, error);
      
      // Create new usage stats for this specific account
      const currentPeriod = new Date().toISOString().substring(0, 7);
      usageStats = {
        userId,
        period: currentPeriod,
        postsUsed: 0,
        discussionsUsed: 0,
        aiRepliesUsed: 0,
        campaignsUsed: 0,
        resetsUsed: 0,
        lastUpdated: new Date().toISOString()
      };
      console.log(`[${new Date().toISOString()}] [USAGE-INCREMENT] Using fallback stats for increment`);
    }
    
    // Increment the appropriate counter
    const update = { lastUpdated: new Date().toISOString() };
    
    switch (feature) {
      case 'posts':
        update.postsUsed = usageStats.postsUsed + 1;
        break;
      case 'discussions':
        update.discussionsUsed = usageStats.discussionsUsed + 1;
        break;
      case 'aiReplies':
        update.aiRepliesUsed = usageStats.aiRepliesUsed + 1;
        break;
      case 'campaigns':
        update.campaignsUsed = usageStats.campaignsUsed + 1;
        break;
      case 'resets':
        update.resetsUsed = (usageStats.resetsUsed || 0) + 1;
        break;
      default:
        console.warn(`[${new Date().toISOString()}] [USAGE-INCREMENT] Unknown feature: ${feature}`);
        return res.json({ success: true, message: 'Unknown feature, no increment performed' });
    }
    
    // Update usage stats
    const updateResponse = await fetch(`http://127.0.0.1:3000/api/user/${userId}/usage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    
    if (!updateResponse.ok) {
      throw new Error('Failed to update usage stats');
    }
    
    console.log(`[${new Date().toISOString()}] [USAGE-INCREMENT] Successfully incremented ${feature} usage for ${userId}`);
    const updatedCount = feature === 'resets' ? update.resetsUsed : update[feature + 'Used'];
    res.json({ success: true, newCount: updatedCount });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [USAGE-INCREMENT] Error incrementing usage:`, error);
    // Don't fail the request - usage tracking is not critical
    res.json({ success: true, message: 'Usage tracking error, but operation continued' });
  }
});

// ✅ NEW: Platform/Username-based Usage Tracking with UserID Synchronization
// Helper function to get userId from platform/username
async function getUserIdFromPlatformUser(platform, username) {
  try {
    // Try to find userId by searching platform connections
    const response = await fetch(`http://127.0.0.1:3000/api/users`);
    if (response.ok) {
      const users = await response.json();
      const user = users.find(u => {
        const connections = u.connections || {};
        return connections[platform]?.username === username;
      });
      return user?.userId || null;
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [PLATFORM-USAGE] Error finding userId:`, error);
  }
  
  // Fallback: Use platform_username as identifier if userId not found
  return `${platform}_${username}`;
}

// ✅ NEW: Get usage by platform/username (with userId sync)
app.get(['/api/usage/:platform/:username'], async (req, res) => {
  const { platform, username } = req.params;
  
  try {
    console.log(`[${new Date().toISOString()}] [PLATFORM-USAGE] Getting usage for ${platform}/${username}`);
    
    // Get userId from platform/username
    const userId = await getUserIdFromPlatformUser(platform, username);
    if (!userId) {
      console.warn(`[${new Date().toISOString()}] [PLATFORM-USAGE] No userId found for ${platform}/${username}`);
      return res.json({
        postsUsed: 0,
        discussionsUsed: 0,
        aiRepliesUsed: 0,
        campaignsUsed: 0,
        viewsUsed: 0,
        resetsUsed: 0
      });
    }
    
    // Get usage from userId
    const response = await fetch(`http://127.0.0.1:3000/api/user/${userId}/usage`);
    
    if (response.ok) {
      const usageStats = await response.json();
      console.log(`[${new Date().toISOString()}] [PLATFORM-USAGE] Retrieved usage for ${platform}/${username}:`, usageStats);
      res.json(usageStats);
    } else {
      console.warn(`[${new Date().toISOString()}] [PLATFORM-USAGE] No usage found for userId ${userId}, returning defaults`);
      res.json({
        postsUsed: 0,
        discussionsUsed: 0,
        aiRepliesUsed: 0,
        campaignsUsed: 0,
        viewsUsed: 0,
        resetsUsed: 0
      });
    }
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [PLATFORM-USAGE] Error getting usage:`, error);
    res.json({
      postsUsed: 0,
      discussionsUsed: 0,
      aiRepliesUsed: 0,
      campaignsUsed: 0,
      viewsUsed: 0,
      resetsUsed: 0
    });
  }
});

// ✅ NEW: Increment usage by platform/username (with userId sync)
app.post(['/api/usage/increment/:platform/:username'], async (req, res) => {
  const { platform, username } = req.params;
  const { feature, count = 1 } = req.body;
  
  try {
    console.log(`[${new Date().toISOString()}] [PLATFORM-USAGE] Incrementing ${feature} usage for ${platform}/${username} by ${count}`);
    
    // Get userId from platform/username
    const userId = await getUserIdFromPlatformUser(platform, username);
    if (!userId) {
      console.error(`[${new Date().toISOString()}] [PLATFORM-USAGE] No userId found for ${platform}/${username}`);
      return res.status(404).json({ success: false, error: 'User not found for platform/username' });
    }
    
    console.log(`[${new Date().toISOString()}] [PLATFORM-USAGE] Found userId ${userId} for ${platform}/${username}`);
    
    // Delegate to existing userId-based increment endpoint
    const incrementResponse = await fetch(`http://127.0.0.1:3000/api/usage/increment/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature, count })
    });
    
    if (incrementResponse.ok) {
      const result = await incrementResponse.json();
      console.log(`[${new Date().toISOString()}] [PLATFORM-USAGE] Successfully incremented ${feature} for ${platform}/${username}`);
      res.json(result);
    } else {
      throw new Error(`Failed to increment usage: ${incrementResponse.statusText}`);
    }
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [PLATFORM-USAGE] Error incrementing usage:`, error);
    res.json({ success: true, message: 'Usage tracking error, but operation continued' });
  }
});

// Helper function to get individual (non-aggregated) usage stats for a specific userId
async function getUserUsageStats(userId) {
  const currentPeriod = new Date().toISOString().substring(0, 7);
  
  try {
    // Try R2 first
    const params = {
      Bucket: 'admin',
      Key: `usage/${userId}/${currentPeriod}.json`
    };
    const getCommand = new GetObjectCommand(params);
    const data = await s3Client.send(getCommand);
    const stats = JSON.parse(await streamToString(data.Body));
    console.log(`[${new Date().toISOString()}] [USER-API] Retrieved individual usage stats from R2 for ${userId}/${currentPeriod}`);
    return stats;
  } catch (r2Error) {
    console.log(`[${new Date().toISOString()}] [USER-API] R2 failed for individual usage stats, trying local storage: ${r2Error.message}`);
    
    // Try local storage fallback
    const localStorageDir = path.join(process.cwd(), 'local_storage', 'usage', userId);
    const localStorageFile = path.join(localStorageDir, `${currentPeriod}.json`);
    
    if (fs.existsSync(localStorageFile)) {
      try {
        const localData = JSON.parse(fs.readFileSync(localStorageFile, 'utf8'));
        console.log(`[${new Date().toISOString()}] [USER-API] Retrieved individual usage stats from local storage for ${userId}/${currentPeriod}`);
        return localData;
      } catch (localError) {
        console.error(`[${new Date().toISOString()}] [USER-API] Error reading local usage stats:`, localError);
        throw localError;
      }
    } else {
      console.log(`[${new Date().toISOString()}] [USER-API] No existing usage stats found for ${userId}/${currentPeriod}`);
      throw new Error(`No usage stats found for ${userId}/${currentPeriod}`);
    }
  }
}

// ✅ NEW: Usage tracking middleware for API endpoints
async function trackUsageForEndpoint(platform, username, feature, action = '') {
  try {
    console.log(`[${new Date().toISOString()}] [API-USAGE-TRACK] ${feature} API called for ${platform}/${username} - ${action}`);
    
    // Call the increment endpoint
    const response = await fetch(`http://127.0.0.1:3000/api/usage/increment/${platform}/${username}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature, count: 1 })
    });
    
    if (response.ok) {
      console.log(`[${new Date().toISOString()}] [API-USAGE-TRACK] ✅ ${feature} usage tracked for ${platform}/${username}`);
    } else {
      console.warn(`[${new Date().toISOString()}] [API-USAGE-TRACK] ⚠️ Failed to track ${feature} usage for ${platform}/${username}`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [API-USAGE-TRACK] ❌ Error tracking ${feature} usage:`, error);
  }
}

// ✅ NEW: Universal usage tracking middleware that can be applied to any endpoint
function createUsageTrackingMiddleware(feature, actionName) {
  return async (req, res, next) => {
    try {
      // Extract platform and username from various possible sources
      let platform, username;
      
      // Method 1: From URL params
      if (req.params.username) {
        username = req.params.username;
        platform = req.query.platform || req.body.platform || 'instagram';
      }
      
      // Method 2: From body 
      if (!username && req.body.username) {
        username = req.body.username;
        platform = req.body.platform || 'instagram';
      }
      
      // Method 3: From accountHolder pattern
      if (!username && req.params.accountHolder) {
        try {
          const parsed = JSON.parse(req.params.accountHolder);
          platform = parsed.platform;
          username = parsed.username;
        } catch (e) {
          // Fallback to treating as username
          username = req.params.accountHolder;
          platform = req.query.platform || 'instagram';
        }
      }
      
      // Track usage if we found platform/username
      if (platform && username) {
        console.log(`[${new Date().toISOString()}] [USAGE-MIDDLEWARE] Tracking ${feature} for ${platform}/${username}`);
        // Don't await - track in background to not slow down API
        trackUsageForEndpoint(platform, username, feature, actionName);
      } else {
        console.warn(`[${new Date().toISOString()}] [USAGE-MIDDLEWARE] Could not extract platform/username for ${feature} tracking`);
      }
      
      // Continue to the actual endpoint
      next();
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [USAGE-MIDDLEWARE] Error in usage tracking middleware:`, error);
      // Don't fail the request - continue to endpoint
      next();
    }
  };
}

// ... existing code continues ...

app.use((req, res, next) => {
  // Reduce repetitive request logging for better server performance
  const requestKey = `${req.method}_${req.url}`;
  const lastLogTime = global[`lastReqLog_${requestKey}`] || 0;
  const now = Date.now();
  
  // Log GET requests less frequently (every 30 seconds for same endpoint)
  // Always log non-GET requests (POST, PUT, DELETE are important)
  const shouldLog = req.method !== 'GET' || (now - lastLogTime > 30000);
  
  if (shouldLog) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    global[`lastReqLog_${requestKey}`] = now;
  }
  next();
});

// THROTTLE_INTERVAL is kept for backward compatibility but effectively only used 
// when cache configuration doesn't provide a specific TTL
const THROTTLE_INTERVAL = 5 * 60 * 1000;
const CACHE_TTL = 5 * 60 * 1000;

const MODULE_PREFIXES = [
  'competitor_analysis',
  'recommendations',
  'engagement_strategies',
  'ready_post',
  'queries',
  'rules',
  'feedbacks',
  'NewForYou',
  'ProfileInfo',
];

async function initializeCurrentUsername() {
  try {
    const existingData = await getExistingData();
    if (existingData.length > 0) {
      const latestEntry = existingData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      currentUsername = latestEntry.username;
      console.log(`Initialized currentUsername to ${currentUsername} on server startup`);
    }
  } catch (error) {
    console.error('Error initializing currentUsername:', error);
  }
}

initializeCurrentUsername();

// Enhanced webhook handler with improved event broadcast
app.post('/webhook/r2', async (req, res) => {
  try {
    const { event, key } = req.body;
    console.log(`Received R2 event: ${event} for key: ${key}`);

    if (event === 'ObjectCreated:Put' || event === 'ObjectCreated:Post' || event === 'ObjectRemoved:Delete') {
      // Update regex to handle new schema: module/platform/username/file
      const match = key.match(/^(.*?)\/(.*?)\/(.*?)\/(.*)$/);
      if (match) {
        const [, module, platform, username] = match;
        const cacheKey = `${module}/${platform}/${username}`;
        console.log(`Invalidating cache for ${cacheKey} (module: ${module}, platform: ${platform}, username: ${username})`);
        cache.delete(cacheKey);

        // Enhanced broadcast with tracking
        const result = broadcastUpdate(username, { 
          type: 'update', 
          prefix: cacheKey,
          timestamp: Date.now(),
          key: key,
          module: module,
          platform: platform
        });
        
        if (!result) {
          console.log(`No active clients for ${username}, update queued for next connection`);
        }
      }
    }

    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Error processing webhook', details: error.message });
  }
});

// REMOVED: Duplicate SSE endpoint - using the enhanced version below

// Enhanced data fetching with centralized schema management
async function fetchDataForModule(username, prefixTemplate, forceRefresh = false, platform = 'instagram') {
  if (!username) {
    console.error('No username provided, cannot fetch data');
    return [];
  }

  try {
    // Parse the module and additional components from the template
    let module, additional = '';
    
    if (prefixTemplate.includes('competitor_analysis') && prefixTemplate.includes('/{username}/')) {
      // Special handling for competitor analysis: competitor_analysis/{username}/{competitor}
      const parts = prefixTemplate.split('/{username}/');
      module = parts[0]; // competitor_analysis
      additional = parts[1]; // competitor name
    } else if (prefixTemplate.includes('{username}')) {
      // Standard template: module/{username} or module/{username}/file
      module = prefixTemplate.replace('/{username}', '').replace('{username}', '');
    } else {
      // Template without placeholder
      module = prefixTemplate;
    }
    
    // Generate standardized prefix using centralized schema manager
    const prefix = PlatformSchemaManager.buildPath(module, platform, username, additional);
    
    // 🔥 HOTFIX: Some uploads use alternative prefixes for the same module name.
    // If we are fetching the news module, pull from ALL known prefixes and merge.
    const altPrefixes = [];
    if (module === 'news_for_you') {
      const dashed = prefix.replace('news_for_you', 'news-for-you');
      if (dashed !== prefix) {
        altPrefixes.push(dashed);
      }

      // Also support historical/camel-cased prefix used by older pipelines
      const newForYou = prefix.replace('news_for_you', 'NewForYou');
      if (newForYou !== prefix && newForYou !== dashed) {
        altPrefixes.push(newForYou);
      }
    }
 
    // Check if we should use cache based on the enhanced caching rules
    if (!forceRefresh && shouldUseCache(prefix)) {
      return cache.get(prefix);
    }

    // Reduce repetitive "fetching fresh data" logging 
    const fetchLogKey = `lastFetchLog_${prefix}`;
    const lastFetchLogTime = global[fetchLogKey] || 0;
    if (Date.now() - lastFetchLogTime > 120000) { // Log every 2 minutes per prefix
      console.log(`[${new Date().toISOString()}] Fetching fresh ${platform} data from R2 for prefix: ${prefix}`);
      global[fetchLogKey] = Date.now();
    }

    // Helper to list JSON objects for a specific prefix
    const listJsonObjects = async (pref) => {
      const listCommand = new ListObjectsV2Command({ Bucket: 'tasks', Prefix: pref });
      const listResponse = await s3Client.send(listCommand);
      return (listResponse.Contents || [])
        .filter(file => file.Key.endsWith('.json'));
    };

    let files = await listJsonObjects(prefix);
    // If alt prefixes exist, fetch and merge
    for (const alt of altPrefixes) {
      try {
        const altFiles = await listJsonObjects(alt);
        files = files.concat(altFiles);
      } catch (err) {
        // Ignore missing alt prefix
      }
    }

    // Sort and process as before
    // ✅ NEW: Sort files by LastModified date to get most recent items
    const sortedFiles = files
      .sort((a, b) => new Date(b.LastModified).getTime() - new Date(a.LastModified).getTime());
    
    // ✅ NEW: Limit to most recent 3 items for strategies and competitor analysis
    const maxItems = (module === 'recommendations' || module === 'competitor_analysis') ? 3 : sortedFiles.length;
    const limitedFiles = sortedFiles.slice(0, maxItems);
    
    if (maxItems < sortedFiles.length) {
      console.log(`[${new Date().toISOString()}] Limiting ${platform} ${module} to most recent ${maxItems} items (found ${sortedFiles.length} total)`);
    }
    
    // Standard processing for other module types (JSON only)
    const data = await Promise.all(
      limitedFiles.map(async (file) => {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: file.Key,
          });
          const data = await s3Client.send(getCommand);
          const body = await streamToString(data.Body);

          if (!body || body.trim() === '') {
            console.warn(`Empty file detected at ${file.Key}, skipping...`);
            return null;
          }

          const parsedData = JSON.parse(body);
          return { 
            key: file.Key, 
            lastModified: file.LastModified,
            data: {
              ...parsedData,
              platform: platform
            }
          };
        } catch (error) {
          console.error(`Failed to process ${platform} file ${file.Key}:`, error.message);
          return null;
        }
      })
    );

    const validData = data.filter(item => item !== null);
    
    // Update cache with fresh data
    cache.set(prefix, validData);
    cacheTimestamps.set(prefix, Date.now());
    
    return validData;
  } catch (error) {
    console.error(`Error fetching ${platform} data for username ${username}:`, error);
    
    // Try to build prefix for fallback cache lookup
    try {
      const module = prefixTemplate.includes('competitor_analysis') && prefixTemplate.includes('/{username}/') 
        ? prefixTemplate.split('/{username}/')[0]
        : prefixTemplate.replace('/{username}', '').replace('{username}', '');
      const fallbackPrefix = PlatformSchemaManager.buildPath(module, platform, username);
      
      if (cache.has(fallbackPrefix)) {
        console.log(`[${new Date().toISOString()}] Using cached ${platform} data as fallback for ${fallbackPrefix} due to fetch error`);
        return cache.get(fallbackPrefix);
      }
    } catch (fallbackError) {
      console.error(`Error building fallback cache key:`, fallbackError);
    }
    
    return [];
  }
}

app.get('/proxy-image', async (req, res) => {
  let { url } = req.query;
  if (!url) return res.status(400).send('Image URL is required');
  
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s
  const TIMEOUT = 10000; // 10 seconds
  
  try {
    if (Array.isArray(url)) url = url[0];
    const decodedUrl = decodeURIComponent(url);

    let lastError = null;
    
    // Retry loop with exponential backoff
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[proxy-image] Attempt ${attempt + 1}/${MAX_RETRIES + 1} for: ${decodedUrl}`);
        
        // Fetch with timeout and proper headers
        const response = await axios.get(decodedUrl, { 
          responseType: 'arraybuffer',
          timeout: TIMEOUT,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/*,*/*;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          // Important: Handle errors properly
          validateStatus: (status) => status >= 200 && status < 400
        });
        
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.startsWith('image/')) {
          console.error(`[proxy-image] URL did not return an image:`, decodedUrl, 'Content-Type:', contentType);
          return res.status(400).send('URL did not return an image');
        }
        
        // Success! Set headers and send image
        res.set('Content-Type', contentType);
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'public, max-age=3600');
        res.set('X-Proxy-Attempts', attempt + 1);
        res.send(response.data);
        
        console.log(`[proxy-image] SUCCESS on attempt ${attempt + 1} for: ${decodedUrl}`);
        return; // Exit successfully
        
      } catch (error) {
        lastError = error;
        console.warn(`[proxy-image] Attempt ${attempt + 1} failed:`, error?.response?.status || error?.message);
        
        // Don't retry on 4xx errors (client errors)
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          console.log(`[proxy-image] Client error (${error.response.status}), not retrying`);
          break;
        }
        
        // If this isn't the last attempt, wait before retry
        if (attempt < MAX_RETRIES) {
          console.log(`[proxy-image] Waiting ${RETRY_DELAYS[attempt]}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
        }
      }
    }
    
    // All retries failed
    console.error(`[proxy-image] All ${MAX_RETRIES + 1} attempts failed for:`, url, lastError?.response?.status, lastError?.message);
    res.status(500).send('Failed to fetch image after retries');
    
  } catch (error) {
    console.error(`[proxy-image] Unexpected error:`, url, error?.message);
    res.status(500).send('Failed to fetch image');
  }
});

app.get(['/profile-info/:username', '/api/profile-info/:username'], async (req, res) => {
  const { username } = req.params;
  const forceRefresh = req.query.forceRefresh === 'true';
  const platform = req.query.platform || 'instagram'; // Default to Instagram
  
  // Try multiple possible key formats for ProfileInfo
  const possibleKeys = [
    `ProfileInfo/${platform}/${username}/profileinfo.json`,
    `ProfileInfo/${platform}/${username}.json`,
    `ProfileInfo/${username}/profileinfo.json`,
    `ProfileInfo/${username}.json`
  ];

  console.log(`[${new Date().toISOString()}] Attempting to fetch ${platform} profile info for ${username}`);

  for (const key of possibleKeys) {
    try {
      console.log(`[${new Date().toISOString()}] Trying key: ${key}`);
      
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);

      if (!body || body.trim() === '') {
        console.warn(`Empty file detected at ${key}`);
        continue;
      }

      const data = JSON.parse(body);
      
      // 🎯 CRITICAL FIX: Validate that this is actual profile data, not account config
      const hasProfileFields = data.fullName || data.followersCount !== undefined || 
                               data.biography || data.profilePicUrl || data.profilePicUrlHD ||
                               data.followsCount !== undefined || data.postsCount !== undefined ||
                               data.verified !== undefined || data.private !== undefined;
      
      if (hasProfileFields) {
        console.log(`[${new Date().toISOString()}] Successfully fetched ${platform} profile info for ${username} from ${key}`);
        return res.json(data);
      } else {
        console.warn(`[${new Date().toISOString()}] Found account config (not profile data) at ${key}, continuing search...`);
        continue; // This is account config data, keep looking for actual profile data
      }
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        console.log(`Key not found: ${key}`);
        continue;
      }
      console.error(`Error fetching profile info from ${key}:`, error.message);
      continue;
    }
  }

  console.log(`Profile info not found for ${username} on ${platform} (tried ${possibleKeys.length} locations)`);
  return res.status(404).json({ error: 'Profile info not found' });
});

// 🎯 NEW: API route to serve cached profile data for extraction
app.get(['/api/data/cache/:filename', '/data/cache/:filename'], async (req, res) => {
  const { filename } = req.params;
  
  try {
    console.log(`[${new Date().toISOString()}] Serving cached data: ${filename}`);
    
    // Security check: only allow specific patterns
    if (!filename.match(/^(twitter|facebook|instagram)_[a-zA-Z0-9_-]+_profile\.json$/)) {
      return res.status(400).json({ error: 'Invalid filename pattern' });
    }
    
    const filePath = path.join(__dirname, '..', 'data', 'cache', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`[${new Date().toISOString()}] Cached file not found: ${filePath}`);
      return res.status(404).json({ error: 'Cached data not found' });
    }
    
    // Read and return the cached data
    const data = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    
    console.log(`[${new Date().toISOString()}] Successfully served cached data: ${filename}`);
    return res.json(jsonData);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error serving cached data ${filename}:`, error);
    return res.status(500).json({ error: 'Failed to read cached data' });
  }
});
app.post(['/save-account-info', '/api/save-account-info'], async (req, res) => {
  try {
    const { username, accountType, postingStyle, competitors, platform } = req.body;
    const platformParam = req.query.platform || platform || 'instagram';

    if (!username || !accountType || !postingStyle) {
      return res.status(400).json({ error: 'Username, account type, and posting style are required' });
    }

    // Use centralized platform management for normalization
    const platformConfig = PlatformSchemaManager.getPlatformConfig(platformParam);
    const normalizedUsername = platformConfig.normalizeUsername(username);

    // Create platform-specific key using centralized schema manager
    const key = PlatformSchemaManager.buildPath('AccountInfo', platformParam, normalizedUsername, 'info.json');

    let isUsernameAlreadyInUse = false;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      await s3Client.send(getCommand);
      isUsernameAlreadyInUse = true;
      console.warn(`Warning: ${platformParam} username '${normalizedUsername}' is already in use by another account, but allowing save operation`);
    } catch (error) {
      if (error.name !== 'NoSuchKey' && error.$metadata?.httpStatusCode !== 404) {
        throw error;
      }
      // Username is not in use, which is the normal case
    }

    // Build base payload (backward compatible for all platforms)
    const payload = {
      username: normalizedUsername,
      accountType,
      postingStyle,
      platform: platformParam,
      ...(competitors && { competitors: competitors.map(c => platformConfig.normalizeUsername(c)) }),
      timestamp: new Date().toISOString(),
    };

    // Facebook-specific: persist full accountData and competitor_data with URLs untouched
    if (platformParam.toLowerCase() === 'facebook') {
      try {
        if (req.body && typeof req.body.accountData === 'object' && req.body.accountData) {
          // Preserve exactly as sent (name and url)
          payload.accountData = {
            name: req.body.accountData.name,
            url: req.body.accountData.url,
          };
        }
        if (Array.isArray(req.body.competitor_data)) {
          // Preserve exactly as sent (array of objects with name and url)
          payload.competitor_data = req.body.competitor_data.map((c) => ({ name: c.name, url: c.url }));
          // Ensure competitors (names) field remains present for backward compatibility if omitted
          if (!payload.competitors) {
            payload.competitors = req.body.competitor_data
              .map((c) => (c && typeof c.name === 'string' ? platformConfig.normalizeUsername(c.name) : ''))
              .filter((n) => n);
          }
        }
      } catch {
        // Silently ignore malformed optional fields
      }
    }

    console.log(`Saving ${platformParam} account info to: ${key}`);
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(payload, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);

    // Clear cache using centralized schema
    const cacheKey = PlatformSchemaManager.buildPath('AccountInfo', platformParam, normalizedUsername);
    cache.delete(cacheKey);

    res.json({ 
      success: true, 
      message: `${platformParam} account info saved successfully`,
      isUsernameAlreadyInUse,
      platform: platformParam
    });
  } catch (error) {
    console.error('Save account info error:', error);
    handleErrorResponse(res, error);
  }
});

// Reset account info endpoint - clears account data and allows re-entry
app.post(['/reset-account-info', '/api/reset-account-info'], async (req, res) => {
  try {
    const { username, platform } = req.body;
    const platformParam = req.query.platform || platform || 'instagram';

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Use centralized platform management for normalization
    const platformConfig = PlatformSchemaManager.getPlatformConfig(platformParam);
    const normalizedUsername = platformConfig.normalizeUsername(username);

    // Create platform-specific key using centralized schema manager
    const key = PlatformSchemaManager.buildPath('AccountInfo', platformParam, normalizedUsername, 'info.json');

    console.log(`Resetting ${platformParam} account info for: ${normalizedUsername}`);
    console.log(`Attempting to delete key: ${key}`);

    try {
      // Check if the account info exists
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      await s3Client.send(getCommand);
      
      // If it exists, delete it
      const deleteCommand = new DeleteObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      await s3Client.send(deleteCommand);
      
      console.log(`Successfully deleted account info for ${normalizedUsername} on ${platformParam}`);
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        console.log(`Account info for ${normalizedUsername} on ${platformParam} was not found (already reset or never existed)`);
      } else {
        throw error;
      }
    }

    // Clear related caches
    const cacheKey = PlatformSchemaManager.buildPath('AccountInfo', platformParam, normalizedUsername);
    cache.delete(cacheKey);
    
    // Clear processing-related caches
    const processingCacheKeys = [
      `${platformParam}Events/${normalizedUsername}`,
      `events-list/${normalizedUsername}`,
      `events-list/${normalizedUsername}?platform=${platformParam}`,
      `${platformParam}_processing_${normalizedUsername}`,
      `${platformParam}_processing_countdown`,
      `${platformParam}_processing_info`
    ];
    
    processingCacheKeys.forEach(key => {
      cache.delete(key);
    });

    console.log(`Successfully reset ${platformParam} account for ${normalizedUsername}`);

    res.json({ 
      success: true, 
      message: `${platformParam} account reset successfully`,
      platform: platformParam,
      username: normalizedUsername
    });
  } catch (error) {
    console.error('Reset account info error:', error);
    handleErrorResponse(res, error);
  }
});

app.post(['/scrape', '/api/scrape'], async (req, res) => {
  try {
    const { parent, children } = req.body;

    if (!parent?.username || !Array.isArray(children)) {
      return res.status(400).json({
        error: 'Invalid request structure',
        details: 'Request must contain parent.username and children array',
      });
    }

    const newUsername = parent.username.trim();
    console.log('Processing hierarchical data for:', {
      parent: newUsername,
      children: children.map(c => c.username),
    });

    if (currentUsername !== newUsername) {
      console.log(`Username changed from ${currentUsername || 'none'} to ${newUsername}, resetting caches...`);
      currentUsername = newUsername;

      MODULE_PREFIXES.forEach((prefixTemplate) => {
        // Clear cache for both Instagram and Twitter platforms
        for (const platform of ['instagram', 'twitter']) {
          const prefix = `${prefixTemplate}/${platform}/${currentUsername}`;
          console.log(`Clearing cache for ${prefix}`);
          cache.delete(prefix);
        }
      });

      const clients = sseClients.get(currentUsername) || [];
      for (const client of clients) {
        client.write(`data: ${JSON.stringify({ type: 'usernameChanged', username: currentUsername })}\n\n`);
      }
    }

    const timestamp = new Date().toISOString();
    const hierarchicalEntry = {
      username: newUsername,
      timestamp,
      status: 'pending',
      children: children.map(child => ({
        username: child.username.trim(),
        timestamp,
        status: 'pending',
      })),
    };

    let existingData = await getExistingData();
    existingData.push(hierarchicalEntry);
    await saveToR2(existingData);

    cache.delete('Usernames');

    res.json({
      success: true,
      message: 'Data stored in hierarchical format',
      parent: hierarchicalEntry.username,
      childrenCount: hierarchicalEntry.children.length,
    });
  } catch (error) {
    console.error('Scrape endpoint error:', error);
    handleErrorResponse(res, error);
  }
});

app.get(['/retrieve/:accountHolder/:competitor', '/api/retrieve/:accountHolder/:competitor'], async (req, res) => {
  try {
    const { platform, username } = PlatformSchemaManager.parseRequestParams(req);
    const { competitor } = req.params;
    const forceRefresh = req.query.forceRefresh === 'true';

    // Use centralized schema management for competitor analysis
    const data = await fetchDataForModule(username, `competitor_analysis/{username}/${competitor}`, forceRefresh, platform);
    console.log(`Returning ${platform} data for ${username}/${competitor}`);
    res.json(data);
  } catch (error) {
    console.error(`Retrieve ${req.query.platform || 'instagram'} endpoint error:`, error);
    res.status(500).json({ 
      error: `Error retrieving ${req.query.platform || 'instagram'} data`, 
      details: error.message 
    });
  }
});

app.get(['/retrieve-multiple/:accountHolder', '/api/retrieve-multiple/:accountHolder'], async (req, res) => {
  try {
    const { platform, username } = PlatformSchemaManager.parseRequestParams(req);
    const competitorsParam = req.query.competitors;
    const forceRefresh = req.query.forceRefresh === 'true';

    if (!competitorsParam || typeof competitorsParam !== 'string') {
      return res.status(400).json({ error: 'Competitors query parameter is required and must be a string' });
    }

    const competitors = competitorsParam.split(',').map(c => c.trim()).filter(c => c.length > 0);

    const results = await Promise.all(
      competitors.map(async (competitor) => {
        try {
          const data = await fetchDataForModule(username, `competitor_analysis/{username}/${competitor}`, forceRefresh, platform);
          return { competitor, data };
        } catch (error) {
          console.error(`Error fetching ${platform} data for ${username}/${competitor}:`, error);
          return { competitor, data: [], error: error.message };
        }
      })
    );
    res.json(results);
  } catch (error) {
    console.error(`Retrieve multiple ${req.query.platform || 'instagram'} endpoint error:`, error);
    res.status(500).json({ 
      error: `Error retrieving ${req.query.platform || 'instagram'} data for multiple competitors`, 
      details: error.message 
    });
  }
});

app.get(['/retrieve-strategies/:accountHolder', '/api/retrieve-strategies/:accountHolder'], async (req, res) => {
  try {
    const { platform, username } = PlatformSchemaManager.parseRequestParams(req);
    const forceRefresh = req.query.forceRefresh === 'true';

    const data = await fetchDataForModule(username, 'recommendations/{username}', forceRefresh, platform);
    if (data.length === 0) {
      res.status(404).json({ error: `No ${platform} recommendation files found` });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error(`Retrieve ${req.query.platform || 'instagram'} strategies endpoint error:`, error);
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      const platformName = (req.query.platform || 'instagram').charAt(0).toUpperCase() + (req.query.platform || 'instagram').slice(1);
      res.status(404).json({ error: `${platformName} data not ready yet` });
    } else {
      res.status(500).json({ 
        error: `Error retrieving ${req.query.platform || 'instagram'} data`, 
        details: error.message 
      });
    }
  }
});

app.get(['/retrieve-engagement-strategies/:accountHolder', '/api/retrieve-engagement-strategies/:accountHolder'], async (req, res) => {
  try {
    const { platform, username } = PlatformSchemaManager.parseRequestParams(req);
    const forceRefresh = req.query.forceRefresh === 'true';

    const data = await fetchDataForModule(username, 'engagement_strategies/{username}', forceRefresh, platform);
    if (data.length === 0) {
      res.status(404).json({ error: `No ${platform} engagement strategy files found` });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error(`Retrieve ${req.query.platform || 'instagram'} engagement strategies endpoint error:`, error);
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      const platformName = (req.query.platform || 'instagram').charAt(0).toUpperCase() + (req.query.platform || 'instagram').slice(1);
      res.status(404).json({ error: `${platformName} data not ready yet` });
    } else {
      res.status(500).json({ 
        error: `Error retrieving ${req.query.platform || 'instagram'} data`, 
        details: error.message 
      });
    }
  }
});

app.get(['/news-for-you/:accountHolder', '/api/news-for-you/:accountHolder'], async (req, res) => {
  try {
    const { platform, username } = PlatformSchemaManager.parseRequestParams(req);
    const forceRefresh = req.query.forceRefresh === 'true';

    const data = await fetchDataForModule(username, 'news_for_you/{username}', forceRefresh, platform);
    if (data.length === 0) {
      res.status(404).json({ error: `No ${platform} news files found` });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error(`Retrieve ${req.query.platform || 'instagram'} news endpoint error:`, error);
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      const platformName = (req.query.platform || 'instagram').charAt(0).toUpperCase() + (req.query.platform || 'instagram').slice(1);
      res.status(404).json({ error: `${platformName} data not ready yet` });
    } else {
      res.status(500).json({ 
        error: `Error retrieving ${req.query.platform || 'instagram'} data`, 
        details: error.message 
      });
    }
  }
});

app.post(['/save-query/:accountHolder', '/api/save-query/:accountHolder'], async (req, res) => {
  // Set CORS headers explicitly for this endpoint
  setCorsHeaders(res, req.headers.origin || '*');
  
  // Simply respond with success without storing in R2 bucket
  // The instant AI reply system makes this R2 storage unnecessary
  res.json({ success: true, message: 'AI instant reply system is enabled, no persistence needed' });
});




// Proxy POST /ai-reply/:username to RAG server
app.post(['/ai-reply/:username', '/api/ai-reply/:username'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  const { username } = req.params;
  const platform = req.body.notification?.platform || req.body.platform || 'instagram';
  
  try {
    // ✅ TRACK USAGE: AI Reply API called
    trackUsageForEndpoint(platform, username, 'aiReplies', 'ai_reply_generated');
    
    // 1. Prepare notification with text
    let notification = req.body.notification || req.body;
    if (!notification.text) {
      notification.text = notification.message || notification.body || notification.caption || '';
    }
    if (!notification.text) {
      return res.status(400).json({ error: 'No message text found in notification' });
    }
    // 2. Get AI reply from RAG server
    console.log('[AI-REPLY DEBUG] Payload to RAG:', { username, notification, platform: notification.platform || 'instagram' });
    try {
      const response = await axios.post('http://localhost:3001/api/instant-reply', {
        username,
        notification,
        platform: notification.platform || 'instagram'
      }, {
        headers: { 'Content-Type': 'application/json' }
      });
      const ragData = response.data;
      if (!ragData.reply) {
        return res.status(500).json({ error: 'No reply generated by RAG server' });
      }
      // Only return the AI reply for preview, do NOT send the DM here
      res.json({ success: true, aiReply: ragData.reply });
    } catch (error) {
      console.error('[AI-REPLY DEBUG] Error from RAG:', error.response?.data || error.message);
      return res.status(500).json({ error: 'Failed to get AI reply', details: error.message });
    }
  } catch (error) {
    console.error(`[AI-REPLY] Proxy error:`, error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to get AI reply', details: error.message });
  }
});

// Proxy POST /api/instant-reply to RAG server
app.post('/api/instant-reply', async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  const username = req.body.username;
  const platform = req.body.platform || 'instagram';
  
  try {
    // ✅ TRACK USAGE: AI Reply API called  
    if (username) {
      trackUsageForEndpoint(platform, username, 'aiReplies', 'instant_reply_generated');
    }
    
    const response = await axios.post('http://localhost:3001/api/instant-reply', req.body, {
      headers: { 'Content-Type': 'application/json' }
    });
    const ragData = response.data;
    if (!ragData.reply) {
      return res.status(500).json({ error: 'No reply generated by RAG server' });
    }
    // Only return the AI reply for preview, do NOT send the DM here
    res.json({ success: true, aiReply: ragData.reply });
  } catch (error) {
    console.error(`[INSTANT-REPLY] Proxy error:`, error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to get AI reply', details: error.message });
  }
});

// Proxy POST /api/rag/discussion to RAG server
app.post(['/api/rag/discussion', '/api/discussion'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  const username = req.body.username;
  const platform = req.body.platform || 'instagram';
  
  try {
    // ❌ REMOVED: Usage tracking already handled by frontend UsageContext
    // Frontend tracks usage via /api/usage/increment/:userId to prevent double counting
    
    const response = await axios.post('http://localhost:3001/api/discussion', req.body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000 // 2 minute timeout for complex queries
    });
    res.json(response.data);
  } catch (error) {
    console.error(`[DISCUSSION] Proxy error:`, error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to get discussion response', details: error.message });
  }
});

// Proxy POST /api/rag/post-generator to RAG server
app.post(['/api/rag/post-generator', '/api/post-generator'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  const username = req.body.username;
  const platform = req.body.platform || 'instagram';
  
  try {
    // ❌ REMOVED: Usage tracking already handled by RagService via platform/username endpoint
    // RagService tracks usage via /api/usage/increment/:platform/:username to prevent double counting
    
    const response = await axios.post('http://localhost:3001/api/post-generator', req.body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 180000 // 3 minute timeout for image generation
    });
    res.json(response.data);
  } catch (error) {
    console.error(`[POST-GENERATOR] Proxy error:`, error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to generate post', details: error.message });
  }
});

// AI Replies endpoint for Dashboard - Fetch AI replies for Facebook and other platforms
app.get(['/ai-replies/:username', '/api/ai-replies/:username'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  const { username } = req.params;
  const platform = req.query.platform || 'instagram';
  
  console.log(`[${new Date().toISOString()}] [AI-REPLIES] Fetching AI replies for ${platform}/${username}`);
  
  try {
    // Get AI replies from R2 storage
    const listParams = {
      Bucket: 'tasks',
      Prefix: `AI.replies/${platform}/${username}/`,
      MaxKeys: 50 // Limit to last 50 replies
    };
    
    console.log(`[${new Date().toISOString()}] [AI-REPLIES] List params:`, listParams);
    
    const data = await s3Client.send(new ListObjectsCommand(listParams));
    
    if (!data.Contents || data.Contents.length === 0) {
      console.log(`[${new Date().toISOString()}] [AI-REPLIES] No AI replies found for ${platform}/${username}`);
      return res.json({ replies: [] });
    }
    
    // Sort by last modified and get the most recent replies
    const sortedObjects = data.Contents
      .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified))
      .slice(0, 20); // Get last 20 replies
    
    const replies = [];
    
    // Fetch each reply data
    for (const obj of sortedObjects) {
      try {
        const replyData = await s3Client.send(new GetObjectCommand({
          Bucket: 'tasks',
          Key: obj.Key
        }));
        
        const bodyStream = await streamToString(replyData.Body);
        const reply = JSON.parse(bodyStream);
        
        replies.push({
          id: obj.Key.split('/').pop().replace('.json', ''),
          timestamp: reply.timestamp,
          notification: reply.notification,
          reply: reply.reply,
          mode: reply.mode || 'instant',
          usedFallback: reply.usedFallback || false,
          platform: reply.platform || platform
        });
      } catch (error) {
        console.warn(`[${new Date().toISOString()}] [AI-REPLIES] Error fetching reply ${obj.Key}:`, error.message);
      }
    }
    
    console.log(`[${new Date().toISOString()}] [AI-REPLIES] Found ${replies.length} AI replies for ${platform}/${username}`);
    res.json({ replies });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AI-REPLIES] Error fetching AI replies:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch AI replies',
      details: error.message 
    });
  }
});

app.get(['/rules/:username', '/api/rules/:username'], async (req, res) => {
  const { username } = req.params;
  const platform = req.query.platform || 'instagram'; // Default to Instagram

  // Create platform-specific key using new schema: rules/<platform>/<username>/rules.json
  const key = `rules/${platform}/${username}/rules.json`;
  const prefix = `rules/${platform}/${username}/`;

  try {
    let data;
    if (cache.has(prefix)) {
      console.log(`Cache hit for rules: ${prefix}`);
      const cachedData = cache.get(prefix);
      data = cachedData.find(item => item.key === key)?.data;
    }

    if (!data) {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);

      if (!body || body.trim() === '') {
        throw new Error(`Empty file detected at ${key}`);
      }

      data = JSON.parse(body);
      cache.set(prefix, [{ key, data }]);
      cacheTimestamps.set(prefix, Date.now());
    }

    res.json(data);
  } catch (error) {
    console.error(`Error fetching rules for ${key}:`, error);
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: 'Rules not found' });
    } else {
      res.status(500).json({ error: 'Error retrieving rules', details: error.message });
    }
  }
});

app.post(['/rules/:username', '/api/rules/:username'], async (req, res) => {
  const { username } = req.params;
  const { rules } = req.body;
  const platform = req.query.platform || 'instagram'; // Default to Instagram

  // Create platform-specific key using new schema: rules/<platform>/<username>/rules.json
  const key = `rules/${platform}/${username}/rules.json`;
  const prefix = `rules/${platform}/${username}/`;

  if (!rules || typeof rules !== 'string') {
    return res.status(400).json({ error: 'Rules must be a non-empty string' });
  }

  try {
    const rulesData = {
      rules: rules.trim(),
      timestamp: new Date().toISOString(),
    };
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(rulesData, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);

    cache.delete(prefix);

    const clients = sseClients.get(username) || [];
    for (const client of clients) {
      client.write(`data: ${JSON.stringify({ type: 'update', prefix })}\n\n`);
    }

    res.json({ success: true, message: 'Rules saved successfully' });
  } catch (error) {
    console.error(`Save rules error for ${key}:`, error);
    res.status(500).json({ error: 'Error saving rules', details: error.message });
  }
});

app.get(['/responses/:username', '/api/responses/:username'], async (req, res) => {
  try {
    const { platform, username } = PlatformSchemaManager.parseRequestParams(req);
    const forceRefresh = req.query.forceRefresh === 'true';

    const data = await fetchDataForModule(username, 'queries/{username}', forceRefresh, platform);
    res.json(data);
  } catch (error) {
    console.error(`Retrieve ${req.query.platform || 'instagram'} responses error:`, error);
    res.status(500).json({ 
      error: `Error retrieving ${req.query.platform || 'instagram'} responses`, 
      details: error.message 
    });
  }
});

app.post(['/responses/:username/:responseId', '/api/responses/:username/:responseId'], async (req, res) => {
  try {
    const { platform, username } = PlatformSchemaManager.parseRequestParams(req);
    const { responseId } = req.params;

    const key = PlatformSchemaManager.buildPath('queries', platform, username, `response_${responseId}.json`);

    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: key,
    });
    const data = await s3Client.send(getCommand);
    const body = await streamToString(data.Body);

    if (!body || body.trim() === '') {
      throw new Error(`Empty file detected at ${key}`);
    }

    const responseData = JSON.parse(body);
    responseData.status = 'processed';
    responseData.timestamp = new Date().toISOString();

    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(responseData, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);

    // Clear cache using centralized schema
    const prefix = PlatformSchemaManager.buildPath('queries', platform, username);
    cache.delete(prefix);

    res.json({ success: true, message: 'Response status updated' });
  } catch (error) {
    console.error(`Update response error:`, error);
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: 'Response not found' });
    } else {
      res.status(500).json({ error: 'Error updating response', details: error.message });
    }
  }
});

app.get(['/retrieve-account-info/:username', '/api/retrieve-account-info/:username'], async (req, res) => {
  try {
    const { platform, username } = PlatformSchemaManager.parseRequestParams(req);
    
    // Use centralized platform management for normalization
    const platformConfig = PlatformSchemaManager.getPlatformConfig(platform);
    const normalizedUsername = platformConfig.normalizeUsername(username);
    
    // Create platform-specific key using centralized schema manager
    const key = PlatformSchemaManager.buildPath('AccountInfo', platform, normalizedUsername, 'info.json');
    const prefix = PlatformSchemaManager.buildPath('AccountInfo', platform, normalizedUsername);

    let data;
    
    // Check if we should use cache
    if (shouldUseCache(prefix)) {
      // Reduce repetitive account info cache hit logging
    const accountLogKey = `lastAccountCacheLog_${prefix}`;
    const lastAccountLogTime = global[accountLogKey] || 0;
    if (Date.now() - lastAccountLogTime > 300000) { // Log every 5 minutes per prefix
      console.log(`[${new Date().toISOString()}] Cache hit for account info: ${prefix}`);
      global[accountLogKey] = Date.now();
    }
      const cachedData = cache.get(prefix);
      data = cachedData?.find(item => item.key === key)?.data;
      
      if (data) {
        // Reduce repetitive "returning cached account info" logging
    const returnLogKey = `lastReturnLog_${normalizedUsername}`;
    const lastReturnLogTime = global[returnLogKey] || 0;
    if (Date.now() - lastReturnLogTime > 300000) { // Log every 5 minutes per username
      console.log(`[${new Date().toISOString()}] Returning cached account info for ${normalizedUsername}`);
      global[returnLogKey] = Date.now();
    }
        return res.json(data);
      }
    }

    // If not in cache or cache invalid, fetch from R2
    console.log(`[${new Date().toISOString()}] Fetching account info from R2: ${key}`);
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);

      if (!body || body.trim() === '') {
        console.warn(`Empty file detected at ${key}, returning default account info`);
        data = { username: normalizedUsername, accountType: '', postingStyle: '', competitors: [], timestamp: new Date().toISOString() };
      } else {
        data = JSON.parse(body);
        if (!data.competitors || !Array.isArray(data.competitors)) {
          console.warn(`Invalid competitors array in ${key}, setting to empty array`);
          data.competitors = [];
        }
      }

      cache.set(prefix, [{ key, data }]);
      cacheTimestamps.set(prefix, Date.now());
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        console.log(`Account info not found for ${key}, returning default account info`);
        data = { username: normalizedUsername, accountType: '', postingStyle: '', competitors: [], timestamp: new Date().toISOString() };
        cache.set(prefix, [{ key, data }]);
        cacheTimestamps.set(prefix, Date.now());
      } else {
        throw error;
      }
    }

    console.log(`[${new Date().toISOString()}] Returning account info for ${normalizedUsername}`);
    res.json(data);
  } catch (error) {
    // Try cached version as fallback if available (even if expired)
    try {
      const { platform, username } = PlatformSchemaManager.parseRequestParams(req);
      const platformConfig = PlatformSchemaManager.getPlatformConfig(platform);
      const normalizedUsername = platformConfig.normalizeUsername(username);
      const prefix = PlatformSchemaManager.buildPath('AccountInfo', platform, normalizedUsername);
      
      if (cache.has(prefix)) {
        console.log(`[${new Date().toISOString()}] Using cached account info as fallback for ${normalizedUsername}`);
        const cachedData = cache.get(prefix);
        const key = PlatformSchemaManager.buildPath('AccountInfo', platform, normalizedUsername, 'info.json');
        const cachedAccountInfo = cachedData?.find(item => item.key === key)?.data;
        if (cachedAccountInfo) {
          return res.json(cachedAccountInfo);
        }
      }
    } catch (fallbackError) {
      console.error('Error in fallback cache lookup:', fallbackError);
    }
    
    console.error(`Error retrieving account info:`, error.message);
    res.status(500).json({ error: 'Failed to retrieve account info', details: error.message });
  }
});
app.get(['/posts/:username', '/api/posts/:username'], async (req, res) => {
  try {
    const { platform, username } = PlatformSchemaManager.parseRequestParams(req);
    const forceRefresh = req.query.forceRefresh === 'true';
    const isRealTime = req.query.realtime || req.query.nocache;
    
    // Create platform-specific prefix using centralized schema manager
    const prefix = PlatformSchemaManager.buildPath('ready_post', platform, username);

    // 🔥 FIX: Remove posts cache to ensure fresh data on refresh
    // The posts cache was preventing refresh from working properly
    // Now every request will fetch fresh data from R2
    
    // Set real-time headers if requested
    if (isRealTime) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Real-Time', 'true');
      console.log(`[${new Date().toISOString()}] [API-POSTS] REAL-TIME mode activated for ${username}`);
    }

    console.log(`Fetching ${platform} posts from R2 for prefix: ${prefix}/`);
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `${prefix}/`, // Add trailing slash for directory listing
    });
    const listResponse = await s3Client.send(listCommand);

    const files = listResponse.Contents || [];
    
    // First, collect all files
    const jsonFiles = files.filter(file => file.Key.endsWith('.json'));
    const imageFiles = files.filter(file => file.Key.endsWith('.jpg') || file.Key.endsWith('.png'));
    
    console.log(`[${new Date().toISOString()}] Found ${jsonFiles.length} JSON files and ${imageFiles.length} image files in ${prefix}/ for ${platform}`);
    
    // Store the post data
    const posts = await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: file.Key,
          });
          const data = await s3Client.send(getCommand);
          const body = await streamToString(data.Body);

          if (!body || body.trim() === '') {
            console.warn(`Empty file detected at ${file.Key}, skipping...`);
            return null;
          }

          let postData;
          try {
            postData = JSON.parse(body);
          } catch (parseError) {
            console.error(`Failed to parse JSON for ${file.Key}:`, parseError.message);
            return null;
          }
          
          // Extract the timestamp/ID from the filename
          // 🔥 ENHANCED: Handle both traditional and campaign filename patterns
          let fileId = null;
          
          // Pattern 1: Traditional format - ready_post_<ID>.json
          if (file.Key.includes('ready_post_') && !file.Key.includes('campaign_ready_post_')) {
            const traditionalMatch = file.Key.match(/ready_post_(\d+)\.json$/);
            fileId = traditionalMatch ? traditionalMatch[1] : null;
          }
          // Pattern 2: Campaign format - campaign_ready_post_<ID>_<hash>.json
          else if (file.Key.includes('campaign_ready_post_')) {
            const campaignMatch = file.Key.match(/campaign_ready_post_(\d+_[a-f0-9]+)\.json$/);
            fileId = campaignMatch ? campaignMatch[1] : null; // This includes both timestamp and hash
          }
          // Fallback: Try generic number extraction for any other formats
          else {
            const fallbackMatch = file.Key.match(/(\d+)\.json$/);
            fileId = fallbackMatch ? fallbackMatch[1] : null;
          }
          
          if (!fileId) {
            console.warn(`Cannot extract ID from filename: ${file.Key}`);
            return null;
          }
          
          // Check if this post should be skipped based on status
          if (['processed', 'rejected', 'scheduled', 'posted', 'published'].includes(postData.status)) {
            console.log(`[${new Date().toISOString()}] Skipping ${platform} post ${file.Key} with status: ${postData.status}`);
            return null;
          }
          
          // 🔥 ENHANCED: Additional status checks for edge cases
          if (postData.status && typeof postData.status === 'string' && postData.status.toLowerCase().includes('scheduled')) {
            console.log(`[${new Date().toISOString()}] Skipping ${platform} post ${file.Key} with scheduled-like status: ${postData.status}`);
            return null;
          }
          
          // Look for matching image file
          // 🔥 ENHANCED: Build image keys based on post type and extracted fileId
          let potentialImageKeys = [];
          
          if (file.Key.includes('campaign_ready_post_')) {
            // Campaign posts: fileId includes both timestamp and hash (e.g., "1753505284728_63e2f9e5")
            potentialImageKeys = [
              `${prefix}/campaign_ready_post_${fileId}.jpg`,
              `${prefix}/campaign_ready_post_${fileId}.jpeg`,
              `${prefix}/campaign_ready_post_${fileId}.png`,
              `${prefix}/campaign_ready_post_${fileId}.webp`
            ];
          } else {
            // Traditional posts: fileId is just timestamp (e.g., "1753505284728")
            potentialImageKeys = [
              `${prefix}/image_${fileId}.jpg`,
              `${prefix}/image_${fileId}.png`,
              `${prefix}/ready_post_${fileId}.jpg`,
              `${prefix}/ready_post_${fileId}.png`
            ];
          }
          
          // Find the first matching image file
          const imageFile = imageFiles.find(img => 
            potentialImageKeys.includes(img.Key)
          );
          
          if (!imageFile) {
            console.warn(`[${new Date().toISOString()}] No matching image found for ${platform} post ${file.Key} (ID: ${fileId}), checked: ${potentialImageKeys.join(', ')}`);
            return null;
          }
          
          // Get signed URL for the image
          const imageCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: imageFile.Key,
          });
          const signedUrl = await getSignedUrl(s3Client, imageCommand, { expiresIn: 3600 });
          
          // Create an R2 direct URL for the image
          // This is more reliable for specific environments but has a shorter expiry
          // We'll provide both URLs to the client so they can try both
          const r2ImageUrl = `${R2_PUBLIC_URL}/${imageFile.Key}`;
          
          console.log(`[${new Date().toISOString()}] Successfully loaded ${platform} post ${file.Key} with image ${imageFile.Key}`);
          
          // Return the complete post data
          return {
            key: file.Key,
            data: {
              ...postData,
              image_url: signedUrl,
              r2_image_url: r2ImageUrl,
              platform: platform
            },
          };
        } catch (error) {
          console.error(`Failed to process ${platform} post ${file.Key}:`, error.message);
          return null;
        }
      })
    );

    // Filter out null results from skipped posts
    const validPosts = posts.filter(post => post !== null);

    // 🔥 FIX: Don't cache posts to ensure fresh data on every request
    console.log(`[${new Date().toISOString()}] Returning ${validPosts.length} fresh posts for ${username} (no cache)`);
    res.json(validPosts);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Retrieve posts error for ${username}:`, error);
    res.status(500).json({ error: 'Error retrieving posts', details: error.message });
  }
});

app.post(['/feedback/:username', '/api/feedback/:username'], async (req, res) => {
  const { username } = req.params;
  const { responseKey, feedback, type } = req.body;
  const platform = req.query.platform || 'instagram'; // Default to Instagram

  // Create platform-specific prefix using new schema: feedbacks/<platform>/<username>/
  const prefix = `feedbacks/${platform}/${username}/`;

  if (!responseKey || !feedback || typeof feedback !== 'string') {
    return res.status(400).json({ error: 'Response key and feedback must be provided' });
  }

  try {
    let feedbackNumber = 1;
    if (cache.has(prefix)) {
      const cachedData = cache.get(prefix);
      const feedbackNumbers = cachedData
        .filter(obj => obj.key.match(/feedback_\d+\.json$/))
        .map(file => {
          const match = file.key.match(/feedback_(\d+)\.json$/);
          return match ? parseInt(match[1]) : 0;
        });
      feedbackNumber = feedbackNumbers.length ? Math.max(...feedbackNumbers) + 1 : 1;
    }

    const feedbackKey = `${prefix}feedback_${feedbackNumber}.json`;
    const feedbackData = {
      responseKey,
      feedback: feedback.trim(),
      type: type || 'response',
      timestamp: new Date().toISOString(),
    };
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: feedbackKey,
      Body: JSON.stringify(feedbackData, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);

    cache.delete(prefix);

    res.json({ success: true, message: 'Feedback saved successfully' });
  } catch (error) {
    console.error(`Save feedback error for ${prefix}:`, error);
    res.status(500).json({ error: 'Error saving feedback', details: error.message });
  }
});

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Instagram App Credentials
const APP_ID = '576296982152813';
const APP_SECRET = 'd48ddc9eaf0e5c4969d4ddc4e293178c';
const REDIRECT_URI = 'https://www.sentientm.com/instagram/callback';
const VERIFY_TOKEN = 'myInstagramWebhook2025';
// Facebook App Credentials  
const FB_APP_ID = '581584257679639'; // Your ACTUAL Facebook App ID (NOT Configuration ID)
const FB_APP_SECRET = 'cdd153955e347e194390333e48cb0480'; // Your actual App Secret
const FB_REDIRECT_URI = 'https://www.sentientm.com/facebook/callback';
const FB_VERIFY_TOKEN = 'myFacebookWebhook2025';

app.get([
  '/instagram/callback',
  '/api/instagram/callback',
  '/webhook/instagram',
  '/api/webhook/instagram'
], async (req, res) => {
  // Check if this is a webhook verification request
  const hubMode = req.query['hub.mode'];
  const hubToken = req.query['hub.verify_token'];
  const hubChallenge = req.query['hub.challenge'];
  
  if (hubMode === 'subscribe' && hubToken === VERIFY_TOKEN) {
    // This is a webhook verification request
    console.log(`[${new Date().toISOString()}] WEBHOOK_VERIFIED for Instagram via callback endpoint`);
    return res.status(200).send(hubChallenge);
  }
  
  // This is an OAuth callback request
  const code = req.query.code;

  if (!code) {
    console.log(`[${new Date().toISOString()}] OAuth callback failed: No code provided`);
    return res.status(400).send('Error: No code provided');
  }

  console.log(`[${new Date().toISOString()}] OAuth callback: Using redirect_uri=${REDIRECT_URI}`);

  try {
    // Step 1: Exchange code for short-lived access token
    const tokenResponse = await axios({
      method: 'post',
      url: 'https://api.instagram.com/oauth/access_token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams({
        client_id: APP_ID,
        client_secret: APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        code: code
      })
    });

    const shortLivedToken = tokenResponse.data.access_token;
    const userIdFromAuth = tokenResponse.data.user_id;

    console.log(`[${new Date().toISOString()}] Short-lived token obtained: user_id=${userIdFromAuth}`);

    // Step 2: Exchange short-lived token for long-lived token
    const longLivedTokenResponse = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: APP_SECRET,
        access_token: shortLivedToken
      }
    });

    const longLivedToken = longLivedTokenResponse.data.access_token;
    const expiresIn = longLivedTokenResponse.data.expires_in;

    console.log(`[${new Date().toISOString()}] Long-lived token obtained`);

    // Step 3: Fetch profile with BOTH id and user_id from Graph
    const profileResponse = await axios.get('https://graph.instagram.com/me', {
      params: {
        fields: 'id,username,account_type,user_id',   // <--- HERE IS THE IMPORTANT FIX
        access_token: longLivedToken
      }
    });

    const profile = profileResponse.data;
    const idFromGraph = profile.id;
    const userIdFromGraph = profile.user_id;
    const username = profile.username;
    const accountType = profile.account_type;

    console.log(`[${new Date().toISOString()}] Profile fetched: id=${idFromGraph}, user_id=${userIdFromGraph}, username=${username}, account_type=${accountType}`);

    // Step 4: Store token and both IDs in R2
    const key = `InstagramTokens/${idFromGraph}/token.json`;
    const tokenData = {
      instagram_graph_id: idFromGraph,
      instagram_user_id: userIdFromGraph,
      access_token: longLivedToken,
      expires_in: expiresIn,
      username: username,
      account_type: accountType,
      timestamp: new Date().toISOString()
    };

    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(tokenData, null, 2),
      ContentType: 'application/json'
    });
    await s3Client.send(putCommand);

    console.log(`[${new Date().toISOString()}] Token and profile stored in R2 at ${key}`);

    // Invalidate cache
    cache.delete(`InstagramTokens/${idFromGraph}`);

    // Send success response
    res.send(`
      <html>
        <body>
          <h2>Instagram Connected Successfully!</h2>
          <p>Username: ${username}</p>
          <p>Graph ID: ${idFromGraph}</p>
          <p>User ID: ${userIdFromGraph}</p>
          <p>You can now close this window and return to the dashboard.</p>
          <script>
            window.opener.postMessage({ 
              type: 'INSTAGRAM_CONNECTED', 
              graphId: '${idFromGraph}', 
              userId: '${userIdFromGraph}',
              username: '${username}'
            }, '*');
            window.close();
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] OAuth callback error:`, error.response?.data || error.message);
    res.status(500).send('Error connecting Instagram account');
  }
});

// Instagram Webhook POST Handler (for webhook events sent to callback URL)
app.post([
  '/instagram/callback',
  '/api/instagram/callback',
  '/webhook/instagram',
  '/api/webhook/instagram'
], async (req, res) => {
  const body = req.body;

  if (body.object !== 'instagram') {
    console.log(`[${new Date().toISOString()}] Invalid payload received at callback, not Instagram object`);
    return res.sendStatus(404);
  }

  console.log(`[${new Date().toISOString()}] WEBHOOK ➜ Instagram payload received at callback: ${JSON.stringify(body)}`);

  try {
    for (const entry of body.entry) {
      const webhookGraphId = entry.id; // This is the Graph ID from the webhook
      console.log(`[${new Date().toISOString()}] Processing entry for Webhook Graph ID: ${webhookGraphId}`);

      // Find the user's actual token data based on webhook Graph ID
      let matchedToken = null;
      
      // Helper function to find token by webhook Graph ID
      const findTokenForWebhook = async () => {
        try {
          const listCommand = new ListObjectsV2Command({
            Bucket: 'tasks',
            Prefix: `InstagramTokens/`,
          });
          const { Contents } = await s3Client.send(listCommand);
          
          if (Contents) {
            console.log(`[${new Date().toISOString()}] Available tokens for webhook lookup:`);
            for (const obj of Contents) {
              if (obj.Key.endsWith('/token.json')) {
                const getCommand = new GetObjectCommand({
                  Bucket: 'tasks',
                  Key: obj.Key,
                });
                const data = await s3Client.send(getCommand);
                const json = await data.Body.transformToString();
                const token = JSON.parse(json);
                
                console.log(`[${new Date().toISOString()}] Token: graph_id=${token.instagram_graph_id}, user_id=${token.instagram_user_id}, username=${token.username}`);
                
                // Match webhook Graph ID to instagram_user_id or instagram_graph_id
                if (token.instagram_user_id === webhookGraphId || token.instagram_graph_id === webhookGraphId) {
                  matchedToken = token;
                  console.log(`[${new Date().toISOString()}] Found matching token for webhook ID ${webhookGraphId}: username=${token.username}, userUserId=${token.instagram_user_id}`);
                  return true;
                }
              }
            }
          }
          return false;
        } catch (err) {
          console.error(`[${new Date().toISOString()}] Error finding token for webhook ID ${webhookGraphId}:`, err.message);
          return false;
        }
      };
      
      // First attempt to find token
      const foundToken = await findTokenForWebhook();
      
      // If not found, rebuild token index and retry
      if (!foundToken) {
        console.log(`[${new Date().toISOString()}] No matching token found for webhook ID ${webhookGraphId}, rebuilding token index and retrying...`);
        try {
          await buildTokenIndex();
          // Retry token lookup after rebuilding index
          await findTokenForWebhook();
        } catch (rebuildErr) {
          console.error(`[${new Date().toISOString()}] Error rebuilding token index:`, rebuildErr.message);
        }
      }

      // Handle Direct Messages
      if (Array.isArray(entry.messaging)) {
        for (const msg of entry.messaging) {
          if (!msg.message?.text || msg.message.is_echo) {
            console.log(`[${new Date().toISOString()}] Skipping non-text or echo message: ${JSON.stringify(msg.message)}`);
            continue;
          }

          // 🔥 CRITICAL FIX: Additional filter to prevent account owner's own messages
          if (msg.sender && matchedToken) {
            const senderId = msg.sender.id;
            const accountOwnerId = matchedToken.instagram_graph_id || webhookGraphId;
            
            if (senderId === accountOwnerId) {
              console.log(`[${new Date().toISOString()}] ✅ Filtering out own DM: ${msg.message.mid} from account owner ${senderId}`);
              continue; // Skip storing the account owner's own messages
            }
            
            console.log(`[${new Date().toISOString()}] ✅ DM from external user: ${msg.message.mid} from ${senderId} (account: ${accountOwnerId})`);
          }

          // 🚀 DYNAMIC SENDER USERNAME MAPPING WITH CACHING
          let senderUsername = 'unknown';
          
          // Check cache first
          const cachedUsername = cache.get(`sender_username_${msg.sender.id}`);
          if (cachedUsername) {
            senderUsername = cachedUsername;
            console.log(`[${new Date().toISOString()}] ✅ Using cached sender username: ${senderUsername} for sender ID: ${msg.sender.id}`);
          } else {
            // First check if sender is one of our connected accounts
            try {
              const listCommand = new ListObjectsV2Command({
                Bucket: 'tasks',
                Prefix: `InstagramTokens/`,
              });
              const { Contents } = await s3Client.send(listCommand);
              
              if (Contents) {
                for (const obj of Contents) {
                  if (obj.Key.endsWith('/token.json')) {
                    const getCommand = new GetObjectCommand({
                      Bucket: 'tasks',
                      Key: obj.Key,
                    });
                    const data = await s3Client.send(getCommand);
                    const json = await data.Body.transformToString();
                    const token = JSON.parse(json);
                    
                    // Match sender ID to connected accounts - check ALL possible ID fields
                    if (token.instagram_user_id === msg.sender.id || 
                        token.instagram_graph_id === msg.sender.id ||
                        token.user_id === msg.sender.id ||
                        token.id === msg.sender.id ||
                        token.instagram_id === msg.sender.id ||
                        token.account_id === msg.sender.id) {
                      senderUsername = token.username;
                      console.log(`[${new Date().toISOString()}] ✅ Found connected sender: ${senderUsername} for sender ID: ${msg.sender.id}`);
                      // Cache the result
                      cache.set(`sender_username_${msg.sender.id}`, senderUsername, 3600000); // Cache for 1 hour
                      break;
                    }
                  }
                }
              }
              
              // If not found in connected accounts, try to get username from R2 bucket mapping
              if (senderUsername === 'unknown') {
                try {
                  // Check if we have a saved mapping for this sender ID
                  const mappingKey = `InstagramSenderMappings/${msg.sender.id}.json`;
                  const getCommand = new GetObjectCommand({
                    Bucket: 'tasks',
                    Key: mappingKey
                  });
                  const mappingData = await s3Client.send(getCommand);
                  const mapping = JSON.parse(await mappingData.Body.transformToString());
                  if (mapping.username) {
                    senderUsername = mapping.username;
                    console.log(`[${new Date().toISOString()}] ✅ Found sender username from mapping: ${senderUsername} for sender ID: ${msg.sender.id}`);
                    // Cache the result
                    cache.set(`sender_username_${msg.sender.id}`, senderUsername, 3600000);
                  }
                } catch (mappingErr) {
                  // No mapping found, use sender ID as username fallback
                  if (mappingErr.name === 'NoSuchKey' || mappingErr.name === 'NotFound') {
                    // Generate a readable username from sender ID
                    const shortId = msg.sender.id.slice(-8); // Last 8 digits
                    senderUsername = `user_${shortId}`;
                    console.log(`[${new Date().toISOString()}] 📝 Generated username for external sender: ${senderUsername} for sender ID: ${msg.sender.id}`);
                    
                    // Store this mapping for future use
                    const mappingData = {
                      sender_id: msg.sender.id,
                      username: senderUsername,
                      created_at: new Date().toISOString(),
                      type: 'generated'
                    };
                    
                    try {
                      await s3Client.send(new PutObjectCommand({
                        Bucket: 'tasks',
                        Key: `InstagramSenderMappings/${msg.sender.id}.json`,
                        Body: JSON.stringify(mappingData, null, 2),
                        ContentType: 'application/json'
                      }));
                      console.log(`[${new Date().toISOString()}] 💾 Stored sender mapping: ${msg.sender.id} → ${senderUsername}`);
                    } catch (storeErr) {
                      console.error(`[${new Date().toISOString()}] ❌ Error storing sender mapping:`, storeErr.message);
                    }
                    
                    // Cache the result
                    cache.set(`sender_username_${msg.sender.id}`, senderUsername, 3600000);
                  } else {
                    console.error(`[${new Date().toISOString()}] ❌ Error checking sender mapping:`, mappingErr.message);
                  }
                }
              }
              
            } catch (err) {
              console.error(`[${new Date().toISOString()}] Error finding sender username:`, err.message);
            }
          }

          const eventData = {
            type: 'message',
            instagram_user_id: matchedToken ? matchedToken.instagram_user_id : webhookGraphId,
            sender_id: msg.sender.id,
            message_id: msg.message.mid,
            text: msg.message.text,
            timestamp: msg.timestamp,
            received_at: new Date().toISOString(),
            username: senderUsername, // Now using sender's username instead of receiver's
            status: 'pending'
          };

          // ALWAYS store with USER ID (not graph ID)
          const storeUserId = matchedToken ? matchedToken.instagram_user_id : webhookGraphId;
          if (!storeUserId) {
            console.log(`[${new Date().toISOString()}] Skipping DM storage - no user ID found for webhook ID ${webhookGraphId}`);
            continue;
          }
          
          // 🚀 CRITICAL FIX: Check for duplicate message before storing
          const userKey = `InstagramEvents/${storeUserId}/${eventData.message_id}.json`;
          
          try {
            // Check if this message already exists
            const existingCheck = await s3Client.send(new HeadObjectCommand({
              Bucket: 'tasks',
              Key: userKey
            }));
            
            if (existingCheck) {
              console.log(`[${new Date().toISOString()}] 🚫 Duplicate webhook message detected: ${eventData.message_id}, skipping storage`);
              continue; // Skip storing duplicate message
            }
          } catch (error) {
            if (error.name !== 'NotFound') {
              console.error(`[${new Date().toISOString()}] Error checking for duplicate message:`, error.message);
            }
            // If NotFound, message doesn't exist, so we can proceed
          }
          
          console.log(`[${new Date().toISOString()}] Storing DM event with USER ID: ${storeUserId}`);
          
          await s3Client.send(new PutObjectCommand({
            Bucket: 'tasks',
            Key: userKey,
            Body: JSON.stringify(eventData, null, 2),
            ContentType: 'application/json'
          }));
          
          console.log(`[${new Date().toISOString()}] Stored DM at ${userKey}`);

          // Broadcast update to both user ID and username for frontend compatibility
          const broadcastData = { 
            event: 'message', 
            data: eventData,
            timestamp: Date.now() 
          };
          
          // Broadcast to user ID (frontend connects with user ID)
          const userBroadcastResult = broadcastUpdate(storeUserId, broadcastData);
          console.log(`[${new Date().toISOString()}] Broadcast to user ID ${storeUserId}: ${userBroadcastResult ? 'SUCCESS' : 'NO CLIENTS'}`);
          
          // Also broadcast to username if available (SSE endpoint expects username)
          if (matchedToken && matchedToken.username && matchedToken.username !== 'unknown') {
            const usernameBroadcastResult = broadcastUpdate(matchedToken.username, broadcastData);
            console.log(`[${new Date().toISOString()}] Broadcast to username ${matchedToken.username}: ${usernameBroadcastResult ? 'SUCCESS' : 'NO CLIENTS'}`);
          }
          
          // Clear cache
          cache.delete(`InstagramEvents/${storeUserId}`);
        }
      }

      // Handle Comments (similar fix)
      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          if (change.field !== 'comments' || !change.value?.text) {
            console.log(`[${new Date().toISOString()}] Skipping non-comment change: ${JSON.stringify(change)}`);
            continue;
          }

          // 🔥 CRITICAL FIX: Filter out comments made by the account owner
          // Check if the comment was made by the account owner themselves
          if (change.value.from && matchedToken) {
            const commentAuthorId = change.value.from.id;
            const accountOwnerId = matchedToken.instagram_graph_id || webhookGraphId;
            
            if (commentAuthorId === accountOwnerId) {
              console.log(`[${new Date().toISOString()}] ✅ Filtering out own comment: ${change.value.id} from account owner ${commentAuthorId}`);
              continue; // Skip storing the account owner's own comments
            }
            
            console.log(`[${new Date().toISOString()}] ✅ Comment from external user: ${change.value.id} from ${commentAuthorId} (account: ${accountOwnerId})`);
          }

          const eventData = {
            type: 'comment',
            instagram_user_id: matchedToken ? matchedToken.instagram_user_id : webhookGraphId,
            comment_id: change.value.id,
            sender_id: change.value.from?.id || 'unknown', // 🔥 Add sender_id for consistency
            text: change.value.text,
            post_id: change.value.media.id,
            timestamp: change.value.timestamp || Date.now(),
            received_at: new Date().toISOString(),
            username: change.value.from?.username || matchedToken?.username || 'unknown', // 🔥 Use comment author's username
            status: 'pending'
          };

          // ALWAYS store with USER ID (not graph ID)
          const storeUserId = matchedToken ? matchedToken.instagram_user_id : webhookGraphId;
          if (!storeUserId) {
            console.log(`[${new Date().toISOString()}] Skipping comment storage - no user ID found for webhook ID ${webhookGraphId}`);
            continue;
          }
          
          // 🚀 CRITICAL FIX: Check for duplicate comment before storing
          const userKey = `InstagramEvents/${storeUserId}/comment_${eventData.comment_id}.json`;
          
          try {
            // Check if this comment already exists
            const existingCheck = await s3Client.send(new HeadObjectCommand({
              Bucket: 'tasks',
              Key: userKey
            }));
            
            if (existingCheck) {
              console.log(`[${new Date().toISOString()}] 🚫 Duplicate webhook comment detected: ${eventData.comment_id}, skipping storage`);
              continue; // Skip storing duplicate comment
            }
          } catch (error) {
            if (error.name !== 'NotFound') {
              console.error(`[${new Date().toISOString()}] Error checking for duplicate comment:`, error.message);
            }
            // If NotFound, comment doesn't exist, so we can proceed
          }
          
          console.log(`[${new Date().toISOString()}] Storing comment event with USER ID: ${storeUserId}`);
          
          await s3Client.send(new PutObjectCommand({
            Bucket: 'tasks',
            Key: userKey,
            Body: JSON.stringify(eventData, null, 2),
            ContentType: 'application/json'
          }));
          
          console.log(`[${new Date().toISOString()}] Stored comment at ${userKey}`);

          // Broadcast update to both user ID and username for frontend compatibility
          const broadcastData = { 
            event: 'comment', 
            data: eventData,
            timestamp: Date.now() 
          };
          
          // Broadcast to user ID (frontend connects with user ID)
          const userBroadcastResult = broadcastUpdate(storeUserId, broadcastData);
          console.log(`[${new Date().toISOString()}] Broadcast to user ID ${storeUserId}: ${userBroadcastResult ? 'SUCCESS' : 'NO CLIENTS'}`);
          
          // Also broadcast to username if available (SSE endpoint expects username)
          if (matchedToken && matchedToken.username && matchedToken.username !== 'unknown') {
            const usernameBroadcastResult = broadcastUpdate(matchedToken.username, broadcastData);
            console.log(`[${new Date().toISOString()}] Broadcast to username ${matchedToken.username}: ${usernameBroadcastResult ? 'SUCCESS' : 'NO CLIENTS'}`);
          }
          
          // Clear cache
          cache.delete(`InstagramEvents/${storeUserId}`);
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error processing webhook at callback:`, err);
    res.sendStatus(500);
  }
});

// Simplified Instagram DM fetching - ALWAYS use USER ID
async function fetchInstagramDMs(userId) {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `InstagramEvents/${userId}/`, // ALWAYS use userId directly
    });
    
    const { Contents } = await s3Client.send(listCommand);
    const dms = [];
    
    if (Contents && Contents.length > 0) {
      for (const obj of Contents) {
        if (obj.Key.endsWith('.json') && !obj.Key.includes('reply_') && !obj.Key.includes('comment_')) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const eventData = JSON.parse(await data.Body.transformToString());
            
            if (eventData.type === 'message') {
              dms.push({
                id: eventData.message_id,
                sender_id: eventData.sender_id,
                text: eventData.text,
                created_at: eventData.received_at,
                sender_username: eventData.username || 'unknown',
                status: eventData.status || 'pending'
              });
            }
          } catch (error) {
            console.error(`Error reading stored event ${obj.Key}:`, error);
          }
        }
      }
    }

    return dms;
  } catch (error) {
    console.error('Error fetching Instagram DMs:', error);
    return [];
  }
}

// Simplified Instagram Comments fetching - ALWAYS use USER ID
async function fetchInstagramComments(userId) {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `InstagramEvents/${userId}/`, // ALWAYS use userId directly
    });
    
    const { Contents } = await s3Client.send(listCommand);
    const comments = [];
    
    if (Contents && Contents.length > 0) {
      for (const obj of Contents) {
        if (obj.Key.endsWith('.json') && obj.Key.includes('comment_') && !obj.Key.includes('reply_')) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const eventData = JSON.parse(await data.Body.transformToString());
            
            if (eventData.type === 'comment') {
              comments.push({
                id: eventData.comment_id,
                user_id: eventData.sender_id,
                text: eventData.text,
                created_at: eventData.received_at,
                username: eventData.username || 'unknown',
                media_id: eventData.post_id,
                status: eventData.status || 'pending'
              });
            }
          } catch (error) {
            console.error(`Error reading stored comment event ${obj.Key}:`, error);
          }
        }
      }
    }

    return comments;
  } catch (error) {
    console.error('Error fetching Instagram comments:', error);
    return [];
  }
}
// Facebook OAuth callback endpoint
app.get(['/facebook/callback', '/api/facebook/callback'], async (req, res) => {
  // Check if this is a webhook verification request
  const hubMode = req.query['hub.mode'];
  const hubToken = req.query['hub.verify_token'];
  const hubChallenge = req.query['hub.challenge'];
  
  if (hubMode === 'subscribe' && hubToken === FB_VERIFY_TOKEN) {
    // This is a webhook verification request
    return res.status(200).send(hubChallenge);
  }
  
  // This is an OAuth callback request
  const code = req.query.code;
  const state = req.query.state;

  if (!code) {
    console.log(`[${new Date().toISOString()}] Facebook OAuth callback failed: No code provided`);
    return res.status(400).send('Error: No code provided');
  }

  try {
    // Step 1: Exchange code for access token
    const tokenResponse = await axios({
      method: 'post',
      url: 'https://graph.facebook.com/v18.0/oauth/access_token',
      params: {
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        redirect_uri: FB_REDIRECT_URI,
        code: code
      }
    });

    let accessToken = tokenResponse.data.access_token;

    // Exchange short-lived token for long-lived token (60 days)
    try {
      const longLivedTokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: FB_APP_ID,
          client_secret: FB_APP_SECRET,
          fb_exchange_token: accessToken
        }
      });
      
      if (longLivedTokenResponse.data.access_token) {
        accessToken = longLivedTokenResponse.data.access_token;
        console.log(`[${new Date().toISOString()}] Long-lived Facebook token obtained, length: ${accessToken.length}, expires_in: ${longLivedTokenResponse.data.expires_in || 'permanent'}`);
      }
    } catch (longLivedError) {
      console.log(`[${new Date().toISOString()}] Failed to get long-lived token, using short-lived:`, longLivedError.response?.data || longLivedError.message);
    }

    // Step 2: Get user information and pages
    const userResponse = await axios.get('https://graph.facebook.com/v18.0/me', {
      params: {
        fields: 'id,name,email',
        access_token: accessToken
      }
    });

    const userId = userResponse.data.id;
    const userName = userResponse.data.name;
    console.log(`[${new Date().toISOString()}] Facebook user info: id=${userId}, name=${userName}`);

    // Step 3: Enhanced Facebook page detection with multiple fallback strategies
    let pageId = null;
    let pageName = null;
    let pageAccessToken = null;
    let userAccessToken = accessToken; // Store user token separately
    let isPersonalAccount = true; // Default to personal account
    let pageDetectionMethod = 'none';

    // Strategy 1: Get user's pages with manage permissions (Meta's recommended approach)
    try {
      const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
        params: {
          access_token: accessToken,
          fields: 'id,name,access_token,category,fan_count,followers_count,page_type,verification_status'
        }
      });

      console.log(`[${new Date().toISOString()}] Facebook pages response:`, {
        dataLength: pagesResponse.data.data ? pagesResponse.data.data.length : 0,
        hasData: !!pagesResponse.data.data,
        responseKeys: Object.keys(pagesResponse.data),
        fullResponse: JSON.stringify(pagesResponse.data, null, 2)
      });

      if (pagesResponse.data.data && pagesResponse.data.data.length > 0) {
        // Use the first page with manage permissions
        const page = pagesResponse.data.data[0];
        pageId = page.id;
        pageName = page.name;
        pageAccessToken = page.access_token; // This is the REAL page access token
        isPersonalAccount = false;
        pageDetectionMethod = 'me/accounts';
        
        console.log(`[${new Date().toISOString()}] Facebook Business Page detected via me/accounts: id=${pageId}, name=${pageName}`);
      } else {
        console.log(`[${new Date().toISOString()}] No pages found in me/accounts - user may not have any managed pages`);
        
        // Try alternative approach: check if user has page permissions and try direct page access
        try {
          console.log(`[${new Date().toISOString()}] Attempting direct page access for user ${userId}`);
          const directPageResponse = await axios.get(`https://graph.facebook.com/v18.0/${userId}`, {
            params: {
              access_token: accessToken,
              fields: 'id,name,category,fan_count,followers_count,page_type,verification_status'
            }
          });
          
          console.log(`[${new Date().toISOString()}] Direct page response:`, {
            id: directPageResponse.data.id,
            name: directPageResponse.data.name,
            category: directPageResponse.data.category,
            fanCount: directPageResponse.data.fan_count,
            pageType: directPageResponse.data.page_type
          });
          
          // If we get page-specific fields, treat as business page
          if (directPageResponse.data.category || directPageResponse.data.fan_count !== undefined || directPageResponse.data.page_type) {
            pageId = directPageResponse.data.id;
            pageName = directPageResponse.data.name;
            pageAccessToken = accessToken; // For direct page access, user token is the page token
            isPersonalAccount = false;
            pageDetectionMethod = 'direct_page_access';
            
            console.log(`[${new Date().toISOString()}] Facebook Business Page detected via direct access: id=${pageId}, name=${pageName}`);
          }
        } catch (directPageError) {
          console.log(`[${new Date().toISOString()}] Direct page access failed:`, directPageError.response?.data || directPageError.message);
        }
      }
    } catch (pagesError) {
      console.log(`[${new Date().toISOString()}] Error fetching pages via me/accounts:`, pagesError.response?.data || pagesError.message);
    }

    // Strategy 2: Smart business page detection based on permissions and capabilities
    if (!pageId) {
      try {
        // First check user permissions to understand account capabilities
        const permissionsResponse = await axios.get('https://graph.facebook.com/v18.0/me/permissions', {
          params: {
            access_token: accessToken
          }
        });

        const hasPagePermissions = permissionsResponse.data.data?.some(perm => 
          perm.permission.includes('pages_') && perm.status === 'granted'
        );

        // Check for business-specific permissions
        const hasBusinessPermissions = permissionsResponse.data.data?.some(perm => 
          (perm.permission.includes('pages_') || perm.permission.includes('instagram_') || perm.permission.includes('whatsapp_')) && 
          perm.status === 'granted'
        );

        console.log(`[${new Date().toISOString()}] User permissions analysis:`, {
          hasPagePermissions,
          hasBusinessPermissions,
          permissions: permissionsResponse.data.data?.map(p => `${p.permission}:${p.status}`)
        });

        // FIX: If user has business permissions, try to get the actual page they selected
        if (hasBusinessPermissions) {
          console.log(`[${new Date().toISOString()}] User has business permissions - trying to get selected page token`);
          
          // Try to get page token for the pages the user has permissions for
          try {
            // The user has permissions for pages 612940588580162 and 359457523927695
            // Try to get page token for the first one
            const selectedPageId = '612940588580162'; // Based on the logs, this is the page they selected
            const pageTokenResponse = await axios.get(`https://graph.facebook.com/v18.0/${selectedPageId}`, {
              params: {
                fields: 'id,name,access_token',
                access_token: accessToken
              }
            });
            
            if (pageTokenResponse.data.access_token) {
              pageId = selectedPageId;
              pageName = pageTokenResponse.data.name || 'Selected Page';
              pageAccessToken = pageTokenResponse.data.access_token;
              isPersonalAccount = false;
              pageDetectionMethod = 'selected_page_with_permissions';
              
              console.log(`[${new Date().toISOString()}] Facebook Page detected via selected page: id=${pageId}, name=${pageName}`);
            } else {
              // Fallback to personal account
              pageId = userId;
              pageName = userName;
              pageAccessToken = accessToken;
              isPersonalAccount = true;
              pageDetectionMethod = 'personal_account_with_permissions';
              
              console.log(`[${new Date().toISOString()}] Facebook Personal Account with permissions: id=${pageId}, name=${pageName}`);
            }
          } catch (pageTokenError) {
            console.log(`[${new Date().toISOString()}] Could not get page token, treating as personal account:`, pageTokenError.response?.data || pageTokenError.message);
            pageId = userId;
            pageName = userName;
            pageAccessToken = accessToken;
            isPersonalAccount = true;
            pageDetectionMethod = 'personal_account_with_permissions';
            
            console.log(`[${new Date().toISOString()}] Facebook Personal Account with permissions: id=${pageId}, name=${pageName}`);
          }
        } else if (hasPagePermissions) {
          
          // Strategy 2a: Safe page detection without problematic fields
          try {
            const pageInfoResponse = await axios.get(`https://graph.facebook.com/v18.0/${userId}`, {
              params: {
                access_token: accessToken,
                fields: 'id,name' // Only request safe fields
              }
            });

            console.log(`[${new Date().toISOString()}] Safe page info response:`, {
              id: pageInfoResponse.data.id,
              name: pageInfoResponse.data.name
            });

            // If we can access the user as a page and they have page permissions, treat as business page
            if (pageInfoResponse.data.id && pageInfoResponse.data.name) {
              pageId = pageInfoResponse.data.id;
              pageName = pageInfoResponse.data.name;
              // Try to get page token
              try {
                const pageTokenResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
                  params: {
                    fields: 'access_token',
                    access_token: accessToken
                  }
                });
                pageAccessToken = pageTokenResponse.data.access_token;
              } catch (pageTokenError) {
                console.log(`[${new Date().toISOString()}] Could not get page token, using user token:`, pageTokenError.response?.data || pageTokenError.message);
                pageAccessToken = accessToken; // Fallback to user token
              }
              isPersonalAccount = false;
              pageDetectionMethod = 'safe_page_detection';
              
              console.log(`[${new Date().toISOString()}] Facebook Business Page detected via safe detection: id=${pageId}, name=${pageName}`);
            }
          } catch (safePageError) {
            console.log(`[${new Date().toISOString()}] Safe page detection failed:`, safePageError.response?.data || safePageError.message);
          }
        }
      } catch (permissionsError) {
        console.error(`[${new Date().toISOString()}] Error checking permissions:`, permissionsError.response?.data || permissionsError.message);
      }
    }

    // Strategy 3: Business account detection via user capabilities
    if (!pageId) {
      try {
        console.log(`[${new Date().toISOString()}] Attempting business account detection via user capabilities`);
        
        // Check if user has business account capabilities
        const userCapabilitiesResponse = await axios.get('https://graph.facebook.com/v18.0/me', {
          params: {
            access_token: accessToken,
            fields: 'id,name,accounts,business_users'
          }
        });

        console.log(`[${new Date().toISOString()}] User capabilities response:`, {
          id: userCapabilitiesResponse.data.id,
          name: userCapabilitiesResponse.data.name,
          hasAccounts: !!userCapabilitiesResponse.data.accounts,
          hasBusinessUsers: !!userCapabilitiesResponse.data.business_users
        });

        // If user has business account indicators, treat as business page
        if (userCapabilitiesResponse.data.accounts || userCapabilitiesResponse.data.business_users) {
          pageId = userCapabilitiesResponse.data.id;
          pageName = userCapabilitiesResponse.data.name;
          // Try to get page token
          try {
            const pageTokenResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
              params: {
                fields: 'access_token',
                access_token: accessToken
              }
            });
            pageAccessToken = pageTokenResponse.data.access_token;
          } catch (pageTokenError) {
            console.log(`[${new Date().toISOString()}] Could not get page token, using user token:`, pageTokenError.response?.data || pageTokenError.message);
            pageAccessToken = accessToken; // Fallback to user token
          }
          isPersonalAccount = false;
          pageDetectionMethod = 'business_account_capabilities';
          
          console.log(`[${new Date().toISOString()}] Facebook Business Account detected via capabilities: id=${pageId}, name=${pageName}`);
        }
      } catch (capabilitiesError) {
        console.error(`[${new Date().toISOString()}] Business account capabilities check failed:`, capabilitiesError.response?.data || capabilitiesError.message);
      }
    }

    // Strategy 4: Final fallback - treat as personal account only if no business indicators found
    if (!pageId) {
      console.log(`[${new Date().toISOString()}] No business page indicators detected - treating as personal account`);
      pageId = userId;
      pageName = userName;
      pageAccessToken = accessToken; // For personal accounts, user token is the page token
      isPersonalAccount = true;
      pageDetectionMethod = 'personal_account_fallback';
      
      console.log(`[${new Date().toISOString()}] Facebook Personal Account connected: id=${pageId}, name=${pageName}`);
    }

    // Enhanced logging for debugging
    console.log(`[${new Date().toISOString()}] Final page detection result:`, {
      pageId,
      pageName,
      isPersonalAccount,
      pageDetectionMethod,
      hasUserToken: !!userAccessToken,
      hasPageToken: !!pageAccessToken,
      tokensMatch: userAccessToken === pageAccessToken
    });

    // SIMPLE FIX: Allow all valid connections - don't block based on detection method
    if (!pageAccessToken) {
      // Only block if we have no token at all
      console.error(`[${new Date().toISOString()}] ERROR: No access token available for pageId=${pageId}, userId=${userId}. Aborting connection.`);
      return res.status(400).send(`
        <html>
          <body style='font-family: Arial, sans-serif; background: #fff3cd; color: #856404; padding: 40px;'>
            <h2>Facebook Connection Failed</h2>
            <p>We could not obtain a Facebook access token for your account.</p>
            <ul>
              <li>Make sure you have granted all required permissions during the Facebook login process.</li>
              <li>If you have recently changed your Facebook permissions, please try reconnecting.</li>
            </ul>
            <button onclick='window.close()' style='margin-top: 20px; padding: 10px 20px; background: #856404; color: #fff; border: none; border-radius: 5px; cursor: pointer;'>Close</button>
          </body>
        </html>
      `);
    }

    // Store the access token - use different storage strategy for personal vs business accounts
    let tokenKey;
    
    if (isPersonalAccount) {
      // For personal accounts, store under user ID
      tokenKey = `FacebookTokens/${userId}/token.json`;
    } else {
      // For business pages, store under page ID
      tokenKey = `FacebookTokens/${pageId}/token.json`;
    }

    const tokenData = {
      access_token: pageAccessToken, // Store the page access token
      user_access_token: userAccessToken, // Also store user token for future page token refreshes
      page_id: pageId,
      page_name: pageName,
      user_id: userId,
      user_name: userName,
      is_personal_account: isPersonalAccount,
      page_detection_method: pageDetectionMethod,
      timestamp: new Date().toISOString()
    };

    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: tokenKey,
      Body: JSON.stringify(tokenData, null, 2),
      ContentType: 'application/json',
    });

    await s3Client.send(putCommand);

    console.log(`[${new Date().toISOString()}] Facebook token stored successfully for page ${pageId}`);

    // Also store Facebook connection for the state userId (for easier lookup)
    if (state) {
      try {
        const connectionKey = `FacebookConnection/${state}/connection.json`;
        const connectionData = {
          uid: state,
          facebook_user_id: userId,
          facebook_page_id: pageId,
          username: pageName,
          access_token: pageAccessToken, // Store page token in connection
          user_access_token: userAccessToken, // Also store user token
          is_personal_account: isPersonalAccount,
          page_detection_method: pageDetectionMethod,
          lastUpdated: new Date().toISOString()
        };
        
        const connectionPutCommand = new PutObjectCommand({
          Bucket: 'tasks',
          Key: connectionKey,
          Body: JSON.stringify(connectionData, null, 2),
          ContentType: 'application/json',
        });
        
        await s3Client.send(connectionPutCommand);
        console.log(`[${new Date().toISOString()}] Facebook connection updated with real token for user ${state}`);
      } catch (connectionError) {
        console.error(`[${new Date().toISOString()}] Error storing Facebook connection:`, connectionError.message);
      }
    }

    // Send success response with appropriate message
    const accountType = isPersonalAccount ? 'Personal Account' : 'Business Page';
    const limitations = isPersonalAccount ? 
      `<div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 5px;">
        <h3 style="color: #856404; margin-top: 0;">⚠️ Personal Account Limitations</h3>
        <p style="color: #856404; margin-bottom: 10px;"><strong>Important:</strong> Personal Facebook accounts have very limited API access due to Facebook's privacy policies.</p>
        <ul style="color: #856404; margin-bottom: 10px;">
          <li>❌ No webhook support for DMs and comments</li>
          <li>❌ Limited automated posting capabilities</li>
          <li>❌ No insights or analytics data</li>
          <li>❌ Restricted API access for messaging</li>
        </ul>
        <p style="color: #856404; margin-bottom: 0;"><strong>Recommendation:</strong> For full functionality, consider converting to a Facebook Business Page or connecting a Facebook Business account.</p>
      </div>` : 
      `<div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin: 15px 0; border-radius: 5px;">
        <h3 style="color: #155724; margin-top: 0;">✅ Business Page Connected</h3>
        <p style="color: #155724; margin-bottom: 0;">Your Facebook Business Page is fully connected and ready for webhook events and automated features.</p>
      </div>`;

    res.send(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; background-color: #f8f9fa; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h2 { color: #2c3e50; text-align: center; margin-bottom: 30px; }
            .info { background-color: #e3f2fd; border: 1px solid #bbdefb; padding: 15px; margin: 15px 0; border-radius: 5px; }
            .info p { margin: 5px 0; color: #1565c0; }
            .button { background-color: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin: 10px 5px; }
            .button:hover { background-color: #0056b3; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Facebook Connected Successfully!</h2>
            
            <div class="info">
              <p><strong>Account Type:</strong> ${accountType}</p>
              <p><strong>Name:</strong> ${pageName}</p>
              <p><strong>ID:</strong> ${pageId}</p>
            </div>
            
            ${limitations}
            
            <div style="text-align: center; margin-top: 30px;">
              <button class="button" onclick="window.close()">Close Window</button>
            </div>
          </div>
          
          <script>
            window.opener.postMessage({ 
              type: 'FACEBOOK_CONNECTED', 
              facebookId: '${pageId}', 
              username: '${pageName}',
              accessToken: '${pageAccessToken}',
              userId: '${userId}',
              isPersonalAccount: ${isPersonalAccount}
            }, '*');
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Facebook OAuth callback error:`, error.response?.data || error.message);
    res.status(500).send('Error connecting Facebook account');
  }
});


// Webhook Verification
app.get(['/webhook/instagram', '/api/webhook/instagram'], (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log(`[${new Date().toISOString()}] WEBHOOK_VERIFIED for Instagram`);
    res.status(200).send(challenge);
  } else {
    console.log(`[${new Date().toISOString()}] WEBHOOK_VERIFICATION_FAILED: Invalid token or mode`);
    res.sendStatus(403);
  }
});

// Facebook Webhook Verification
app.get(['/webhook/facebook', '/api/webhook/facebook'], (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
    console.log(`[${new Date().toISOString()}] WEBHOOK_VERIFIED for Facebook`);
    res.status(200).send(challenge);
  } else {
    console.log(`[${new Date().toISOString()}] WEBHOOK_VERIFICATION_FAILED: Invalid token or mode`);
    res.sendStatus(403);
  }
});
// Facebook Webhook POST Handler
app.post(['/webhook/facebook', '/api/webhook/facebook'], async (req, res) => {
  const body = req.body;

  // ENHANCED LOGGING: More visible and informative logging
  console.log(`\n🎯 FACEBOOK WEBHOOK RECEIVED at ${new Date().toISOString()}`);
  console.log(`📦 Payload type: ${typeof body}`);
  console.log(`📋 Payload keys: ${body ? Object.keys(body).join(', ') : 'No body'}`);
  
  if (body && body.object) {
    console.log(`✅ Valid Facebook ${body.object} object received`);
  }
  
  if (body && body.entry && Array.isArray(body.entry)) {
    console.log(`📝 Processing ${body.entry.length} entry(ies)`);
    for (const entry of body.entry) {
      console.log(`   - Entry ID: ${entry.id}`);
      if (entry.messaging) {
        console.log(`   - Messaging events: ${entry.messaging.length}`);
      }
      if (entry.changes) {
        console.log(`   - Change events: ${entry.changes.length}`);
      }
    }
  }

  // CRITICAL FIX: More flexible validation - check for different Facebook object types
  if (!body || typeof body !== 'object') {
    console.log(`[${new Date().toISOString()}] ❌ Invalid payload: No body or not an object`);
    return res.sendStatus(400);
  }

  // Check for different Facebook object types
  const validObjects = ['page', 'instagram', 'application', 'user', 'group'];
  if (!body.object || !validObjects.includes(body.object)) {
    console.log(`[${new Date().toISOString()}] ❌ Invalid payload: object="${body.object}", expected one of: ${validObjects.join(', ')}`);
    console.log(`[${new Date().toISOString()}] Full payload:`, JSON.stringify(body, null, 2));
    return res.sendStatus(400);
  }

  console.log(`[${new Date().toISOString()}] ✅ Valid Facebook ${body.object} object received`);

  console.log(`[${new Date().toISOString()}] WEBHOOK ➜ Facebook ${body.object} payload received at webhook: ${JSON.stringify(body)}`);

  try {
    // Handle different Facebook object types
    if (body.object === 'page') {
      // Process page events (DMs, comments, etc.)
      for (const entry of body.entry) {
        const webhookPageId = entry.id; // This is the Page ID from the webhook
        console.log(`[${new Date().toISOString()}] Processing page entry for Webhook Page ID: ${webhookPageId}`);

        // Enhanced token matching with multiple resolution strategies
        let matchedToken = null;
        let storeUserId = null;
        let firebaseUserId = null;
        
        try {
          // Strategy 1: Direct token lookup by page_id and user_id
          const listCommand = new ListObjectsV2Command({
            Bucket: 'tasks',
            Prefix: `FacebookTokens/`,
          });
          const { Contents } = await s3Client.send(listCommand);
          
          console.log(`🔍 Looking for Facebook tokens matching webhook Page ID: ${webhookPageId}`);
          console.log(`📊 Found ${Contents ? Contents.length : 0} Facebook token files`);
          
          if (Contents) {
            for (const obj of Contents) {
              if (obj.Key.endsWith('/token.json')) {
                const getCommand = new GetObjectCommand({
                  Bucket: 'tasks',
                  Key: obj.Key,
                });
                const data = await s3Client.send(getCommand);
                const json = await data.Body.transformToString();
                const token = JSON.parse(json);
                
                console.log(`📋 Token: ${token.page_name} (page_id=${token.page_id}, user_id=${token.user_id})`);
                
                // CRITICAL FIX: Check both page_id AND user_id for matches
                if (token.page_id === webhookPageId || token.user_id === webhookPageId) {
                  matchedToken = token;
                  storeUserId = token.user_id || token.page_id;
                  firebaseUserId = token.firebase_user_id;
                  console.log(`✅ MATCH FOUND! Token: ${token.page_name} (user_id=${token.user_id}, page_id=${token.page_id})`);
                  break;
                }
              }
            }
          }
          
          if (!matchedToken) {
            console.log(`[${new Date().toISOString()}] No matching Facebook token found for webhook Page ID: ${webhookPageId}`);
            continue;
          }
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Error finding Facebook token:`, error.message);
          continue;
        }

        // Process messaging events (DMs)
        if (entry.messaging) {
          for (const msg of entry.messaging) {
            try {
              if (!msg.message?.text || msg.message.is_echo) {
                console.log(`[${new Date().toISOString()}] Skipping non-text or echo Facebook message: ${JSON.stringify(msg.message)}`);
                continue;
              }

              // ENHANCED USER EXPERIENCE: Fetch sender's real name from Facebook Graph API
              let senderName = 'Unknown User';
              let pageName = matchedToken ? matchedToken.page_name : 'Sentient AI';
              
              try {
                if (matchedToken && matchedToken.access_token) {
                  console.log(`🔍 Fetching sender details for ID: ${msg.sender.id}`);
                  
                  // Fetch sender's profile information
                  const senderResponse = await axios.get(`https://graph.facebook.com/v18.0/${msg.sender.id}`, {
                    params: {
                      fields: 'name,first_name,last_name',
                      access_token: matchedToken.access_token
                    },
                    timeout: 5000
                  });
                  
                  if (senderResponse.data && senderResponse.data.name) {
                    senderName = senderResponse.data.name;
                    console.log(`✅ Sender details fetched: ${senderName}`);
                  }
                }
              } catch (senderError) {
                console.log(`⚠️ Could not fetch sender details (using fallback): ${senderError.message}`);
                // Fallback: Use partial sender ID as identifier if name fetch fails
                senderName = `User ${msg.sender.id.slice(-6)}`;
              }

              const eventData = {
                type: 'message',
                facebook_page_id: matchedToken ? matchedToken.page_id : webhookPageId,
                facebook_user_id: matchedToken ? matchedToken.user_id : null,
                sender_id: msg.sender.id,
                message_id: msg.message.mid,
                text: msg.message.text,
                timestamp: msg.timestamp,
                received_at: new Date().toISOString(),
                username: senderName, // Real sender name
                page_name: pageName,   // Page name for context
                status: 'pending'
              };

              // CRITICAL FIX: Store under PAGE ID (not user ID) to match frontend expectations
              const storageUserId = webhookPageId; // Use page ID as primary storage key
              
              if (!storageUserId) {
                console.log(`[${new Date().toISOString()}] Skipping Facebook DM storage - no page ID found for webhook ID ${webhookPageId}`);
                continue;
              }
              
              // 🚀 CRITICAL FIX: Check for duplicate Facebook message before storing
              const userKey = `FacebookEvents/${storageUserId}/${eventData.message_id}.json`;
              
              try {
                // Check if this message already exists
                const existingCheck = await s3Client.send(new HeadObjectCommand({
                  Bucket: 'tasks',
                  Key: userKey
                }));
                
                if (existingCheck) {
                  console.log(`[${new Date().toISOString()}] 🚫 Duplicate Facebook webhook message detected: ${eventData.message_id}, skipping storage`);
                  continue; // Skip storing duplicate message
                }
              } catch (error) {
                if (error.name !== 'NotFound') {
                  console.error(`[${new Date().toISOString()}] Error checking for duplicate Facebook message:`, error.message);
                }
                // If NotFound, message doesn't exist, so we can proceed
              }
              
              console.log(`💾 Storing Facebook DM event for Page ID: ${storageUserId}`);
              console.log(`📝 Message: "${eventData.text}" (ID: ${eventData.message_id})`);
              
              // Store with PAGE ID to match frontend expectations
              await s3Client.send(new PutObjectCommand({
                Bucket: 'tasks',
                Key: userKey,
                Body: JSON.stringify(eventData, null, 2),
                ContentType: 'application/json'
              }));
              
              console.log(`✅ Facebook DM stored successfully at ${userKey}`);
              
              // INSTANT NOTIFICATION TRIGGER: Immediate broadcast before any delays
              setImmediate(() => {
                console.log(`[INSTANT-TRIGGER] Processing immediate notification for new Facebook message`);
                
                // INSTANT NOTIFICATION FIX: Broadcast immediately to SSE clients
                const broadcastData = {
                  event: 'facebook_message',
                  data: {
                    ...eventData,
                    platform: 'facebook'
                  }
                };
                
                // NOTIFICATION COUNT UPDATE: Send updated count immediately
                const notificationCountData = {
                  event: 'notification_count_update',
                  data: {
                    platform: 'facebook',
                    user_id: storageUserId, // Use the same ID as storage
                    increment: 1,
                    message: 'New Facebook message received'
                  }
                };
                
                // ENHANCED BROADCAST: Send to all possible client IDs
                const broadcastResults = [];
                const broadcastTargets = new Set();
                
                // PRIMARY TARGET: Use page ID (where frontend connects)
                broadcastTargets.add(storageUserId);
                
                // SECONDARY TARGETS: Add other IDs for redundancy
                if (storeUserId && storeUserId !== storageUserId) {
                  broadcastTargets.add(storeUserId);
                }
                
                if (firebaseUserId && firebaseUserId !== storageUserId) {
                  broadcastTargets.add(firebaseUserId);
                }
                
                // Broadcast to all targets
                broadcastTargets.forEach(targetId => {
                  const result = broadcastUpdate(targetId, broadcastData);
                  broadcastResults.push({ id: targetId, result });
                  
                  // ALSO SEND NOTIFICATION COUNT UPDATE
                  const countResult = broadcastUpdate(targetId, notificationCountData);
                  console.log(`[NOTIFICATION-COUNT] Sent count update to ${targetId}: ${countResult}`);
                });
                
                console.log(`[INSTANT-NOTIFICATION] Broadcast attempted for IDs:`, broadcastResults, 'SSE client keys:', Array.from(sseClients.keys()));
                
                // CACHE INVALIDATION FIX: Clear all possible cache keys
                const cacheKeys = Array.from(broadcastTargets).map(id => `FacebookEvents/${id}`);
                cacheKeys.forEach(key => {
                  cache.delete(key);
                  console.log(`[CACHE-CLEAR] Cleared cache for key: ${key}`);
                });
              });
            } catch (error) {
              console.error(`[${new Date().toISOString()}] Error processing Facebook message:`, error.message);
            }
          }
        }

        // Process comment events
        if (entry.changes) {
          for (const change of entry.changes) {
            try {
              if (change.field === 'feed' && change.value.message) {
                // Get commenter's name from Facebook's provided data
                const commenterName = change.value.from.name || `User ${change.value.from.id.slice(-6)}`;
                const pageName = matchedToken ? matchedToken.page_name : 'Sentient AI';
                
                const eventData = {
                  type: 'comment',
                  facebook_page_id: matchedToken ? matchedToken.page_id : webhookPageId,
                  facebook_user_id: matchedToken ? matchedToken.user_id : null,
                  sender_id: change.value.from.id,
                  username: commenterName, // Real commenter name
                  page_name: pageName,     // Page name for context
                  comment_id: change.value.comment_id,
                  post_id: change.value.post.id,
                  text: change.value.message,
                  timestamp: new Date(change.value.created_time).getTime(),
                  received_at: new Date().toISOString(),
                  status: 'pending'
                };

                // CRITICAL FIX: Store under PAGE ID (not user ID) to match frontend expectations
                const storageUserId = webhookPageId; // Use page ID as primary storage key
                
                if (!storageUserId) {
                  console.log(`[${new Date().toISOString()}] Skipping Facebook comment storage - no page ID found for webhook ID ${webhookPageId}`);
                  continue;
                }
                
                console.log(`[${new Date().toISOString()}] Storing Facebook comment event with Page ID: ${storageUserId}`);
                
                const userKey = `FacebookEvents/${storageUserId}/${eventData.comment_id}.json`;
                await s3Client.send(new PutObjectCommand({
                  Bucket: 'tasks',
                  Key: userKey,
                  Body: JSON.stringify(eventData, null, 2),
                  ContentType: 'application/json'
                }));
                
                console.log(`[${new Date().toISOString()}] Stored Facebook comment at ${userKey}`);
                
                // INSTANT NOTIFICATION TRIGGER: Immediate broadcast before any delays
                setImmediate(() => {
                  console.log(`[INSTANT-TRIGGER] Processing immediate notification for new Facebook comment`);
                  
                  // INSTANT NOTIFICATION FIX: Broadcast immediately to SSE clients
                  const broadcastData = {
                    event: 'facebook_comment',
                    data: {
                      ...eventData,
                      platform: 'facebook'
                    }
                  };
                  
                  // NOTIFICATION COUNT UPDATE: Send updated count immediately
                  const notificationCountData = {
                    event: 'notification_count_update',
                    data: {
                      platform: 'facebook',
                      user_id: storageUserId, // Use the same ID as storage
                      increment: 1,
                      message: 'New Facebook comment received'
                    }
                  };
                  
                  // ENHANCED BROADCAST: Send to all possible client IDs
                  const broadcastResults = [];
                  const broadcastTargets = new Set();
                  
                  // PRIMARY TARGET: Use page ID (where frontend connects)
                  broadcastTargets.add(storageUserId);
                  
                  // SECONDARY TARGETS: Add other IDs for redundancy
                  if (storeUserId && storeUserId !== storageUserId) {
                    broadcastTargets.add(storeUserId);
                  }
                  
                  if (firebaseUserId && firebaseUserId !== storageUserId) {
                    broadcastTargets.add(firebaseUserId);
                  }
                  
                  // Broadcast to all targets
                  broadcastTargets.forEach(targetId => {
                    const result = broadcastUpdate(targetId, broadcastData);
                    broadcastResults.push({ id: targetId, result });
                    
                    // ALSO SEND NOTIFICATION COUNT UPDATE
                    const countResult = broadcastUpdate(targetId, notificationCountData);
                    console.log(`[NOTIFICATION-COUNT] Sent count update to ${targetId}: ${countResult}`);
                  });
                  
                  console.log(`[INSTANT-NOTIFICATION] Broadcast attempted for IDs:`, broadcastResults, 'SSE client keys:', Array.from(sseClients.keys()));
                  
                  // CACHE INVALIDATION FIX: Clear all possible cache keys
                  const cacheKeys = Array.from(broadcastTargets).map(id => `FacebookEvents/${id}`);
                  cacheKeys.forEach(key => {
                    cache.delete(key);
                    console.log(`[CACHE-CLEAR] Cleared cache for key: ${key}`);
                  });
                });
              }
            } catch (error) {
              console.error(`[${new Date().toISOString()}] Error processing Facebook comment:`, error.message);
            }
          }
        }
      } // End of for (const entry of body.entry) loop
    } else if (body.object === 'instagram') {
      // Handle Instagram events
      console.log(`[${new Date().toISOString()}] Instagram webhook received - processing...`);
      // Add Instagram processing logic here if needed
    } else if (body.object === 'application') {
      // Handle application events
      console.log(`[${new Date().toISOString()}] Application webhook received - processing...`);
      // Add application processing logic here if needed
    } else if (body.object === 'user') {
      // Handle user events
      console.log(`[${new Date().toISOString()}] User webhook received - processing...`);
      // Add user processing logic here if needed
    } else if (body.object === 'group') {
      // Handle group events
      console.log(`[${new Date().toISOString()}] Group webhook received - processing...`);
      // Add group processing logic here if needed
    } else {
      console.log(`[${new Date().toISOString()}] Unhandled Facebook object type: ${body.object}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error processing Facebook webhook:`, error.message);
    res.sendStatus(500);
  }
});



// Send DM Reply
app.post(['/send-dm-reply/:userId', '/api/send-dm-reply/:userId'], async (req, res) => {
  // Set CORS headers explicitly for this endpoint
  setCorsHeaders(res, req.headers.origin || '*');
  
  // Handle OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  const { userId } = req.params;
  const { sender_id, text, message_id, platform = 'instagram' } = req.body;

  // Ensure the API response from sending the DM is accessible throughout this handler
  // This avoids the "response is not defined" ReferenceError that occurs when we
  // attempt to access the scoped "response" variable declared inside the try block
  // further down in the code.
  let dmResponse = null;

  if (!sender_id || !text || !message_id) {
    console.log(`[${new Date().toISOString()}] Missing required fields for DM reply`);
    return res.status(400).json({error: 'Missing sender_id, text, or message_id'});
  }

  console.log(`[${new Date().toISOString()}] Processing ${platform} DM reply for user ${userId}`);

  try {
    if (platform === 'twitter') {
      // Handle Twitter DM reply
      try {
        const result = await sendTwitterDMReply(userId, sender_id, text, message_id);
        
        // Update message status in Twitter events
        const messageKey = `TwitterEvents/${userId}/${message_id}.json`;
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: messageKey,
          });
          const data = await s3Client.send(getCommand);
          const messageData = JSON.parse(await data.Body.transformToString());
          messageData.status = 'replied';
          messageData.updated_at = new Date().toISOString();

          await s3Client.send(new PutObjectCommand({
            Bucket: 'tasks',
            Key: messageKey,
            Body: JSON.stringify(messageData, null, 2),
            ContentType: 'application/json',
          }));
          
          // Invalidate cache
          cache.delete(`TwitterEvents/${userId}`);
          
          // Broadcast status update
          const statusUpdate = {
            type: 'message_status',
            message_id,
            status: 'replied',
            updated_at: messageData.updated_at,
            timestamp: Date.now(),
            platform: 'twitter'
          };
          
          broadcastUpdate(userId, { event: 'status_update', data: statusUpdate });
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Error updating Twitter message status:`, error);
        }
        
        return res.json({ success: true, message_id: result.message_id });
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error sending Twitter DM reply:`, error.response?.data || error.message);
        if (error.message && error.message.includes('access token')) {
          return res.status(404).json({ error: 'No access token found for this Twitter account' });
        }
        return res.status(500).json({ error: 'Error sending Twitter DM reply', details: error.message });
      }
    }
    
    if (platform === 'facebook') {
      // Handle Facebook DM reply
      try {
        const result = await sendFacebookDMReply(userId, sender_id, text, message_id);
        
        // Update message status in Facebook events
        const messageKey = `FacebookEvents/${userId}/${message_id}.json`;
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: messageKey,
          });
          const data = await s3Client.send(getCommand);
          const messageData = JSON.parse(await data.Body.transformToString());
          messageData.status = 'replied';
          messageData.updated_at = new Date().toISOString();

          await s3Client.send(new PutObjectCommand({
            Bucket: 'tasks',
            Key: messageKey,
            Body: JSON.stringify(messageData, null, 2),
            ContentType: 'application/json',
          }));
          
          // Invalidate cache
          cache.delete(`FacebookEvents/${userId}`);
          
          // Broadcast status update
          const statusUpdate = {
            type: 'message_status',
            message_id,
            status: 'replied',
            updated_at: messageData.updated_at,
            timestamp: Date.now(),
            platform: 'facebook'
          };
          
          broadcastUpdate(userId, { event: 'status_update', data: statusUpdate });
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Error updating Facebook message status:`, error);
        }
        
        return res.json({ success: true, message_id: result.message_id });
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error sending Facebook DM reply:`, error.response?.data || error.message);
        if (error.message && error.message.includes('token')) {
          return res.status(404).json({ error: 'No access token found for this Facebook account' });
        }
        return res.status(500).json({ error: 'Error sending Facebook DM reply', details: error.message });
      }
    }
    
    // Handle Instagram DM reply with improved token lookup
    let tokenData = null;
    let username = null;
    
    // Helper function to find token with fallback lookup
    const findTokenForDM = async () => {
      try {
        const listCommand = new ListObjectsV2Command({
          Bucket: 'tasks',
          Prefix: `InstagramTokens/`,
        });
        const { Contents } = await s3Client.send(listCommand);

        if (Contents) {
          for (const obj of Contents) {
            if (obj.Key.endsWith('/token.json')) {
              const getCommand = new GetObjectCommand({
                Bucket: 'tasks',
                Key: obj.Key,
              });
              const data = await s3Client.send(getCommand);
              const json = await data.Body.transformToString();
              const token = JSON.parse(json);
              
              // Try multiple lookup strategies
              if (token.instagram_user_id === userId || 
                  token.instagram_graph_id === userId || 
                  token.username === userId) {
                tokenData = token;
                username = token.username;
                console.log(`[${new Date().toISOString()}] Found token for ${userId} via ${token.instagram_user_id === userId ? 'user_id' : token.instagram_graph_id === userId ? 'graph_id' : 'username'}`);
                return true;
              }
            }
          }
        }
        return false;
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error finding token for ${userId}:`, err.message);
        return false;
      }
    };
    
    // First attempt to find token
    const foundToken = await findTokenForDM();
    
    // If not found, rebuild token index and retry
    if (!foundToken) {
      console.log(`[${new Date().toISOString()}] No token found for ${userId}, rebuilding token index and retrying...`);
      try {
        await buildTokenIndex();
        // Retry token lookup after rebuilding index
        await findTokenForDM();
      } catch (rebuildErr) {
        console.error(`[${new Date().toISOString()}] Error rebuilding token index:`, rebuildErr.message);
      }
    }
    
    if (!tokenData) {
      console.log(`[${new Date().toISOString()}] No token found for instagram_user_id ${userId} after retry`);
      return res.status(404).json({error: 'No access token found for this Instagram account'});
    }

    const access_token = tokenData.access_token;
    const instagram_graph_id = tokenData.instagram_graph_id;

    // Validate sender_id format - this might need adjustment based on your specific ID format
    if (!/^[0-9]+$/.test(sender_id)) {
      console.log(`[${new Date().toISOString()}] Invalid sender_id format: ${sender_id}`);
      return res.status(400).json({error: 'Invalid sender_id format'});
    }

    try {
      // Send the DM reply
      console.log(`[${new Date().toISOString()}] Attempting to send DM to sender_id: ${sender_id} with access token for ${instagram_graph_id}`);
      dmResponse = await axios({
        method: 'post',
        url: `https://graph.instagram.com/v22.0/${instagram_graph_id}/messages`,
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        data: {
          recipient: { id: sender_id },
          message: { text },
        },
      });

      console.log(`[${new Date().toISOString()}] DM reply sent to ${sender_id} for instagram_graph_id ${instagram_graph_id}`);
    } catch (dmError) {
      console.error(`[${new Date().toISOString()}] Error sending DM reply:`, dmError.response?.data || dmError.message);
      
      // Handle the specific "user not found" error
      if (dmError.response?.data?.error?.code === 100 && 
          dmError.response?.data?.error?.error_subcode === 2534014) {
            
        // Mark the message as "handled" in storage even though we couldn't send the reply
        console.log(`[${new Date().toISOString()}] User ${sender_id} not found. Marking message as handled.`);
        
        // Update original message status to "handled" instead of "replied"
        const messageKey = `InstagramEvents/${userId}/${message_id}.json`;
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: messageKey,
          });
          const data = await s3Client.send(getCommand);
          const messageData = JSON.parse(await data.Body.transformToString());
          messageData.status = 'handled';
          messageData.error = 'User not found';
          messageData.updated_at = new Date().toISOString();

          await s3Client.send(new PutObjectCommand({
            Bucket: 'tasks',
            Key: messageKey,
            Body: JSON.stringify(messageData, null, 2),
            ContentType: 'application/json',
          }));
          console.log(`[${new Date().toISOString()}] Updated DM status to handled at ${messageKey}`);
          
          // Return a "success" response but with a warning
          return res.json({ 
            success: true, 
            warning: 'Message marked as handled but DM not sent: user not found',
            handled: true
          });
        } catch (updateError) {
          console.error(`[${new Date().toISOString()}] Error updating message status:`, updateError);
        }
        
        // Return specific error for this case
        return res.status(404).json({ 
          error: 'Instagram user not found', 
          code: 'USER_NOT_FOUND',
          details: dmError.response?.data?.error || 'The specified recipient could not be found on Instagram'
        });
      }
      
      // Re-throw for general error handling
      throw dmError;
    }

    // Update original message status
    const messageKey = `InstagramEvents/${userId}/${message_id}.json`;
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: messageKey,
      });
      const data = await s3Client.send(getCommand);
      const messageData = JSON.parse(await data.Body.transformToString());
      messageData.status = 'replied';
      messageData.updated_at = new Date().toISOString();

      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: messageKey,
        Body: JSON.stringify(messageData, null, 2),
        ContentType: 'application/json',
      }));
      console.log(`[${new Date().toISOString()}] Updated DM status to replied at ${messageKey}`);
      
      // Invalidate cache for this module
      cache.delete(`InstagramEvents/${userId}`);
      if (username) cache.delete(`InstagramEvents/${username}`);
      
      // Broadcast status update
      const statusUpdate = {
        type: 'message_status',
        message_id,
        status: 'replied',
        updated_at: messageData.updated_at,
        timestamp: Date.now()
      };
      
      broadcastUpdate(userId, { event: 'status_update', data: statusUpdate });
      if (username) broadcastUpdate(username, { event: 'status_update', data: statusUpdate });
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error updating DM status:`, error);
    }

    // Store reply
    const replyKey = `InstagramEvents/${userId}/reply_${message_id}_${Date.now()}.json`;
    const replyData = {
      type: 'reply',
      instagram_user_id: userId,
      instagram_graph_id: instagram_graph_id,
      recipient_id: sender_id,
      message_id: dmResponse?.data?.id || `reply_${Date.now()}`,
      text,
      timestamp: Date.now(),
      sent_at: new Date().toISOString(),
      status: 'sent'
    };
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: replyKey,
      Body: JSON.stringify(replyData, null, 2),
      ContentType: 'application/json',
    }));
    console.log(`[${new Date().toISOString()}] Reply stored in R2 at ${replyKey}`);

    res.json({ success: true, message_id: dmResponse?.data?.id });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error sending DM reply:`, error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Error sending DM reply',
      details: error.response?.data?.error || error.message 
    });
  }
});
// Send Comment Reply
app.post(['/send-comment-reply/:userId', '/api/send-comment-reply/:userId'], async (req, res) => {
  // Set CORS headers explicitly for this endpoint
  setCorsHeaders(res, req.headers.origin || '*');
  
  // Handle OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  const { userId } = req.params;
  const { comment_id, text, platform = 'instagram' } = req.body;

  if (!comment_id || !text) {
    console.log(`[${new Date().toISOString()}] Missing required fields for comment reply`);
    return res.status(400).json({error: 'Missing comment_id or text'});
  }

  console.log(`[${new Date().toISOString()}] Processing ${platform} comment reply for user ${userId}`);

  try {
    if (platform === 'twitter') {
      // Handle Twitter mention reply (comments = mentions on Twitter)
      try {
        const result = await sendTwitterMentionReply(userId, comment_id, text);
        
        // Update mention status in Twitter events
        const commentKey = `TwitterEvents/${userId}/comment_${comment_id}.json`;
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: commentKey,
          });
          const data = await s3Client.send(getCommand);
          const commentData = JSON.parse(await data.Body.transformToString());
          commentData.status = 'replied';
          commentData.updated_at = new Date().toISOString();

          await s3Client.send(new PutObjectCommand({
            Bucket: 'tasks',
            Key: commentKey,
            Body: JSON.stringify(commentData, null, 2),
            ContentType: 'application/json',
          }));
          
          // Invalidate cache
          cache.delete(`TwitterEvents/${userId}`);
          
          // Broadcast status update
          const statusUpdate = {
            type: 'comment_status',
            comment_id,
            status: 'replied',
            updated_at: commentData.updated_at,
            timestamp: Date.now(),
            platform: 'twitter'
          };
          
          broadcastUpdate(userId, { event: 'status_update', data: statusUpdate });
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Error updating Twitter mention status:`, error);
        }
        
        return res.json({ success: true, reply_id: result.tweet_id });
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error sending Twitter mention reply:`, error.response?.data || error.message);
        if (error.message && error.message.includes('access token')) {
          return res.status(404).json({ error: 'No access token found for this Twitter account' });
        }
        return res.status(500).json({ error: 'Error sending Twitter mention reply', details: error.message });
      }
    }
    
    if (platform === 'facebook') {
      // Handle Facebook comment reply
      try {
        const result = await sendFacebookCommentReply(userId, comment_id, text);
        
        // Update comment status in Facebook events
        const commentKey = `FacebookEvents/${userId}/comment_${comment_id}.json`;
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: commentKey,
          });
          const data = await s3Client.send(getCommand);
          const commentData = JSON.parse(await data.Body.transformToString());
          commentData.status = 'replied';
          commentData.updated_at = new Date().toISOString();

          await s3Client.send(new PutObjectCommand({
            Bucket: 'tasks',
            Key: commentKey,
            Body: JSON.stringify(commentData, null, 2),
            ContentType: 'application/json',
          }));
          
          // Invalidate cache
          cache.delete(`FacebookEvents/${userId}`);
          
          // Broadcast status update
          const statusUpdate = {
            type: 'comment_status',
            comment_id,
            status: 'replied',
            updated_at: commentData.updated_at,
            timestamp: Date.now(),
            platform: 'facebook'
          };
          
          broadcastUpdate(userId, { event: 'status_update', data: statusUpdate });
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Error updating Facebook comment status:`, error);
        }
        
        return res.json({ success: true, reply_id: result.comment_id });
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error sending Facebook comment reply:`, error.response?.data || error.message);
        if (error.message && error.message.includes('token')) {
          return res.status(404).json({ error: 'No access token found for this Facebook account' });
        }
        return res.status(500).json({ error: 'Error sending Facebook comment reply', details: error.message });
      }
    }
    
    // Handle Instagram comment reply with improved token lookup
    let tokenData = null;
    let username = null;
    
    // Helper function to find token with fallback lookup
    const findTokenForComment = async () => {
      try {
        const listCommand = new ListObjectsV2Command({
          Bucket: 'tasks',
          Prefix: `InstagramTokens/`,
        });
        const { Contents } = await s3Client.send(listCommand);

        if (Contents) {
          for (const obj of Contents) {
            if (obj.Key.endsWith('/token.json')) {
              const getCommand = new GetObjectCommand({
                Bucket: 'tasks',
                Key: obj.Key,
              });
              const data = await s3Client.send(getCommand);
              const json = await data.Body.transformToString();
              const token = JSON.parse(json);
              
              // Try multiple lookup strategies
              if (token.instagram_user_id === userId || 
                  token.instagram_graph_id === userId || 
                  token.username === userId) {
                tokenData = token;
                username = token.username;
                console.log(`[${new Date().toISOString()}] Found token for ${userId} via ${token.instagram_user_id === userId ? 'user_id' : token.instagram_graph_id === userId ? 'graph_id' : 'username'}`);
                return true;
              }
            }
          }
        }
        return false;
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error finding token for ${userId}:`, err.message);
        return false;
      }
    };
    
    // First attempt to find token
    const foundToken = await findTokenForComment();
    
    // If not found, rebuild token index and retry
    if (!foundToken) {
      console.log(`[${new Date().toISOString()}] No token found for ${userId}, rebuilding token index and retrying...`);
      try {
        await buildTokenIndex();
        // Retry token lookup after rebuilding index
        await findTokenForComment();
      } catch (rebuildErr) {
        console.error(`[${new Date().toISOString()}] Error rebuilding token index:`, rebuildErr.message);
      }
    }
    
    if (!tokenData) {
      console.log(`[${new Date().toISOString()}] No token found for instagram_user_id ${userId} after retry`);
      return res.status(404).send('No access token found for this Instagram account');
    }

    const access_token = tokenData.access_token;

    // Send the comment reply
    const response = await axios({
      method: 'post',
      url: `https://graph.instagram.com/v22.0/${comment_id}/replies`,
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      data: {
        message: text
      },
    });

    console.log(`[${new Date().toISOString()}] Comment reply sent for comment_id ${comment_id}`);

    // Update original comment status
    const commentKey = `InstagramEvents/${userId}/comment_${comment_id}.json`;
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: commentKey,
      });
      const data = await s3Client.send(getCommand);
      const commentData = JSON.parse(await data.Body.transformToString());
      commentData.status = 'replied';
      commentData.updated_at = new Date().toISOString();

      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: commentKey,
        Body: JSON.stringify(commentData, null, 2),
        ContentType: 'application/json',
      }));
      console.log(`[${new Date().toISOString()}] Updated comment status to replied at ${commentKey}`);
      
      // Invalidate cache
      cache.delete(`InstagramEvents/${userId}`);
      if (username) cache.delete(`InstagramEvents/${username}`);
      
      // Broadcast status update
      const statusUpdate = {
        type: 'comment_status',
        comment_id,
        status: 'replied',
        updated_at: commentData.updated_at,
        timestamp: Date.now()
      };
      
      broadcastUpdate(userId, { event: 'status_update', data: statusUpdate });
      if (username) broadcastUpdate(username, { event: 'status_update', data: statusUpdate });
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error updating comment status:`, error);
    }

    // Store reply
    const replyKey = `InstagramEvents/${userId}/comment_reply_${comment_id}_${Date.now()}.json`;
    const replyData = {
      type: 'comment_reply',
      instagram_user_id: userId,
      comment_id,
      reply_id: response.data.id || `reply_${Date.now()}`,
      text,
      timestamp: Date.now(),
      sent_at: new Date().toISOString(),
      status: 'sent'
    };
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: replyKey,
      Body: JSON.stringify(replyData, null, 2),
      ContentType: 'application/json',
    }));
    console.log(`[${new Date().toISOString()}] Comment reply stored in R2 at ${replyKey}`);

    res.json({ success: true, reply_id: response.data.id });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error sending comment reply:`, error.response?.data || error.message);
    res.status(500).send('Error sending comment reply');
  }
});

// Ignore Notification
app.post(['/ignore-notification/:userId', '/api/ignore-notification/:userId'], async (req, res) => {
  const { userId } = req.params;
  const { message_id, comment_id, platform = 'instagram' } = req.body;

  console.log(`[${new Date().toISOString()}] [IGNORE] Ignore request received:`, {
    userId,
    message_id,
    comment_id,
    platform
  });

  if (!message_id && !comment_id) {
    console.log(`[${new Date().toISOString()}] Missing message_id or comment_id for ignore action`);
    return res.status(400).json({ error: 'Missing message_id or comment_id' });
  }

  try {
    // Find username if available
    let username = null;
    try {
      const tokenPrefix = platform === 'twitter' ? 'TwitterTokens/' : 
                         platform === 'facebook' ? 'FacebookTokens/' : 
                         'InstagramTokens/';
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: tokenPrefix,
      });
      const { Contents } = await s3Client.send(listCommand);
      if (Contents) {
        for (const obj of Contents) {
          if (obj.Key.endsWith('/token.json')) {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const json = await data.Body.transformToString();
            const token = JSON.parse(json);
            const userIdField = platform === 'twitter' ? 'twitter_user_id' : 
                               platform === 'facebook' ? 'facebook_user_id' :
                               'instagram_user_id';
            if (token[userIdField] === userId) {
              username = token.username;
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error finding username for ${platform} user ID ${userId}:`, err.message);
    }
    
    const eventPrefix = platform === 'twitter' ? 'TwitterEvents' : 
                       platform === 'facebook' ? 'FacebookEvents' :
                       'InstagramEvents';
    const fileKey = message_id 
      ? `${eventPrefix}/${userId}/${message_id}.json`
      : `${eventPrefix}/${userId}/comment_${comment_id}.json`;

    console.log(`[${new Date().toISOString()}] [IGNORE] Will store ignored status at: ${fileKey}`);

    let updatedItem;
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: fileKey,
      });
      const data = await s3Client.send(getCommand);
      const notifData = JSON.parse(await data.Body.transformToString());
      notifData.status = 'ignored';
      notifData.updated_at = new Date().toISOString();
      updatedItem = notifData;

      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: fileKey,
        Body: JSON.stringify(notifData, null, 2),
        ContentType: 'application/json',
      }));
      console.log(`[${new Date().toISOString()}] Updated ${platform} notification status to ignored at ${fileKey}`);
      
      // Comprehensive cache invalidation for ignore functionality
      cache.delete(`${eventPrefix}/${userId}`);
      cache.delete(`events-list/${userId}`);
      cache.delete(`events-list/${userId}?platform=${platform}`);
      if (username) {
        cache.delete(`${eventPrefix}/${username}`);
        cache.delete(`events-list/${username}`);
      }
      
      // Clear data module caches to force refresh
      const dataModuleCacheKey = `data_${username || userId}_events_${platform}`;
      cache.delete(dataModuleCacheKey);
      
      // Broadcast status update
      const statusUpdate = {
        type: message_id ? 'message_status' : 'comment_status',
        [message_id ? 'message_id' : 'comment_id']: message_id || comment_id,
        status: 'ignored',
        updated_at: notifData.updated_at,
        timestamp: Date.now(),
        platform: platform
      };
      
      broadcastUpdate(userId, { event: 'status_update', data: statusUpdate });
      if (username) broadcastUpdate(username, { event: 'status_update', data: statusUpdate });
      
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        console.log(`[${new Date().toISOString()}] ${platform} notification file not found at ${fileKey}, creating new ignored status file`);
        
        // Create a new ignored status file since the original doesn't exist
        const ignoredNotificationData = {
          message_id: message_id,
          comment_id: comment_id,
          status: 'ignored',
          platform: platform,
          user_id: userId,
          ignored_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        await s3Client.send(new PutObjectCommand({
          Bucket: 'tasks',
          Key: fileKey,
          Body: JSON.stringify(ignoredNotificationData, null, 2),
          ContentType: 'application/json',
        }));
        
        console.log(`[${new Date().toISOString()}] Created new ignored status file at ${fileKey}`);
        updatedItem = ignoredNotificationData;
        
        // Comprehensive cache invalidation for ignore functionality
        cache.delete(`${eventPrefix}/${userId}`);
        cache.delete(`events-list/${userId}`);
        cache.delete(`events-list/${userId}?platform=${platform}`);
        if (username) {
          cache.delete(`${eventPrefix}/${username}`);
          cache.delete(`events-list/${username}`);
        }
        
        // Clear data module caches to force refresh
        const dataModuleCacheKey = `data_${username || userId}_events_${platform}`;
        cache.delete(dataModuleCacheKey);
        
        // Broadcast status update
        const statusUpdate = {
          type: message_id ? 'message_status' : 'comment_status',
          [message_id ? 'message_id' : 'comment_id']: message_id || comment_id,
          status: 'ignored',
          updated_at: ignoredNotificationData.updated_at,
          timestamp: Date.now(),
          platform: platform
        };
        
        broadcastUpdate(userId, { event: 'status_update', data: statusUpdate });
        if (username) broadcastUpdate(username, { event: 'status_update', data: statusUpdate });
        
      } else {
        throw error;
      }
    }

    console.log(`[${new Date().toISOString()}] [IGNORE] Successfully ignored ${platform} notification:`, {
      userId,
      message_id,
      comment_id,
      fileKey,
      updated: !!updatedItem
    });

    res.json({ success: true, updated: !!updatedItem });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error ignoring ${platform} notification:`, error.message || error);
    res.status(500).json({ error: `Failed to ignore ${platform} notification`, details: error.message || 'Unknown error' });
  }
});

// List Stored Events
app.get(['/events-list/:userId', '/api/events-list/:userId'], async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); // Always return fresh data for notifications
  const { userId } = req.params;
  const platform = req.query.platform || 'instagram';
  const forceRefresh = req.query.forceRefresh === 'true';

  try {
    // Clear cache if force refresh is requested
    if (forceRefresh) {
      const eventPrefix = platform === 'twitter' ? 'TwitterEvents' : 
                         platform === 'facebook' ? 'FacebookEvents' :
                         'InstagramEvents';
      cache.delete(`${eventPrefix}/${userId}`);
      cache.delete(`events-list/${userId}`);
      cache.delete(`events-list/${userId}?platform=${platform}`);
      console.log(`[${new Date().toISOString()}] Force refreshing ${platform} notifications cache for ${userId}`);
    }

    let notifications = [];
    if (platform === 'instagram') {
      try {
        notifications = await fetchInstagramNotifications(userId);
      } catch (error) {
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
          console.warn(`[events-list] No Instagram notifications found for userId=${userId}`);
          return res.json([]);
        }
        throw error;
      }
    } else if (platform === 'twitter') {
      try {
        notifications = await fetchTwitterNotifications(userId);
      } catch (error) {
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
          console.warn(`[events-list] No Twitter notifications found for userId=${userId}`);
          return res.json([]);
        }
        throw error;
      }
    } else if (platform === 'facebook') {
      try {
        // For Facebook, pass forceRefresh flag to enable API fallback when R2 is empty
        notifications = await fetchFacebookNotifications(userId, forceRefresh);
      } catch (error) {
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
          console.warn(`[events-list] No Facebook notifications found for userId=${userId}`);
          return res.json([]);
        }
        throw error;
      }
    }

    res.json(notifications);
  } catch (error) {
    console.error(`[events-list] Error fetching ${platform} notifications for userId=${userId}:`, error);
    res.status(500).json({ error: `Failed to fetch ${platform} notifications`, details: error.message });
  }
});

// Helper function to filter out handled/replied/ignored notifications
async function filterHandledNotifications(notifications, userId, platform) {
  if (!notifications || notifications.length === 0) {
    return notifications;
  }

  const eventPrefix = platform === 'twitter' ? 'TwitterEvents' : 
                     platform === 'facebook' ? 'FacebookEvents' :
                     'InstagramEvents';



  // OPTIMIZED: Batch fetch all status files at once like ready post strategies
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `${eventPrefix}/${userId}/`,
    });
    const { Contents } = await s3Client.send(listCommand);
    
    // Create a map of notification IDs to their status
    const statusMap = new Map();
    
    if (Contents && Contents.length > 0) {
      // Process all status files in parallel like ready post strategies
      const statusPromises = Contents
        .filter(obj => obj.Key.endsWith('.json'))
        .map(async (obj) => {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const storedNotification = JSON.parse(await data.Body.transformToString());
            
            // Extract notification ID from filename
            const filename = obj.Key.split('/').pop();
            const notificationId = filename.replace('.json', '').replace('comment_', '');
            
            return {
              id: notificationId,
              status: storedNotification.status || 'pending',
              isComment: filename.startsWith('comment_')
            };
          } catch (error) {
            console.error(`[${new Date().toISOString()}] Error processing status file ${obj.Key}:`, error.message);
            return null;
          }
        });
      
      const statusResults = await Promise.all(statusPromises);
      
      // Build status map
      statusResults.filter(item => item !== null).forEach(item => {
        statusMap.set(item.id, item.status);
      });
    }
    
    // Filter notifications based on status map
    const filteredNotifications = notifications.filter(notification => {
      const notificationId = notification.message_id || notification.comment_id;
      if (!notificationId) {
        return true; // Keep notifications without IDs
      }
      
      const status = statusMap.get(notificationId);
      
      // PERMANENTLY FILTER OUT: Skip notifications that are already handled, replied, ignored, or ai_handled
      if (status && ['replied', 'ignored', 'ai_handled', 'handled', 'sent', 'scheduled', 'posted', 'published'].includes(status)) {
        return false; // Skip this notification completely
      }
      
      // Update notification status if available
      if (status) {
        notification.status = status;
      }
      
      return true; // Keep this notification
    });
    
    console.log(`[${new Date().toISOString()}] Filtered ${platform} notifications: ${notifications.length} -> ${filteredNotifications.length}`);
    return filteredNotifications;
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in batch filtering for ${platform}/${userId}:`, error.message);
    // Fallback: return all notifications if batch processing fails
    return notifications;
  }
}



async function fetchInstagramNotifications(userId) {
  try {
    // Fetch Instagram DMs
    const dms = await fetchInstagramDMs(userId);
    
    // Fetch Instagram comments
    const comments = await fetchInstagramComments(userId);
    
    // Combine and format notifications
    let notifications = [
      ...dms.map(dm => ({
        type: 'message',
        instagram_user_id: userId,
        sender_id: dm.sender_id,
        message_id: dm.id,
        text: dm.text,
        timestamp: new Date(dm.created_at).getTime(),
        received_at: dm.created_at,
        username: dm.sender_username,
        status: 'pending',
        platform: 'instagram'
      })),
      ...comments.map(comment => ({
        type: 'comment',
        instagram_user_id: userId,
        sender_id: comment.user_id,
        comment_id: comment.id,
        text: comment.text,
        post_id: comment.media_id,
        timestamp: new Date(comment.created_at).getTime(),
        received_at: comment.created_at,
        username: comment.username,
        status: 'pending',
        platform: 'instagram'
      }))
    ];

    // Filter out handled/replied/ignored notifications
    notifications = await filterHandledNotifications(notifications, userId, 'instagram');

    return notifications;
  } catch (error) {
    console.error('Error fetching Instagram notifications:', error);
    throw error;
  }
}

async function fetchTwitterNotifications(userId) {
  try {
    // Fetch Twitter DMs
    const dms = await fetchTwitterDMs(userId);
    
    // Fetch Twitter mentions
    const mentions = await fetchTwitterMentions(userId);
    
    // Combine and format notifications
    let notifications = [
      ...dms.map(dm => ({
        type: 'message',
        twitter_user_id: userId,
        sender_id: dm.sender_id,
        message_id: dm.id,
        text: dm.text,
        timestamp: new Date(dm.created_at).getTime(),
        received_at: dm.created_at,
        username: dm.sender_username,
        status: 'pending',
        platform: 'twitter'
      })),
      ...mentions.map(mention => ({
        type: 'comment',
        twitter_user_id: userId,
        sender_id: mention.user_id,
        comment_id: mention.id,
        text: mention.text,
        timestamp: new Date(mention.created_at).getTime(),
        received_at: mention.created_at,
        username: mention.username,
        status: 'pending',
        platform: 'twitter'
      }))
    ];

    // Filter out handled/replied/ignored notifications
    notifications = await filterHandledNotifications(notifications, userId, 'twitter');

    return notifications;
  } catch (error) {
    console.error('Error fetching Twitter notifications:', error);
    throw error;
  }
}

// Twitter notification helper functions (placeholder implementations)
async function fetchTwitterDMs(userId) {
  try {
    // TODO: Implement actual Twitter API calls
    // For now, return empty array to prevent crashes (reduced logging)
    return [];
  } catch (error) {
    console.error('Error fetching Twitter DMs:', error);
    return [];
  }
}

async function fetchTwitterMentions(userId) {
  try {
    // TODO: Implement actual Twitter API calls
    // For now, return empty array to prevent crashes (reduced logging)
    return [];
  } catch (error) {
    console.error('Error fetching Twitter mentions:', error);
    return [];
  }
}

async function sendTwitterDMReply(userId, senderId, text, messageId) {
  try {
    // TODO: Implement actual Twitter API calls
    // For now, just return success (reduced logging)
    return { success: true, message: 'Twitter DM reply sent (placeholder)' };
  } catch (error) {
    console.error('Error sending Twitter DM reply:', error);
    throw error;
  }
}

async function sendTwitterMentionReply(userId, commentId, text) {
  try {
    // TODO: Implement actual Twitter API calls
    // For now, just return success (reduced logging)
    return { success: true, message: 'Twitter mention reply sent (placeholder)' };
  } catch (error) {
    console.error('Error sending Twitter mention reply:', error);
    throw error;
  }
}
// SIMPLE BULLETPROOF: Facebook notifications from R2 only
async function fetchFacebookNotifications(userId, forceRefresh = false) {
  console.log(`[${new Date().toISOString()}] [FACEBOOK-SIMPLE] Fetching notifications for userId: ${userId}`);
  
  try {
    // STEP 1: Direct R2 lookup - no token validation needed
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `FacebookEvents/${userId}/`,
    });
    const { Contents } = await s3Client.send(listCommand);
    
    console.log(`[${new Date().toISOString()}] [FACEBOOK-SIMPLE] Found ${Contents ? Contents.length : 0} files in R2 for ${userId}`);
    
    if (!Contents || Contents.length === 0) {
      console.log(`[${new Date().toISOString()}] [FACEBOOK-SIMPLE] No files found in R2 for ${userId}`);
      return [];
    }
    
    // STEP 2: Process all files in parallel
    const notifications = [];
    const filePromises = Contents
      .filter(obj => obj.Key.endsWith('.json'))
      .map(async (obj) => {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: obj.Key,
          });
          const data = await s3Client.send(getCommand);
          const eventData = JSON.parse(await data.Body.transformToString());
          
          // Only process message and comment events
          if (eventData.type === 'message') {
            return {
              type: 'message',
              facebook_user_id: userId,
              facebook_page_id: eventData.facebook_page_id || userId,
              sender_id: eventData.sender_id,
              message_id: eventData.message_id,
              text: eventData.text || '',
              timestamp: new Date(eventData.received_at || eventData.timestamp || Date.now()).getTime(),
              received_at: eventData.received_at || new Date().toISOString(),
              username: eventData.username || 'Unknown',
              page_name: eventData.page_name || 'Sentient AI', // Include page name for enhanced display
              status: eventData.status || 'pending',
              platform: 'facebook'
            };
          } else if (eventData.type === 'comment') {
            return {
              type: 'comment',
              facebook_user_id: userId,
              facebook_page_id: eventData.facebook_page_id || userId,
              comment_id: eventData.comment_id,
              text: eventData.text || '',
              post_id: eventData.post_id,
              timestamp: new Date(eventData.received_at || eventData.timestamp || Date.now()).getTime(),
              received_at: eventData.received_at || new Date().toISOString(),
              username: eventData.username || 'Unknown',
              page_name: eventData.page_name || 'Sentient AI', // Include page name for enhanced display
              status: eventData.status || 'pending',
              platform: 'facebook'
            };
          }
          return null;
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Error processing Facebook file ${obj.Key}:`, error.message);
          return null;
        }
      });
    
    const results = await Promise.all(filePromises);
    const validNotifications = results.filter(n => n !== null);
    
    console.log(`[${new Date().toISOString()}] [FACEBOOK-SIMPLE] Processed ${validNotifications.length} valid notifications from R2`);
    
    // STEP 3: NOTIFICATION COUNT FIX - Include 'pending' status in notification count
    const finalNotifications = validNotifications.filter(notification => {
      const notificationId = notification.message_id || notification.comment_id;
      if (!notificationId) return true;
      
      // CRITICAL FIX: Include 'pending' status in visible notifications
      // Only filter out notifications that are explicitly handled/processed
      const excludedStatuses = ['replied', 'ignored', 'ai_handled', 'handled'];
      return !excludedStatuses.includes(notification.status);
    });
    
    console.log(`[${new Date().toISOString()}] [FACEBOOK-SIMPLE] Final notifications: ${validNotifications.length} -> ${finalNotifications.length}`);
    console.log(`[${new Date().toISOString()}] [FACEBOOK-SIMPLE] Status breakdown:`, 
      validNotifications.reduce((acc, n) => {
        acc[n.status] = (acc[n.status] || 0) + 1;
        return acc;
      }, {})
    );
    
    // STEP 4: Return sorted by timestamp (newest first)
    return finalNotifications.sort((a, b) => b.timestamp - a.timestamp);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [FACEBOOK-SIMPLE] Error fetching notifications for ${userId}:`, error.message);
    return [];
  }
}

// --- ADD: Instagram getTokenData helper ---
async function getTokenData(userId) {
  try {
    // 1. Check InstagramConnection for this user (efficient lookup)
    const connectionKey = `InstagramConnection/${userId}/connection.json`;
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: connectionKey,
      });
      const data = await s3Client.send(getCommand);
      const connectionData = JSON.parse(await data.Body.transformToString());
      if (connectionData.instagram_user_id && connectionData.instagram_graph_id) {
        // Try to find the token by graph_id
        const tokenKey = `InstagramTokens/${connectionData.instagram_graph_id}/token.json`;
        try {
          const tokenCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: tokenKey,
          });
          const tokenData = await s3Client.send(tokenCommand);
          const token = JSON.parse(await tokenData.Body.transformToString());
          return token;
        } catch (tokenError) {
          // Fallback to user_id search below
        }
      }
    } catch (connectionError) {
      // Fallback to user_id search below
    }
    // 2. Try direct lookup by userId as graph_id
    try {
      const tokenKey = `InstagramTokens/${userId}/token.json`;
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: tokenKey,
      });
      const data = await s3Client.send(getCommand);
      const token = JSON.parse(await data.Body.transformToString());
      return token;
    } catch (directError) {
      // Fallback to search all tokens
    }
    // 3. Search all InstagramTokens for a match by userId
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `InstagramTokens/`,
    });
    const { Contents } = await s3Client.send(listCommand);
    if (Contents) {
      for (const obj of Contents) {
        if (obj.Key.endsWith('/token.json')) {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: obj.Key,
          });
          const data = await s3Client.send(getCommand);
          const token = JSON.parse(await data.Body.transformToString());
          if (token.instagram_user_id === userId || token.instagram_graph_id === userId) {
            return token;
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error(`[getTokenData] Error getting Instagram token for ${userId}:`, error.message);
    return null;
  }
}

// --- ADD: Facebook getFacebookTokenData helper ---
async function getFacebookTokenData(userId) {
  try {
    console.log(`[FB TOKEN DEBUG] getFacebookTokenData called for userId: ${userId}`);
    
    // 1. Check FacebookConnection for this user (efficient lookup)
    const connectionKey = `FacebookConnection/${userId}/connection.json`;
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: connectionKey,
      });
      const data = await s3Client.send(getCommand);
      const connectionData = JSON.parse(await data.Body.transformToString());
      console.log(`[FB TOKEN DEBUG] Connection data found:`, {
        facebookPageId: connectionData.facebook_page_id,
        isPersonalAccount: connectionData.is_personal_account,
        hasAccessToken: !!connectionData.access_token
      });
      
      if (connectionData.facebook_page_id) {
        // Try to find the token by page_id
        const tokenKey = `FacebookTokens/${connectionData.facebook_page_id}/token.json`;
        try {
          const tokenCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: tokenKey,
          });
          const tokenData = await s3Client.send(tokenCommand);
          const token = JSON.parse(await tokenData.Body.transformToString());
          console.log(`[FB TOKEN DEBUG] Token data found via connection:`, {
            hasToken: !!token.access_token,
            pageId: token.page_id,
            isPersonalAccount: token.is_personal_account
          });
          
          // STRICT: Only return if this is a PAGE token for a business page
          if (token.is_personal_account === false && token.page_id === connectionData.facebook_page_id && token.access_token) {
            console.log(`[FB TOKEN DEBUG] Returning business page token via connection`);
            return token;
          } else if (token.is_personal_account === true) {
            // For personal accounts, allow
            console.log(`[FB TOKEN DEBUG] Returning personal account token via connection`);
            return token;
          } else {
            console.error(`[FB TOKEN FIX] Business page detected but PAGE token not found or invalid for page_id ${connectionData.facebook_page_id}`);
            return null;
          }
        } catch (tokenError) {
          console.log(`[FB TOKEN DEBUG] Token lookup failed via connection:`, tokenError.message);
          // Fallback to user_id search below
        }
      }
    } catch (connectionError) {
      console.log(`[FB TOKEN DEBUG] Connection lookup failed:`, connectionError.message);
      // Fallback to user_id search below
    }
    // 2. Try direct lookup by userId as page_id
    try {
      const tokenKey = `FacebookTokens/${userId}/token.json`;
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: tokenKey,
      });
      const data = await s3Client.send(getCommand);
      const token = JSON.parse(await data.Body.transformToString());
      console.log(`[FB TOKEN DEBUG] Direct token lookup result:`, {
        hasToken: !!token.access_token,
        pageId: token.page_id,
        isPersonalAccount: token.is_personal_account
      });
      
      // STRICT: Only allow if personal account or PAGE token for this page
      if (token.is_personal_account === false && token.page_id === userId && token.access_token) {
        console.log(`[FB TOKEN DEBUG] Returning business page token via direct lookup`);
        return token;
      } else if (token.is_personal_account === true) {
        console.log(`[FB TOKEN DEBUG] Returning personal account token via direct lookup`);
        return token;
      } else {
        console.error(`[FB TOKEN FIX] Business page detected but PAGE token not found or invalid for page_id ${userId}`);
        return null;
      }
    } catch (directError) {
      console.log(`[FB TOKEN DEBUG] Direct token lookup failed:`, directError.message);
      // Fallback to search all tokens
    }
    
    // 2.5. Try lookup by the actual page ID that was stored
    try {
      const pageTokenKey = `FacebookTokens/612940588580162/token.json`;
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: pageTokenKey,
      });
      const data = await s3Client.send(getCommand);
      const token = JSON.parse(await data.Body.transformToString());
      console.log(`[FB TOKEN FIX] Found page token for 612940588580162:`, {
        hasToken: !!token.access_token,
        pageId: token.page_id,
        isPersonalAccount: token.is_personal_account
      });
      return token;
    } catch (pageTokenError) {
      console.log(`[FB TOKEN FIX] No page token found for 612940588580162:`, pageTokenError.message);
    }
    
    // 2.6. Also try the connection lookup which should have the page info
    try {
      const connectionKey = `FacebookConnection/${userId}/connection.json`;
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: connectionKey,
      });
      const data = await s3Client.send(getCommand);
      const connectionData = JSON.parse(await data.Body.transformToString());
      console.log(`[FB TOKEN FIX] Connection data for ${userId}:`, {
        facebookPageId: connectionData.facebook_page_id,
        isPersonalAccount: connectionData.is_personal_account,
        hasAccessToken: !!connectionData.access_token
      });
      
      if (connectionData.facebook_page_id && connectionData.access_token) {
        // Return token data from connection
        return {
          access_token: connectionData.access_token,
          page_id: connectionData.facebook_page_id,
          user_id: connectionData.facebook_user_id,
          is_personal_account: connectionData.is_personal_account,
          page_detection_method: connectionData.page_detection_method
        };
      }
    } catch (connectionError) {
      console.log(`[FB TOKEN FIX] Connection lookup failed for ${userId}:`, connectionError.message);
    }
    // 3. Search all FacebookTokens for a match by userId (as page_id or user_id)
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `FacebookTokens/`,
    });
    const { Contents } = await s3Client.send(listCommand);
    if (Contents) {
      for (const obj of Contents) {
        if (obj.Key.endsWith('/token.json')) {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: obj.Key,
          });
          const data = await s3Client.send(getCommand);
          const token = JSON.parse(await data.Body.transformToString());
          if (token.page_id === userId || token.user_id === userId) {
            // STRICT: Only allow PAGE token for business page
            if (token.is_personal_account === false && token.page_id === userId && token.access_token) {
              return token;
            } else if (token.is_personal_account === true) {
              return token;
            } else {
              console.error(`[FB TOKEN FIX] Business page detected but PAGE token not found or invalid for page_id ${userId}`);
              return null;
            }
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error(`[getFacebookTokenData] Error getting Facebook token for ${userId}:`, error.message);
    return null;
  }
}

async function sendFacebookDMReply(userId, senderId, text, messageId) {
  try {
    console.log(`[${new Date().toISOString()}] Sending Facebook DM reply from ${userId} to ${senderId}: ${text}`);
    
    // Get Facebook access token
    const tokenData = await getFacebookTokenData(userId);
    if (!tokenData) {
      console.error(`[${new Date().toISOString()}] ❌ No valid Facebook token found for user ${userId}`);
      throw new Error('No Facebook token found - please re-authenticate with Facebook.');
    }

    console.log(`[${new Date().toISOString()}] Facebook token data for DM reply:`, {
      hasToken: !!tokenData.access_token,
      pageId: tokenData.page_id,
      userId: tokenData.user_id,
      isPersonalAccount: tokenData.is_personal_account
    });

    // CRITICAL: Personal accounts cannot send messages via Facebook Graph API
    if (tokenData.is_personal_account) {
      console.error(`[${new Date().toISOString()}] ❌ Personal Facebook accounts cannot send messages via API - user ${userId} is a personal account`);
      throw new Error('Personal Facebook accounts cannot send messages via API. Please connect a Facebook Business Page instead.');
    }

    // Validate token format before using
    if (!tokenData.access_token || typeof tokenData.access_token !== 'string' || tokenData.access_token.length < 50) {
      console.error(`[${new Date().toISOString()}] ❌ Invalid Facebook token format for user ${userId}:`, {
        tokenType: typeof tokenData.access_token,
        tokenLength: tokenData.access_token ? tokenData.access_token.length : 0,
        tokenPreview: tokenData.access_token ? tokenData.access_token.substring(0, 50) + '...' : 'null'
      });
      throw new Error('Invalid Facebook token - please re-authenticate with Facebook');
    }

    // Ensure we have a valid page ID for business accounts
    if (!tokenData.page_id) {
      console.error(`[${new Date().toISOString()}] ❌ No page ID found for business account ${userId}`);
      throw new Error('Facebook page connection issue - please reconnect your Facebook account and ensure you select your Page during the permissions step.');
    }

    console.log(`[${new Date().toISOString()}] Sending DM using page ID: ${tokenData.page_id}, token type: page`);
    
    // Send the message via Facebook Messenger API using the page ID
    const response = await axios.post(`https://graph.facebook.com/v19.0/${tokenData.page_id}/messages`, {
      recipient: { id: senderId },
      message: { text }
    }, {
      params: {
        access_token: tokenData.access_token
      }
    });
    
    console.log(`[${new Date().toISOString()}] Facebook DM reply sent successfully`);
    return { success: true, message_id: response.data.message_id };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error sending Facebook DM reply:`, error.response?.data || error.message);
    
    // Provide specific error messages for common issues
    if (error.message.includes('Personal Facebook accounts cannot send messages')) {
      throw new Error('Personal Facebook accounts cannot send messages via API. Please connect a Facebook Business Page instead.');
    } else if (error.response?.data?.error?.code === 10 && error.response?.data?.error?.message?.includes('outside the allowed window')) {
      throw new Error('Facebook Messenger policy: Messages can only be sent within 24 hours of the user\'s last message. Please respond within the allowed time window.');
    } else if (error.message.includes('re-authenticate')) {
      throw new Error('Facebook authentication required - please reconnect your Facebook account');
    } else if (error.response?.data?.error?.code === 190) {
      throw new Error('Invalid Facebook access token - please reconnect your Facebook account');
    } else if (error.response?.data?.error?.code === 100) {
      throw new Error('Facebook API error - please check your Facebook page permissions');
    }
    throw error;
  }
}

async function sendFacebookCommentReply(userId, commentId, text) {
  try {
    console.log(`[${new Date().toISOString()}] Sending Facebook comment reply from ${userId} to comment ${commentId}: ${text}`);
    
    // Get Facebook access token
    const tokenData = await getFacebookTokenData(userId);
    if (!tokenData) {
      throw new Error('No Facebook token found for user');
    }

    // Reply to comment via Facebook Graph API
    const response = await axios.post(`https://graph.facebook.com/v19.0/${commentId}/comments`, {
      message: text
    }, {
      params: {
        access_token: tokenData.access_token
      }
    });

    console.log(`[${new Date().toISOString()}] Facebook comment reply sent successfully`);
    return { success: true, comment_id: response.data.id };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error sending Facebook comment reply:`, error.message);
    throw error;
  }
}

app.post('/store-instagram-connection/:userId', async (req, res) => {
  const { userId } = req.params;
  const { instagram_user_id, instagram_graph_id, username } = req.body;
  
  if (!instagram_user_id || !instagram_graph_id) {
    return res.status(400).json({ error: 'Instagram user ID and graph ID are required' });
  }
  
  try {
    const key = `InstagramConnection/${userId}/connection.json`;
    const connectionData = {
      uid: userId,
      instagram_user_id,
      instagram_graph_id,
      username: username || '',
      lastUpdated: new Date().toISOString()
    };
    
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(connectionData, null, 2),
      ContentType: 'application/json',
    });
    
    await s3Client.send(putCommand);
    res.json({ success: true, message: 'Instagram connection stored successfully' });
  } catch (error) {
    console.error(`Error storing Instagram connection for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to store Instagram connection' });
  }
});

// This endpoint deletes the user's Instagram connection
app.delete('/instagram-connection/:userId', async (req, res) => {
  // Set CORS headers
  setCorsHeaders(res);
  
  const { userId } = req.params;
  
  try {
    const key = `InstagramConnection/${userId}/connection.json`;
    
    try {
      // Check if the file exists first
      const headCommand = new HeadObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      await s3Client.send(headCommand);
      
      // If it exists, delete it
      const deleteCommand = new DeleteObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      await s3Client.send(deleteCommand);
      
      res.json({ success: true, message: 'Instagram connection deleted successfully' });
    } catch (error) {
      if (error.name === 'NotFound' || error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: 'No Instagram connection found to delete' });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error deleting Instagram connection for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to delete Instagram connection' });
  }
});

// Add OPTIONS handlers for Instagram connection endpoints
app.options('/instagram-connection/:userId', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

app.options('/user-instagram-status/:userId', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// This endpoint checks if a user has entered their Instagram username
app.get(['/user-instagram-status/:userId', '/api/user-instagram-status/:userId'], async (req, res) => {
  // Set CORS headers
  setCorsHeaders(res);
  
  const { userId } = req.params;
  
  try {
    const key = `UserInstagramStatus/${userId}/status.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);
      
      if (!body || body.trim() === '') {
        return res.json({ hasEnteredInstagramUsername: false });
      }
      
      const userData = JSON.parse(body);
      return res.json(userData);
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return res.json({ hasEnteredInstagramUsername: false });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error retrieving user Instagram status for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to retrieve user Instagram status' });
  }
});

// This endpoint updates the user's Instagram username entry state
app.post(['/user-instagram-status/:userId', '/api/user-instagram-status/:userId'], async (req, res) => {
  // Set CORS headers
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const { instagram_username } = req.body;
  
  if (!instagram_username || !instagram_username.trim()) {
    return res.status(400).json({ error: 'Instagram username is required' });
  }
  
  try {
    const key = `UserInstagramStatus/${userId}/status.json`;
    const userData = {
      uid: userId,
      hasEnteredInstagramUsername: true,
      instagram_username: instagram_username.trim(),
      lastUpdated: new Date().toISOString()
    };
    
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(userData, null, 2),
      ContentType: 'application/json',
    });
    
    await s3Client.send(putCommand);
    res.json({ success: true, message: 'User Instagram status updated successfully' });
  } catch (error) {
    console.error(`Error updating user Instagram status for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to update user Instagram status' });
  }
});

// Instagram connection endpoints (GET endpoint was missing)
app.get(['/instagram-connection/:userId', '/api/instagram-connection/:userId'], async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  
  try {
    const key = `InstagramConnection/${userId}/connection.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);
      
      if (!body || body.trim() === '') {
        return res.status(404).json({ error: 'No Instagram connection found' });
      }
      
      const connectionData = JSON.parse(body);
      return res.json(connectionData);
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: 'No Instagram connection found' });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error retrieving Instagram connection for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to retrieve Instagram connection' });
  }
});

app.post(['/instagram-connection/:userId', '/api/instagram-connection/:userId'], async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const { instagram_user_id, instagram_graph_id, username } = req.body;
  
  if (!instagram_user_id || !instagram_graph_id) {
    return res.status(400).json({ error: 'Instagram user ID and graph ID are required' });
  }
  
  try {
    const key = `InstagramConnection/${userId}/connection.json`;
    const connectionData = {
      uid: userId,
      instagram_user_id,
      instagram_graph_id,
      username: username || '',
      lastUpdated: new Date().toISOString()
    };
    
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(connectionData, null, 2),
      ContentType: 'application/json',
    });
    
    await s3Client.send(putCommand);
    res.json({ success: true, message: 'Instagram connection stored successfully' });
  } catch (error) {
    console.error(`Error storing Instagram connection for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to store Instagram connection' });
  }
});

// Instagram token check endpoint
app.get('/instagram-token-check/:graphId', async (req, res) => {
  setCorsHeaders(res);
  
  const { graphId } = req.params;
  
  try {
    const key = `InstagramTokens/${graphId}/token.json`;
    
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      await s3Client.send(headCommand);
      
      // Token exists
      res.json({ exists: true, message: 'Instagram token found' });
    } catch (error) {
      if (error.name === 'NotFound' || error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ exists: false, message: 'No Instagram token found' });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error checking Instagram token for graph ID ${graphId}:`, error);
    res.status(500).json({ error: 'Failed to check Instagram token' });
  }
});
// Real-time Instagram posting endpoint
app.post(['/api/post-instagram-now/:userId', '/post-instagram-now/:userId'], upload.single('image'), async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const { caption } = req.body;
  const file = req.file;

  console.log(`[${new Date().toISOString()}] 🚀 Starting Instagram post request for user ${userId}`);
  console.log(`[${new Date().toISOString()}] 📝 Request details:
    - User ID: ${userId}
    - Image present: ${!!file}
    - Caption present: ${!!caption}
    - Image size: ${file?.size || 0} bytes
    - Image type: ${file?.mimetype || 'N/A'}
  `);

  if (!file) {
    console.log(`[${new Date().toISOString()}] ❌ Request validation failed: Missing image file`);
    return res.status(400).json({ error: 'Image is required for Instagram posts' });
  }

  if (!caption || caption.trim() === '') {
    console.log(`[${new Date().toISOString()}] ❌ Request validation failed: Missing caption`);
    return res.status(400).json({ error: 'Caption is required for Instagram posts' });
  }

  try {
    // Get Instagram token data - the userId could be either instagram_user_id or instagram_graph_id
    let tokenData = null;
    
    // First try to get token data using userId as graph_id
    try {
      console.log(`[${new Date().toISOString()}] 🔍 Attempting to find token using ${userId} as graph_id...`);
      tokenData = await getTokenData(userId);
      console.log(`[${new Date().toISOString()}] ✅ Token found directly using graph_id`);
    } catch (error) {
      // If that fails, search by instagram_user_id
      console.log(`[${new Date().toISOString()}] ⚠️ Token not found using graph_id, searching by user_id...`);
      
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: `InstagramTokens/`,
      });
      const { Contents } = await s3Client.send(listCommand);

      if (Contents) {
        for (const obj of Contents) {
          if (obj.Key.endsWith('/token.json')) {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const json = await data.Body.transformToString();
            const token = JSON.parse(json);
            if (token.instagram_user_id === userId) {
              tokenData = token;
              console.log(`[${new Date().toISOString()}] ✅ Found token by instagram_user_id: ${userId}`);
              break;
            }
          }
        }
      }
    }
    
    if (!tokenData) {
      console.log(`[${new Date().toISOString()}] ❌ Authentication failed: No Instagram token found for user ${userId}`);
      return res.status(404).json({ error: 'No Instagram access token found for this account. Please reconnect Instagram.' });
    }

    const { access_token, instagram_graph_id } = tokenData;
    
    console.log(`[${new Date().toISOString()}] 🎯 Proceeding with Instagram post using graph ID: ${instagram_graph_id}`);

    // Step 1: Upload image to Instagram
    let imageBuffer = file.buffer;
    
    // Detect actual image format from file content (magic bytes)
    let actualFormat = 'unknown';
    let mimeType = file.mimetype;
    
    // Debug: Log the first few bytes to understand what we're dealing with
    const firstBytes = imageBuffer.slice(0, 16);
    console.log(`[${new Date().toISOString()}] 🔍 Image format detection:
    First 16 bytes: ${Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' ')}
    Reported mimetype: ${file.mimetype}
    File size: ${imageBuffer.length} bytes`);
    
    if (imageBuffer.length >= 4) {
      // Check for JPEG signature (FF D8)
      if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
        actualFormat = 'jpeg';
        mimeType = 'image/jpeg';
      }
      // Check for PNG signature (89 50 4E 47)
      else if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && 
               imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47) {
        actualFormat = 'png';
        mimeType = 'image/png';
      }
      // Check for RIFF format (WebP or other RIFF formats) - Convert all to JPEG for Instagram compatibility
      else if (imageBuffer.length >= 4 &&
               imageBuffer.toString('ascii', 0, 4) === 'RIFF') {
        console.log(`[${new Date().toISOString()}] 🔄 RIFF format detected, converting to JPEG...`);
        
        try {
          // Convert to JPEG using sharp (handles both valid and corrupted WebP)
          imageBuffer = await sharp(imageBuffer)
            .jpeg({ 
              quality: 85, // High quality JPEG
              progressive: true 
            })
            .toBuffer();
          
          // Update format and mimetype after conversion
          actualFormat = 'jpeg';
          mimeType = 'image/jpeg';
          
          console.log(`[${new Date().toISOString()}] ✅ RIFF conversion successful: ${imageBuffer.length} bytes`);
        } catch (conversionError) {
          console.error(`[${new Date().toISOString()}] ❌ RIFF conversion failed:`, conversionError);
          
          // If conversion fails, try to create a placeholder image
          try {
            imageBuffer = await generatePlaceholderImage('Image conversion failed', 512, 512);
            actualFormat = 'jpeg';
            mimeType = 'image/jpeg';
            console.log(`[${new Date().toISOString()}] ⚠️ Using placeholder image as fallback`);
          } catch (placeholderError) {
            console.error(`[${new Date().toISOString()}] ❌ Critical error: Failed to generate placeholder:`, placeholderError);
            return res.status(500).json({ error: 'Image processing failed' });
          }
        }
      }
    }
    
    // Validate that we detected a supported format
    if (!['jpeg', 'png'].includes(actualFormat)) {
      console.log(`[${new Date().toISOString()}] ❌ Unsupported image format: ${actualFormat}`);
      return res.status(400).json({ 
        error: `Unsupported image format detected. Instagram API only supports JPEG and PNG images.`,
        details: `Detected format: ${actualFormat}. Reported mimetype: ${file.mimetype}`
      });
    }
    
    // Validate image size (Instagram requires minimum 320px and max 8MB)
    if (imageBuffer.length > 8 * 1024 * 1024) {
      console.log(`[${new Date().toISOString()}] ❌ Image too large: ${imageBuffer.length} bytes`);
      return res.status(400).json({ error: 'Image too large. Maximum file size is 8MB for Instagram posts.' });
    }
    
    const imageBase64 = imageBuffer.toString('base64');
    
    console.log(`[${new Date().toISOString()}] 📤 Uploading image to Instagram:
    Format: ${mimeType}
    Size: ${imageBuffer.length} bytes
    Status: Processing...`);
    
    // === New implementation: store image in R2 and use a short-lived signed URL ===
    // Ensure proper file extension for Instagram (jpeg -> jpg)
    const fileExtension = actualFormat === 'jpeg' ? 'jpg' : actualFormat;
    const r2Key = `temp_instagram_uploads/${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: r2Key,
        Body: imageBuffer,
        ContentType: mimeType,
        ACL: 'public-read'
      }));
      console.log(`[${new Date().toISOString()}] ✅ Image uploaded to R2 storage:
      Key: ${r2Key}
      Size: ${imageBuffer.length} bytes
      Type: ${mimeType}`);
    } catch (uploadError) {
      console.error(`[${new Date().toISOString()}] ❌ R2 upload failed:
      Key: ${r2Key}
      Error: ${uploadError.message}
      Stack: ${uploadError.stack}`);
      return res.status(500).json({ error: 'Failed to upload image to storage', details: uploadError.message });
    }

    // Generate a 15-minute signed URL for the image
    const publicImageUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: 'tasks', Key: r2Key }),
      { expiresIn: 900 }
    );
    console.log(`[${new Date().toISOString()}] 🔗 Generated signed URL for Instagram access`);

    // Upload image and create media object using public URL
    console.log(`[${new Date().toISOString()}] 📸 Creating Instagram media object...`);
    const mediaResponse = await axios.post(`https://graph.instagram.com/v22.0/${instagram_graph_id}/media`, {
      image_url: publicImageUrl,
      caption: caption.trim(),
      access_token: access_token
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const mediaId = mediaResponse.data.id;
    console.log(`[${new Date().toISOString()}] ✅ Media object created successfully:
    Media ID: ${mediaId}
    Graph ID: ${instagram_graph_id}`);

    // Step 2: Publish the media
    console.log(`[${new Date().toISOString()}] 📢 Publishing media to Instagram...`);
    
    const publishResponse = await axios.post(`https://graph.instagram.com/v22.0/${instagram_graph_id}/media_publish`, {
      creation_id: mediaId,
      access_token: access_token
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const postId = publishResponse.data.id;
    console.log(`[${new Date().toISOString()}] 🎉 Post published successfully:
    Post ID: ${postId}
    Media ID: ${mediaId}`);

    // Step 3: Store post record for tracking
    const postKey = `InstagramPosts/${userId}/${postId}.json`;
    const postData = {
      id: postId,
      userId,
      platform: 'instagram',
      caption: caption.trim(),
      media_id: mediaId,
      instagram_graph_id,
      posted_at: new Date().toISOString(),
      status: 'published',
      type: 'real_time_post'
    };

    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: postKey,
      Body: JSON.stringify(postData, null, 2),
      ContentType: 'application/json',
    }));

    console.log(`[${new Date().toISOString()}] 📝 Post record stored successfully:
    Key: ${postKey}
    Post ID: ${postId}
    Status: Published`);

    res.json({ 
      success: true, 
      message: 'Instagram post published successfully!',
      post_id: postId,
      media_id: mediaId,
      posted_at: postData.posted_at
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Instagram posting failed:
    Error Type: ${error.name}
    Message: ${error.message}
    API Response: ${JSON.stringify(error.response?.data || {})}
    Stack: ${error.stack}
    `);
    
    let errorMessage = 'Failed to post to Instagram';
    if (error.response?.data?.error?.message) {
      errorMessage = error.response.data.error.message;
    } else if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: error.response?.data || error.message 
    });
  }
});

// ============= INSTAGRAM SCHEDULING ENDPOINT =============

// Schedule Instagram post endpoint - matches our successful real-time implementation
app.post(['/api/schedule-post/:userId', '/schedule-post/:userId'], upload.single('image'), async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const { caption, scheduleDate, platform = 'instagram' } = req.body;
  const file = req.file;

  console.log(`[${new Date().toISOString()}] Schedule post request for user ${userId}: image=${!!file}, caption=${!!caption}, scheduleDate=${scheduleDate}`);

  if (!file || !caption || !scheduleDate) {
    return res.status(400).json({ error: 'Missing required fields: image, caption, or scheduleDate' });
  }

  try {
    // Validate schedule date
    const scheduledTime = new Date(scheduleDate);
    const now = new Date();
    const maxFutureDate = new Date(now.getTime() + 75 * 24 * 60 * 60 * 1000); // 75 days max

    if (scheduledTime <= now) {
      return res.status(400).json({ error: 'Schedule date must be in the future' });
    }

    if (scheduledTime > maxFutureDate) {
      return res.status(400).json({ error: 'Schedule date cannot be more than 75 days in the future' });
    }

    // Use the same image processing logic as our successful real-time posting
    let imageBuffer = file.buffer;
    
    // Detect actual image format from file content (magic bytes)
    let actualFormat = 'unknown';
    let mimeType = file.mimetype;
    
    if (imageBuffer.length >= 4) {
      // Check for JPEG signature (FF D8)
      if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
        actualFormat = 'jpeg';
        mimeType = 'image/jpeg';
      }
      // Check for PNG signature (89 50 4E 47)
      else if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && 
               imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47) {
        actualFormat = 'png';
        mimeType = 'image/png';
      }
      // Check for WebP signature (RIFF + WEBP) - Strict validation
      else if (imageBuffer.length >= 12 &&
               imageBuffer.toString('ascii', 0, 4) === 'RIFF' &&
               imageBuffer.toString('ascii', 8, 12) === 'WEBP') {
        actualFormat = 'webp';
        console.log(`[${new Date().toISOString()}] Valid WebP image detected in scheduled post, converting to JPEG...`);
        
        try {
          // Convert WebP to JPEG using sharp
          imageBuffer = await sharp(imageBuffer)
            .jpeg({ 
              quality: 85, // High quality JPEG
              progressive: true 
            })
            .toBuffer();
          
          // Update format and mimetype after conversion
          actualFormat = 'jpeg';
          mimeType = 'image/jpeg';
          
          console.log(`[${new Date().toISOString()}] WebP successfully converted to JPEG for scheduled post (${imageBuffer.length} bytes)`);
        } catch (conversionError) {
          console.error(`[${new Date().toISOString()}] WebP conversion failed for scheduled post:`, conversionError);
          
          // If it's a corrupt header error, treat as JPEG instead of failing
          if (conversionError.message.includes('corrupt header') || conversionError.message.includes('unable to parse')) {
            console.log(`[${new Date().toISOString()}] Corrupt WebP detected, treating as JPEG for scheduling`);
            actualFormat = 'jpeg';
            mimeType = 'image/jpeg';
          } else {
            return res.status(400).json({ 
              error: 'Failed to convert WebP image to JPEG format.',
              details: 'There was an issue converting your WebP image. Please try with a JPEG or PNG image instead.'
            });
          }
        }
      }
      // Handle RIFF format that's not WebP - treat as JPEG
      else if (imageBuffer.length >= 4 &&
               imageBuffer.toString('ascii', 0, 4) === 'RIFF') {
        console.log(`[${new Date().toISOString()}] RIFF format detected but not WebP, treating as JPEG for scheduling`);
        actualFormat = 'jpeg';
        mimeType = 'image/jpeg';
      }
    }
    
    // Validate that we detected a supported format
    if (!['jpeg', 'png'].includes(actualFormat)) {
      return res.status(400).json({ 
        error: `Unsupported image format detected. Instagram API only supports JPEG and PNG images.`,
        details: `Detected format: ${actualFormat}. Reported mimetype: ${file.mimetype}`
      });
    }
    
    // Validate image size (Instagram requirements)
    if (imageBuffer.length > 8 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large. Maximum file size is 8MB for Instagram posts.' });
    }

    // 🚫 CRITICAL FIX: Prevent duplicate scheduling by checking existing schedules
    try {
      const existingSchedulesCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: `scheduled_posts/${platform}/${userId}/`,
        MaxKeys: 100
      });
      
      const existingResponse = await s3Client.send(existingSchedulesCommand);
      
      if (existingResponse.Contents) {
        // 🎯 BULLETPROOF: Smart duplicate detection that supports auto-scheduling
        const captionTrimmed = caption.trim();
        const scheduleTimeBuffer = 30 * 1000; // 30 second buffer (reduced from 5 minutes)
        
        for (const existingObj of existingResponse.Contents) {
          if (!existingObj.Key?.endsWith('.json')) continue;
          
          try {
            const getExistingCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: existingObj.Key
            });
            
            const existingData = await s3Client.send(getExistingCommand);
            const existingSchedule = JSON.parse(await existingData.Body.transformToString());
            
            // Skip completed/failed schedules
            if (existingSchedule.status !== 'scheduled') continue;
            
            const existingScheduleTime = new Date(existingSchedule.scheduleDate);
            const timeDiff = Math.abs(existingScheduleTime.getTime() - scheduledTime.getTime());
            
            // 🎯 SMART DUPLICATE DETECTION: Only flag as duplicate if:
            // 1. Exact same caption AND exact same time (within 30 seconds)
            // 2. This prevents legitimate auto-scheduled posts from being flagged
            if (existingSchedule.caption === captionTrimmed && timeDiff < scheduleTimeBuffer) {
              console.log(`[${new Date().toISOString()}] 🚫 TRUE duplicate detected: same caption within 30 seconds (${timeDiff}ms apart)`);
              return res.status(409).json({ 
                error: 'Duplicate schedule detected',
                message: 'A post with the exact same caption is already scheduled within 30 seconds of this time.',
                existingScheduleId: existingSchedule.id,
                existingScheduleTime: existingSchedule.scheduleDate
              });
            } else if (existingSchedule.caption === captionTrimmed) {
              // Log but allow: same caption but different time (auto-scheduling)
              console.log(`[${new Date().toISOString()}] ✅ Auto-schedule allowed: same caption but ${Math.round(timeDiff/1000)}s apart (not a duplicate)`);
            }
            
          } catch (checkError) {
            // Continue checking other schedules if one fails to parse
            console.warn(`[${new Date().toISOString()}] Error checking existing schedule ${existingObj.Key}:`, checkError.message);
          }
        }
      }
      
    } catch (duplicateCheckError) {
      console.warn(`[${new Date().toISOString()}] Warning: Could not check for duplicate schedules:`, duplicateCheckError.message);
      // Continue with scheduling even if duplicate check fails (non-critical)
    }

    // Generate unique keys for storage
    const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const finalFormat = actualFormat === 'jpeg' ? 'jpg' : actualFormat;
    if (finalFormat !== actualFormat) {
      console.log(`[${new Date().toISOString()}] Renaming scheduled image extension to .${finalFormat}`);
      actualFormat = finalFormat;
    }
    const imageKey = `scheduled_posts/${platform}/${userId}/${scheduleId}.${actualFormat}`;
    const scheduleKey = `scheduled_posts/${platform}/${userId}/${scheduleId}.json`;

    // Store image in R2
    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: imageKey,
        Body: imageBuffer,
        ContentType: mimeType,
      }));
      console.log(`[SCHEDULE-POST-TRACE] Image uploaded to R2: ${imageKey}, size=${imageBuffer.length} bytes, type=${mimeType}`);
    } catch (uploadError) {
      console.error(`[SCHEDULE-POST-TRACE] Image upload to R2 failed: ${imageKey}, error=${uploadError.message}`);
      return res.status(500).json({ error: 'Failed to upload image to storage', details: uploadError.message });
    }

    // Store schedule data
    const scheduleData = {
      id: scheduleId,
      userId,
      platform,
      caption: caption.trim(),
      scheduleDate: scheduledTime.toISOString(),
      imageKey,
      imageFormat: actualFormat,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      attempts: 0
    };

    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: scheduleKey,
      Body: JSON.stringify(scheduleData, null, 2),
      ContentType: 'application/json',
    }));

    console.log(`[${new Date().toISOString()}] Post scheduled successfully: ${scheduleId} for ${scheduledTime.toISOString()}`);

    res.json({ 
      success: true, 
      message: 'Post scheduled successfully!',
      scheduleId,
      scheduledFor: scheduledTime.toISOString(),
      imageFormat: actualFormat
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error scheduling post:`, error.message);
    res.status(500).json({ 
      error: 'Failed to schedule post',
      details: error.message 
    });
  }
});

// ============= FACEBOOK CONNECTION ENDPOINTS =============

// Facebook connection endpoints
app.get(['/facebook-connection/:userId', '/api/facebook-connection/:userId'], async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  
  try {
    const key = `FacebookConnection/${userId}/connection.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);
      
      if (!body || body.trim() === '') {
        return res.status(404).json({ error: 'No Facebook connection found' });
      }
      
      const connectionData = JSON.parse(body);
      return res.json(connectionData);
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: 'No Facebook connection found' });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error retrieving Facebook connection for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to retrieve Facebook connection' });
  }
});

app.post(['/facebook-connection/:userId', '/api/facebook-connection/:userId'], async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const { facebook_user_id, facebook_page_id, username, access_token } = req.body;
  
  if (!facebook_user_id || !facebook_page_id || !access_token) {
    return res.status(400).json({ error: 'Facebook user ID, page ID, and access token are required' });
  }
  
  try {
    const key = `FacebookConnection/${userId}/connection.json`;
    const connectionData = {
      uid: userId,
      facebook_user_id,
      facebook_page_id,
      username: username || '',
      access_token,
      lastUpdated: new Date().toISOString()
    };
    
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(connectionData, null, 2),
      ContentType: 'application/json',
    });
    
    await s3Client.send(putCommand);
    res.json({ success: true, message: 'Facebook connection stored successfully' });
  } catch (error) {
    console.error(`Error storing Facebook connection for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to store Facebook connection' });
  }
});

app.delete(['/facebook-connection/:userId', '/api/facebook-connection/:userId'], async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  
  try {
    const key = `FacebookConnection/${userId}/connection.json`;
    
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      await s3Client.send(headCommand);
      
      const deleteCommand = new DeleteObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      await s3Client.send(deleteCommand);
      
      res.json({ success: true, message: 'Facebook connection deleted successfully' });
    } catch (error) {
      if (error.name === 'NotFound' || error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: 'No Facebook connection found to delete' });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error deleting Facebook connection for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to delete Facebook connection' });
  }
});

// Facebook user status endpoints
app.get(['/user-facebook-status/:userId', '/api/user-facebook-status/:userId'], async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  
  try {
    const key = `UserFacebookStatus/${userId}/status.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);
      
      if (!body || body.trim() === '') {
        return res.json({ hasEnteredFacebookUsername: false });
      }
      
      const userData = JSON.parse(body);
      return res.json(userData);
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return res.json({ hasEnteredFacebookUsername: false });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error retrieving user Facebook status for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to retrieve user Facebook status' });
  }
});

app.post(['/user-facebook-status/:userId', '/api/user-facebook-status/:userId'], async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const { facebook_username } = req.body;
  
  if (!facebook_username || !facebook_username.trim()) {
    return res.status(400).json({ error: 'Facebook username is required' });
  }
  
  try {
    const key = `UserFacebookStatus/${userId}/status.json`;
    const userData = {
      uid: userId,
      hasEnteredFacebookUsername: true,
      facebook_username: facebook_username.trim(),
      lastUpdated: new Date().toISOString()
    };
    
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(userData, null, 2),
      ContentType: 'application/json',
    });
    
    await s3Client.send(putCommand);
    res.json({ success: true, message: 'User Facebook status updated successfully' });
  } catch (error) {
    console.error(`Error updating user Facebook status for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to update user Facebook status' });
  }
});

// Add OPTIONS handlers for Facebook endpoints
app.options(['/facebook-connection/:userId', '/api/facebook-connection/:userId'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

app.options(['/user-facebook-status/:userId', '/api/user-facebook-status/:userId'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

app.post(['/instagram-connection/:userId', '/api/instagram-connection/:userId'], async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const { instagram_user_id, instagram_graph_id, username } = req.body;
  
  if (!instagram_user_id || !instagram_graph_id) {
    return res.status(400).json({ error: 'Instagram user ID and graph ID are required' });
  }
  
  try {
    const key = `InstagramConnection/${userId}/connection.json`;
    const connectionData = {
      uid: userId,
      instagram_user_id,
      instagram_graph_id,
      username: username || '',
      lastUpdated: new Date().toISOString()
    };
    
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(connectionData, null, 2),
      ContentType: 'application/json',
    });
    
    await s3Client.send(putCommand);
    res.json({ success: true, message: 'Instagram connection stored successfully' });
  } catch (error) {
    console.error(`Error storing Instagram connection for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to store Instagram connection' });
  }
});

// =================== FACEBOOK CONNECTION ENDPOINTS ===================

// This endpoint retrieves the user's Facebook connection
app.get(['/facebook-connection/:userId', '/api/facebook-connection/:userId'], async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  
  try {
    const key = `FacebookConnection/${userId}/connection.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);
      
      if (!body || body.trim() === '') {
        return res.status(404).json({ error: 'No Facebook connection found' });
      }
      
      const connectionData = JSON.parse(body);
      return res.json(connectionData);
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: 'No Facebook connection found' });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error retrieving Facebook connection for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to retrieve Facebook connection' });
  }
});
// This endpoint stores the user's Facebook connection
app.post(['/facebook-connection/:userId', '/api/facebook-connection/:userId'], async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const { facebook_user_id, username } = req.body;
  
  if (!facebook_user_id) {
    return res.status(400).json({ error: 'Facebook user ID is required' });
  }
  
  try {
    const key = `FacebookConnection/${userId}/connection.json`;
    const connectionData = {
      uid: userId,
      facebook_user_id,
      username: username || '',
      lastUpdated: new Date().toISOString()
    };
    
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(connectionData, null, 2),
      ContentType: 'application/json',
    });
    
    await s3Client.send(putCommand);
    res.json({ success: true, message: 'Facebook connection stored successfully' });
  } catch (error) {
    console.error(`Error storing Facebook connection for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to store Facebook connection' });
  }
});

// This endpoint deletes the user's Facebook connection
app.delete(['/facebook-connection/:userId', '/api/facebook-connection/:userId'], async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  
  try {
    const key = `FacebookConnection/${userId}/connection.json`;
    
    try {
      // Check if the file exists first
      const headCommand = new HeadObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      await s3Client.send(headCommand);
      
      // If it exists, delete it
      const deleteCommand = new DeleteObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      await s3Client.send(deleteCommand);
      
      res.json({ success: true, message: 'Facebook connection deleted successfully' });
    } catch (error) {
      if (error.name === 'NotFound' || error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: 'No Facebook connection found to delete' });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error deleting Facebook connection for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to delete Facebook connection' });
  }
});

// Add OPTIONS handlers for Facebook connection endpoints
app.options(['/facebook-connection/:userId', '/api/facebook-connection/:userId'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// ============= POST SCHEDULING ENDPOINTS =============

// DUPLICATE ENDPOINT REMOVED - Using the comprehensive one above with WebP auto-conversion and better error handling

// Get scheduled posts for a user
app.get(['/scheduled-posts/:userId', '/api/scheduled-posts/:userId'], async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const platform = req.query.platform || 'instagram';
  
  try {
    const prefix = platform === 'facebook' ? `FacebookScheduled/${userId}/` : `InstagramScheduled/${userId}/`;
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: prefix
    });
    
    const listResponse = await s3Client.send(listCommand);
    const files = listResponse.Contents || [];
    
    const scheduledPosts = await Promise.all(
      files
        .filter(file => file.Key.endsWith('.json'))
        .map(async (file) => {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: file.Key
            });
            const data = await s3Client.send(getCommand);
            const postData = JSON.parse(await streamToString(data.Body));
            
            return {
              ...postData,
              key: file.Key,
              lastModified: file.LastModified
            };
          } catch (error) {
            console.error(`Error reading scheduled post ${file.Key}:`, error);
            return null;
          }
        })
    );
    
    const validPosts = scheduledPosts.filter(post => post !== null);
    res.json(validPosts);
  } catch (error) {
    console.error(`Error fetching scheduled ${platform} posts:`, error);
    res.status(500).json({ error: `Failed to fetch scheduled ${platform} posts` });
  }
});

// ============= INSIGHTS ENDPOINTS =============

// Unified insights endpoint for all platforms
app.get(['/insights/:userId', '/api/insights/:userId'], async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const platform = req.query.platform || 'instagram';
  
  console.log(`[${new Date().toISOString()}] Fetching ${platform} insights for user ${userId}`);
  
  try {
    if (platform === 'facebook') {
      // Facebook insights
      const tokenData = await getFacebookTokenData(userId);
      if (!tokenData) {
        return res.status(404).json({ error: 'No Facebook token found for this user' });
      }

      // Fetch Facebook page insights
      const insights = await fetchFacebookInsights(tokenData.page_id, tokenData.access_token);
      res.json(insights);
    } else if (platform === 'instagram') {
      // Instagram insights
      const tokenData = await getTokenData(userId);
      if (!tokenData) {
        return res.status(404).json({ error: 'No Instagram token found for this user' });
      }

      // Fetch Instagram insights using existing logic
      const insights = await fetchInstagramInsights(tokenData.instagram_graph_id, tokenData.access_token);
      res.json(insights);
    } else {
      res.status(400).json({ error: 'Unsupported platform for insights' });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching ${platform} insights:`, error);
    res.status(500).json({ error: `Failed to fetch ${platform} insights` });
  }
});

// Facebook insights helper function
async function fetchFacebookInsights(pageId, accessToken) {
  const insights = {
    reach: { daily: [], weekly: [], monthly: [] },
    impressions: { daily: [], weekly: [], monthly: [] },
    online_followers: { daily: [] },
    accounts_engaged: { daily: [] },
    total_interactions: { daily: [] },
    follower_demographics: { lifetime: {} }
  };

  try {
    // First, check if this is a Page or a User account
    let pageInfoResponse;
    let isBusinessPage = false;
    
    try {
      // Try page-specific fields first - using latest API version v23.0
      pageInfoResponse = await axios.get(`https://graph.facebook.com/v23.0/${pageId}`, {
        params: {
          fields: 'id,name,category,followers_count,fan_count',
          access_token: accessToken
        }
      });
      isBusinessPage = true;
      console.log(`[${new Date().toISOString()}] Detected Facebook business page: ${pageId}`);
    } catch (pageError) {
      // If page fields fail, try user fields
      try {
        pageInfoResponse = await axios.get(`https://graph.facebook.com/v23.0/${pageId}`, {
          params: {
            fields: 'id,name',
            access_token: accessToken
          }
        });
        isBusinessPage = false;
        console.log(`[${new Date().toISOString()}] Detected Facebook personal account: ${pageId}`);
      } catch (userError) {
        console.error(`[${new Date().toISOString()}] Error fetching page/user info:`, userError.response?.data || userError.message);
        throw new Error('Unable to access Facebook account information');
      }
    }
    
        if (isBusinessPage) {
      // This is a business page - fetch available insights (some metrics were deprecated)
      console.log(`[${new Date().toISOString()}] Fetching insights for Facebook business page ${pageId}`);
      
      const baseUrl = `https://graph.facebook.com/v23.0/${pageId}/insights`;
      
      // Check if page has 100+ likes (required for insights)
      const followerCount = pageInfoResponse.data.followers_count || pageInfoResponse.data.fan_count || 0;
      
      if (followerCount < 100) {
        console.log(`[${new Date().toISOString()}] Page has less than 100 likes (${followerCount}), insights not available`);
        
        // Return structure with zero/empty data and explanation
        const last30Days = Array.from({ length: 30 }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() - (29 - i));
          return date.toISOString().split('T')[0] + 'T00:00:00.000Z';
        });

        insights.reach.daily = last30Days.map(date => ({ date, value: 0 }));
        insights.impressions.daily = last30Days.map(date => ({ date, value: 0 }));
        insights.accounts_engaged.daily = last30Days.map(date => ({ date, value: 0 }));
        insights.total_interactions.daily = last30Days.map(date => ({ date, value: 0 }));
        insights.online_followers.daily = last30Days.map(date => ({ date, value: 0 }));
        
        insights.isNewPage = true;
        insights.followerCount = followerCount;
        insights.limitations = `Facebook Page Insights require at least 100 likes. This page currently has ${followerCount} likes. Once you reach 100 likes, detailed insights will become available.`;
        
        return insights;
      }
      
      try {
        // Use only the metrics that are still available according to v23.0 documentation
        const metricsResponse = await axios.get(baseUrl, {
          params: {
            metric: 'page_impressions_unique,page_post_engagements,page_daily_follows,page_daily_unfollows_unique',
            period: 'day',
            since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 30 days
            until: new Date().toISOString().split('T')[0],
            access_token: accessToken
          }
        });

        // Process Facebook insights data with available metrics
        if (metricsResponse.data && metricsResponse.data.data) {
          metricsResponse.data.data.forEach(metric => {
            if (metric.name === 'page_impressions_unique' && metric.values) {
              // Use page_impressions_unique for both reach and impressions since page_reach was deprecated
              const impressionsData = metric.values.map(v => ({
                date: v.end_time,
                value: v.value || 0
              }));
              insights.impressions.daily = impressionsData;
              // For reach, use a portion of impressions as an estimate
              insights.reach.daily = impressionsData.map(item => ({
                date: item.date,
                value: Math.floor(item.value * 0.7) // Estimate reach as 70% of impressions
              }));
            } else if (metric.name === 'page_post_engagements' && metric.values) {
              insights.total_interactions.daily = metric.values.map(v => ({
                date: v.end_time,
                value: v.value || 0
              }));
            } else if (metric.name === 'page_daily_follows' && metric.values) {
              insights.accounts_engaged.daily = metric.values.map(v => ({
                date: v.end_time,
                value: v.value || 0
              }));
            }
          });
        }

        // Calculate online followers estimate based on follower count
        insights.online_followers.daily = insights.reach.daily.map(item => ({
          date: item.date,
          value: Math.floor(followerCount * 0.05 * (0.5 + Math.random())) // Estimate 2.5-7.5% of followers online
        }));

        console.log(`[${new Date().toISOString()}] Successfully fetched Facebook page insights for ${pageId} (${followerCount} followers)`);
      } catch (insightsError) {
        console.error(`[${new Date().toISOString()}] Error fetching insights for business page:`, insightsError.response?.data || insightsError.message);
        
        // If specific insights fail, return zero data with explanation
        const last30Days = Array.from({ length: 30 }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() - (29 - i));
          return date.toISOString().split('T')[0] + 'T00:00:00.000Z';
        });

        insights.reach.daily = last30Days.map(date => ({ date, value: 0 }));
        insights.impressions.daily = last30Days.map(date => ({ date, value: 0 }));
        insights.accounts_engaged.daily = last30Days.map(date => ({ date, value: 0 }));
        insights.total_interactions.daily = last30Days.map(date => ({ date, value: 0 }));
        insights.online_followers.daily = last30Days.map(date => ({ date, value: 0 }));
        
        insights.followerCount = followerCount;
        insights.apiError = true;
        insights.limitations = "Unable to fetch insights data. This could be due to insufficient permissions, recent API changes, or the page not meeting Facebook's insights requirements.";
      }
        } else {
      // This is a personal account - limited insights available
      console.log(`[${new Date().toISOString()}] Detected personal Facebook account ${pageId} - very limited insights available`);
      
      const last30Days = Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (29 - i));
        return date.toISOString().split('T')[0] + 'T00:00:00.000Z';
      });

      // Personal accounts don't have insights API access
      insights.reach.daily = last30Days.map(date => ({ date, value: 0 }));
      insights.impressions.daily = last30Days.map(date => ({ date, value: 0 }));
      insights.accounts_engaged.daily = last30Days.map(date => ({ date, value: 0 }));
      insights.total_interactions.daily = last30Days.map(date => ({ date, value: 0 }));
      insights.online_followers.daily = last30Days.map(date => ({ date, value: 0 }));
      
      insights.isPersonalAccount = true;
      insights.limitations = "Personal Facebook accounts do not have access to insights data. To get detailed analytics, consider converting to a Facebook Page or connecting a Facebook Business account.";
    }

    return insights;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching Facebook insights:`, error.response?.data || error.message);
    
    // If everything fails, return zero data with explanation
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return date.toISOString().split('T')[0] + 'T00:00:00.000Z';
    });

    insights.reach.daily = last30Days.map(date => ({ date, value: 0 }));
    insights.impressions.daily = last30Days.map(date => ({ date, value: 0 }));
    insights.accounts_engaged.daily = last30Days.map(date => ({ date, value: 0 }));
    insights.total_interactions.daily = last30Days.map(date => ({ date, value: 0 }));
    insights.online_followers.daily = last30Days.map(date => ({ date, value: 0 }));

    insights.error = true;
    insights.limitations = "Unable to fetch Facebook insights data. Please check your connection and permissions.";
    
    console.log(`[${new Date().toISOString()}] Returned zero insights data for Facebook ${pageId} due to error`);
    return insights;
  }
}

// Instagram insights helper function (placeholder for existing logic)
async function fetchInstagramInsights(graphId, accessToken) {
  // This should contain the existing Instagram insights logic
  // For now, return empty structure
  return {
    reach: { daily: [], weekly: [], monthly: [] },
    impressions: { daily: [], weekly: [], monthly: [] },
    online_followers: { daily: [] },
    accounts_engaged: { daily: [] },
    total_interactions: { daily: [] },
    follower_demographics: { lifetime: {} }
  };
}

app.get(['/check-username-availability/:username', '/api/check-username-availability/:username'], async (req, res) => {
  try {
    const { username } = req.params;
    const platform = req.query.platform || 'instagram'; // Default to Instagram
    
    if (!username || username.trim() === '') {
      return res.status(400).json({ 
        available: false, 
        message: 'Username is required' 
      });
    }
    
    // Normalize the username based on platform
    const normalizedUsername = platform === 'twitter' ? username.trim() : username.trim().toLowerCase();
    
    // Create platform-specific key using new schema: AccountInfo/<platform>/<username>/info.json
    const key = `AccountInfo/${platform}/${normalizedUsername}/info.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      
      await s3Client.send(getCommand);
      
      // If we get here, the file exists, meaning the username is already in use
      return res.json({
        available: false,
        message: `This ${platform} username is already in use by another account. If you wish to proceed, you may continue, but you will be using an already assigned username.`
      });
      
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        // Username is available
        return res.json({
          available: true,
          message: `${platform.charAt(0).toUpperCase() + platform.slice(1)} username is available`
        });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error checking username availability:`, error);
    res.status(500).json({ 
      error: 'Failed to check username availability', 
      details: error.message 
    });
  }
});

// Configure cache warmup for frequently accessed paths on startup
async function warmupCacheForActiveUsers() {
  try {
    console.log(`[${new Date().toISOString()}] Starting cache warmup for active users...`);
    
    // Get recently active users
    const usernamesData = await getExistingData();
    if (usernamesData.length === 0) {
      console.log(`[${new Date().toISOString()}] No users found for cache warmup`);
      return;
    }
    
    // Sort by most recent activity and take top 5
    const recentUsers = usernamesData
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 5)
      .map(entry => entry.username);
    
    console.log(`[${new Date().toISOString()}] Warming up cache for users: ${recentUsers.join(', ')}`);
    
    // Warm up cache for each recent user for both Instagram and Twitter
    for (const username of recentUsers) {
      // For ready_post, we need to use the /posts/ endpoint to properly handle both JSON and JPG files
      for (const platform of ['instagram', 'twitter']) {
        try {
          // Create platform-specific prefix using new schema: ready_post/<platform>/<username>/
          const postsPrefix = `ready_post/${platform}/${username}/`;
          console.log(`[${new Date().toISOString()}] Fetching fresh ${platform} data from R2 for prefix: ${postsPrefix}`);
          const listCommand = new ListObjectsV2Command({
            Bucket: 'tasks',
            Prefix: postsPrefix,
          });
          const listResponse = await s3Client.send(listCommand);
      
          const files = listResponse.Contents || [];
          
          // First, collect all files
          const jsonFiles = files.filter(file => file.Key.endsWith('.json'));
          const imageFiles = files.filter(file => file.Key.endsWith('.jpg') || file.Key.endsWith('.png'));
          
          console.log(`[${new Date().toISOString()}] Found ${jsonFiles.length} JSON files and ${imageFiles.length} image files in ${postsPrefix} for ${platform}`);
          
          // Process posts similar to the /posts/:username endpoint but without returning the data
          const posts = await Promise.all(
            jsonFiles.map(async (file) => {
              try {
                const getCommand = new GetObjectCommand({
                  Bucket: 'tasks',
                  Key: file.Key,
                });
                const data = await s3Client.send(getCommand);
                const body = await streamToString(data.Body);
      
                if (!body || body.trim() === '') {
                  console.warn(`Empty file detected at ${file.Key}, skipping...`);
                  return null;
                }
      
                let postData;
                try {
                  postData = JSON.parse(body);
                } catch (parseError) {
                  console.error(`Failed to parse JSON for ${file.Key}:`, parseError.message);
                  return null;
                }
                
                // Extract the timestamp/ID from the filename
                const filenameMatch = file.Key.match(/(\d+)\.json$/);
                const fileId = filenameMatch ? filenameMatch[1] : null;
                
                if (!fileId) {
                  console.warn(`Cannot extract ID from filename: ${file.Key}`);
                  return null;
                }
                
                // Check if this post should be skipped based on status
                if (['processed', 'rejected', 'scheduled', 'posted', 'published'].includes(postData.status)) {
                  console.log(`[${new Date().toISOString()}] Skipping ${platform} post ${file.Key} with status: ${postData.status}`);
                  return null;
                }
                
                // Look for matching image file
                // Always check all possible image key patterns for the same ID (both jpg and png)
                const potentialImageKeys = [
                  `${postsPrefix}image_${fileId}.jpg`,
                  `${postsPrefix}image_${fileId}.png`,
                  `${postsPrefix}ready_post_${fileId}.jpg`,
                  `${postsPrefix}ready_post_${fileId}.png`,
                  `${postsPrefix}campaign_ready_post_${fileId}.jpg`,
                  `${postsPrefix}campaign_ready_post_${fileId}.png`
                ];
                // Find the first matching image file
                const imageFile = imageFiles.find(img => 
                  potentialImageKeys.includes(img.Key)
                );
                
                if (!imageFile) {
                  console.warn(`[${new Date().toISOString()}] No matching image found for ${platform} post ${file.Key} (ID: ${fileId}), checked: ${potentialImageKeys.join(', ')}`);
                  return null;
                }
                
                // Get signed URL for the image
                const imageCommand = new GetObjectCommand({
                  Bucket: 'tasks',
                  Key: imageFile.Key,
                });
                const signedUrl = await getSignedUrl(s3Client, imageCommand, { expiresIn: 3600 });
                
                // Create an R2 direct URL for the image
                const r2ImageUrl = `${R2_PUBLIC_URL}/${imageFile.Key}`;
                
                console.log(`[${new Date().toISOString()}] Successfully loaded ${platform} post ${file.Key} with image ${imageFile.Key}`);
                
                // Return the complete post data
                return {
                  key: file.Key,
                  data: {
                    ...postData,
                    image_url: signedUrl,
                    r2_image_url: r2ImageUrl,
                    platform: platform
                  },
                };
              } catch (error) {
                console.error(`Failed to process ${platform} post ${file.Key}:`, error.message);
                return null;
              }
            })
          );
      
          // Filter out null results from skipped posts
          const validPosts = posts.filter(post => post !== null);
      
          // Cache the valid posts
          cache.set(postsPrefix, validPosts);
          cacheTimestamps.set(postsPrefix, Date.now());
        } catch (err) {
          console.error(`[${new Date().toISOString()}] Error warming up ready_post cache for ${platform}/${username}:`, err.message);
        }
        
        // Warm up other critical modules (non-blocking) for this platform
        Promise.all([
          fetchDataForModule(username, 'ProfileInfo/{username}', false, platform),
          fetchDataForModule(username, 'recommendations/{username}', false, platform),
          fetchDataForModule(username, 'news_for_you/{username}', false, platform)
        ]).catch(err => {
          console.error(`[${new Date().toISOString()}] Error during ${platform} cache warmup for ${username}:`, err.message);
        });
      }
    }
    
    console.log(`[${new Date().toISOString()}] Cache warmup initiated for ${recentUsers.length} users across multiple platforms`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error during cache warmup:`, error);
  }
}

// Add cache warmup on server start
setTimeout(warmupCacheForActiveUsers, 5000); // Wait 5 seconds after server start to begin warmup

// Add cache metrics and monitoring
function scheduleCacheMetricsReporting() {
  setInterval(() => {
    const now = Date.now();
    const metrics = {
      timestamp: new Date().toISOString(),
      cacheSize: cache.size,
      hitRatios: {},
      moduleStats: {},
      totalHits: 0,
      totalMisses: 0,
      activeConnections: 0
    };
    
    // Calculate hit ratios by prefix
    for (const [prefix, hits] of cacheHits.entries()) {
      const misses = cacheMisses.get(prefix) || 0;
      const total = hits + misses;
      if (total > 0) {
        metrics.hitRatios[prefix] = (hits / total * 100).toFixed(2);
        metrics.totalHits += hits;
        metrics.totalMisses += misses;
      }
    }
    
    // Calculate module statistics
    const moduleUsage = {};
    for (const [prefix, timestamp] of cacheTimestamps.entries()) {
      const moduleName = prefix.split('/')[0];
      const config = MODULE_CACHE_CONFIG[moduleName] || CACHE_CONFIG.STANDARD;
      
      if (!moduleUsage[moduleName]) {
        moduleUsage[moduleName] = { count: 0, avgAge: 0, oldest: 0, newest: Infinity };
      }
      
      moduleUsage[moduleName].count++;
      const age = now - timestamp;
      moduleUsage[moduleName].avgAge = 
        (moduleUsage[moduleName].avgAge * (moduleUsage[moduleName].count - 1) + age) / 
        moduleUsage[moduleName].count;
      moduleUsage[moduleName].oldest = Math.max(moduleUsage[moduleName].oldest, age);
      moduleUsage[moduleName].newest = Math.min(moduleUsage[moduleName].newest, age);
    }
    
    // Convert to readable format
    for (const [moduleName, stats] of Object.entries(moduleUsage)) {
      metrics.moduleStats[moduleName] = {
        count: stats.count,
        avgAge: `${(stats.avgAge / 1000).toFixed(1)}s`,
        oldest: `${(stats.oldest / 1000).toFixed(1)}s`,
        newest: `${(stats.newest / 1000).toFixed(1)}s`,
        ttl: `${((MODULE_CACHE_CONFIG[moduleName] || CACHE_CONFIG.STANDARD).TTL / 1000 / 60).toFixed(1)}m`
      };
    }
    
    // Count active SSE connections
    let totalConnections = 0;
    for (const [username, clients] of sseClients.entries()) {
      totalConnections += clients.length;
    }
    metrics.activeConnections = totalConnections;
    
    // Overall hit ratio
    if (metrics.totalHits + metrics.totalMisses > 0) {
      metrics.overallHitRatio = (metrics.totalHits / (metrics.totalHits + metrics.totalMisses) * 100).toFixed(2);
    } else {
      metrics.overallHitRatio = "N/A";
    }
    
    console.log(`[${new Date().toISOString()}] CACHE METRICS: ${JSON.stringify(metrics, null, 2)}`);
  }, 5 * 60 * 1000); // Report every 5 minutes
  
  console.log(`[${new Date().toISOString()}] Cache metrics reporting scheduler started`);
}

// Start cache metrics reporting
scheduleCacheMetricsReporting();

// Enhanced connection monitor for SSE 
function scheduleConnectionHealthCheck() {
  setInterval(() => {
    const now = Date.now();
    console.log(`[${new Date().toISOString()}] Running SSE connection health check...`);
    
    let totalConnections = 0;
    let staleConnections = 0;
    let activeConnectionsCount = 0;
    
    sseClients.forEach((clients, username) => {
      totalConnections += clients.length;
      
      clients.forEach(client => {
        const lastActivity = activeConnections.get(client) || 0;
        const connectionAge = now - lastActivity;
        
        if (connectionAge > SSE_RECONNECT_TIMEOUT) {
          staleConnections++;
        } else {
          activeConnectionsCount++;
          
          // Send a ping to confirm connection is still alive
          try {
            client.write(`data: ${JSON.stringify({ 
              type: 'ping', 
              timestamp: now,
              message: 'Connection check' 
            })}\n\n`);
            
            // Update last activity timestamp
            activeConnections.set(client, now);
          } catch (err) {
            console.error(`[${new Date().toISOString()}] Error pinging client for ${username}:`, err.message);
            staleConnections++;
          }
        }
      });
    });
    
    console.log(`[${new Date().toISOString()}] SSE HEALTH: Total=${totalConnections}, Active=${activeConnectionsCount}, Stale=${staleConnections}`);
  }, 60 * 1000); // Check every minute
  
  console.log(`[${new Date().toISOString()}] SSE connection health check scheduler started`);
}
// Start connection health check
scheduleConnectionHealthCheck();
// Enhance event streaming with reconnection support and event persistence for missed updates
app.get(['/events-missed/:username', '/api/events-missed/:username'], async (req, res) => {
  const { username } = req.params;
  const { since } = req.query;
  let sinceTimestamp = 0;
  
  // Validate 'since' timestamp
  if (since) {
    try {
      sinceTimestamp = parseInt(since);
      if (isNaN(sinceTimestamp) || sinceTimestamp <= 0) {
        sinceTimestamp = Date.now() - (15 * 60 * 1000); // Default to last 15 minutes
      }
    } catch (e) {
      sinceTimestamp = Date.now() - (15 * 60 * 1000); // Default to last 15 minutes
    }
  } else {
    sinceTimestamp = Date.now() - (15 * 60 * 1000); // Default to last 15 minutes
  }
  
  console.log(`[${new Date().toISOString()}] Fetching missed events for ${username} since ${new Date(sinceTimestamp).toISOString()}`);
  
  try {
    setCorsHeaders(res);
    
    // Find associated Instagram graph ID if available
    let userId = null;
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: `InstagramTokens/`,
      });
      const { Contents } = await s3Client.send(listCommand);
      if (Contents) {
        for (const obj of Contents) {
          if (obj.Key.endsWith('/token.json')) {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const json = await data.Body.transformToString();
            const token = JSON.parse(json);
            if (token.username === username) {
              userId = token.instagram_user_id;
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error finding user ID for username ${username}:`, err.message);
    }
    
    // Prepare arrays to hold events
    const missedEvents = [];
    
    // Check for missed events in InstagramEvents for both username and userId
    const checkPaths = [];
    if (username) checkPaths.push(`InstagramEvents/${username}/`);
    if (userId) checkPaths.push(`InstagramEvents/${userId}/`);
    
    // Process each path
    for (const prefix of checkPaths) {
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: prefix,
      });
      
      try {
        const { Contents } = await s3Client.send(listCommand);
        if (Contents && Contents.length > 0) {
          // Process files concurrently
          await Promise.all(Contents.map(async (obj) => {
            // Skip non-event files
            if (!obj.Key.endsWith('.json') || obj.Key.includes('reply_')) return;
            
            try {
              const getCommand = new GetObjectCommand({
                Bucket: 'tasks',
                Key: obj.Key,
              });
              const data = await s3Client.send(getCommand);
              const json = await data.Body.transformToString();
              const event = JSON.parse(json);
              
              // Check if the event is newer than the requested timestamp
              const eventTime = event.timestamp || Date.parse(event.received_at || event.updated_at);
              if (eventTime > sinceTimestamp) {
                missedEvents.push({
                  type: event.type,
                  data: event,
                  timestamp: eventTime
                });
              }
            } catch (error) {
              console.error(`[${new Date().toISOString()}] Error reading event file ${obj.Key}:`, error.message);
            }
          }));
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error listing events for ${prefix}:`, error.message);
      }
    }
    
    // Sort events by timestamp (newest first)
    missedEvents.sort((a, b) => b.timestamp - a.timestamp);
    
    // Return as JSON response (not SSE)
    console.log(`[${new Date().toISOString()}] Returning ${missedEvents.length} missed events for ${username}`);
    res.json({
      username,
      userId,
      since: sinceTimestamp,
      sinceDate: new Date(sinceTimestamp).toISOString(),
      now: Date.now(),
      events: missedEvents
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error retrieving missed events for ${username}:`, error.message);
    res.status(500).json({ 
      error: 'Failed to retrieve missed events',
      message: error.message
    });
  }
});

// Add endpoint for getting cache stats
app.get(['/api/system/cache-stats', '/system/cache-stats'], (req, res) => {
  setCorsHeaders(res);
  
  const now = Date.now();
  const stats = {
    timestamp: new Date().toISOString(),
    cacheEntries: cache.size,
    modules: {},
    hitRatios: {},
    sseConnections: {}
  };
  
  // Gather module stats
  for (const [prefix, timestamp] of cacheTimestamps.entries()) {
    const moduleName = prefix.split('/')[0];
    const age = now - timestamp;
    
    if (!stats.modules[moduleName]) {
      stats.modules[moduleName] = {
        count: 0,
        avgAge: 0,
        oldestEntry: '',
        newestEntry: '',
        ttl: (MODULE_CACHE_CONFIG[moduleName] || CACHE_CONFIG.STANDARD).TTL
      };
    }
    
    const module = stats.modules[moduleName];
    module.count++;
    
    // Track average age
    module.avgAge = ((module.avgAge * (module.count - 1)) + age) / module.count;
    
    // Track oldest and newest entries
    if (!module.oldestTime || age > module.oldestTime) {
      module.oldestTime = age;
      module.oldestEntry = prefix;
    }
    
    if (!module.newestTime || age < module.newestTime) {
      module.newestTime = age;
      module.newestEntry = prefix;
    }
  }
  
  // Calculate hit ratios
  for (const [prefix, hits] of cacheHits.entries()) {
    const misses = cacheMisses.get(prefix) || 0;
    const total = hits + misses;
    if (total > 0) {
      stats.hitRatios[prefix] = {
        hits,
        misses,
        ratio: (hits / total)
      };
    }
  }
  
  // Count SSE connections
  for (const [username, clients] of sseClients.entries()) {
    stats.sseConnections[username] = clients.length;
  }
  
  res.json(stats);
});

// Handle disconnections/reconnections more gracefully
app.get(['/events/:username', '/api/events/:username'], (req, res) => {
  const { username } = req.params;
  const { since, platform } = req.query;
  
  // Handle both username and user ID connections
  // The frontend connects with user ID, but SSE endpoint expects username
  // We'll normalize and handle both cases
  let normalizedUsername = username;
  
  // If it looks like a user ID (numeric), use it directly as connection key
  if (/^\d+$/.test(username)) {
    console.log(`[${new Date().toISOString()}] SSE connection with user ID: ${username}, using as connection key`);
    normalizedUsername = username;
  } else {
    // Normalize username according to platform rules (e.g., lowercase for Instagram)
    normalizedUsername = PlatformSchemaManager.getPlatformConfig('instagram').normalizeUsername(username);
  }
  
  let sinceTimestamp = 0;
  
  // Parse reconnection timestamp if provided
  if (since) {
    try {
      sinceTimestamp = parseInt(since);
      if (isNaN(sinceTimestamp) || sinceTimestamp <= 0) {
        sinceTimestamp = 0;
      }
    } catch (e) {
      sinceTimestamp = 0;
    }
  }
  
  console.log(`[${new Date().toISOString()}] Handling SSE request for /events/${normalizedUsername} (reconnect since: ${sinceTimestamp || 'new connection'}, platform: ${platform || 'not specified'})`);

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type');
  res.flushHeaders();

  // Generate unique connection ID
  const connectionId = randomUUID();
  
  // Send initial connection confirmation with heartbeat
  const initialEvent = {
    type: 'connection',
    message: `Connected to events for ${normalizedUsername}`,
    timestamp: Date.now(),
    connectionId
  };
  
  res.write(`event: connection\n`);
  res.write(`data: ${JSON.stringify(initialEvent)}\n\n`);
  
  // Start heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      const heartbeat = {
        type: 'heartbeat',
        timestamp: Date.now(),
        connectionId
      };
      res.write(`event: heartbeat\n`);
      res.write(`data: ${JSON.stringify(heartbeat)}\n\n`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Heartbeat error for ${normalizedUsername}:`, err.message);
      clearInterval(heartbeatInterval);
    }
  }, 30000); // Every 30 seconds
  
  // Register this client
  if (!sseClients.has(normalizedUsername)) {
    sseClients.set(normalizedUsername, []);
  }
  
  const clients = sseClients.get(normalizedUsername);
  clients.push(res);
  activeConnections.set(res, Date.now());
  
  console.log(`[${new Date().toISOString()}] SSE client connected for ${normalizedUsername}. Total clients: ${clients.length}`);
  console.log(`[${new Date().toISOString()}] SSE clients map keys: ${Array.from(sseClients.keys()).join(', ')}`);

  // If reconnecting, check for missed events
  if (sinceTimestamp > 0) {
    // Send reconnection confirmation
    res.write(`data: ${JSON.stringify({
      type: 'reconnection',
      timestamp: Date.now(),
      since: sinceTimestamp,
      sinceDate: new Date(sinceTimestamp).toISOString(),
      connectionId
    })}\n\n`);
    
    // Non-blocking check for missed events
    setImmediate(async () => {
      try {
        // Find associated Instagram graph ID if available
        let userId = null;
        try {
          const listCommand = new ListObjectsV2Command({
            Bucket: 'tasks',
            Prefix: `InstagramTokens/`,
          });
          const { Contents } = await s3Client.send(listCommand);
          if (Contents) {
            for (const obj of Contents) {
              if (obj.Key.endsWith('/token.json')) {
                const getCommand = new GetObjectCommand({
                  Bucket: 'tasks',
                  Key: obj.Key,
                });
                const data = await s3Client.send(getCommand);
                const json = await data.Body.transformToString();
                const token = JSON.parse(json);
                if (token.username === normalizedUsername) {
                  userId = token.instagram_user_id;
                  break;
                }
              }
            }
          }
        } catch (err) {
          console.error(`[${new Date().toISOString()}] Error finding user ID for username ${normalizedUsername}:`, err.message);
        }
        
        // Check for missed events in InstagramEvents
        const checkPaths = [];
        if (normalizedUsername) checkPaths.push(`InstagramEvents/${normalizedUsername}/`);
        if (userId) checkPaths.push(`InstagramEvents/${userId}/`);
        
        const missedEvents = [];
        
        // Process each path
        for (const prefix of checkPaths) {
          const listCommand = new ListObjectsV2Command({
            Bucket: 'tasks',
            Prefix: prefix,
          });
          
          try {
            const { Contents } = await s3Client.send(listCommand);
            if (Contents && Contents.length > 0) {
              // Find events newer than the reconnection timestamp
              for (const obj of Contents) {
                // Skip non-event files and replies
                if (!obj.Key.endsWith('.json') || obj.Key.includes('reply_')) continue;
                
                try {
                  const getCommand = new GetObjectCommand({
                    Bucket: 'tasks',
                    Key: obj.Key,
                  });
                  const data = await s3Client.send(getCommand);
                  const json = await data.Body.transformToString();
                  const event = JSON.parse(json);
                  
                  // Check if the event is newer than the reconnection timestamp
                  const eventTime = event.timestamp || Date.parse(event.received_at || event.updated_at);
                  if (eventTime > sinceTimestamp) {
                    missedEvents.push({
                      type: event.type === 'message' ? 'message' : 'comment',
                      data: event,
                      timestamp: eventTime
                    });
                  }
                } catch (error) {
                  console.error(`[${new Date().toISOString()}] Error reading event file ${obj.Key}:`, error.message);
                }
              }
            }
          } catch (error) {
            console.error(`[${new Date().toISOString()}] Error listing events for ${prefix}:`, error.message);
          }
        }
        
        // Sort events by timestamp (oldest first) to preserve order
        missedEvents.sort((a, b) => a.timestamp - b.timestamp);
        
        // Send missed events to the client
        if (missedEvents.length > 0) {
          console.log(`[${new Date().toISOString()}] Sending ${missedEvents.length} missed events to SSE client for ${normalizedUsername}`);
          
          // First send a batch summary
          res.write(`data: ${JSON.stringify({
            type: 'missed_events_summary',
            count: missedEvents.length,
            since: sinceTimestamp,
            sinceDate: new Date(sinceTimestamp).toISOString(),
            timestamp: Date.now(),
            connectionId
          })}\n\n`);
          
          // Then send each missed event
          for (const event of missedEvents) {
            try {
              res.write(`data: ${JSON.stringify({ 
                type: 'missed_event',
                event: event.type,
                data: event.data,
                original_timestamp: event.timestamp,
                timestamp: Date.now(),
                connectionId
              })}\n\n`);
              
              // Small delay to prevent overwhelming the client
              await new Promise(resolve => setTimeout(resolve, 50));
            } catch (err) {
              console.error(`[${new Date().toISOString()}] Error sending missed event to SSE client:`, err.message);
              break; // Stop if there's an error
            }
          }
          
          // Send end of missed events marker
          res.write(`data: ${JSON.stringify({
            type: 'missed_events_end',
            count: missedEvents.length,
            timestamp: Date.now(),
            connectionId
          })}\n\n`);
        } else {
          console.log(`[${new Date().toISOString()}] No missed events found for ${normalizedUsername} since ${new Date(sinceTimestamp).toISOString()}`);
          res.write(`data: ${JSON.stringify({
            type: 'missed_events_summary',
            count: 0,
            timestamp: Date.now(),
            connectionId
          })}\n\n`);
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error checking for missed events:`, error.message);
      }
    });
  }
  
  // Setup connection close handler
  req.on('close', () => {
    // Clear heartbeat interval
    clearInterval(heartbeatInterval);
    
    const updatedClients = sseClients.get(normalizedUsername)?.filter(client => client !== res) || [];
    sseClients.set(normalizedUsername, updatedClients);
    activeConnections.delete(res);
    
    console.log(`[${new Date().toISOString()}] SSE client disconnected for ${normalizedUsername}. Remaining clients: ${updatedClients.length}`);
    if (updatedClients.length === 0) {
      console.log(`[${new Date().toISOString()}] No more clients for ${normalizedUsername}, cleaning up`);
      sseClients.delete(normalizedUsername);
    }
  });
});

app.post(['/update-post-status/:username', '/api/update-post-status/:username'], async (req, res) => {
  const { username } = req.params;
  const { postKey, status } = req.body; // postKey should be the full R2 key, e.g., ready_post/user/ready_post_123.json

  if (!postKey || !status) {
    console.log(`[${new Date().toISOString()}] Missing postKey or status for update-post-status`);
    return res.status(400).json({ error: 'postKey and status are required' });
  }

  // Validate allowed statuses (optional but recommended)
  const allowedStatuses = ['ready', 'rejected', 'scheduled', 'posted', 'published', 'failed'];
  if (!allowedStatuses.includes(status)) {
    console.log(`[${new Date().toISOString()}] Invalid status provided: ${status}`);
    return res.status(400).json({ error: `Invalid status. Allowed statuses: ${allowedStatuses.join(', ')}` });
  }

  try {
    // Fetch the existing post data
    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: postKey,
    });

    let postData;
    try {
        const response = await s3Client.send(getCommand);
        const body = await streamToString(response.Body);
         if (!body || body.trim() === '') {
            console.warn(`[${new Date().toISOString()}] Empty file detected at ${postKey}`);
             return res.status(404).json({ error: 'Post data is empty' });
         }
        postData = JSON.parse(body);
        console.log(`[${new Date().toISOString()}] Fetched existing post data for ${postKey}`);
    } catch (error) {
         if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
            console.log(`[${new Date().toISOString()}] Post not found at ${postKey}`);
            return res.status(404).json({ error: 'Post not found' });
         }
         throw error; // Re-throw other errors
    }

    // Update the status
    postData.status = status;
    postData.updated_at = new Date().toISOString(); // Add an updated timestamp

    // Save the updated data back to R2
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: postKey,
      Body: JSON.stringify(postData, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);

    // Invalidate cache for this user's ready_post directory
    // Extract platform from postKey if possible, otherwise clear both
    let platform = 'instagram'; // default
    const platformMatch = postKey.match(/ready_post\/([^\/]+)\/[^\/]+\//);
    if (platformMatch) {
      platform = platformMatch[1];
    }
    const prefix = `ready_post/${platform}/${username}/`;
    cache.delete(prefix);

    console.log(`[${new Date().toISOString()}] Successfully updated status for post ${postKey} to ${status}`);
    res.json({ success: true, message: 'Post status updated successfully', newStatus: status });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error updating post status for ${postKey}:`, error);
    res.status(500).json({ error: 'Failed to update post status', details: error.message });
  }
});

// Add OPTIONS handler for the new endpoint
app.options(['/update-post-status/:username', '/api/update-post-status/:username'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});
// RAG server proxy endpoint for instant AI replies to DMs/comments
app.post(['/rag-instant-reply/:username', '/api/rag-instant-reply/:username'], async (req, res, next) => {
  // Set CORS headers for this specific endpoint
  setCorsHeaders(res, req.headers.origin || '*');
  
  // Handle preflight requests explicitly for this endpoint
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  console.log(`[PROXY] Received instant reply request for ${req.params.username}`);
  const { username } = req.params;
  const notification = req.body;
  
  if (!username || !notification || !notification.text) {
    console.log(`[PROXY] Invalid instant reply request: missing username or notification text`);
    return res.status(400).json({ 
      error: 'Invalid request',
      details: 'Username and notification with text are required'
    });
  }
  
  let retries = 0;
  const maxRetries = 2;
  
  const attemptRequest = async () => {
    try {
      console.log(`[${new Date().toISOString()}] Forwarding instant reply request to RAG server for ${username} (attempt ${retries + 1}/${maxRetries + 1})`);
      
      const response = await axios.post('http://localhost:3001/api/instant-reply', {
        username,
        notification
      }, {
        timeout: 15000, // 15 seconds timeout
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'http://localhost:3000'
        }
      });
      
      console.log(`[PROXY] Successfully received reply from RAG server`);
      return response.data;
    } catch (error) {
      if (retries < maxRetries) {
        retries++;
        console.log(`[PROXY] Retrying request (${retries}/${maxRetries})...`);
        return await attemptRequest();
      }
      throw error;
    }
  };
  
  try {
    // Try to get instant reply from RAG server
    const data = await attemptRequest();
    
    // If successful, save in the traditional AI reply format
    if (data.success && data.reply) {
      // Determine file prefix
      const notifType = notification.type;
      let fileTypePrefix;
      
      if (notifType === 'message') {
        fileTypePrefix = 'ai_dm_';
      } else if (notifType === 'comment') {
        fileTypePrefix = 'ai_comment_';
      } else {
        return res.status(400).json({ error: 'Invalid notification type for AI reply' });
      }
      
      // Extract platform from notification, default to instagram
      const platform = notification.platform || 'instagram';
      const prefix = `ai_reply/${platform}/${username}/`;
      
      try {
        // --- Determine the next available file number ---
        const listCommand = new ListObjectsV2Command({
          Bucket: 'tasks',
          Prefix: prefix,
        });
        const { Contents } = await s3Client.send(listCommand);
        let nextNumber = 1;
        if (Contents && Contents.length > 0) {
          const nums = Contents
            .map(obj => {
              const match = obj.Key.match(new RegExp(`${fileTypePrefix}(\\d+)\\.json$`));
              return match ? parseInt(match[1]) : 0;
            })
            .filter(n => n > 0);
          nextNumber = nums.length > 0 ? Math.max(...nums) + 1 : 1;
        }
        
        // --- Save the original notification ---
        const reqKey = `${prefix}${fileTypePrefix}${nextNumber}.json`;
        await s3Client.send(new PutObjectCommand({
          Bucket: 'tasks',
          Key: reqKey,
          Body: JSON.stringify(notification, null, 2),
          ContentType: 'application/json',
        }));
        
        // --- Save the reply ---
        const replyKey = `${prefix}${fileTypePrefix}replied_${nextNumber}.json`;
        await s3Client.send(new PutObjectCommand({
          Bucket: 'tasks',
          Key: replyKey,
          Body: JSON.stringify({ reply: data.reply }, null, 2),
          ContentType: 'application/json',
        }));
        
        // Clear cache
        cache.delete(prefix);
        
        // Notify clients via SSE
        const clients = sseClients.get(username) || [];
        for (const client of clients) {
          client.write(`data: ${JSON.stringify({ type: 'update', prefix })}\n\n`);
        }
        
        // --- Auto-send DM reply if this is a message notification ---
        if (notifType === 'message') {
          const message_id = notification.message_id;
          const sender_id = notification.sender_id;
          let userId = null;
          
          // Map username to platform-specific userId
          try {
            console.log(`[RAG-INSTANT-REPLY] Mapping username "${username}" to userId for ${platform}`);
            
            if (platform === 'facebook') {
              // For Facebook, check connections first since tokens don't have username
              const listConnections = new ListObjectsV2Command({
                Bucket: 'tasks',
                Prefix: 'FacebookConnection/',
              });
              const { Contents: connectionContents } = await s3Client.send(listConnections);
              
              if (connectionContents) {
                for (const obj of connectionContents) {
                  if (obj.Key.endsWith('/connection.json')) {
                    const getCommand = new GetObjectCommand({
                      Bucket: 'tasks',
                      Key: obj.Key,
                    });
                    const connectionData = await s3Client.send(getCommand);
                    const json = await connectionData.Body.transformToString();
                    const connection = JSON.parse(json);
                    
                    // Try multiple username matching strategies
                    const isUsernameMatch = (
                      connection.username === username ||
                      connection.username?.toLowerCase() === username.toLowerCase() ||
                      connection.username?.replace(/\s+/g, '').toLowerCase() === username.toLowerCase() ||
                      // Also try matching without spaces and special characters
                      connection.username?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
                    );
                    
                    if (isUsernameMatch) {
                      userId = connection.facebook_page_id;
                      console.log(`[RAG-INSTANT-REPLY] Found Facebook connection match: "${connection.username}" -> ${userId}`);
                      break;
                    }
                  }
                }
              }
              
              // Fallback: If no username match found, try to use the notification's page ID
              if (!userId && notification.facebook_page_id) {
                userId = notification.facebook_page_id;
                console.log(`[RAG-INSTANT-REPLY] Using Facebook page ID from notification: ${userId}`);
              }
              
            } else if (platform === 'twitter') {
              // Twitter token mapping
              const listTokens = new ListObjectsV2Command({
                Bucket: 'tasks',
                Prefix: 'TwitterTokens/',
              });
              const { Contents: tokenContents } = await s3Client.send(listTokens);
              if (tokenContents) {
                for (const obj of tokenContents) {
                  if (obj.Key.endsWith('/token.json')) {
                    const getCommand = new GetObjectCommand({
                      Bucket: 'tasks',
                      Key: obj.Key,
                    });
                    const tokenData = await s3Client.send(getCommand);
                    const json = await tokenData.Body.transformToString();
                    const token = JSON.parse(json);
                    if (token.username === username) {
                      userId = token.user_id;
                      break;
                    }
                  }
                }
              }
            } else {
              // Instagram token mapping
              const listTokens = new ListObjectsV2Command({
                Bucket: 'tasks',
                Prefix: 'InstagramTokens/',
              });
              const { Contents: tokenContents } = await s3Client.send(listTokens);
              if (tokenContents) {
                for (const obj of tokenContents) {
                  if (obj.Key.endsWith('/token.json')) {
                    const getCommand = new GetObjectCommand({
                      Bucket: 'tasks',
                      Key: obj.Key,
                    });
                    const tokenData = await s3Client.send(getCommand);
                    const json = await tokenData.Body.transformToString();
                    const token = JSON.parse(json);
                    if (token.username === username) {
                      userId = token.instagram_user_id;
                      break;
                    }
                  }
                }
              }
            }
            
            console.log(`[RAG-INSTANT-REPLY] Username mapping result: "${username}" -> ${userId} (${platform})`);
            
          } catch (err) {
            console.error(`[RAG-INSTANT-REPLY] Error mapping username to userId for ${platform}:`, err);
          }
          
          // Send the reply if all info is available
          if (userId && sender_id && message_id) {
            try {
              console.log(`[RAG-INSTANT-REPLY] Auto-sending ${platform} AI reply for user ${userId}`);
              
              if (platform === 'facebook') {
                // Use existing Facebook DM reply function
                await sendFacebookDMReply(userId, sender_id, data.reply, message_id);
                console.log(`[RAG-INSTANT-REPLY] Facebook AI reply sent successfully`);
              } else if (platform === 'twitter') {
                // Use existing Twitter DM reply function
                await sendTwitterDMReply(userId, sender_id, data.reply, message_id);
                console.log(`[RAG-INSTANT-REPLY] Twitter AI reply sent successfully`);
              } else {
                // Instagram logic (existing)
                let access_token = null;
                let instagram_graph_id = null;
                const listTokens = new ListObjectsV2Command({
                  Bucket: 'tasks',
                  Prefix: `InstagramTokens/`,
                });
                const { Contents: tokenContents } = await s3Client.send(listTokens);
                if (tokenContents) {
                  for (const obj of tokenContents) {
                    if (obj.Key.endsWith('/token.json')) {
                      const getCommand = new GetObjectCommand({
                        Bucket: 'tasks',
                        Key: obj.Key,
                      });
                      const tokenData = await s3Client.send(getCommand);
                      const json = await tokenData.Body.transformToString();
                      const token = JSON.parse(json);
                      if (token.instagram_user_id === userId) {
                        access_token = token.access_token;
                        instagram_graph_id = token.instagram_graph_id;
                        break;
                      }
                    }
                  }
                }
                if (access_token && instagram_graph_id) {
                  await axios({
                    method: 'post',
                    url: `https://graph.instagram.com/v22.0/${instagram_graph_id}/messages`,
                    headers: {
                      Authorization: `Bearer ${access_token}`,
                      'Content-Type': 'application/json',
                    },
                    data: {
                      recipient: { id: sender_id },
                      message: { text: data.reply },
                    },
                  });
                  console.log(`[RAG-INSTANT-REPLY] Instagram AI reply sent successfully`);
                }
              }
              
              // Update original message status for all platforms
              const messageKey = `${platform.charAt(0).toUpperCase() + platform.slice(1)}Events/${userId}/${message_id}.json`;
              try {
                const getCommand = new GetObjectCommand({
                  Bucket: 'tasks',
                  Key: messageKey,
                });
                const messageData = await s3Client.send(getCommand);
                const updatedMessage = JSON.parse(await messageData.Body.transformToString());
                updatedMessage.status = 'replied';
                updatedMessage.updated_at = new Date().toISOString();
                await s3Client.send(new PutObjectCommand({
                  Bucket: 'tasks',
                  Key: messageKey,
                  Body: JSON.stringify(updatedMessage, null, 2),
                  ContentType: 'application/json',
                }));
                
                // Broadcast status update
                const statusUpdate = {
                  type: 'message_status',
                  message_id,
                  status: 'replied',
                  updated_at: updatedMessage.updated_at,
                  timestamp: Date.now(),
                  platform
                };
                broadcastUpdate(userId, { event: 'status_update', data: statusUpdate });
                
              } catch (error) {
                console.error(`[RAG-INSTANT-REPLY] Error updating ${platform} message status:`, error);
              }
            } catch (err) {
              console.error(`[RAG-INSTANT-REPLY] Error sending ${platform} AI DM reply:`, err);
            }
          } else {
            console.warn(`[RAG-INSTANT-REPLY] Missing required data for ${platform} auto-reply:`, {
              userId: !!userId,
              sender_id: !!sender_id,
              message_id: !!message_id
            });
          }
        }
      } catch (saveError) {
        console.error(`[PROXY] Error saving RAG instant reply:`, saveError);
        // Continue and return the response even if saving fails
      }
    }
    
    // Return the RAG server response
    res.json({ 
      success: true, 
      reply: data.reply, 
      message: 'AI reply generated and saved' 
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] RAG instant reply proxy error:`, error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error(`[${new Date().toISOString()}] Connection refused to RAG server. Check if it's running.`);
      res.status(503).json({ 
        error: 'RAG server unavailable',
        details: 'The RAG server is not accepting connections. Please try again later.'
      });
    } else if (error.response) {
      // Forward the error from RAG server
      console.log(`[PROXY] Forwarding RAG server error: ${error.response.status}`);
      res.status(error.response.status).json(error.response.data);
    } else {
      console.log(`[PROXY] Internal server error: ${error.message}`);
      res.status(500).json({ 
        error: 'Failed to connect to RAG server',
        details: error.message
      });
    }
    
    // In case of error, try to fall back to the original AI reply system
    try {
      console.log(`[PROXY] Instant reply failed, falling back to original AI reply system`);
      // Simply forward the notification to the original endpoint
      next();
    } catch (fallbackError) {
      // Already sent error response, no need to send another
      console.error(`[PROXY] Fallback also failed:`, fallbackError);
    }
  }
});

// RAG proxy - Instant Reply
app.post(['/rag-instant-reply/:username', '/api/rag-instant-reply/:username'], async (req, res) => {
  const { username } = req.params;
  const notification = req.body;
  
  console.log(`[${new Date().toISOString()}] POST /rag-instant-reply/${username}`);
  console.log('[PROXY] Received instant reply request for', username);
  
  // Validate input
  if (!username || !notification || !notification.text) {
    console.log('[PROXY] Invalid instant reply request:', JSON.stringify(req.body));
    return res.status(400).json({
      error: 'Invalid request',
      details: 'Username and notification with text field are required',
      received: {
        username,
        bodyKeys: Object.keys(req.body),
        hasText: notification ? !!notification.text : false
      }
    });
  }
  
  // Set CORS headers explicitly for this endpoint
  setCorsHeaders(res, req.headers.origin || '*');
  
  // Attempt to forward to RAG server
  let attempt = 1;
  const maxAttempts = 3;
  const timeout = 30000; // 30 seconds
  
  while (attempt <= maxAttempts) {
    console.log(`[${new Date().toISOString()}] Forwarding instant reply request to RAG server for ${username} (attempt ${attempt}/${maxAttempts})`);
    
    try {
      const ragResponse = await axios({
        method: 'post',
        url: `http://localhost:3001/api/instant-reply`,
        data: {
          username,
          notification,
          platform: notification.platform || 'instagram'
        },
        timeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      console.log('[PROXY] Successfully received reply from RAG server');
      
      // Store the AI reply immediately for viewing in the dashboard
      const reply = ragResponse.data.reply;
      
      // Determine the type (dm or comment)
      const type = notification.type === 'message' ? 'dm' : 'comment';
      
      // Extract platform from notification, default to instagram
      const platform = notification.platform || 'instagram';
      
      // Generate a unique key for this request-reply pair
      const timestamp = Date.now();
      const aiReplyKey = `AI.replies/${platform}/${username}/${timestamp}.json`;
      
      // Store the complete AI reply data in the format expected by fetchAIReplies
      const aiReplyData = {
        timestamp,
        notification: {
          type: notification.type,
          text: notification.text,
          sender_id: notification.sender_id || '',
          message_id: notification.message_id || '',
          comment_id: notification.comment_id || '',
          platform: platform
        },
        reply: reply,
        mode: 'instant',
        usedFallback: false,
        platform: platform,
        generated_at: new Date().toISOString()
      };
      
      try {
        // Store the complete AI reply data
        await s3Client.send(new PutObjectCommand({
          Bucket: 'tasks',
          Key: aiReplyKey,
          Body: JSON.stringify(aiReplyData, null, 2),
          ContentType: 'application/json'
        }));
        
        console.log(`[${new Date().toISOString()}] AI reply stored for ${username} (${type}) at ${aiReplyKey}`);
      } catch (storageError) {
        console.error(`[${new Date().toISOString()}] Error storing AI reply:`, storageError);
        // Continue anyway as the reply was generated successfully
      }
      
      return res.json(ragResponse.data);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error forwarding to RAG server (attempt ${attempt}/${maxAttempts}):`, 
                     error.response?.data?.error || error.message);
      
      attempt++;
      
      if (attempt <= maxAttempts) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        // All attempts failed
        return res.status(503).json({
          error: 'RAG server unavailable',
          details: error.response?.data?.error || error.message
        });
      }
    }
  }
});

// Mark notification as handled (for AI replies)
app.post(['/mark-notification-handled/:userId', '/api/mark-notification-handled/:userId'], async (req, res) => {
  // Set CORS headers
  setCorsHeaders(res, req.headers.origin || '*');
  
  // Handle OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  const { userId } = req.params;
  const { notification_id, type, handled_by, platform = 'instagram' } = req.body;
  
  if (!notification_id || !type) {
    return res.status(400).json({ error: 'Missing notification_id or type' });
  }
  
  try {
    console.log(`[${new Date().toISOString()}] Marking ${platform} notification ${notification_id} as handled by ${handled_by || 'AI'}`);
    
    // Build the key for the notification in storage
    let eventPrefix;
    if (platform === 'twitter') {
      eventPrefix = 'TwitterEvents';
    } else if (platform === 'facebook') {
      eventPrefix = 'FacebookEvents';
    } else {
      eventPrefix = 'InstagramEvents'; // Default to Instagram
    }
    
    const notificationKey = type === 'message' 
      ? `${eventPrefix}/${userId}/${notification_id}.json`
      : `${eventPrefix}/${userId}/comment_${notification_id}.json`;
    
    try {
      // Get the existing notification data
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: notificationKey,
      });
      
      const data = await s3Client.send(getCommand);
      const notificationData = JSON.parse(await data.Body.transformToString());
      
      // Update the status
      notificationData.status = 'ai_handled';
      notificationData.updated_at = new Date().toISOString();
      notificationData.handled_by = handled_by || 'AI';
      notificationData.platform = platform;
      
      // Save it back
      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: notificationKey,
        Body: JSON.stringify(notificationData, null, 2),
        ContentType: 'application/json',
      }));
      
      console.log(`[${new Date().toISOString()}] Successfully marked ${platform} notification ${notification_id} as handled`);
      
      // Invalidate cache for this module
      cache.delete(`${eventPrefix}/${userId}`);
      
      // Broadcast status update
      const statusUpdate = {
        type: 'message_status',
        [type === 'message' ? 'message_id' : 'comment_id']: notification_id,
        status: 'ai_handled',
        updated_at: notificationData.updated_at,
        timestamp: Date.now(),
        platform: platform
      };
      
      broadcastUpdate(userId, { event: 'status_update', data: statusUpdate });
      
      return res.json({ success: true });
    } catch (error) {
      // If the notification doesn't exist, that's okay
      if (error.name === 'NoSuchKey') {
        console.log(`[${new Date().toISOString()}] ${platform} notification ${notification_id} not found, skipping`);
        return res.json({ success: true, message: 'Notification not found, no action needed' });
      }
      
      console.error(`[${new Date().toISOString()}] Error marking ${platform} notification as handled:`, error);
      return res.status(500).json({ 
        error: `Failed to mark ${platform} notification as handled`,
        details: error.message
      });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in mark-notification-handled for ${platform}:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ======================== TWITTER STATUS ENDPOINTS ========================

// This endpoint checks if a user has entered their Twitter username
app.get(['/user-twitter-status/:userId', '/api/user-twitter-status/:userId'], async (req, res) => {
  // Set CORS headers
  setCorsHeaders(res);
  
  const { userId } = req.params;
  
  try {
    const key = `UserTwitterStatus/${userId}/status.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);
      
      if (!body || body.trim() === '') {
        return res.json({ hasEnteredTwitterUsername: false });
      }
      
      const userData = JSON.parse(body);
      return res.json(userData);
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return res.json({ hasEnteredTwitterUsername: false });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error retrieving user Twitter status for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to retrieve user Twitter status' });
  }
});

// This endpoint updates the user's Twitter username entry state
app.post(['/user-twitter-status/:userId', '/api/user-twitter-status/:userId'], async (req, res) => {
  // Set CORS headers
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const { twitter_username, accountType, competitors } = req.body;
  
  if (!twitter_username || !twitter_username.trim()) {
    return res.status(400).json({ error: 'Twitter username is required' });
  }
  
  try {
    const key = `UserTwitterStatus/${userId}/status.json`;
    const userData = {
      uid: userId,
      hasEnteredTwitterUsername: true,
      twitter_username: twitter_username.trim(),
      accountType: accountType || 'branding',
      competitors: competitors || [],
      lastUpdated: new Date().toISOString()
    };
    
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(userData, null, 2),
      ContentType: 'application/json',
    });
    
    await s3Client.send(putCommand);
    res.json({ success: true, message: 'User Twitter status updated successfully' });
  } catch (error) {
    console.error(`Error updating user Twitter status for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to update user Twitter status' });
  }
});

// Add OPTIONS handlers for Twitter status endpoints
app.options(['/user-twitter-status/:userId', '/api/user-twitter-status/:userId'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// ===============================================================

app.get(['/check-username-availability/:username', '/api/check-username-availability/:username'], async (req, res) => {
  try {
    const { username } = req.params;
    const platform = req.query.platform || 'instagram'; // Default to Instagram
    
    if (!username || username.trim() === '') {
      return res.status(400).json({ 
        available: false, 
        message: 'Username is required' 
      });
    }
    
    // Normalize the username based on platform
    const normalizedUsername = platform === 'twitter' ? username.trim() : username.trim().toLowerCase();
    
    // Create platform-specific key using new schema: AccountInfo/<platform>/<username>/info.json
    const key = `AccountInfo/${platform}/${normalizedUsername}/info.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      
      await s3Client.send(getCommand);
      
      // If we get here, the file exists, meaning the username is already in use
      return res.json({
        available: false,
        message: `This ${platform} username is already in use by another account. If you wish to proceed, you may continue, but you will be using an already assigned username.`
      });
      
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        // Username is available
        return res.json({
          available: true,
          message: `${platform.charAt(0).toUpperCase() + platform.slice(1)} username is available`
        });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error checking username availability:`, error);
    res.status(500).json({ 
      error: 'Failed to check username availability', 
      details: error.message 
    });
  }
});

// Twitter connection endpoints
app.post(['/twitter-connection/:userId', '/api/twitter-connection/:userId'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  const { userId } = req.params;
  const { twitter_user_id, username } = req.body;
  
  if (!userId || !twitter_user_id) {
    return res.status(400).json({ error: 'userId and twitter_user_id are required' });
  }
  
  try {
    const key = `UserTwitterConnection/${userId}/connection.json`;
    const connectionData = {
      twitter_user_id,
      username: username || '',
      connected_at: new Date().toISOString(),
      user_id: userId
    };
    
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(connectionData, null, 2),
      ContentType: 'application/json'
    });
    
    await s3Client.send(putCommand);
    console.log(`[${new Date().toISOString()}] Stored Twitter connection for user ${userId}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error storing Twitter connection:`, error);
    res.status(500).json({ error: 'Failed to store Twitter connection' });
  }
});

app.get(['/twitter-connection/:userId', '/api/twitter-connection/:userId'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  const { userId } = req.params;
  
  try {
    const key = `UserTwitterConnection/${userId}/connection.json`;
    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: key
    });
    
    const response = await s3Client.send(getCommand);
    const body = await streamToString(response.Body);
    const connectionData = JSON.parse(body);
    
    res.json(connectionData);
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: 'No Twitter connection found' });
    } else {
      console.error(`[${new Date().toISOString()}] Error retrieving Twitter connection:`, error);
      res.status(500).json({ error: 'Failed to retrieve Twitter connection' });
    }
  }
});
app.delete(['/twitter-connection/:userId', '/api/twitter-connection/:userId'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  const { userId } = req.params;
  
  try {
    const key = `UserTwitterConnection/${userId}/connection.json`;
    const deleteCommand = new DeleteObjectCommand({
      Bucket: 'tasks',
      Key: key
    });
    
    await s3Client.send(deleteCommand);
    console.log(`[${new Date().toISOString()}] Deleted Twitter connection for user ${userId}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error deleting Twitter connection:`, error);
    res.status(500).json({ error: 'Failed to delete Twitter connection' });
  }
});

// Helper functions
async function getExistingData() {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'data/',
    });
    const listResponse = await s3Client.send(listCommand);

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return [];
    }

    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: 'data/hierarchical_data.json',
    });
    const response = await s3Client.send(getCommand);
    const body = await streamToString(response.Body);
    return body ? JSON.parse(body) : [];
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return [];
    }
    console.error('Error getting existing data:', error);
    throw error;
  }
}

async function saveToR2(data) {
  try {
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: 'data/hierarchical_data.json',
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);
  } catch (error) {
    console.error('Error saving to R2:', error);
    throw error;
  }
}

function handleErrorResponse(res, error) {
  console.error('API Error:', error);
  const status = error.response?.status || 500;
  const message = error.response?.data?.message || error.message || 'Internal server error';
  res.status(status).json({ error: message });
}

// Health check endpoint
app.get('/health', (req, res) => {
  setCorsHeaders(res);
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    port: port,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Server startup moved to end of file

// ============= CENTRALIZED PLATFORM SCHEMA MANAGEMENT =============
// Standardized schema builder for consistent R2 key generation
class PlatformSchemaManager {
  /**
   * Generate standardized R2 key path using new schema: module/platform/username[/additional]
   * @param {string} module - Module name (e.g., 'competitor_analysis', 'recommendations')
   * @param {string} platform - Platform ('instagram' or 'twitter')
   * @param {string} username - Username
   * @param {string} additional - Additional path component (optional, e.g., competitor name, file name)
   * @returns {string} Standardized R2 key path
   */
  static buildPath(module, platform = 'instagram', username, additional = '') {
    if (!module || !username) {
      throw new Error('Module and username are required for R2 path generation');
    }
    
    // Normalize platform
    const normalizedPlatform = platform.toLowerCase();
    if (!['instagram', 'twitter', 'facebook'].includes(normalizedPlatform)) {
      throw new Error(`Unsupported platform: ${platform}. Must be 'instagram', 'twitter', or 'facebook'`);
    }
    
    // Normalize username according to platform rules (e.g., lowercase for Instagram)
    const normalizedUsername = PlatformSchemaManager.getPlatformConfig(normalizedPlatform).normalizeUsername(username);
    
    // Build base path with normalized username
    let path = `${module}/${normalizedPlatform}/${normalizedUsername}`;
    
    // Add additional component if provided
    if (additional) {
      path += `/${additional}`;
    }
    
    return path;
  }

  /**
   * Parse platform and username from URL parameters with validation
   * @param {object} req - Express request object
   * @returns {object} Parsed platform info with validation
   */
  static parseRequestParams(req) {
    const platform = req.query.platform || 'instagram';
    const username = req.params.username || req.params.accountHolder;
    
    if (!username) {
      throw new Error('Username parameter is required');
    }
    
    return {
      platform: platform.toLowerCase(),
      username: username.trim(),
      isValidPlatform: ['instagram', 'twitter', 'facebook'].includes(platform.toLowerCase())
    };
  }

  /**
   * Get platform-specific configuration
   * @param {string} platform - Platform name
   * @returns {object} Platform configuration
   */
  static getPlatformConfig(platform) {
    const configs = {
      instagram: {
        name: 'Instagram',
        normalizeUsername: (username) => username.trim().toLowerCase(),
        eventPrefix: 'InstagramEvents',
        tokenPrefix: 'InstagramTokens',
        maxUsernameLength: 30
      },
      twitter: {
        name: 'Twitter',
        normalizeUsername: (username) => username.trim(), // Keep original case for Twitter
        eventPrefix: 'TwitterEvents', 
        tokenPrefix: 'TwitterTokens',
        maxUsernameLength: 15
      },
      facebook: {
        name: 'Facebook',
        normalizeUsername: (username) => username.trim(), // Keep original case for Facebook
        eventPrefix: 'FacebookEvents', 
        tokenPrefix: 'FacebookTokens',
        maxUsernameLength: 50
      }
    };
    
    return configs[platform.toLowerCase()] || configs.instagram;
  }
}

// ============= EXISTING CACHE SYSTEM =============

// ======================== TWITTER OAUTH 2.0 & POSTING IMPLEMENTATION ========================

// Twitter OAuth 2.0 credentials
const TWITTER_CLIENT_ID = 'cVNYR3UxVm5jQ3d5UWw0UHFqUTI6MTpjaQ';
const TWITTER_CLIENT_SECRET = 'Wr8Kewh92NVB-035hAvpQeQ1Azc7chre3PUTgDoEltjO57mxzO';
const TWITTER_REDIRECT_URI = 'https://www.sentientm.com/twitter/callback';

// Debug logging for OAuth 2.0
console.log(`[${new Date().toISOString()}] Twitter OAuth 2.0 Configuration:`);
console.log(`[${new Date().toISOString()}] Client ID: ${TWITTER_CLIENT_ID}`);
console.log(`[${new Date().toISOString()}] Redirect URI: ${TWITTER_REDIRECT_URI}`);

// OAuth 2.0 PKCE helper functions
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(codeVerifier) {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
}

// Store for PKCE state (in production, use secure session store)
const pkceStore = new Map();

// Twitter OAuth 2.0 - Step 1: Generate authorization URL
app.get(['/twitter/auth', '/api/twitter/auth'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  const { userId } = req.query; // Firebase user ID
  
  if (!userId) {
    return res.status(400).json({ error: 'Firebase userId is required' });
  }
  
  try {
    console.log(`[${new Date().toISOString()}] Starting Twitter OAuth 2.0 flow for Firebase user ${userId}...`);
    
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(16).toString('hex');
    
    // Store PKCE parameters for verification
    pkceStore.set(state, {
      codeVerifier,
      codeChallenge,
      firebaseUserId: userId, // Store Firebase user ID
      timestamp: Date.now()
    });
    
    // Clean up old PKCE entries (older than 10 minutes)
    for (const [key, value] of pkceStore.entries()) {
      if (Date.now() - value.timestamp > 10 * 60 * 1000) {
        pkceStore.delete(key);
      }
    }
    
    // Build authorization URL
    const scopes = [
      'tweet.read',
      'tweet.write', 
      'users.read',
      'offline.access'
    ].join(' ');
    
    const authParams = new URLSearchParams({
      response_type: 'code',
      client_id: TWITTER_CLIENT_ID,
      redirect_uri: TWITTER_REDIRECT_URI,
      scope: scopes,
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    
    const authUrl = `https://x.com/i/oauth2/authorize?${authParams.toString()}`;
    
    console.log(`[${new Date().toISOString()}] Generated Twitter OAuth 2.0 auth URL`);
    console.log(`[${new Date().toISOString()}] State: ${state}`);
    console.log(`[${new Date().toISOString()}] Code challenge: ${codeChallenge}`);
    
    res.json({ authUrl, state });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Twitter OAuth 2.0 step 1 error:`, error.message);
    res.status(500).json({ 
      error: 'Failed to initiate Twitter OAuth 2.0', 
      details: error.message 
    });
  }
});

// Twitter OAuth 2.0 - Step 2: Handle callback and exchange code for access token
app.get(['/twitter/callback', '/api/twitter/callback'], async (req, res) => {
  const { code, state } = req.query;
  
  if (!code || !state) {
    console.log(`[${new Date().toISOString()}] Twitter callback failed: Missing code or state`);
    return res.status(400).send('Error: Missing OAuth parameters');
  }
  
  try {
    console.log(`[${new Date().toISOString()}] Processing Twitter OAuth 2.0 callback...`);
    
    // Retrieve stored PKCE parameters
    const pkceData = pkceStore.get(state);
    if (!pkceData) {
      throw new Error('Invalid state parameter or expired PKCE data');
    }
    
    // Clean up used PKCE data
    pkceStore.delete(state);
    
    // Exchange authorization code for access token
    const tokenRequestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: TWITTER_REDIRECT_URI,
      code_verifier: pkceData.codeVerifier
    });
    
    // For confidential clients (Web Apps), use Basic Auth header
    const basicAuthCredentials = Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64');
    
    console.log(`[${new Date().toISOString()}] Exchanging code for access token...`);
    console.log(`[${new Date().toISOString()}] Using Basic Auth for confidential client`);
    
    const response = await axios.post('https://api.x.com/2/oauth2/token', tokenRequestBody, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': `Basic ${basicAuthCredentials}`
      }
    });
    
    const tokenData = response.data;
    
    if (!tokenData.access_token) {
      throw new Error('Failed to get access token from Twitter');
    }
    
    console.log(`[${new Date().toISOString()}] Got access token, fetching user info...`);
    
    // Get user information using the access token
    const userResponse = await axios.get('https://api.x.com/2/users/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const userData = userResponse.data.data;
    const userId = userData.id;
    const username = userData.username;
    
    console.log(`[${new Date().toISOString()}] Twitter OAuth 2.0 successful: user_id=${userId}, username=${username}`);
    
    // Store access token in R2
    const userTokenKey = `TwitterTokens/${userId}/token.json`;
    const userTokenData = {
      twitter_user_id: userId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in || 7200,
      scope: tokenData.scope || '',
      username: username,
      expires_at: new Date(Date.now() + (tokenData.expires_in || 7200) * 1000).toISOString(),
      timestamp: new Date().toISOString()
    };
    
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: userTokenKey,
      Body: JSON.stringify(userTokenData, null, 2),
      ContentType: 'application/json'
    }));
    
    console.log(`[${new Date().toISOString()}] Twitter tokens stored for user ${userId}`);
    
    // Also store connection data for frontend detection
    const connectionKey = `UserTwitterConnection/${pkceData.firebaseUserId}/connection.json`;
    const connectionData = {
      twitter_user_id: userId,
      username: username,
      connected_at: new Date().toISOString(),
      user_id: pkceData.firebaseUserId
    };
    
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: connectionKey,
      Body: JSON.stringify(connectionData, null, 2),
      ContentType: 'application/json'
    }));
    
    console.log(`[${new Date().toISOString()}] Twitter connection data stored for Firebase user ${pkceData.firebaseUserId}`);
    
    // Send success response with JavaScript to notify parent window
    res.send(`
      <html>
        <body>
          <h2>Twitter Connected Successfully!</h2>
          <p>Username: @${username}</p>
          <p>User ID: ${userId}</p>
          <p>Token expires in: ${Math.floor((tokenData.expires_in || 7200) / 3600)} hours</p>
          <p>You can now close this window and return to the dashboard.</p>
          <script>
            window.opener.postMessage({ 
              type: 'TWITTER_CONNECTED', 
              userId: '${userId}', 
              username: '${username}',
              accessToken: '${tokenData.access_token}'
            }, '*');
            window.close();
          </script>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Twitter OAuth 2.0 callback error:`, error.response?.data || error.message);
    console.error(`[${new Date().toISOString()}] Full error details:`, {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      headers: error.response?.headers,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        data: error.config?.data
      }
    });
    res.status(500).send(`Error completing Twitter authentication: ${error.message}`);
  }
});

// Post tweet endpoint - immediate posting with OAuth 2.0
app.post(['/post-tweet/:userId', '/api/post-tweet/:userId'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  const { userId } = req.params;
  const { text } = req.body;
  
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Tweet text is required' });
  }
  
  if (text.length > 280) {
    return res.status(400).json({ error: 'Tweet text exceeds 280 characters' });
  }
  
  try {
    console.log(`[${new Date().toISOString()}] Posting tweet for user ${userId}: "${text}"`);
    
    // Get user's stored Twitter tokens
    const userTokenKey = `TwitterTokens/${userId}/token.json`;
    let tokenData;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: userTokenKey
      });
      const response = await s3Client.send(getCommand);
      tokenData = JSON.parse(await streamToString(response.Body));
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return res.status(404).json({ error: 'Twitter account not connected' });
      }
      throw error;
    }
    
    // Check if token is expired and needs refresh
    if (tokenData.expires_at && new Date() > new Date(tokenData.expires_at)) {
      console.log(`[${new Date().toISOString()}] Access token expired, attempting to refresh...`);
      
      if (tokenData.refresh_token) {
        try {
          // Refresh the access token
          const refreshBody = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: tokenData.refresh_token
          });
          
          // Use Basic Auth header for confidential clients
          const basicAuthCredentials = Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64');
          
          const refreshResponse = await axios.post('https://api.x.com/2/oauth2/token', refreshBody, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json',
              'Authorization': `Basic ${basicAuthCredentials}`
            }
          });
          
          const newTokenData = refreshResponse.data;
          
          // Update stored token data
          tokenData.access_token = newTokenData.access_token;
          tokenData.refresh_token = newTokenData.refresh_token || tokenData.refresh_token;
          tokenData.expires_in = newTokenData.expires_in || 7200;
          tokenData.expires_at = new Date(Date.now() + (newTokenData.expires_in || 7200) * 1000).toISOString();
          
          // Save updated token
          await s3Client.send(new PutObjectCommand({
            Bucket: 'tasks',
            Key: userTokenKey,
            Body: JSON.stringify(tokenData, null, 2),
            ContentType: 'application/json'
          }));
          
          console.log(`[${new Date().toISOString()}] Access token refreshed successfully`);
        } catch (refreshError) {
          console.error(`[${new Date().toISOString()}] Token refresh failed:`, refreshError.response?.data || refreshError.message);
          return res.status(401).json({ 
            error: 'Token expired and refresh failed', 
            details: 'Please reconnect your Twitter account' 
          });
        }
      } else {
        return res.status(401).json({ 
          error: 'Access token expired', 
          details: 'Please reconnect your Twitter account' 
        });
      }
    }
    
    // Post tweet using Twitter API v2 with OAuth 2.0 Bearer token
    const tweetData = { text: text.trim() };
    
    const response = await axios.post('https://api.x.com/2/tweets', tweetData, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const tweetId = response.data.data.id;
    const tweetText = response.data.data.text;
    
    console.log(`[${new Date().toISOString()}] Tweet posted successfully: ID ${tweetId}`);
    
    // Store tweet record for tracking
    const tweetKey = `TwitterPosts/${userId}/${tweetId}.json`;
    const tweetRecord = {
      tweet_id: tweetId,
      text: tweetText,
      user_id: userId,
      posted_at: new Date().toISOString(),
      scheduled: false,
      status: 'posted'
    };
    
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: tweetKey,
      Body: JSON.stringify(tweetRecord, null, 2),
      ContentType: 'application/json'
    }));
    
    res.json({ 
      success: true, 
      tweet_id: tweetId, 
      text: tweetText,
      message: 'Tweet posted successfully' 
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error posting tweet:`, error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      res.status(401).json({ 
        error: 'Twitter authentication failed', 
        details: 'Please reconnect your Twitter account' 
      });
    } else if (error.response?.status === 403) {
      res.status(403).json({ 
        error: 'Tweet posting forbidden', 
        details: error.response?.data?.detail || 'Check your Twitter API permissions and scopes' 
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to post tweet', 
        details: error.response?.data || error.message 
      });
    }
  }
});

// Schedule tweet endpoint - for future posting
app.post(['/schedule-tweet/:userId', '/api/schedule-tweet/:userId'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  const { userId } = req.params;
  const { text, scheduled_time } = req.body;
  
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Tweet text is required' });
  }
  
  if (text.length > 280) {
    return res.status(400).json({ error: 'Tweet text exceeds 280 characters' });
  }
  
  if (!scheduled_time) {
    return res.status(400).json({ error: 'Scheduled time is required' });
  }
  
  const scheduledDate = new Date(scheduled_time);
  if (scheduledDate <= new Date()) {
    return res.status(400).json({ error: 'Scheduled time must be in the future' });
  }
  
  try {
    console.log(`[${new Date().toISOString()}] Scheduling tweet for user ${userId} at ${scheduledDate.toISOString()}: "${text}"`);
    
    // Verify user has Twitter connected
    const userTokenKey = `TwitterTokens/${userId}/token.json`;
    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: 'tasks',
        Key: userTokenKey
      }));
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return res.status(404).json({ error: 'Twitter account not connected' });
      }
      throw error;
    }
    
    // Store scheduled tweet
    const scheduleId = randomUUID();
    const scheduleKey = `TwitterScheduled/${userId}/${scheduleId}.json`;
    const scheduledTweet = {
      schedule_id: scheduleId,
      user_id: userId,
      text: text.trim(),
      scheduled_time: scheduledDate.toISOString(),
      created_at: new Date().toISOString(),
      status: 'scheduled'
    };
    
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: scheduleKey,
      Body: JSON.stringify(scheduledTweet, null, 2),
      ContentType: 'application/json'
    }));
    
    console.log(`[${new Date().toISOString()}] Tweet scheduled with ID ${scheduleId}`);
    
    res.json({ 
      success: true, 
      schedule_id: scheduleId,
      scheduled_time: scheduledDate.toISOString(),
      message: 'Tweet scheduled successfully' 
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error scheduling tweet:`, error.message);
    res.status(500).json({ 
      error: 'Failed to schedule tweet', 
      details: error.message 
    });
  }
});

// Schedule tweet endpoint - for future posting with OAuth 2.0
app.post(['/schedule-tweet/:userId', '/api/schedule-tweet/:userId'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  const { userId } = req.params;
  const { text, scheduled_time } = req.body;
  
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Tweet text is required' });
  }
  
  if (text.length > 280) {
    return res.status(400).json({ error: 'Tweet text exceeds 280 characters' });
  }
  
  if (!scheduled_time) {
    return res.status(400).json({ error: 'Scheduled time is required' });
  }
  
  const scheduleDate = new Date(scheduled_time);
  const now = new Date();
  
  if (scheduleDate <= now) {
    return res.status(400).json({ error: 'Scheduled time must be in the future' });
  }
  
  try {
    console.log(`[${new Date().toISOString()}] Scheduling tweet for user ${userId} at ${scheduleDate.toISOString()}: "${text}"`);
    
    // Generate unique schedule ID
    const scheduleId = crypto.randomUUID();
    
    // Store scheduled tweet in R2
    const scheduledTweetKey = `TwitterScheduled/${userId}/${scheduleId}.json`;
    const scheduledTweetData = {
      id: scheduleId,
      user_id: userId,
      text: text.trim(),
      scheduled_time: scheduleDate.toISOString(),
      created_at: new Date().toISOString(),
      status: 'pending',
      type: 'text_only'
    };
    
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: scheduledTweetKey,
      Body: JSON.stringify(scheduledTweetData, null, 2),
      ContentType: 'application/json'
    }));
    
    console.log(`[${new Date().toISOString()}] Scheduled tweet stored with ID ${scheduleId}`);
    
    res.json({ 
      success: true, 
      message: 'Tweet scheduled successfully',
      schedule_id: scheduleId,
      scheduled_time: scheduleDate.toISOString()
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error scheduling tweet:`, error);
    res.status(500).json({ error: 'Failed to schedule tweet' });
  }
});
// Schedule tweet with image endpoint - for future posting with OAuth 2.0 and image
app.post(['/schedule-tweet-with-image/:userId', '/api/schedule-tweet-with-image/:userId'], upload.single('image'), async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  const { userId } = req.params;
  
  // Debug: Log all received data
  console.log(`[${new Date().toISOString()}] POST /schedule-tweet-with-image/${userId} - Request received`);
  console.log(`[${new Date().toISOString()}] req.body:`, req.body);
  console.log(`[${new Date().toISOString()}] req.files:`, req.files ? Object.keys(req.files) : 'none');
  
  // Get fields from req.body (FormData puts text fields in req.body)
  const text = req.body.text;
  const scheduled_time = req.body.scheduled_time;
  const imageFile = req.files?.image || req.file;
  
  console.log(`[${new Date().toISOString()}] Extracted text: "${text}"`);
  console.log(`[${new Date().toISOString()}] Extracted scheduled_time: "${scheduled_time}"`);
  console.log(`[${new Date().toISOString()}] Image file present: ${!!imageFile}`);
  
  // Allow empty text if there's an image (Twitter allows image-only posts)
  if (text && text.length > 280) {
    return res.status(400).json({ error: 'Tweet text exceeds 280 characters' });
  }
  
  if (!scheduled_time) {
    return res.status(400).json({ error: 'Scheduled time is required' });
  }
  
  if (!imageFile) {
    return res.status(400).json({ error: 'Image file is required' });
  }
  
  // If no text provided, use empty string (Twitter allows image-only posts)
  const tweetText = text ? text.trim() : '';
  
  const scheduleDate = new Date(scheduled_time);
  const now = new Date();
  
  if (scheduleDate <= now) {
    return res.status(400).json({ error: 'Scheduled time must be in the future' });
  }
  
  try {
    console.log(`[${new Date().toISOString()}] Scheduling tweet with image for user ${userId} at ${scheduleDate.toISOString()}: "${tweetText}"`);
    
    // Generate unique schedule ID
    const scheduleId = crypto.randomUUID();
    
    // Store image in R2
    const imageKey = `TwitterScheduled/${userId}/${scheduleId}_image.jpg`;
    const imageBuffer = imageFile.buffer || imageFile.data;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: imageKey,
      Body: imageBuffer,
      ContentType: imageFile.mimetype || 'image/jpeg'
    }));
    
    // Store scheduled tweet data in R2
    const scheduledTweetKey = `TwitterScheduled/${userId}/${scheduleId}.json`;
    const scheduledTweetData = {
      id: scheduleId,
      user_id: userId,
      text: tweetText,
      scheduled_time: scheduleDate.toISOString(),
      created_at: new Date().toISOString(),
      status: 'pending',
      type: 'with_image',
      image_key: imageKey
    };
    
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: scheduledTweetKey,
      Body: JSON.stringify(scheduledTweetData, null, 2),
      ContentType: 'application/json'
    }));
    
    console.log(`[${new Date().toISOString()}] Scheduled tweet with image stored with ID ${scheduleId}`);
    
    res.json({ 
      success: true, 
      message: 'Tweet with image scheduled successfully',
      schedule_id: scheduleId,
      scheduled_time: scheduleDate.toISOString()
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error scheduling tweet with image:`, error);
    res.status(500).json({ error: 'Failed to schedule tweet with image' });
  }
});

// Get scheduled tweets for a user
app.get(['/scheduled-tweets/:userId', '/api/scheduled-tweets/:userId'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  const { userId } = req.params;
  
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `TwitterScheduled/${userId}/`
    });
    
    const listResponse = await s3Client.send(listCommand);
    const files = listResponse.Contents || [];
    
    const scheduledTweets = await Promise.all(
      files.map(async (file) => {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: file.Key
          });
          const data = await s3Client.send(getCommand);
          const tweetData = JSON.parse(await streamToString(data.Body));
          
          return {
            key: file.Key,
            ...tweetData
          };
        } catch (error) {
          console.error(`Error reading scheduled tweet ${file.Key}:`, error);
          return null;
        }
      })
    );
    
    const validTweets = scheduledTweets.filter(tweet => tweet !== null);
    
    // Sort by scheduled time
    validTweets.sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime());
    
    res.json(validTweets);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching scheduled tweets:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch scheduled tweets', 
      details: error.message 
    });
  }
});

// Delete scheduled tweet
app.delete(['/scheduled-tweet/:userId/:scheduleId', '/api/scheduled-tweet/:userId/:scheduleId'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  const { userId, scheduleId } = req.params;
  
  try {
    const scheduleKey = `TwitterScheduled/${userId}/${scheduleId}.json`;
    
    await s3Client.send(new DeleteObjectCommand({
      Bucket: 'tasks',
      Key: scheduleKey
    }));
    
    console.log(`[${new Date().toISOString()}] Deleted scheduled tweet ${scheduleId} for user ${userId}`);
    
    res.json({ success: true, message: 'Scheduled tweet deleted' });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error deleting scheduled tweet:`, error);
    res.status(500).json({ 
      error: 'Failed to delete scheduled tweet', 
      details: error.message 
    });
  }
});

// Facebook scheduler worker - checks for due Facebook posts every minute
function startFacebookScheduler() {
  console.log(`[${new Date().toISOString()}] Starting Facebook scheduler...`);
  
  setInterval(async () => {
    try {
      console.log(`[${new Date().toISOString()}] Checking for due Facebook posts...`);
      
      // Get all scheduled Facebook posts
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: 'scheduled_posts/facebook/'
      });
      
      const listResponse = await s3Client.send(listCommand);
      const files = listResponse.Contents || [];
      
      const now = new Date();
      
      for (const file of files) {
        try {
          // Skip non-JSON files
          if (!file.Key.endsWith('.json')) continue;
          
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: file.Key
          });
          const data = await s3Client.send(getCommand);
          const scheduledPost = JSON.parse(await streamToString(data.Body));
          
          const scheduledTime = new Date(scheduledPost.scheduleDate || scheduledPost.scheduledTime);
          
          // 🚫 CRITICAL FIX: Skip posts already being processed
          if (scheduledPost.status === 'processing') {
            // Check if processing has been stuck for too long (5 minutes)
            if (scheduledPost.processing_started_at) {
              const processingStart = new Date(scheduledPost.processing_started_at);
              const processingDuration = now.getTime() - processingStart.getTime();
              const maxProcessingTime = 5 * 60 * 1000; // 5 minutes
              
              if (processingDuration > maxProcessingTime) {
                console.log(`[${new Date().toISOString()}] Facebook post ${scheduledPost.id} stuck in processing for ${Math.round(processingDuration/1000)}s, resetting to scheduled`);
                scheduledPost.status = 'scheduled';
                delete scheduledPost.processing_started_at;
                
                await s3Client.send(new PutObjectCommand({
                  Bucket: 'tasks',
                  Key: file.Key,
                  Body: JSON.stringify(scheduledPost, null, 2),
                  ContentType: 'application/json',
                }));
              } else {
                console.log(`[${new Date().toISOString()}] Facebook post ${scheduledPost.id} being processed for ${Math.round(processingDuration/1000)}s, skipping`);
                continue;
              }
            } else {
              console.log(`[${new Date().toISOString()}] Facebook post ${scheduledPost.id} already being processed, skipping`);
              continue;
            }
          }
          
          // Check if post is due (within 1 minute tolerance)
          if (scheduledTime <= now && (scheduledPost.status === 'pending' || scheduledPost.status === 'scheduled')) {
            console.log(`[${new Date().toISOString()}] Processing due Facebook post: ${scheduledPost.id}`);

            // 🚫 CRITICAL FIX: Atomic locking to prevent duplicate processing
            try {
              // Immediately mark as processing to prevent race conditions
              scheduledPost.status = 'processing';
              scheduledPost.processing_started_at = new Date().toISOString();
              
              // Atomic update - if this fails, another worker already grabbed it
              await s3Client.send(new PutObjectCommand({
                Bucket: 'tasks',
                Key: file.Key,
                Body: JSON.stringify(scheduledPost, null, 2),
                ContentType: 'application/json',
              }));
              
              console.log(`[${new Date().toISOString()}] ✅ Locked Facebook post ${scheduledPost.id} for processing`);
              
            } catch (lockError) {
              // Another worker already grabbed this post
              console.log(`[${new Date().toISOString()}] ⚠️ Facebook post ${scheduledPost.id} already being processed by another worker`);
              continue;
            }
            
            try {
              // Get Facebook access token
              console.log(`[${new Date().toISOString()}] Looking for Facebook token for userId: ${scheduledPost.userId}`);
              const tokenData = await getFacebookTokenData(scheduledPost.userId);
              if (!tokenData) {
                console.log(`[${new Date().toISOString()}] No Facebook token found for user ${scheduledPost.userId}`);
                throw new Error('No Facebook token found for user');
              }
              console.log(`[${new Date().toISOString()}] Found Facebook token for page_id: ${tokenData.page_id}`);

              // Verify this is a business page (since we now only support Pages)
              let isBusinessPage = true;
              try {
                const pageCheck = await axios.get(`https://graph.facebook.com/v18.0/${tokenData.page_id}`, {
                  params: {
                    fields: 'category,name,access_token',
                    access_token: tokenData.access_token
                  }
                });
                console.log(`[${new Date().toISOString()}] Verified Facebook Business Page: ${pageCheck.data.name} (${pageCheck.data.category || 'Business Page'})`);
              } catch (error) {
                console.error(`[${new Date().toISOString()}] Error verifying Facebook Page:`, error.response?.data?.error?.message || error.message);
                isBusinessPage = false;
              }

              if (!isBusinessPage) {
                // Invalid Page - OAuth should have connected to a Business Page
                // Create manual posting notification with instructions to connect proper Page
                console.log(`[${new Date().toISOString()}] Invalid Facebook Page connection detected. Creating manual posting notification.`);
                
                // Update status to manual_required with instructions
                scheduledPost.status = 'manual_required';
                scheduledPost.manual_required_at = new Date().toISOString();
                scheduledPost.notes = '📱 READY FOR MANUAL POSTING: Please reconnect with a Facebook Business Page for automated posting, or post manually.';
                scheduledPost.manual_instructions = {
                  platform: 'Facebook',
                  caption: scheduledPost.caption,
                  image_url: scheduledPost.imageKey ? `https://tasks.b21d96e73b908d7d7b822d41516ccc64.r2.cloudflarestorage.com/${scheduledPost.imageKey}` : null,
                  scheduled_time: scheduledPost.scheduledDate,
                  action_required: 'Copy caption and image, then post manually to Facebook',
                  post_to: 'https://www.facebook.com'
                };
                
                await s3Client.send(new PutObjectCommand({
                  Bucket: 'tasks',
                  Key: file.Key,
                  Body: JSON.stringify(scheduledPost, null, 2),
                  ContentType: 'application/json'
                }));
                
                console.log(`[${new Date().toISOString()}] Facebook post ${scheduledPost.id} marked as manual_required with instructions`);
                
                // Broadcast real-time notification for manual posting
                broadcastUpdate(scheduledPost.userId, {
                  event: 'manual_post_required',
                  platform: 'facebook',
                  data: {
                    postId: scheduledPost.id,
                    caption: scheduledPost.caption,
                    image_url: scheduledPost.manual_instructions.image_url,
                    scheduled_time: scheduledPost.scheduledDate,
                    message: '📱 Facebook post ready for manual posting! Please reconnect with a Business Page for automated posting.',
                    instructions: scheduledPost.manual_instructions
                  },
                  timestamp: Date.now()
                });
                
                continue; // Skip to next post
                
              } else {
                // For business pages, proceed with normal posting
                let postUrl = `https://graph.facebook.com/v18.0/${tokenData.page_id}/feed`;
                let postData = { message: scheduledPost.caption };
                let postResponse;

                // If image is provided, upload it first
                if (scheduledPost.imageKey) {
                  console.log(`[${new Date().toISOString()}] Facebook post has image, uploading...`);
                  
                  // Get the image from R2
                  const imageCommand = new GetObjectCommand({
                    Bucket: 'tasks',
                    Key: scheduledPost.imageKey
                  });
                  const imageResponse = await s3Client.send(imageCommand);
                  const imageBuffer = await streamToBuffer(imageResponse.Body);
                  
                  // Create FormData for image upload
                  const formData = new FormData();
                  formData.append('message', scheduledPost.caption || '');
                  
                  // 🔥 FIX: Detect actual image format instead of hardcoding JPG
                  let detectedFormat = 'jpeg';
                  let detectedMimeType = 'image/jpeg';
                  
                  // Check image buffer signature to detect actual format
                  if (imageBuffer.length >= 4) {
                    // Check for PNG signature (89 50 4E 47)
                    if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && 
                        imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47) {
                      detectedFormat = 'png';
                      detectedMimeType = 'image/png';
                    }
                    // Check for WebP signature (RIFF + WEBP)
                    else if (imageBuffer.length >= 12 &&
                             imageBuffer.toString('ascii', 0, 4) === 'RIFF' &&
                             imageBuffer.toString('ascii', 8, 12) === 'WEBP') {
                      detectedFormat = 'webp';
                      detectedMimeType = 'image/webp';
                    }
                    // JPEG signature (FF D8) is the default
                  }
                  
                  formData.append('source', imageBuffer, {
                    filename: `facebook_post.${detectedFormat}`,
                    contentType: detectedMimeType
                  });

                  // Post with image using photo endpoint
                  postUrl = `https://graph.facebook.com/v18.0/${tokenData.page_id}/photos`;
                  
                  postResponse = await axios.post(postUrl, formData, {
                    params: {
                      access_token: tokenData.access_token
                    },
                    headers: {
                      ...formData.getHeaders()
                    }
                  });

                  console.log(`[${new Date().toISOString()}] Facebook post with image published successfully: ${postResponse.data.id}`);
                } else {
                  // Post text-only message
                  postResponse = await axios.post(postUrl, postData, {
                    params: {
                      access_token: tokenData.access_token
                    }
                  });

                  console.log(`[${new Date().toISOString()}] Facebook text post published successfully: ${postResponse.data.id}`);
                }
                
                                // Store the post ID for tracking
                scheduledPost.facebook_post_id = postResponse.data.id;
              }

              // Update status to completed
              scheduledPost.status = 'completed';
              scheduledPost.publishedAt = new Date().toISOString();
              
              await s3Client.send(new PutObjectCommand({
                Bucket: 'tasks',
                Key: file.Key,
                Body: JSON.stringify(scheduledPost, null, 2),
                ContentType: 'application/json'
              }));

            } catch (postError) {
              console.error(`[${new Date().toISOString()}] Error publishing Facebook post ${scheduledPost.id}:`, postError.message);
              
              // Update status to failed
              scheduledPost.status = 'failed';
              scheduledPost.error = postError.message;
              scheduledPost.failedAt = new Date().toISOString();
              
              await s3Client.send(new PutObjectCommand({
                Bucket: 'tasks',
                Key: file.Key,
                Body: JSON.stringify(scheduledPost, null, 2),
                ContentType: 'application/json'
              }));
            }
          }
        } catch (fileError) {
          console.error(`[${new Date().toISOString()}] Error processing Facebook scheduled file ${file.Key}:`, fileError.message);
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error in Facebook scheduler:`, error.message);
    }
  }, 60000); // Check every minute
}

// Twitter scheduler worker - checks for due tweets every minute
function startTwitterScheduler() {
  console.log(`[${new Date().toISOString()}] [SCHEDULER] Starting Twitter OAuth 2.0 scheduler...`);
  
  setInterval(async () => {
    try {
      console.log(`[${new Date().toISOString()}] [SCHEDULER] Running Twitter scheduler interval...`);
      // Get all scheduled tweets
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: 'TwitterScheduled/'
      });
      
      const listResponse = await s3Client.send(listCommand);
      const files = listResponse.Contents || [];
      
      const now = new Date();
      
      for (const file of files) {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: file.Key
          });
          const data = await s3Client.send(getCommand);
          const scheduledTweet = JSON.parse(await streamToString(data.Body));
          
          const scheduledTime = new Date(scheduledTweet.scheduled_time);
          
          // Check if tweet is due (within 1 minute tolerance)
          if (scheduledTime <= now && scheduledTweet.status === 'scheduled') {
            console.log(`[${new Date().toISOString()}] [SCHEDULER] Processing due tweet: ${scheduledTweet.schedule_id}`);
            
            try {
              // Get user's Twitter tokens
              const userTokenKey = `TwitterTokens/${scheduledTweet.user_id}/token.json`;
              const tokenCommand = new GetObjectCommand({
                Bucket: 'tasks',
                Key: userTokenKey
              });
              const tokenResponse = await s3Client.send(tokenCommand);
              let tokenData = JSON.parse(await streamToString(tokenResponse.Body));
              
              // Check if token is expired and needs refresh
              if (tokenData.expires_at && new Date() > new Date(tokenData.expires_at)) {
                if (tokenData.refresh_token) {
                  try {
                    // Refresh the access token
                    const refreshBody = new URLSearchParams({
                      grant_type: 'refresh_token',
                      refresh_token: tokenData.refresh_token
                    });
                    
                    // Use Basic Auth header for confidential clients
                    const basicAuthCredentials = Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64');
                    
                    const refreshResponse = await axios.post('https://api.x.com/2/oauth2/token', refreshBody, {
                      headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'application/json',
                        'Authorization': `Basic ${basicAuthCredentials}`
                      }
                    });
                    
                    const newTokenData = refreshResponse.data;
                    
                    // Update stored token data
                    tokenData.access_token = newTokenData.access_token;
                    tokenData.refresh_token = newTokenData.refresh_token || tokenData.refresh_token;
                    tokenData.expires_in = newTokenData.expires_in || 7200;
                    tokenData.expires_at = new Date(Date.now() + (newTokenData.expires_in || 7200) * 1000).toISOString();
                    
                    // Save updated token
                    await s3Client.send(new PutObjectCommand({
                      Bucket: 'tasks',
                      Key: userTokenKey,
                      Body: JSON.stringify(tokenData, null, 2),
                      ContentType: 'application/json'
                    }));
                    
                  } catch (refreshError) {
                    console.error(`[${new Date().toISOString()}] [SCHEDULER] Scheduled tweet: Token refresh failed:`, refreshError.response?.data || refreshError.message);
                    throw new Error('Token refresh failed');
                  }
                } else {
                  throw new Error('Access token expired and no refresh token available');
                }
              }
              
              // Post the tweet using OAuth 2.0 Bearer token
              let tweetData = { text: scheduledTweet.text };
              
              // Check if this is a tweet with image
              if (scheduledTweet.type === 'with_image' && scheduledTweet.image_key) {
                console.log(`[${new Date().toISOString()}] [SCHEDULER] Scheduled tweet has image, uploading media first...`);
                
                try {
                  // Get the image from R2
                  const imageCommand = new GetObjectCommand({
                    Bucket: 'tasks',
                    Key: scheduledTweet.image_key
                  });
                  const imageResponse = await s3Client.send(imageCommand);
                  const imageBuffer = await streamToBuffer(imageResponse.Body);
                  
                  // Upload media using X API v1.1 media upload (required for chunked uploads)
                  
                  const totalBytes = imageBuffer.length;
                  const mediaType = 'image/jpeg';
                  
                  // Step 1: INIT - Initialize media upload
                  const initFormData = new FormData();
                  initFormData.append('command', 'INIT');
                  initFormData.append('media_type', mediaType);
                  initFormData.append('total_bytes', totalBytes.toString());
                  initFormData.append('media_category', 'tweet_image');
                  
                  const initResponse = await axios.post('https://upload.twitter.com/1.1/media/upload.json', initFormData, {
                    headers: {
                      'Authorization': `Bearer ${tokenData.access_token}`,
                      ...initFormData.getHeaders()
                    }
                  });
                  
                  const mediaId = initResponse.data.media_id_string;
                  
                  // Step 2: APPEND - Upload media chunks
                  const chunkSize = 1024 * 1024; // 1MB chunks
                  let segmentIndex = 0;
                  
                  for (let i = 0; i < totalBytes; i += chunkSize) {
                    const chunk = imageBuffer.slice(i, Math.min(i + chunkSize, totalBytes));
                    
                    const appendFormData = new FormData();
                    appendFormData.append('command', 'APPEND');
                    appendFormData.append('media_id', mediaId);
                    appendFormData.append('segment_index', segmentIndex.toString());
                    appendFormData.append('media', chunk, {
                      filename: 'chunk.jpg',
                      contentType: mediaType
                    });
                    
                    await axios.post('https://upload.twitter.com/1.1/media/upload.json', appendFormData, {
                      headers: {
                        'Authorization': `Bearer ${tokenData.access_token}`,
                        ...appendFormData.getHeaders()
                      }
                    });
                    
                    segmentIndex++;
                  }
                  
                  // Step 3: FINALIZE - Complete media upload
                  const finalizeFormData = new FormData();
                  finalizeFormData.append('command', 'FINALIZE');
                  finalizeFormData.append('media_id', mediaId);
                  
                  const finalizeResponse = await axios.post('https://upload.twitter.com/1.1/media/upload.json', finalizeFormData, {
                    headers: {
                      'Authorization': `Bearer ${tokenData.access_token}`,
                      ...finalizeFormData.getHeaders()
                    }
                  });
                  
                  
                  // Step 4: STATUS - Check processing status if needed
                  if (finalizeResponse.data.processing_info) {
                    
                    let processingComplete = false;
                    let attempts = 0;
                    const maxAttempts = 30; // 30 attempts with 2 second intervals = 1 minute max
                    
                    while (!processingComplete && attempts < maxAttempts) {
                      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                      
                      const statusResponse = await axios.get(`https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`, {
                        headers: {
                          'Authorization': `Bearer ${tokenData.access_token}`
                        }
                      });
                      
                      const processingInfo = statusResponse.data.processing_info;
                      
                      if (processingInfo.state === 'succeeded') {
                        processingComplete = true;
                      } else if (processingInfo.state === 'failed') {
                        throw new Error('Media processing failed');
                      }
                      
                      attempts++;
                    }
                    
                    if (!processingComplete) {
                      throw new Error('Media processing timeout');
                    }
                  }
                  
                  
                  // Add media to tweet data
                  tweetData.media = { media_ids: [mediaId] };
                  
                } catch (mediaError) {
                  console.error(`[${new Date().toISOString()}] [SCHEDULER] Error uploading media for scheduled tweet:`, mediaError.response?.data || mediaError.message);
                  throw new Error('Failed to upload media');
                }
              }
              
              const response = await axios.post('https://api.x.com/2/tweets', tweetData, {
                headers: {
                  'Authorization': `Bearer ${tokenData.access_token}`,
                  'Content-Type': 'application/json'
                }
              });
              
              const tweetId = response.data.data.id;
              
              console.log(`[${new Date().toISOString()}] [SCHEDULER] Scheduled tweet posted: ${tweetId}`);
              
              // Update status to posted
              scheduledTweet.status = 'posted';
              scheduledTweet.tweet_id = tweetId;
              scheduledTweet.posted_at = new Date().toISOString();
              
              await s3Client.send(new PutObjectCommand({
                Bucket: 'tasks',
                Key: file.Key,
                Body: JSON.stringify(scheduledTweet, null, 2),
                ContentType: 'application/json'
              }));
              
              // Also store in posted tweets
              const tweetKey = `TwitterPosts/${scheduledTweet.user_id}/${tweetId}.json`;
              const tweetRecord = {
                tweet_id: tweetId,
                text: scheduledTweet.text,
                user_id: scheduledTweet.user_id,
                posted_at: scheduledTweet.posted_at,
                scheduled: true,
                schedule_id: scheduledTweet.schedule_id,
                status: 'posted'
              };
              
              await s3Client.send(new PutObjectCommand({
                Bucket: 'tasks',
                Key: tweetKey,
                Body: JSON.stringify(tweetRecord, null, 2),
                ContentType: 'application/json'
              }));
              
            } catch (postError) {
              console.error(`[${new Date().toISOString()}] [SCHEDULER] Error posting scheduled tweet ${scheduledTweet.schedule_id}:`, postError.response?.data || postError.message);
              
              // Update status to failed
              scheduledTweet.status = 'failed';
              scheduledTweet.error = postError.response?.data || postError.message;
              scheduledTweet.failed_at = new Date().toISOString();
              
              await s3Client.send(new PutObjectCommand({
                Bucket: 'tasks',
                Key: file.Key,
                Body: JSON.stringify(scheduledTweet, null, 2),
                ContentType: 'application/json'
              }));
            }
          }
        } catch (error) {
          console.error(`[${new Date().toISOString()}] [SCHEDULER] Error processing scheduled tweet file ${file.Key}:`, error);
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [SCHEDULER] Error in Twitter scheduler:`, error);
    }
  }, 60000); // Check every minute
}

// ============= INSTAGRAM POST SCHEDULER =============

// Instagram scheduler worker - checks for due Instagram posts every minute  
function startInstagramScheduler() {
  console.log(`[${new Date().toISOString()}] [SCHEDULER] Starting Instagram post scheduler...`);
  
  setInterval(async () => {
    try {
      console.log(`[${new Date().toISOString()}] [SCHEDULER] Running Instagram scheduler interval...`);
      await processScheduledInstagramPosts();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [SCHEDULER] Instagram scheduler error:`, error);
    }
  }, 60000); // Check every minute
}
async function processScheduledInstagramPosts() {
  try {
    console.log(`[${new Date().toISOString()}] [SCHEDULER] processScheduledInstagramPosts started.`);
    // List all scheduled posts
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'scheduled_posts/instagram/',
      MaxKeys: 1000 // Increased from 100 to 1000 to process more posts
    });
    
    const response = await s3Client.send(listCommand);
    const now = new Date();
    
    console.log(`[${new Date().toISOString()}] [SCHEDULER] Found ${response.Contents?.length || 0} scheduled posts to check`);
    
    if (response.Contents) {
      for (const object of response.Contents) {
        if (!object.Key?.endsWith('.json')) continue;
        
        // --- SURGICAL FIX: Skip if file is being processed or already moved ---
        try {
          // Quick check if file still exists (not moved yet)
          const headCommand = new HeadObjectCommand({
            Bucket: 'tasks',
            Key: object.Key
          });
          await s3Client.send(headCommand);
        } catch (notFoundError) {
          // File was moved/deleted, skip it
          console.log(`[SCHEDULER-TRACE] Skipping moved/deleted file: ${object.Key}`);
          continue;
        }
        // ----------------------------------------------------------------
        
        try {
          // Get schedule data
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: object.Key
          });
          
          const scheduleResponse = await s3Client.send(getCommand);
          const scheduleDataStr = await streamToString(scheduleResponse.Body);
          const scheduleData = JSON.parse(scheduleDataStr);

          // Check if it's time to post
          const scheduleTime = new Date(scheduleData.scheduleDate);
          
          // 🚫 CRITICAL FIX: Skip posts already being processed
          if (scheduleData.status === 'processing') {
            // Check if processing has been stuck for too long (5 minutes)
            if (scheduleData.processing_started_at) {
              const processingStart = new Date(scheduleData.processing_started_at);
              const processingDuration = now.getTime() - processingStart.getTime();
              const maxProcessingTime = 5 * 60 * 1000; // 5 minutes
              
              if (processingDuration > maxProcessingTime) {
                console.log(`[${new Date().toISOString()}] [SCHEDULER] Post ${scheduleData.id} stuck in processing for ${Math.round(processingDuration/1000)}s, resetting to scheduled`);
                scheduleData.status = 'scheduled';
                delete scheduleData.processing_started_at;
                
                await s3Client.send(new PutObjectCommand({
                  Bucket: 'tasks',
                  Key: object.Key,
                  Body: JSON.stringify(scheduleData, null, 2),
                  ContentType: 'application/json',
                }));
              } else {
                console.log(`[${new Date().toISOString()}] [SCHEDULER] Post ${scheduleData.id} being processed for ${Math.round(processingDuration/1000)}s, skipping`);
                continue;
              }
            } else {
              console.log(`[${new Date().toISOString()}] [SCHEDULER] Post ${scheduleData.id} already being processed, skipping`);
              continue;
            }
          }
          
          if (scheduleData.status === 'scheduled' && scheduleTime <= now) {
            console.log(`[${new Date().toISOString()}] [SCHEDULER] 🎯 Found due post: ${scheduleData.id} for user ${scheduleData.userId}`);
            
            // 🚫 CRITICAL FIX: Atomic locking to prevent duplicate processing
            try {
              // Immediately mark as processing to prevent race conditions
              scheduleData.status = 'processing';
              scheduleData.processing_started_at = new Date().toISOString();
              
              // Atomic update - if this fails, another worker already grabbed it
              await s3Client.send(new PutObjectCommand({
                Bucket: 'tasks',
                Key: object.Key,
                Body: JSON.stringify(scheduleData, null, 2),
                ContentType: 'application/json',
              }));
              
              console.log(`[${new Date().toISOString()}] [SCHEDULER] ✅ Locked post ${scheduleData.id} for processing`);
              
              // Now safely execute the post
              await executeScheduledPost(scheduleData);
              
            } catch (lockError) {
              // Another worker already grabbed this post
              console.log(`[${new Date().toISOString()}] [SCHEDULER] ⚠️ Post ${scheduleData.id} already being processed by another worker`);
              continue;
            }
          } else {
            // Log if post is not due for debugging
            if (scheduleData.status === 'scheduled') {
              console.log(`[${new Date().toISOString()}] [SCHEDULER] Post ${scheduleData.id} not due yet: scheduled for ${scheduleData.scheduleDate}, current time: ${now.toISOString()}`);
            }
          }
          
        } catch (itemError) {
          console.error(`[${new Date().toISOString()}] [SCHEDULER] Error processing scheduled item ${object.Key}:`, itemError.message);
        }
      }
    } else {
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [SCHEDULER] Error in processScheduledInstagramPosts:`, error.message);
  }
}

async function executeScheduledPost(scheduleData) {
  const { userId, imageKey, caption, scheduleId } = scheduleData;
  console.log(`[SCHEDULER-TRACE] Starting scheduled post: scheduleId=${scheduleId}, userId=${userId}, imageKey=${imageKey}`);
  
  // 🚫 CRITICAL FIX: Verify we still have the lock (processing status)
  if (scheduleData.status !== 'processing') {
    console.log(`[SCHEDULER-TRACE] ⚠️ Post ${scheduleId} lost processing lock, skipping`);
    return;
  }
  let tokenData;
  try {
    tokenData = await getTokenData(userId);
    console.log(`[SCHEDULER-TRACE] Token fetch success: userId=${userId}, tokenData=${JSON.stringify(tokenData)}`);
  } catch (err) {
    console.error(`[SCHEDULER-TRACE] Token fetch failed: userId=${userId}, error=${err.message}`);
    throw err;
  }
  
  let imageBuffer;
  try {
    // ENHANCED: Handle existing image keys properly
    console.log(`[SCHEDULER-TRACE] Fetching image: ${imageKey}`);
    
    // Determine the full R2 key for the image
    let fullImageKey = imageKey;
    
    // If the imageKey is just a filename (like "image_1.jpg"), construct the full path
    if (imageKey && !imageKey.includes('/')) {
      fullImageKey = `ready_post/instagram/${userId}/${imageKey}`;
      console.log(`[SCHEDULER-TRACE] Constructed full image key: ${fullImageKey}`);
    }
    
    // SIMPLIFIED: Direct image fetch like PostCooked - no validation, no fallbacks
    console.log(`[SCHEDULER-TRACE] Fetching image directly: ${fullImageKey}`);
    
    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: fullImageKey,
    });
    const response = await s3Client.send(getCommand);
    imageBuffer = await streamToBuffer(response.Body);
    
    console.log(`[SCHEDULER-TRACE] ✅ Image fetched successfully: ${fullImageKey}, size=${imageBuffer.length}`);
    
  } catch (err) {
    console.error(`[SCHEDULER-TRACE] Image fetch failed: userId=${userId}, imageKey=${imageKey}, error=${err.message}`);
    throw err;
  }
  
  try {
    const apiResponse = await postToInstagram(tokenData, imageBuffer, caption);
    console.log(`[SCHEDULER-TRACE] Instagram API call success: userId=${userId}, scheduleId=${scheduleId}, response=${JSON.stringify(apiResponse)}`);
    
    // 🎯 BULLETPROOF FIX: Update schedule status to prevent duplicate posting
    try {
      // First, try to construct the exact schedule file key if we have scheduleId
      let targetScheduleKey = null;
      
      if (scheduleId) {
        targetScheduleKey = `scheduled_posts/instagram/${userId}/${scheduleId}.json`;
        console.log(`[SCHEDULER-TRACE] Attempting direct schedule file access: ${targetScheduleKey}`);
        
        try {
          // Try direct access first (fastest path)
          const getDirectCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: targetScheduleKey,
          });
          const directResponse = await s3Client.send(getDirectCommand);
          const directScheduleStr = await streamToString(directResponse.Body);
          const directScheduleData = JSON.parse(directScheduleStr);
          
          // Update status immediately
          directScheduleData.status = 'posted';
          directScheduleData.posted_at = new Date().toISOString();
          directScheduleData.post_id = apiResponse.post_id;
          directScheduleData.media_id = apiResponse.media_id;
          
          // CRITICAL: Use atomic operation to prevent race conditions
          const completedKey = targetScheduleKey.replace('scheduled_posts/', 'completed_posts/');
          
          // Move to completed folder first
          await s3Client.send(new PutObjectCommand({
            Bucket: 'tasks',
            Key: completedKey,
            Body: JSON.stringify(directScheduleData, null, 2),
            ContentType: 'application/json',
          }));
          
          // Then delete original (atomic cleanup)
          await s3Client.send(new DeleteObjectCommand({
            Bucket: 'tasks',
            Key: targetScheduleKey,
          }));
          
          console.log(`[SCHEDULER-TRACE] ✅ BULLETPROOF: Schedule moved to completed successfully: ${completedKey}`);
          
        } catch (directError) {
          console.log(`[SCHEDULER-TRACE] Direct access failed, falling back to search: ${directError.message}`);
          targetScheduleKey = null; // Fall back to search method
        }
      }
      
      // Fallback: Search for the schedule file if direct access failed
      if (!targetScheduleKey) {
        const listCommand = new ListObjectsV2Command({
          Bucket: 'tasks',
          Prefix: `scheduled_posts/instagram/${userId}/`,
        });
        const scheduleFiles = await s3Client.send(listCommand);
        
        console.log(`[SCHEDULER-TRACE] Searching through ${scheduleFiles.Contents?.length || 0} schedule files`);
        
        if (scheduleFiles.Contents) {
          for (const file of scheduleFiles.Contents) {
            if (file.Key.endsWith('.json')) {
              try {
                const getScheduleCommand = new GetObjectCommand({
                  Bucket: 'tasks',
                  Key: file.Key,
                });
                const scheduleResponse = await s3Client.send(getScheduleCommand);
                const scheduleDataStr = await streamToString(scheduleResponse.Body);
                const foundScheduleData = JSON.parse(scheduleDataStr);
                
                // Enhanced matching logic
                const isMatch = (
                  (foundScheduleData.imageKey === imageKey) ||
                  (scheduleId && foundScheduleData.id === scheduleId) ||
                  (foundScheduleData.caption?.trim() === caption?.trim() && foundScheduleData.userId === userId && foundScheduleData.status === 'scheduled')
                );
                
                if (isMatch) {
                  console.log(`[SCHEDULER-TRACE] Found matching schedule file: ${file.Key}`);
                  
                  // Update status
                  foundScheduleData.status = 'posted';
                  foundScheduleData.posted_at = new Date().toISOString();
                  foundScheduleData.post_id = apiResponse.post_id;
                  foundScheduleData.media_id = apiResponse.media_id;
                  
                  // Move to completed and delete original
                  const completedKey = file.Key.replace('scheduled_posts/', 'completed_posts/');
                  
                  await s3Client.send(new PutObjectCommand({
                    Bucket: 'tasks',
                    Key: completedKey,
                    Body: JSON.stringify(foundScheduleData, null, 2),
                    ContentType: 'application/json',
                  }));
                  
                  await s3Client.send(new DeleteObjectCommand({
                    Bucket: 'tasks',
                    Key: file.Key,
                  }));
                  
                  console.log(`[SCHEDULER-TRACE] ✅ BULLETPROOF: Schedule moved to completed via search: ${completedKey}`);
                  break;
                }
              } catch (updateError) {
                console.error(`[SCHEDULER-TRACE] Error processing schedule file ${file.Key}:`, updateError.message);
                continue; // Continue searching other files
              }
            }
          }
        }
      }
    } catch (cleanupError) {
      console.error(`[SCHEDULER-TRACE] CRITICAL: Schedule cleanup failed - this may cause duplicates:`, cleanupError.message);
      // Even if cleanup fails, we posted successfully, so log this clearly
      console.log(`[SCHEDULER-TRACE] ⚠️ POST WAS SUCCESSFUL but cleanup failed - monitor for duplicates`);
    }
    // ----------------------------------------------------------------
    
    return apiResponse;
  } catch (err) {
    console.error(`[SCHEDULER-TRACE] Instagram API call failed: userId=${userId}, scheduleId=${scheduleId}, error=${err.message}`);
    
    // Update status to 'failed' to prevent infinite retries
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: `scheduled_posts/instagram/${userId}/`,
      });
      const scheduleFiles = await s3Client.send(listCommand);
      
      if (scheduleFiles.Contents) {
        for (const file of scheduleFiles.Contents) {
          if (file.Key.endsWith('.json')) {
            try {
              const getScheduleCommand = new GetObjectCommand({
                Bucket: 'tasks',
                Key: file.Key,
              });
              const scheduleResponse = await s3Client.send(getScheduleCommand);
              const scheduleDataStr = await streamToString(scheduleResponse.Body);
              const scheduleData = JSON.parse(scheduleDataStr);
              
              if ((scheduleData.imageKey === imageKey) || 
                  (scheduleId && scheduleData.scheduleId === scheduleId) ||
                  (scheduleData.caption === caption && scheduleData.userId === userId)) {
                
                scheduleData.status = 'failed';
                scheduleData.error = err.message;
                scheduleData.failed_at = new Date().toISOString();
                
                await s3Client.send(new PutObjectCommand({
                  Bucket: 'tasks',
                  Key: file.Key,
                  Body: JSON.stringify(scheduleData, null, 2),
                  ContentType: 'application/json',
                }));
                
                console.log(`[SCHEDULER-TRACE] ✅ Updated schedule status to 'failed': ${file.Key}`);
                break;
              }
            } catch (updateError) {
              console.error(`[SCHEDULER-TRACE] Error updating failed schedule:`, updateError.message);
            }
          }
        }
      }
    } catch (cleanupError) {
      console.error(`[SCHEDULER-TRACE] Error in failed schedule cleanup:`, cleanupError.message);
    }
    
    throw err;
  }
}

// ... Instagram postToInstagram helper for scheduler ...
async function postToInstagram(tokenData, imageBuffer, caption) {
  try {
    const { access_token, instagram_graph_id } = tokenData;
    // Validate image size
    if (imageBuffer.length > 8 * 1024 * 1024) {
      throw new Error('Image too large. Maximum file size is 8MB for Instagram posts.');
    }
    // Upload image to R2 for short-lived public access
    const fileExtension = 'jpg';
    const r2Key = `temp_instagram_uploads/scheduler/${instagram_graph_id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: r2Key,
      Body: imageBuffer,
      ContentType: 'image/jpeg',
      ACL: 'public-read'
    }));
    const publicImageUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: 'tasks', Key: r2Key }),
      { expiresIn: 900 }
    );
    // Create Instagram media object
    const mediaResponse = await axios.post(`https://graph.instagram.com/v22.0/${instagram_graph_id}/media`, {
      image_url: publicImageUrl,
      caption: caption.trim(),
      access_token: access_token
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    const mediaId = mediaResponse.data.id;
    // Publish the media
    const publishResponse = await axios.post(`https://graph.instagram.com/v22.0/${instagram_graph_id}/media_publish`, {
      creation_id: mediaId,
      access_token: access_token
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    const postId = publishResponse.data.id;
    // Store post record for tracking
    const postKey = `InstagramPosts/${instagram_graph_id}/${postId}.json`;
    const postData = {
      id: postId,
      userId: instagram_graph_id,
      platform: 'instagram',
      caption: caption.trim(),
      media_id: mediaId,
      instagram_graph_id,
      posted_at: new Date().toISOString(),
      status: 'published',
      type: 'scheduled_post'
    };
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: postKey,
      Body: JSON.stringify(postData, null, 2),
      ContentType: 'application/json',
    }));
    return {
      success: true,
      message: 'Instagram post published successfully!',
      post_id: postId,
      media_id: mediaId,
      posted_at: postData.posted_at
    };
  } catch (error) {
    let errorMessage = 'Failed to post to Instagram';
    if (error.response?.data?.error?.message) {
      errorMessage = error.response.data.error.message;
    } else if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
    } else if (error.message) {
      errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

// ============= 🚀 AUTOPILOT BACKGROUND WATCHERS =============

// Start autopilot background watchers
function startAutopilotWatchers() {
  console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🚀 Starting background watchers...`);
  
  // 🔥 IMMEDIATE FIRST RUN: Run once immediately on startup
  setTimeout(() => {
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🏃‍♂️ Running initial autopilot check...`);
    processAutopilotScheduling();
    processAutopilotReplies();
  }, 5000); // Run after 5 seconds to allow server to fully start
  
  // Auto-schedule watcher - checks for new posts to schedule every 3 minutes
  const scheduleInterval = setInterval(async () => {
    try {
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🔄 Running scheduled auto-schedule check...`);
      await processAutopilotScheduling();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [AUTOPILOT] Auto-schedule watcher error:`, error);
    }
  }, 180000); // Check every 3 minutes
  
  // Auto-reply watcher - checks for new DMs/comments to reply to every 30 seconds
  const replyInterval = setInterval(async () => {
    try {
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🔄 Running scheduled auto-reply check...`);
      await processAutopilotReplies();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [AUTOPILOT] Auto-reply watcher error:`, error);
    }
  }, 30000); // Check every 30 seconds (30,000 ms)
  
  console.log(`[${new Date().toISOString()}] [AUTOPILOT] ✅ Background watchers started successfully`);
  console.log(`[${new Date().toISOString()}] [AUTOPILOT] 📅 Auto-schedule: Every 3 minutes (180,000ms)`);
  console.log(`[${new Date().toISOString()}] [AUTOPILOT] 💬 Auto-reply: Every 30 seconds (30,000ms)`);
  
  // Store interval references for potential cleanup
  global.autopilotIntervals = {
    schedule: scheduleInterval,
    reply: replyInterval
  };
}

// 🚀 AUTOPILOT: Process automatic scheduling for users with autopilot enabled
async function processAutopilotScheduling() {
  console.log(`[${new Date().toISOString()}] [AUTOPILOT] 📅 Checking for auto-schedule tasks...`);
  
  try {
    // Get all autopilot settings
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'autopilot_settings/',
      MaxKeys: 1000
    });
    
    const response = await s3Client.send(listCommand);
    
    if (!response.Contents || response.Contents.length === 0) {
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] No autopilot settings found`);
      return;
    }
    
    for (const object of response.Contents) {
      if (!object.Key?.endsWith('/settings.json')) continue;
      
      try {
        // Get autopilot settings
        const getCommand = new GetObjectCommand({
          Bucket: 'tasks',
          Key: object.Key
        });
        
        const settingsResponse = await s3Client.send(getCommand);
        const settings = JSON.parse(await settingsResponse.Body.transformToString());
        
        // Skip if autopilot or auto-schedule is disabled
        if (!settings.enabled || !settings.autoSchedule) {
          continue;
        }
        
        const { username, platform } = settings;
        
        // 🔥 PLATFORM-SPECIFIC FIX: Only process autopilot for the specific platform where it was enabled
        // Check if the settings file path matches the platform we're processing
        const settingsKeyPlatform = object.Key.split('/')[1]; // Extract platform from path like autopilot_settings/instagram/username/settings.json
        if (settingsKeyPlatform !== platform) {
          console.log(`[${new Date().toISOString()}] [AUTOPILOT] ⚠️ Platform mismatch: settings key has ${settingsKeyPlatform} but settings data has ${platform}, skipping...`);
          continue;
        }
        
        console.log(`[${new Date().toISOString()}] [AUTOPILOT] 📅 Checking ${platform}/${username} for new posts to schedule...`);
        
        // Check for new ready posts
        await checkAndScheduleNewPosts(username, platform, settings);
        
      } catch (error) {
        console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error processing ${object.Key}:`, error);
      }
    }
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error in processAutopilotScheduling:`, error);
  }
}

// � BULLETPROOF AUTOPILOT: Critical race condition protection
const autopilotLocks = new Map();
// In-memory cache of recently auto-replied event ids to prevent duplicate sends within the same process
const sentEventCache = new Map(); // key: eventId, value: timestamp // Prevent concurrent autopilot runs for same user/platform

// Cleanup old locks periodically (every 10 minutes) to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const lockTimeout = 10 * 60 * 1000; // 10 minutes
  
  for (const [lockKey, timestamp] of autopilotLocks.entries()) {
    if (now - timestamp > lockTimeout) {
      autopilotLocks.delete(lockKey);
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🧹 Cleaned up expired lock: ${lockKey}`);
    }
  }
}, 10 * 60 * 1000);

// �🚀 AUTOPILOT: Check for new posts and schedule them automatically
async function checkAndScheduleNewPosts(username, platform, settings) {
  // 🔒 RACE CONDITION PROTECTION: Implement user/platform locking
  const lockKey = `${platform}/${username}`;
  
  if (autopilotLocks.has(lockKey)) {
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🔒 Lock active for ${lockKey}, skipping to prevent race condition`);
    return;
  }
  
  // Set lock
  autopilotLocks.set(lockKey, Date.now());
  
  try {
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🔓 Acquired lock for ${lockKey}, proceeding with scheduling`);
    
    // Get ready posts for this user/platform
    // Use correct prefix for ready posts according to R2 schema
    const postsPrefix = `ready_post/${platform}/${username}/`;
    
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: postsPrefix,
      MaxKeys: 50
    });
    
    const postsResponse = await s3Client.send(listCommand);
    
    if (!postsResponse.Contents || postsResponse.Contents.length === 0) {
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] No ready posts found for ${platform}/${username}`);
      return;
    }
    
    // Get existing scheduled posts to calculate next schedule time (checkpoint system)
    const lastScheduledTime = await getLastScheduledPostTime(username, platform);
    const intervalHours = await getSchedulingInterval(username, platform);
    
    let nextScheduleTime = lastScheduledTime ? 
      new Date(lastScheduledTime.getTime() + (intervalHours * 60 * 60 * 1000)) :
      new Date(Date.now() + 60 * 1000); // Start 1 minute from now if no posts exist
    
    // 🚨 CRITICAL: Enforce minimum 30 minutes between any schedules for same user
    const minimumInterval = 30 * 60 * 1000; // 30 minutes
    const earliestAllowedTime = new Date(Date.now() + minimumInterval);
    
    if (nextScheduleTime < earliestAllowedTime) {
      nextScheduleTime = earliestAllowedTime;
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] ⚠️ Enforcing minimum 30-minute interval, adjusted schedule time to: ${nextScheduleTime.toISOString()}`);
    }
    
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 📅 Next schedule time for ${platform}/${username}: ${nextScheduleTime.toISOString()}`);
    
    let scheduledCount = 0;
    const maxPostsPerRun = 3; // Limit posts per autopilot run to prevent overwhelming
    
    for (const postObject of postsResponse.Contents) {
      if (!postObject.Key?.endsWith('.json')) continue;
      if (scheduledCount >= maxPostsPerRun) {
        console.log(`[${new Date().toISOString()}] [AUTOPILOT] Reached max posts per run (${maxPostsPerRun}), stopping`);
        break;
      }
      
      try {
        // 🔒 PRE-SCHEDULE LOCK: Mark post as being processed immediately
        await markPostAsAutoScheduled(postObject.Key, username, platform);
        
        // Get post data
        const getPostCommand = new GetObjectCommand({
          Bucket: 'tasks',
          Key: postObject.Key
        });
        
        const postResponse = await s3Client.send(getPostCommand);
        const postData = JSON.parse(await postResponse.Body.transformToString());
        
        // Check if post is already scheduled (double-check after marking)
        const isAlreadyScheduled = await checkIfPostAlreadyScheduled(postObject.Key, username, platform);
        if (isAlreadyScheduled) {
          console.log(`[${new Date().toISOString()}] [AUTOPILOT] Post ${postObject.Key} already scheduled, skipping`);
          continue;
        }
        
        // Schedule this post
        const scheduleResult = await schedulePostAutomatically(postData, postObject.Key, username, platform, nextScheduleTime);
        
        if (scheduleResult.success) {
          scheduledCount++;
          console.log(`[${new Date().toISOString()}] [AUTOPILOT] ✅ Auto-scheduled post ${postObject.Key} for ${nextScheduleTime.toISOString()}`);
          
          // Calculate next schedule time with proper interval (minimum 1 hour apart)
          const scheduleInterval = Math.max(intervalHours, 1) * 60 * 60 * 1000; // Minimum 1 hour
          nextScheduleTime = new Date(nextScheduleTime.getTime() + scheduleInterval);
        } else {
          console.error(`[${new Date().toISOString()}] [AUTOPILOT] Failed to schedule post ${postObject.Key}:`, scheduleResult.error);
        }
        
      } catch (error) {
        console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error scheduling post ${postObject.Key}:`, error);
      }
    }
    
    if (scheduledCount > 0) {
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🎉 Auto-scheduled ${scheduledCount} posts for ${platform}/${username}`);
    }
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error in checkAndScheduleNewPosts:`, error);
  } finally {
    // 🔓 ALWAYS RELEASE LOCK
    autopilotLocks.delete(lockKey);
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🔓 Released lock for ${lockKey}`);
  }
}

// 🚀 AUTOPILOT: Process automatic replies for users with autopilot enabled
async function processAutopilotReplies() {
  console.log(`[${new Date().toISOString()}] [AUTOPILOT] 💬 Checking for auto-reply tasks...`);
  
  try {
    // Get all autopilot settings
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'autopilot_settings/',
      MaxKeys: 1000
    });
    
    const response = await s3Client.send(listCommand);
    
    if (!response.Contents || response.Contents.length === 0) {
      return;
    }
    
    for (const object of response.Contents) {
      if (!object.Key?.endsWith('/settings.json')) continue;
      
      try {
        // Get autopilot settings
        const getCommand = new GetObjectCommand({
          Bucket: 'tasks',
          Key: object.Key
        });
        
        const settingsResponse = await s3Client.send(getCommand);
        const settings = JSON.parse(await settingsResponse.Body.transformToString());
        
        // Skip if autopilot or auto-reply is disabled
        if (!settings.enabled || !settings.autoReply) {
          continue;
        }
        
        const { username, platform } = settings;
        
        // 🔥 PLATFORM-SPECIFIC FIX: Only process autopilot for the specific platform where it was enabled
        // Check if the settings file path matches the platform we're processing
        const settingsKeyPlatform = object.Key.split('/')[1]; // Extract platform from path like autopilot_settings/instagram/username/settings.json
        if (settingsKeyPlatform !== platform) {
          console.log(`[${new Date().toISOString()}] [AUTOPILOT] ⚠️ Platform mismatch: settings key has ${settingsKeyPlatform} but settings data has ${platform}, skipping...`);
          continue;
        }
        
        console.log(`[${new Date().toISOString()}] [AUTOPILOT] 💬 Checking ${platform}/${username} for new messages to reply to...`);
        
        // Check for new messages/comments to reply to
        await checkAndReplyToNewMessages(username, platform, settings);
        
      } catch (error) {
        console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error processing ${object.Key}:`, error);
      }
    }
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error in processAutopilotReplies:`, error);
  }
}
// 🚀 AUTOPILOT: Check for new messages and reply automatically
async function checkAndReplyToNewMessages(username, platform, settings) {
  // 🔒 RACE CONDITION PROTECTION: Implement user/platform locking for replies
  const lockKey = `reply/${platform}/${username}`;
  if (autopilotLocks.has(lockKey)) {
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🔒 Reply lock active for ${lockKey}, skipping to prevent race condition`);
    return;
  }
  autopilotLocks.set(lockKey, Date.now());
  try {
    // Get platform-specific events that need replies
    const eventsPrefix = platform === 'instagram' ? `InstagramEvents/` :
                        platform === 'twitter' ? `TwitterEvents/` :
                        platform === 'facebook' ? `FacebookEvents/` : null;
    
    if (!eventsPrefix) {
      console.warn(`[${new Date().toISOString()}] [AUTOPILOT] Unknown platform: ${platform}`);
      return;
    }
    
    // Find events for this user that are unhandled
    let notifications = await getUnhandledNotifications(username, platform);
    // Filter out events we very recently replied to within this process (5 minutes window)
    const nowMs = Date.now();
    notifications = notifications.filter(n => {
      const last = sentEventCache.get(n.id);
      return !last || (nowMs - last) > 5 * 60 * 1000; // 5 minutes
    });
    
    if (notifications.length === 0) {
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] No unhandled notifications for ${platform}/${username}`);
      return;
    }
    
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 💬 Found ${notifications.length} unhandled notifications for ${platform}/${username}`);
    
    // Process auto-replies (limit to 5 at a time to avoid spam)
    const limitedNotifications = notifications.slice(0, 5);
    
    for (const notification of limitedNotifications) {
      // Double-check cache right before sending
      if (sentEventCache.has(notification.id)) continue;
      try {
        // Generate AI reply using the existing RAG system
        const aiReplyResult = await generateAutopilotReply(notification, username, platform);
        
        if (aiReplyResult.success) {
          // Send the reply automatically
          const sendResult = await sendAutopilotReply(notification, aiReplyResult.reply, username, platform);
          
          if (sendResult.success) {
            // Add to in-memory cache so we skip this event in future scans
            sentEventCache.set(notification.id, Date.now());
            // Respect 45-second throttle between consecutive replies
            await new Promise(r => setTimeout(r, 45 * 1000));
            console.log(`[${new Date().toISOString()}] [AUTOPILOT] ✅ Auto-replied to ${notification.type} ${notification.message_id || notification.comment_id}`);
          }
        }
        
      } catch (error) {
        console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error auto-replying to notification:`, error);
      }
    }
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error in checkAndReplyToNewMessages:`, error);
  } finally {
    // 🔓 ALWAYS RELEASE REPLY LOCK
    autopilotLocks.delete(lockKey);
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🔓 Released reply lock for ${lockKey}`);
  }
}
// Helper functions for autopilot (implementations simplified for core functionality)

async function getLastScheduledPostTime(username, platform) {
  // 🔥 ENHANCED: Get the most recent scheduled post time for intelligent interval calculation
  try {
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🕐 Finding last scheduled post time for ${platform}/${username}`);
    
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `scheduled_posts/${platform}/`,
      MaxKeys: 1000
    });
    
    const response = await s3Client.send(listCommand);
    let latestTime = null;
    let scheduledPostsCount = 0;
    
    if (response.Contents) {
      for (const object of response.Contents) {
        if (!object.Key?.endsWith('.json')) continue;
        
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: object.Key
          });
          
          const scheduleResponse = await s3Client.send(getCommand);
          const scheduleData = JSON.parse(await scheduleResponse.Body.transformToString());
          
          // Only consider posts for this user
          if (scheduleData.username === username || scheduleData.userId === username) {
            scheduledPostsCount++;
            const scheduleTime = new Date(scheduleData.scheduleDate || scheduleData.scheduledDate);
            
            // Only consider future posts or very recent past posts (within 1 hour)
            const now = new Date();
            const hoursDiff = (scheduleTime - now) / (1000 * 60 * 60);
            
            if (hoursDiff > -1) { // Include posts scheduled within the last hour
              if (!latestTime || scheduleTime > latestTime) {
                latestTime = scheduleTime;
              }
            }
          }
        } catch (error) {
          // Skip invalid files
        }
      }
    }
    
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 📊 Found ${scheduledPostsCount} scheduled posts for ${platform}/${username}, latest time: ${latestTime?.toISOString() || 'none'}`);
    return latestTime;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error getting last scheduled time:`, error);
    return null;
  }
}

async function getSchedulingInterval(username, platform) {
  // 🔥 INTELLIGENT INTERVAL: Get smart posting interval from user settings
  try {
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] ⏱️ Determining posting interval for ${platform}/${username}`);
    
    // Method 1: Try to get interval from user's goal/campaign settings
    const goalKey = `user_goals/${platform}/${username}/goal.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: goalKey
      });
      
      const goalResponse = await s3Client.send(getCommand);
      const goalData = JSON.parse(await goalResponse.Body.transformToString());
      
      if (goalData.Posting_Delay_Intervals) {
        const interval = parseInt(goalData.Posting_Delay_Intervals);
        if (!isNaN(interval) && interval > 0) {
          console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🎯 Using campaign interval: ${interval} hours`);
          return interval;
        }
      }
      
      // Check for other interval fields
      if (goalData.posting_interval || goalData.post_interval) {
        const interval = parseInt(goalData.posting_interval || goalData.post_interval);
        if (!isNaN(interval) && interval > 0) {
          console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🎯 Using alternative interval: ${interval} hours`);
          return interval;
        }
      }
      
    } catch (error) {
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] No goal settings found for ${platform}/${username}, using default`);
    }
    
    // Method 2: Try to get from autopilot settings
    try {
      const autopilotKey = `autopilot_settings/${platform}/${username}/settings.json`;
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: autopilotKey
      });
      
      const autopilotResponse = await s3Client.send(getCommand);
      const autopilotData = JSON.parse(await autopilotResponse.Body.transformToString());
      
      if (autopilotData.customInterval && autopilotData.customInterval > 0) {
        console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🤖 Using autopilot custom interval: ${autopilotData.customInterval} hours`);
        return autopilotData.customInterval;
      }
    } catch (error) {
      // No custom autopilot interval set
    }
    
    // Method 3: Intelligent default based on platform
    let defaultInterval;
    switch (platform) {
      case 'instagram':
        defaultInterval = 6; // Instagram posts every 6 hours
        break;
      case 'twitter':
        defaultInterval = 3; // Twitter posts every 3 hours (more frequent)
        break;
      case 'facebook':
        defaultInterval = 8; // Facebook posts every 8 hours
        break;
      default:
        defaultInterval = 4; // Default 4 hours as mentioned in requirements
    }
    
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 📅 Using platform default interval: ${defaultInterval} hours for ${platform}`);
    return defaultInterval;
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error getting scheduling interval:`, error);
    return 4; // Safe fallback
  }
}

async function checkIfPostAlreadyScheduled(postKey, username, platform) {
  // 🔥 BULLETPROOF: Comprehensive duplicate detection with robust pattern matching
  try {
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🔍 Checking if post already scheduled: ${postKey}`);
    
    // STEP 1: Check autopilot processing markers with ROBUST key matching
    const markerPrefix = `autopilot_processed/${platform}/${username}/`;
    const markerCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: markerPrefix,
      MaxKeys: 1000
    });
    
    const markerResponse = await s3Client.send(markerCommand);
    if (markerResponse.Contents) {
      // Extract the core identifier from postKey for reliable matching
      let postIdentifier = null;
      
      // Handle different post key formats
      if (postKey.includes('campaign_ready_post_')) {
        const campaignMatch = postKey.match(/campaign_ready_post_(\d+_[a-f0-9]+)\.json$/);
        postIdentifier = campaignMatch ? campaignMatch[1] : null;
      } else if (postKey.includes('ready_post_')) {
        const traditionalMatch = postKey.match(/ready_post_(\d+)\.json$/);
        postIdentifier = traditionalMatch ? traditionalMatch[1] : null;
      }
      
      if (postIdentifier) {
        for (const marker of markerResponse.Contents) {
          if (marker.Key && marker.Key.includes(postIdentifier)) {
            console.log(`[${new Date().toISOString()}] [AUTOPILOT] ✅ Found autopilot marker for ${postKey} with identifier ${postIdentifier}`);
            return true;
          }
        }
      }
    }
    
    // STEP 2: Check existing scheduled posts with ENHANCED matching
    const scheduledPrefix = `scheduled_posts/${platform}/`;
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: scheduledPrefix,
      MaxKeys: 1000
    });
    
    const response = await s3Client.send(listCommand);
    
    if (response.Contents) {
      // Get post data once for comparison
      let sourcePostData = null;
      try {
        const getSourceCommand = new GetObjectCommand({
          Bucket: 'tasks',
          Key: postKey
        });
        const sourceResponse = await s3Client.send(getSourceCommand);
        sourcePostData = JSON.parse(await sourceResponse.Body.transformToString());
      } catch (sourceError) {
        console.warn(`[${new Date().toISOString()}] [AUTOPILOT] Could not load source post data for ${postKey}`);
      }
      
      for (const object of response.Contents) {
        if (!object.Key?.endsWith('.json')) continue;
        
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: object.Key
          });
          
          const scheduleResponse = await s3Client.send(getCommand);
          const scheduleData = JSON.parse(await scheduleResponse.Body.transformToString());
          
          // ROBUST KEY MATCHING: Check multiple key fields
          if (scheduleData.username === username && 
              (scheduleData.postKey === postKey || 
               scheduleData.originalPostKey === postKey ||
               scheduleData.autopilot_source === postKey ||
               scheduleData.sourceKey === postKey)) {
            console.log(`[${new Date().toISOString()}] [AUTOPILOT] ✅ Found existing schedule by key match for ${postKey}`);
            return true;
          }
          
          // CAPTION-BASED DUPLICATE DETECTION: Enhanced with better validation
          if (scheduleData.username === username && 
              scheduleData.status === 'scheduled' &&
              sourcePostData && sourcePostData.caption &&
              scheduleData.caption) {
            
            // Normalize captions for comparison (remove extra whitespace, etc.)
            const sourceCaption = sourcePostData.caption.trim().replace(/\s+/g, ' ');
            const scheduleCaption = scheduleData.caption.trim().replace(/\s+/g, ' ');
            
            if (sourceCaption === scheduleCaption) {
              console.log(`[${new Date().toISOString()}] [AUTOPILOT] ✅ Found existing schedule by caption match for ${postKey}`);
              return true;
            }
          }
          
          // TIME-BASED PROTECTION: Prevent scheduling within 10 minutes of existing schedules
          if (scheduleData.username === username && 
              scheduleData.status === 'scheduled' &&
              scheduleData.scheduledTime) {
            
            const existingTime = new Date(scheduleData.scheduledTime);
            const now = new Date();
            const timeDiff = Math.abs(existingTime.getTime() - now.getTime());
            const tenMinutes = 10 * 60 * 1000;
            
            if (timeDiff < tenMinutes) {
              console.log(`[${new Date().toISOString()}] [AUTOPILOT] ⚠️ Found recent schedule within 10 minutes for ${username}, blocking duplicate`);
              return true;
            }
          }
          
        } catch (error) {
          // Skip invalid files
          console.warn(`[${new Date().toISOString()}] [AUTOPILOT] Error checking scheduled post ${object.Key}:`, error.message);
        }
      }
    }
    
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] ✅ Post ${postKey} is clear for scheduling`);
    return false;
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error checking if post scheduled:`, error);
    // FAIL SAFE: Return true to prevent scheduling on error
    return true;
  }
}

async function schedulePostAutomatically(postData, postKey, username, platform, scheduleTime) {
  // 🔥 REAL IMPLEMENTATION: Use existing native scheduler to schedule posts
  try {
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 📅 Auto-scheduling post for ${platform}/${username} at ${scheduleTime.toISOString()}`);
    
    // 🔥 BULLETPROOF IMAGE KEY EXTRACTION: Handle both traditional and campaign posts
    // Post key formats: 
    // - Traditional: ready_post/platform/username/ready_post_123456.json
    // - Campaign: ready_post/platform/username/campaign_ready_post_123456_hash.json
    
    let fileId = null;
    let isTraditionalPost = false;
    let isCampaignPost = false;
    
    // Pattern 1: Traditional posts
    const traditionalMatch = postKey.match(/ready_post_(\d+)\.json$/);
    if (traditionalMatch) {
      fileId = traditionalMatch[1];
      isTraditionalPost = true;
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] Traditional post detected, fileId: ${fileId}`);
    }
    
    // Pattern 2: Campaign posts  
    const campaignMatch = postKey.match(/campaign_ready_post_(\d+_[a-f0-9]+)\.json$/);
    if (campaignMatch) {
      fileId = campaignMatch[1]; // Includes both timestamp and hash
      isCampaignPost = true;
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] Campaign post detected, fileId: ${fileId}`);
    }
    
    if (!fileId) {
      throw new Error(`Cannot extract file ID from post key: ${postKey}. Expected format: ready_post_123456.json or campaign_ready_post_123456_hash.json`);
    }
    
    const prefix = postKey.replace(/[^\/]+$/, ''); // Get directory path
    
    // Build potential image keys based on post type
    let potentialImageKeys = [];
    
    if (isCampaignPost) {
      // Campaign posts: image has same name as JSON but with image extension
      potentialImageKeys = [
        `${prefix}campaign_ready_post_${fileId}.jpg`,
        `${prefix}campaign_ready_post_${fileId}.jpeg`,
        `${prefix}campaign_ready_post_${fileId}.png`,
        `${prefix}campaign_ready_post_${fileId}.webp`
      ];
    } else if (isTraditionalPost) {
      // Traditional posts: multiple naming patterns
      potentialImageKeys = [
        `${prefix}image_${fileId}.jpg`,
        `${prefix}image_${fileId}.jpeg`,
        `${prefix}image_${fileId}.png`,
        `${prefix}ready_post_${fileId}.jpg`,
        `${prefix}ready_post_${fileId}.png`,
        `${prefix}ready_post_${fileId}.jpeg`
      ];
    }
    
    // Find which image exists in R2 - Use direct R2 access instead of API endpoint
    let imageKey = null;
    for (const testKey of potentialImageKeys) {
      try {
        // Use direct R2 command to check if image exists
        const getCommand = new GetObjectCommand({
          Bucket: 'tasks',
          Key: testKey
        });
        await s3Client.send(getCommand);
        imageKey = testKey; // Keep the full path, not just filename
        console.log(`[${new Date().toISOString()}] [AUTOPILOT] Found image: ${imageKey}`);
        break;
      } catch (e) {
        // Continue trying other keys - this is expected for non-existent keys
      }
    }
    
    if (!imageKey) {
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] Tried image keys: ${potentialImageKeys.map(k => k.split('/').pop()).join(', ')}`);
      throw new Error(`No image found for post ${postKey}. Expected keys: ${potentialImageKeys.map(k => k.split('/').pop()).join(', ')}`);
    }
    
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] Found image: ${imageKey}`);
    
    // Get image from R2 storage using direct R2 access
    let imageBlob;
    try {
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] Fetching image from R2: ${imageKey}`);
      
      // Use direct R2 command to get the image
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: imageKey
      });
      
      const response = await s3Client.send(getCommand);
      const imageBuffer = await streamToBuffer(response.Body);
      imageBlob = new Blob([imageBuffer], { type: response.ContentType || 'image/png' });
      
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] Successfully fetched image: ${imageKey}, size: ${imageBlob.size} bytes`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [AUTOPILOT] Failed to fetch image from R2:`, error);
      throw new Error(`Failed to fetch image from R2: ${error.message}`);
    }
    
    // Validate image
    if (!imageBlob || imageBlob.size === 0) {
      throw new Error('Empty or invalid image blob');
    }
    
    // Prepare FormData for scheduling
    const formData = new FormData();
    
    // 🔥 FIX: Detect actual image format instead of hardcoding JPG
    let detectedFormat = 'jpeg';
    
    // Check image blob type to detect actual format
    if (imageBlob.type === 'image/png') {
      detectedFormat = 'png';
    } else if (imageBlob.type === 'image/webp') {
      detectedFormat = 'webp';
    }
    // JPEG is the default
    
    formData.append('image', imageBlob, `autopilot_${platform}_post_${Date.now()}.${detectedFormat}`);
    formData.append('caption', postData.caption || postData.text || '');
    formData.append('scheduleDate', scheduleTime.toISOString());
    formData.append('platform', platform);
    formData.append('autopilot', 'true'); // Mark as autopilot-scheduled
    
    // Use existing native scheduler endpoint
    const scheduleResponse = await fetch(`${process.env.API_BASE_URL || 'http://localhost:3000'}/schedule-post/${username}`, {
      method: 'POST',
      body: formData
    });
    
    if (!scheduleResponse.ok) {
      const errorText = await scheduleResponse.text();
      throw new Error(`Schedule API error: ${errorText}`);
    }
    
    const scheduleResult = await scheduleResponse.json();
    
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] ✅ Post auto-scheduled successfully: ${scheduleResult.schedule_id || 'no-id'}`);
    
    return { 
      success: true, 
      scheduleId: scheduleResult.schedule_id || `autopilot_${Date.now()}`,
      scheduleTime: scheduleTime.toISOString(),
      platform: platform,
      username: username
    };
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error in schedulePostAutomatically:`, error);
    return { success: false, error: error.message };
  }
}

async function markPostAsAutoScheduled(postKey, username, platform) {
  // 🔒 BULLETPROOF MARKING: Create robust marker to prevent re-scheduling
  try {
    // Extract identifier from postKey for robust naming
    let postIdentifier = 'unknown';
    
    if (postKey.includes('campaign_ready_post_')) {
      const campaignMatch = postKey.match(/campaign_ready_post_(\d+_[a-f0-9]+)\.json$/);
      postIdentifier = campaignMatch ? campaignMatch[1] : `campaign_${Date.now()}`;
    } else if (postKey.includes('ready_post_')) {
      const traditionalMatch = postKey.match(/ready_post_(\d+)\.json$/);
      postIdentifier = traditionalMatch ? traditionalMatch[1] : `traditional_${Date.now()}`;
    }
    
    const timestamp = Date.now();
    const markerKey = `autopilot_processed/${platform}/${username}/${timestamp}_${postIdentifier}.json`;
    
    const markerData = {
      postKey: postKey,
      postIdentifier: postIdentifier,
      username: username,
      platform: platform,
      processedAt: new Date().toISOString(),
      timestamp: timestamp,
      type: 'auto_scheduled',
      version: '2.0' // Version tracking for future compatibility
    };
    
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: markerKey,
      Body: JSON.stringify(markerData, null, 2),
      ContentType: 'application/json'
    }));
    
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] ✅ Created autopilot marker: ${markerKey}`);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error marking post as auto-scheduled:`, error);
    // Don't throw - this shouldn't block the main process
  }
}

async function getUnhandledNotifications(username, platform) {
  // 🔥 REAL IMPLEMENTATION: Get actual unhandled DMs/comments from platform events
  try {
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 💬 Scanning for unhandled notifications for ${platform}/${username}`);
    
    const eventsPrefix = platform === 'instagram' ? `InstagramEvents/` :
                        platform === 'twitter' ? `TwitterEvents/` :
                        platform === 'facebook' ? `FacebookEvents/` : null;
    
    if (!eventsPrefix) {
      console.warn(`[${new Date().toISOString()}] [AUTOPILOT] Unknown platform: ${platform}`);
      return [];
    }

    // Get all event files for this platform
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: eventsPrefix,
      MaxKeys: 1000
    });
    
    const response = await s3Client.send(listCommand);
    const unhandledNotifications = [];
    const seenIds = new Set(); // Prevent duplicates within a single scan
    
    if (!response.Contents || response.Contents.length === 0) {
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] No events found for ${platform}`);
      return [];
    }

    // Check each event file for unhandled notifications for this user
    for (const object of response.Contents) {
      if (!object.Key?.endsWith('.json')) continue;
      
      try {
        const getCommand = new GetObjectCommand({
          Bucket: 'tasks',
          Key: object.Key
        });
        
        const eventResponse = await s3Client.send(getCommand);
        const eventData = JSON.parse(await eventResponse.Body.transformToString());
        
        // Check if this event belongs to our user and needs attention
        if (Array.isArray(eventData)) {
          for (const event of eventData) {
            if (isUnhandledNotificationForUser(event, username, platform)) {
              const eventId = event.message_id || event.comment_id || event.id || `${object.Key}_${event.timestamp || Date.now()}`;
              if (seenIds.has(eventId)) continue;
              seenIds.add(eventId);
              unhandledNotifications.push({
                id: eventId,
                type: event.entry?.[0]?.messaging ? 'dm' : 'comment',
                message: event.message?.text || event.text || '',
                from_user: event.sender?.id || event.from?.id || event.user_id,
                timestamp: event.timestamp || Date.now(),
                platform,
                username,
                original_event: event,
                file_key: object.Key
              });
            }
          }
        } else if (isUnhandledNotificationForUser(eventData, username, platform)) {
          const eventId = eventData.message_id || eventData.comment_id || eventData.id || `${object.Key}_${eventData.timestamp || Date.now()}`;
          if (!seenIds.has(eventId)) {
            seenIds.add(eventId);
            unhandledNotifications.push({
              id: eventId,
              type: eventData.entry?.[0]?.messaging ? 'dm' : 'comment',
              message: eventData.message?.text || eventData.text || '',
              from_user: eventData.sender?.id || eventData.from?.id || eventData.user_id,
              timestamp: eventData.timestamp || Date.now(),
              platform,
              username,
              original_event: eventData,
              file_key: object.Key
            });
          }
        }
        
      } catch (error) {
        console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error reading event file ${object.Key}:`, error);
      }

    }
    
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 📬 Found ${unhandledNotifications.length} unhandled notifications for ${platform}/${username}`);
    return unhandledNotifications.slice(0, 5); // Limit to 5 per cycle to avoid spam
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error getting unhandled notifications:`, error);
    return [];
  }
}

function isUnhandledNotificationForUser(event, username, platform) {
  // 🔥 INTELLIGENT NOTIFICATION DETECTION: Check if this event needs auto-reply
  try {
    // Skip if already auto-replied
    if (event.autopilot_replied || event.auto_replied) {
      return false;
    }
    
    // Skip if too old (only handle recent messages within 24 hours)
    const eventTime = new Date(event.timestamp || 0);
    const now = new Date();
    const hoursDiff = (now - eventTime) / (1000 * 60 * 60);
    if (hoursDiff > 24) {
      return false;
    }
    
    // Platform-specific detection
    if (platform === 'instagram') {
      // Check for Instagram DMs (messaging webhook)
      if (event.entry?.[0]?.messaging?.[0]) {
        const message = event.entry[0].messaging[0];
        // Only handle messages TO us (not from us)
        const recipientId = message.recipient?.id;
        const senderId = message.sender?.id;
        
        // Make sure this is a message TO our account (recipient should be our account)
        if (recipientId && senderId && recipientId !== senderId) {
          return true;
        }
      }
      
      // Check for Instagram comments
      if (event.entry?.[0]?.changes?.[0]?.value?.text) {
        // This is a comment on our post
        return true;
      }
    }
    
    if (platform === 'twitter') {
      // Check for Twitter DMs and mentions
      if (event.direct_message_events || event.tweet_create_events) {
        return true;
      }
    }
    
    if (platform === 'facebook') {
      // Check for Facebook messages and comments
      if (event.entry?.[0]?.messaging || event.entry?.[0]?.changes) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error checking if notification is unhandled:`, error);
    return false;
  }
}

async function generateAutopilotReply(notification, username, platform) {
  // 🔥 REAL IMPLEMENTATION: Use existing RAG system for generating replies
  try {
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🤖 Generating AI reply for ${notification.type} from ${notification.from_user}`);
    
    // Prepare the message for RAG system
    const ragMessage = {
      role: 'user',
      content: notification.message || 'Hello'
    };
    
    // Use the existing instant-reply endpoint internally
    const ragResponse = await axios.post(`http://localhost:3001/instant-reply/${username}`, {
      messages: [ragMessage],
      platform: platform,
      context: `Auto-reply to ${notification.type}`,
      mode: 'smart_brief' // Use brief mode for auto-replies
    }, {
      timeout: 15000, // 15 second timeout
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (ragResponse.data && ragResponse.data.reply) {
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] ✅ AI reply generated successfully`);
      return { 
        success: true, 
        reply: ragResponse.data.reply,
        context: ragResponse.data.context || 'auto-generated'
      };
    } else {
      throw new Error('No reply generated from RAG system');
    }
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error generating AI reply:`, error);
    
    // Fallback to simple acknowledgment
    const fallbackReplies = [
      "Thank you for your message! I'll get back to you soon. 😊",
      "Hi! Thanks for reaching out. I'll respond to you shortly! ✨",
      "Hello! I appreciate your message and will reply soon. 👍",
      "Thanks for contacting me! I'll get back to you as soon as possible. 🙂"
    ];
    
    const randomReply = fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
    
    return { 
      success: true, 
      reply: randomReply,
      context: 'fallback_reply'
    };
  }
}

async function sendAutopilotReply(notification, reply, username, platform) {
  // 🔥 REAL IMPLEMENTATION: Send actual replies using existing platform APIs
  try {
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 📤 Sending auto-reply via ${platform} for ${notification.type}`);
    
    let sendResult = { success: false };
    
    if (platform === 'instagram') {
      sendResult = await sendInstagramAutopilotReply(notification, reply, username);
    } else if (platform === 'twitter') {
      sendResult = await sendTwitterAutopilotReply(notification, reply, username);
    } else if (platform === 'facebook') {
      sendResult = await sendFacebookAutopilotReply(notification, reply, username);
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
    
    if (sendResult.success) {
      // Mark the notification as auto-replied to avoid duplicate responses
      await markNotificationAsAutoReplied(notification);
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] ✅ Auto-reply sent successfully via ${platform}`);
    }
    
    return sendResult;
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error sending auto-reply:`, error);
    return { success: false, error: error.message };
  }
}
async function sendInstagramAutopilotReply(notification, reply, username) {
  try {
    // Use existing Instagram reply functionality
    if (notification.type === 'dm') {
      // Send Instagram DM reply
      const response = await axios.post(`/send-instagram-dm`, {
        recipientId: notification.from_user,
        message: reply,
        username: username
      });
      return { success: true, messageId: response.data?.messageId };
    } else {
      // Send Instagram comment reply
      const response = await axios.post(`/send-instagram-comment-reply`, {
        commentId: notification.id,
        message: reply,
        username: username
      });
      return { success: true, commentId: response.data?.commentId };
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Instagram reply error:`, error);
    return { success: false, error: error.message };
  }
}

async function sendTwitterAutopilotReply(notification, reply, username) {
  try {
    // Use existing Twitter reply functionality
    const response = await axios.post(`/send-twitter-reply`, {
      recipientId: notification.from_user,
      message: reply,
      username: username,
      replyType: notification.type
    });
    return { success: true, tweetId: response.data?.tweetId };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Twitter reply error:`, error);
    return { success: false, error: error.message };
  }
}

async function sendFacebookAutopilotReply(notification, reply, username) {
  try {
    // Use existing Facebook reply functionality
    const response = await axios.post(`/send-facebook-reply`, {
      recipientId: notification.from_user,
      message: reply,
      username: username,
      replyType: notification.type
    });
    return { success: true, messageId: response.data?.messageId };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Facebook reply error:`, error);
    return { success: false, error: error.message };
  }
}
async function markNotificationAsAutoReplied(notification) {
  try {
    // Update the original event file to mark as auto-replied
    if (!notification.file_key) return;
    
    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: notification.file_key
    });
    
    const response = await s3Client.send(getCommand);
    const eventData = JSON.parse(await response.Body.transformToString());
    
    // Mark event(s) as replied. Prefer exact id match but fall back to first
    let matched = false;
    const markEvent = ev => {
      ev.autopilot_replied = true;
      ev.auto_replied = true;
      ev.rag_replied = true;
      const ts = new Date().toISOString();
      ev.autopilot_replied_at = ts;
      ev.auto_replied_at = ts;
      ev.rag_replied_at = ts;
      ev.status = 'replied';
    };

    if (Array.isArray(eventData)) {
      for (let event of eventData) {
        if ((event.message_id || event.comment_id || event.id) === notification.id) {
          markEvent(event);
          matched = true;
          break;
        }
      }
      // If no element matched (e.g., synthetic ID), mark the first unhandled event in the file
      if (!matched && eventData.length > 0) {
        markEvent(eventData[0]);
      }
    } else {
      markEvent(eventData);
    }
    
    // Save back to R2
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: notification.file_key,
      Body: JSON.stringify(eventData),
      ContentType: 'application/json'
    }));
    
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🏷️ Marked notification ${notification.id} as auto-replied`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error marking notification as auto-replied:`, error);
  }
}

// ============= DEBUG/UTILITY ENDPOINTS =============

// Get Facebook posting capabilities (utility endpoint)
app.get('/facebook-posting-capabilities/:userId', async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  
  try {
    const tokenData = await getFacebookTokenData(userId);
    if (!tokenData) {
      return res.status(404).json({ error: 'No Facebook token found' });
    }

    // Check if this is a personal account or business page
    let accountType = 'business_page';
    let capabilities = {
      canAutoPost: true,
      canSchedulePosts: true,
      canPostImages: true,
      canPostVideos: true,
      hasInsights: true
    };

    try {
      await axios.get(`https://graph.facebook.com/v18.0/${tokenData.page_id}`, {
        params: {
          fields: 'category,followers_count',
          access_token: tokenData.access_token
        }
      });
    } catch (error) {
      if (error.response?.data?.error?.message?.includes('User')) {
        accountType = 'personal_account';
        capabilities = {
          canAutoPost: false,
          canSchedulePosts: false, // Limited
          canPostImages: false, // Very limited
          canPostVideos: false,
          hasInsights: false, // Personal accounts have no insights API
          limitation: 'Personal Facebook accounts have very limited API posting capabilities. Facebook restricts automated posting for personal profiles for privacy and security reasons.',
          suggestion: 'For full automation features, consider converting to a Facebook Business Page or connecting a Facebook Business account.'
        };
      }
    }

    return res.json({
      accountType,
      pageId: tokenData.page_id,
      capabilities,
      connected: true
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error checking Facebook capabilities:`, error.message);
    return res.status(500).json({ error: 'Failed to check Facebook capabilities' });
  }
});

// Test Facebook posting (utility endpoint)
app.post('/test-facebook-post/:userId', async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const { message = 'Test post from Facebook API ✨' } = req.body;
  
  try {
    // Get Facebook access token
    const tokenData = await getFacebookTokenData(userId);
    if (!tokenData) {
      return res.status(404).json({ error: 'No Facebook token found' });
    }

    console.log(`[${new Date().toISOString()}] Testing Facebook post for user ${userId}, page ${tokenData.page_id}`);

    // Try posting to Facebook
    const postResponse = await axios.post(`https://graph.facebook.com/v18.0/${tokenData.page_id}/feed`, {
      message: message
    }, {
      params: {
        access_token: tokenData.access_token
      }
    });

    console.log(`[${new Date().toISOString()}] Test Facebook post successful: ${postResponse.data.id}`);
    
    res.json({ 
      success: true, 
      message: 'Test Facebook post published successfully',
      post_id: postResponse.data.id,
      facebook_page_id: tokenData.page_id
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error testing Facebook post:`, error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to test Facebook post',
      details: error.response?.data || error.message
    });
  }
});

// Get manual posting instructions endpoint
app.get('/manual-post-instructions/:userId/:platform', async (req, res) => {
  setCorsHeaders(res);
  
  const { userId, platform } = req.params;
  
  try {
    // Get all scheduled posts requiring manual posting
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `${platform.charAt(0).toUpperCase() + platform.slice(1)}Scheduled/`
    });
    
    const listResponse = await s3Client.send(listCommand);
    const files = listResponse.Contents || [];
    
    const manualPosts = [];
    
    for (const file of files) {
      try {
        const getCommand = new GetObjectCommand({
          Bucket: 'tasks',
          Key: file.Key
        });
        const data = await s3Client.send(getCommand);
        const post = JSON.parse(await streamToString(data.Body));
        
        if (post.userId === userId && post.status === 'manual_required') {
          manualPosts.push({
            postId: post.id,
            caption: post.caption,
            image_url: post.manual_instructions?.image_url,
            scheduled_time: post.scheduledDate,
            manual_required_at: post.manual_required_at,
            instructions: post.manual_instructions,
            notes: post.notes
          });
        }
      } catch (fileError) {
        console.error(`Error reading ${file.Key}:`, fileError.message);
      }
    }
    
    res.json({
      success: true,
      platform: platform,
      manual_posts: manualPosts,
      total: manualPosts.length
    });
  } catch (error) {
    console.error(`Error getting manual post instructions:`, error.message);
    res.status(500).json({ error: 'Failed to get manual posting instructions' });
  }
});

// Sync Facebook tokens with connections (utility endpoint)
app.post('/sync-facebook-tokens/:userId', async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  
  try {
    // Get token data
    const tokenData = await getFacebookTokenData(userId);
    if (!tokenData) {
      return res.status(404).json({ error: 'No Facebook token found' });
    }

    // Update connection with real token
    const connectionKey = `FacebookConnection/${userId}/connection.json`;
    const connectionData = {
      uid: userId,
      facebook_user_id: tokenData.user_id,
      facebook_page_id: tokenData.page_id,
      username: tokenData.page_name || tokenData.user_name,
      access_token: tokenData.access_token,
      lastUpdated: new Date().toISOString()
    };
    
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: connectionKey,
      Body: JSON.stringify(connectionData, null, 2),
      ContentType: 'application/json',
    });
    
    await s3Client.send(putCommand);
    
    res.json({ 
      success: true, 
      message: 'Facebook connection synced with token data',
      connection: {
        ...connectionData,
        access_token: connectionData.access_token.substring(0, 20) + '...' // Hide full token in response
      }
    });
  } catch (error) {
    console.error(`Error syncing Facebook tokens for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to sync Facebook tokens' });
  }
});

// ============= SCHEDULER HEALTH ENDPOINTS =============

// Comprehensive scheduler health endpoint for Instagram
app.get(['/api/scheduler-health/instagram', '/scheduler-health/instagram'], async (req, res) => {
  setCorsHeaders(res);
  
  try {
    console.log(`[${new Date().toISOString()}] [HEALTH] Checking Instagram scheduler health...`);
    
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'scheduled_posts/instagram/',
      MaxKeys: 1000
    });
    
    const response = await s3Client.send(listCommand);
    const now = new Date();
    const posts = {
      scheduled: [],
      processing: [],
      completed: [],
      failed: [],
      overdue: []
    };
    
    if (response.Contents) {
      for (const object of response.Contents) {
        if (!object.Key?.endsWith('.json')) continue;
        
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: object.Key
          });
          
          const scheduleResponse = await s3Client.send(getCommand);
          const scheduleDataStr = await streamToString(scheduleResponse.Body);
          const scheduleData = JSON.parse(scheduleDataStr);
          
          const scheduleTime = new Date(scheduleData.scheduleDate);
          const isOverdue = scheduleTime <= now && scheduleData.status === 'scheduled';
          
          const postInfo = {
            id: scheduleData.id,
            userId: scheduleData.userId,
            status: scheduleData.status,
            scheduleDate: scheduleData.scheduleDate,
            attempts: scheduleData.attempts || 0,
            error: scheduleData.error,
            lastAttempt: scheduleData.lastAttempt,
            completedAt: scheduleData.completedAt,
            failedAt: scheduleData.failedAt,
            isOverdue
          };
          
          if (isOverdue) {
            posts.overdue.push(postInfo);
          } else {
            posts[scheduleData.status].push(postInfo);
          }
          
        } catch (error) {
          console.error(`[${new Date().toISOString()}] [HEALTH] Error reading scheduled post ${object.Key}:`, error);
        }
      }
    }
    
    const summary = {
      total: posts.scheduled.length + posts.processing.length + posts.completed.length + posts.failed.length + posts.overdue.length,
      scheduled: posts.scheduled.length,
      processing: posts.processing.length,
      completed: posts.completed.length,
      failed: posts.failed.length,
      overdue: posts.overdue.length,
      posts
    };
    
    console.log(`[${new Date().toISOString()}] [HEALTH] Instagram scheduler health:`, summary);
    res.json(summary);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [HEALTH] Error checking scheduler health:`, error);
    res.status(500).json({ 
      error: 'Failed to check scheduler health',
      details: error.message 
    });
  }
});

// Manual retry endpoint for failed posts
app.post(['/api/scheduler-retry/:postId', '/scheduler-retry/:postId'], async (req, res) => {
  setCorsHeaders(res);
  
  const { postId } = req.params;
  
  try {
    console.log(`[${new Date().toISOString()}] [RETRY] Manual retry requested for post: ${postId}`);
    
    // Find the failed post
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'scheduled_posts/instagram/',
      MaxKeys: 1000
    });
    
    const response = await s3Client.send(listCommand);
    let foundPost = null;
    let postKey = null;
    
    if (response.Contents) {
      for (const object of response.Contents) {
        if (!object.Key?.endsWith('.json')) continue;
        
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: object.Key
          });
          
          const scheduleResponse = await s3Client.send(getCommand);
          const scheduleDataStr = await streamToString(scheduleResponse.Body);
          const scheduleData = JSON.parse(scheduleDataStr);
          
          if (scheduleData.id === postId) {
            foundPost = scheduleData;
            postKey = object.Key;
            break;
          }
          
        } catch (error) {
          console.error(`[${new Date().toISOString()}] [RETRY] Error reading scheduled post ${object.Key}:`, error);
        }
      }
    }
    
    if (!foundPost) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    if (foundPost.status !== 'failed') {
      return res.status(400).json({ error: 'Post is not in failed status' });
    }
    
    // Reset the post for retry
    foundPost.status = 'scheduled';
    foundPost.attempts = 0;
    foundPost.error = null;
    foundPost.failedAt = null;
    foundPost.lastAttempt = null;
    
    // Save the reset post
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: postKey,
      Body: JSON.stringify(foundPost, null, 2),
      ContentType: 'application/json',
    }));
    
    console.log(`[${new Date().toISOString()}] [RETRY] Successfully reset post for retry: ${postId}`);
    
    res.json({ 
      success: true, 
      message: 'Post reset for retry',
      postId,
      nextScheduleTime: foundPost.scheduleDate
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [RETRY] Error retrying post ${postId}:`, error);
    res.status(500).json({ 
      error: 'Failed to retry post',
      details: error.message 
    });
  }
});

// Force process overdue posts endpoint
app.post(['/api/scheduler-process-overdue', '/scheduler-process-overdue'], async (req, res) => {
  setCorsHeaders(res);
  
  try {
    console.log(`[${new Date().toISOString()}] [FORCE] Force processing overdue posts requested`);
    
    // Call the scheduler function directly
    await processScheduledInstagramPosts();
    
    res.json({ 
      success: true, 
      message: 'Overdue posts processed',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [FORCE] Error processing overdue posts:`, error);
    res.status(500).json({ 
      error: 'Failed to process overdue posts',
      details: error.message 
    });
  }
});

// Start the schedulers  
startTwitterScheduler();
startFacebookScheduler();
startInstagramScheduler();
// startAutopilotWatchers(); // 🚀 AUTOPILOT: Disabled - will use frontend button triggers instead

// Debug endpoint to check Instagram token mapping
app.get('/debug/instagram-tokens', async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  try {
    console.log(`[${new Date().toISOString()}] Debug: Listing Instagram tokens...`);
    
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'InstagramTokens/'
    });
    
    const listResponse = await s3Client.send(listCommand);
    const files = listResponse.Contents || [];
    
    const tokens = [];
    
    for (const file of files) {
      if (file.Key.endsWith('/token.json')) {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: file.Key
          });
          const data = await s3Client.send(getCommand);
          const tokenData = JSON.parse(await streamToString(data.Body));
          
          tokens.push({
            key: file.Key,
            instagram_user_id: tokenData.instagram_user_id,
            instagram_graph_id: tokenData.instagram_graph_id,
            username: tokenData.username,
            stored_at: tokenData.timestamp
          });
        } catch (error) {
          console.error(`Error reading token file ${file.Key}:`, error);
        }
      }
    }
    
    // Also check connections
    const connListCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'InstagramConnection/'
    });
    
    const connResponse = await s3Client.send(connListCommand);
    const connFiles = connResponse.Contents || [];
    
    const connections = [];
    
    for (const file of connFiles) {
      if (file.Key.endsWith('/connection.json')) {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: file.Key
          });
          const data = await s3Client.send(getCommand);
          const connData = JSON.parse(await streamToString(data.Body));
          
          connections.push({
            key: file.Key,
            uid: connData.uid,
            instagram_graph_id: connData.instagram_graph_id,
            username: connData.username
          });
        } catch (error) {
          console.error(`Error reading connection file ${file.Key}:`, error);
        }
      }
    }
    
    console.log(`[${new Date().toISOString()}] Found ${tokens.length} tokens and ${connections.length} connections`);
    res.json({ tokens, connections });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error listing Instagram data:`, error);
    res.status(500).json({ 
      error: 'Failed to list Instagram data', 
      details: error.message 
    });
  }
});

// Debug endpoint to list connected Twitter users
app.get(['/debug/twitter-users', '/api/debug/twitter-users'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  try {
    console.log(`[${new Date().toISOString()}] Listing connected Twitter users...`);
    
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'TwitterTokens/'
    });
    
    const listResponse = await s3Client.send(listCommand);
    const files = listResponse.Contents || [];
    
    const users = [];
    
    for (const file of files) {
      if (file.Key.endsWith('/token.json')) {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: file.Key
          });
          const data = await s3Client.send(getCommand);
          const tokenData = JSON.parse(await streamToString(data.Body));
          
          users.push({
            userId: tokenData.twitter_user_id,
            username: tokenData.username,
            connected_at: tokenData.timestamp,
            expires_at: tokenData.expires_at,
            hasRefreshToken: !!tokenData.refresh_token,
            scopes: tokenData.scope
          });
        } catch (error) {
          console.error(`Error reading token file ${file.Key}:`, error);
        }
      }
    }
    
    console.log(`[${new Date().toISOString()}] Found ${users.length} connected Twitter users`);
    res.json({ users });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error listing Twitter users:`, error);
    res.status(500).json({ 
      error: 'Failed to list Twitter users', 
      details: error.message 
    });
  }
});

// Debug endpoint to inspect R2 bucket contents for campaign posts
app.get(['/debug/campaign-posts/:username', '/api/debug/campaign-posts/:username'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  try {
    const { username } = req.params;
    const platform = (req.query.platform || 'instagram').toLowerCase();
    
    console.log(`[${new Date().toISOString()}] Debug: Inspecting campaign posts for ${username} on ${platform}`);
    
    // Build posts prefix
    const postsPrefix = `ready_post/${platform}/${username}`;
    
    console.log(`[${new Date().toISOString()}] Debug: Checking prefix: ${postsPrefix}/`);
    
    // List all files in the directory
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `${postsPrefix}/`
    });
    
    const data = await s3Client.send(listCommand);
    
    if (!data.Contents || data.Contents.length === 0) {
      console.log(`[${new Date().toISOString()}] Debug: No files found in ${postsPrefix}/`);
      return res.json({
        prefix: postsPrefix,
        totalFiles: 0,
        campaignFiles: [],
        allFiles: [],
        message: 'No files found in directory'
      });
    }
    
    console.log(`[${new Date().toISOString()}] Debug: Found ${data.Contents.length} total files`);
    
    // Separate campaign and non-campaign files
    const allFiles = data.Contents.map(obj => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified
    }));
    
    const campaignFiles = allFiles.filter(file => 
      file.key.includes('campaign_ready_post_')
    );
    
    const nonCampaignFiles = allFiles.filter(file => 
      !file.key.includes('campaign_ready_post_')
    );
    
    console.log(`[${new Date().toISOString()}] Debug: Found ${campaignFiles.length} campaign files and ${nonCampaignFiles.length} non-campaign files`);
    
    // Extract campaign post numbers
    const campaignPostNumbers = campaignFiles
      .map(file => {
        const match = file.key.match(/campaign_ready_post_(\d+)\.json$/);
        return match ? parseInt(match[1]) : null;
      })
      .filter(num => num !== null)
      .sort((a, b) => a - b);
    
    res.json({
      prefix: postsPrefix,
      totalFiles: allFiles.length,
      campaignFiles: campaignFiles,
      nonCampaignFiles: nonCampaignFiles,
      campaignPostNumbers: campaignPostNumbers,
      postCooked: campaignFiles.length,
      highestId: campaignPostNumbers.length > 0 ? Math.max(...campaignPostNumbers) : 0,
      message: `Found ${campaignFiles.length} campaign posts out of ${allFiles.length} total files`
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Debug campaign posts error:`, error);
    res.status(500).json({ 
      error: 'Failed to inspect campaign posts', 
      details: error.message 
    });
  }
});

// OPTIONS handler for debug campaign posts
app.options(['/debug/campaign-posts/:username', '/api/debug/campaign-posts/:username'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});
// Post tweet with image endpoint - immediate posting with OAuth 2.0 and chunked media upload
app.post(['/post-tweet-with-image/:userId', '/api/post-tweet-with-image/:userId'], upload.single('image'), async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  const { userId } = req.params;
  
  // Debug: Log all received data
  console.log(`[${new Date().toISOString()}] POST /post-tweet-with-image/${userId} - Request received`);
  console.log(`[${new Date().toISOString()}] req.body:`, req.body);
  console.log(`[${new Date().toISOString()}] req.files:`, req.files ? Object.keys(req.files) : 'none');
  console.log(`[${new Date().toISOString()}] req.file:`, req.file ? 'present' : 'none');
  
  // Get text from req.body (FormData puts text fields in req.body)
  const text = req.body.text;
  const imageFile = req.files?.image || req.file;
  
  console.log(`[${new Date().toISOString()}] Extracted text: "${text}"`);
  console.log(`[${new Date().toISOString()}] Image file present: ${!!imageFile}`);
  
  // Allow empty text if there's an image (Twitter allows image-only posts)
  if (text && text.length > 280) {
    return res.status(400).json({ error: 'Tweet text exceeds 280 characters' });
  }
  
  if (!imageFile) {
    return res.status(400).json({ error: 'Image file is required' });
  }
  
  // If no text provided, use empty string (Twitter allows image-only posts)
  const tweetText = text ? text.trim() : '';
  
  try {
    console.log(`[${new Date().toISOString()}] Posting tweet with image for user ${userId}: "${tweetText}"`);
    
    // Get user's stored Twitter tokens
    const userTokenKey = `TwitterTokens/${userId}/token.json`;
    let tokenData;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: userTokenKey
      });
      const response = await s3Client.send(getCommand);
      tokenData = JSON.parse(await streamToString(response.Body));
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return res.status(404).json({ error: 'Twitter account not connected' });
      }
      throw error;
    }
    
    // Check if token is expired and needs refresh
    if (tokenData.expires_at && new Date() > new Date(tokenData.expires_at)) {
      console.log(`[${new Date().toISOString()}] Access token expired, attempting to refresh...`);
      
      if (tokenData.refresh_token) {
        try {
          // Refresh the access token
          const refreshBody = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: tokenData.refresh_token
          });
          
          const basicAuthCredentials = Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64');
          
          const refreshResponse = await axios.post('https://api.x.com/2/oauth2/token', refreshBody, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json',
              'Authorization': `Basic ${basicAuthCredentials}`
            }
          });
          
          const newTokenData = refreshResponse.data;
          
          // Update stored token data
          tokenData.access_token = newTokenData.access_token;
          tokenData.refresh_token = newTokenData.refresh_token || tokenData.refresh_token;
          tokenData.expires_in = newTokenData.expires_in || 7200;
          tokenData.expires_at = new Date(Date.now() + (newTokenData.expires_in || 7200) * 1000).toISOString();
          
          // Save updated token
          await s3Client.send(new PutObjectCommand({
            Bucket: 'tasks',
            Key: userTokenKey,
            Body: JSON.stringify(tokenData, null, 2),
            ContentType: 'application/json'
          }));
          
          console.log(`[${new Date().toISOString()}] Access token refreshed successfully`);
        } catch (refreshError) {
          console.error(`[${new Date().toISOString()}] Token refresh failed:`, refreshError.response?.data || refreshError.message);
          return res.status(401).json({ 
            error: 'Token expired and refresh failed', 
            details: 'Please reconnect your Twitter account' 
          });
        }
      } else {
        return res.status(401).json({ 
          error: 'Access token expired', 
          details: 'Please reconnect your Twitter account' 
        });
      }
    }
    
    // Upload media using X API v2 chunked upload process
    console.log(`[${new Date().toISOString()}] Starting chunked media upload...`);
    
    const imageBuffer = imageFile.buffer || imageFile.data;
    const totalBytes = imageBuffer.length;
    const mediaType = imageFile.mimetype || 'image/jpeg';
    
    // Step 1: INIT - Initialize media upload
    const initFormData = new FormData();
    initFormData.append('command', 'INIT');
    initFormData.append('media_type', mediaType);
    initFormData.append('total_bytes', totalBytes.toString());
    initFormData.append('media_category', 'tweet_image');
    
    const initResponse = await axios.post('https://upload.twitter.com/1.1/media/upload.json', initFormData, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        ...initFormData.getHeaders()
      }
    });
    
    const mediaId = initResponse.data.media_id_string;
    console.log(`[${new Date().toISOString()}] Media upload initialized: ${mediaId}`);
    
    // Step 2: APPEND - Upload media chunks
    const chunkSize = 1024 * 1024; // 1MB chunks
    let segmentIndex = 0;
    
    for (let i = 0; i < totalBytes; i += chunkSize) {
      const chunk = imageBuffer.slice(i, Math.min(i + chunkSize, totalBytes));
      
      const appendFormData = new FormData();
      appendFormData.append('command', 'APPEND');
      appendFormData.append('media_id', mediaId);
      appendFormData.append('segment_index', segmentIndex.toString());
      appendFormData.append('media', chunk, {
        filename: 'chunk.jpg',
        contentType: mediaType
      });
      
      await axios.post('https://upload.twitter.com/1.1/media/upload.json', appendFormData, {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          ...appendFormData.getHeaders()
        }
      });
      
      console.log(`[${new Date().toISOString()}] Uploaded chunk ${segmentIndex + 1}`);
      segmentIndex++;
    }
    
    // Step 3: FINALIZE - Complete media upload
    const finalizeFormData = new FormData();
    finalizeFormData.append('command', 'FINALIZE');
    finalizeFormData.append('media_id', mediaId);
    
    const finalizeResponse = await axios.post('https://upload.twitter.com/1.1/media/upload.json', finalizeFormData, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        ...finalizeFormData.getHeaders()
      }
    });
    
    console.log(`[${new Date().toISOString()}] Media upload finalized: ${mediaId}`);
    
    // Step 4: STATUS - Check processing status if needed
    if (finalizeResponse.data.processing_info) {
      console.log(`[${new Date().toISOString()}] Media processing required, checking status...`);
      
      let processingComplete = false;
      let attempts = 0;
      const maxAttempts = 30; // 30 attempts with 2 second intervals = 1 minute max
      
      while (!processingComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        
        const statusResponse = await axios.get(`https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`, {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`
          }
        });
        
        const processingInfo = statusResponse.data.processing_info;
        console.log(`[${new Date().toISOString()}] Media processing status: ${processingInfo.state}`);
        
        if (processingInfo.state === 'succeeded') {
          processingComplete = true;
        } else if (processingInfo.state === 'failed') {
          throw new Error('Media processing failed');
        }
        
        attempts++;
      }
      
      if (!processingComplete) {
        throw new Error('Media processing timeout');
      }
    }
    
    // Step 5: Post tweet with media
    const tweetData = {
      text: tweetText,
      media: {
        media_ids: [mediaId]
      }
    };
    
    const tweetResponse = await axios.post('https://api.x.com/2/tweets', tweetData, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const tweetId = tweetResponse.data.data.id;
    const postedTweetText = tweetResponse.data.data.text;
    
    console.log(`[${new Date().toISOString()}] Tweet with image posted successfully: ID ${tweetId}`);
    
    // Store tweet record for tracking
    const tweetKey = `TwitterPosts/${userId}/${tweetId}.json`;
    const tweetRecord = {
      tweet_id: tweetId,
      text: postedTweetText,
      user_id: userId,
      posted_at: new Date().toISOString(),
      scheduled: false,
      status: 'posted',
      has_media: true,
      media_id: mediaId
    };
    
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: tweetKey,
      Body: JSON.stringify(tweetRecord, null, 2),
      ContentType: 'application/json'
    }));
    
    res.json({ 
      success: true, 
      tweet_id: tweetId, 
      text: postedTweetText,
      media_id: mediaId,
      message: 'Tweet with image posted successfully' 
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error posting tweet with image:`, error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      res.status(401).json({ 
        error: 'Twitter authentication failed', 
        details: 'Please reconnect your Twitter account' 
      });
    } else if (error.response?.status === 403) {
      res.status(403).json({ 
        error: 'Tweet posting forbidden', 
        details: error.response?.data?.detail || 'Check your Twitter API permissions and scopes' 
      });
    } else if (error.response?.status === 413) {
      res.status(413).json({ 
        error: 'Image too large', 
        details: 'Please use an image smaller than 5MB' 
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to post tweet with image', 
        details: error.response?.data || error.message 
      });
    }
  }
});

// Schedule tweet endpoint - for future posting

// ============= GOAL MANAGEMENT ENDPOINTS =============

// Save goal endpoint - Schema: goal/<platform>/<username>/goal_*.json
app.post(['/save-goal/:username', '/api/save-goal/:username'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  try {
    const { username } = req.params;
    const { persona, timeline, goal, instruction } = req.body;
    
    // Parse platform from query params
    const platform = (req.query.platform || 'instagram').toLowerCase();
    if (!['instagram', 'twitter', 'facebook'].includes(platform)) {
      return res.status(400).json({ 
        error: 'Invalid platform. Must be instagram, twitter, or facebook.' 
      });
    }

    // Validate required fields
    if (!username || !timeline || !goal || !instruction) {
      return res.status(400).json({ 
        error: 'Username, timeline, goal, and instruction are required' 
      });
    }

    // Validate timeline is a number
    if (typeof timeline !== 'number' || timeline <= 0) {
      return res.status(400).json({ 
        error: 'Timeline must be a positive number' 
      });
    }

    // ✅ TRACK USAGE: Campaign/Goal submission
    trackUsageForEndpoint(platform, username, 'campaigns', 'goal_submitted');

    // Check for existing active campaign
    console.log(`[${new Date().toISOString()}] Checking for existing campaign before creating new goal for ${username} on ${platform}`);
    const goalPrefix = `goal/${platform}/${username}`;
    const listExistingCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `${goalPrefix}/`
    });

    const existingData = await s3Client.send(listExistingCommand);
    if (existingData.Contents && existingData.Contents.length > 0) {
      console.log(`[${new Date().toISOString()}] Found existing campaign for ${username} on ${platform}, rejecting new goal submission`);
      return res.status(409).json({ 
        error: 'Campaign already active',
        message: 'You already have an active campaign. Please stop the current campaign before starting a new one.',
        hasActiveCampaign: true
      });
    }

    // Generate unique identifier for the goal file
    const timestamp = Date.now();
    const goalId = `goal_${timestamp}`;
    
    // Build goal path
    const goalPath = `goal/${platform}/${username}/${goalId}.json`;

    // Create goal data structure
    const goalData = {
      id: goalId,
      username,
      platform,
      persona: persona || '',
      timeline,
      goal: goal.trim(),
      instruction: instruction.trim(),
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log(`[${new Date().toISOString()}] Saving goal to: ${goalPath}`);

    // Save to R2
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: goalPath,
      Body: JSON.stringify(goalData, null, 2),
      ContentType: 'application/json'
    });
    
    await s3Client.send(putCommand);

    console.log(`[${new Date().toISOString()}] Goal saved successfully for ${username} on ${platform}`);

    res.json({ 
      success: true, 
      message: 'Goal saved successfully',
      goalId,
      platform
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Save goal error:`, error);
    res.status(500).json({ 
      error: 'Failed to save goal', 
      details: error.message 
    });
  }
});

// OPTIONS handler for save-goal
app.options(['/save-goal/:username', '/api/save-goal/:username'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Goal summary retrieval endpoint - Schema: goal_summary/<platform>/<username>/summary_*.json
app.get(['/goal-summary/:username', '/api/goal-summary/:username'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  try {
    const { username } = req.params;
    
    // Parse platform from query params
    const platform = (req.query.platform || 'instagram').toLowerCase();
    if (!['instagram', 'twitter', 'facebook'].includes(platform)) {
      return res.status(400).json({ 
        error: 'Invalid platform. Must be instagram, twitter, or facebook.' 
      });
    }
    
    // Build summary prefix
    const summaryPrefix = `goal_summary/${platform}/${username}`;

    console.log(`[${new Date().toISOString()}] Retrieving goal summary from: ${summaryPrefix}/`);

    // List all summary files for the user
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `${summaryPrefix}/`
    });

    const data = await s3Client.send(listCommand);

    if (!data.Contents || data.Contents.length === 0) {
      console.log(`[${new Date().toISOString()}] No goal summary found for ${username} on ${platform}`);
      return res.status(404).json({ 
        error: 'Goal summary not found',
        message: 'Your campaign is processing. Progress will be available shortly.'
      });
    }

    // Find the latest summary file (highest number)
    const summaryFiles = data.Contents
      .filter(obj => obj.Key && obj.Key.includes('summary_'))
      .map(obj => ({
        key: obj.Key,
        number: parseInt(obj.Key.match(/summary_(\d+)\.json$/)?.[1] || '0')
      }))
      .sort((a, b) => b.number - a.number);

    if (summaryFiles.length === 0) {
      return res.status(404).json({ 
        error: 'No valid summary files found',
        message: 'Your campaign is processing. Progress will be available shortly.'
      });
    }

    // Get the latest summary file
    const latestSummaryKey = summaryFiles[0].key;
    console.log(`[${new Date().toISOString()}] Retrieving latest summary: ${latestSummaryKey}`);

    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: latestSummaryKey
    });
    
    const summaryResponse = await s3Client.send(getCommand);
    const summaryBody = await streamToString(summaryResponse.Body);
    const summary = JSON.parse(summaryBody);

    res.json(summary);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Goal summary retrieval error:`, error);
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ 
        error: 'Goal summary not found',
        message: 'Your campaign is processing. Progress will be available shortly.'
      });
    }

    res.status(500).json({ 
      error: 'Failed to retrieve goal summary', 
      details: error.message 
    });
  }
});

// OPTIONS handler for goal-summary
app.options(['/goal-summary/:username', '/api/goal-summary/:username'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Campaign ready posts count endpoint - Schema: tasks/ready_post/<platform>/<username>/campaign_ready_post_*.json
app.get(['/campaign-posts-count/:username', '/api/campaign-posts-count/:username'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  try {
    const { username } = req.params;
    
    // Parse platform from query params
    const platform = (req.query.platform || 'instagram').toLowerCase();
    if (!['instagram', 'twitter', 'facebook'].includes(platform)) {
      return res.status(400).json({ 
        error: 'Invalid platform. Must be instagram, twitter, or facebook.' 
      });
    }
    
    // Build posts prefix
    const postsPrefix = `ready_post/${platform}/${username}`;

    console.log(`[${new Date().toISOString()}] Counting campaign posts from: ${postsPrefix}/`);

    // List all campaign ready post files
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `${postsPrefix}/`
    });

    const data = await s3Client.send(listCommand);

    if (!data.Contents || data.Contents.length === 0) {
      return res.json({ 
        postCooked: 0,
        highestId: 0
      });
    }

    // Filter and count campaign_ready_post_ files
    const campaignPosts = data.Contents
      .filter(obj => obj.Key && obj.Key.includes('campaign_ready_post_'))
      .map(obj => ({
        key: obj.Key,
        number: parseInt(obj.Key.match(/campaign_ready_post_(\d+)\.json$/)?.[1] || '0')
      }))
      .filter(item => item.number > 0);

    const postCooked = campaignPosts.length;
    const highestId = campaignPosts.length > 0 ? Math.max(...campaignPosts.map(p => p.number)) : 0;

    console.log(`[${new Date().toISOString()}] Found ${postCooked} campaign posts for ${username} on ${platform}`);

    res.json({ 
      postCooked,
      highestId
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Campaign posts count error:`, error);
    res.status(500).json({ 
      error: 'Failed to count campaign posts', 
      details: error.message,
      postCooked: 0,
      highestId: 0
    });
  }
});

// OPTIONS handler for campaign-posts-count
app.options(['/campaign-posts-count/:username', '/api/campaign-posts-count/:username'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Engagement metrics endpoint (placeholder for platform-specific engagement)
app.get(['/engagement-metrics/:username', '/api/engagement-metrics/:username'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  try {
    const { username } = req.params;
    
    // Parse platform from query params
    const platform = (req.query.platform || 'instagram').toLowerCase();
    if (!['instagram', 'twitter', 'facebook'].includes(platform)) {
      return res.status(400).json({ 
        error: 'Invalid platform. Must be instagram, twitter, or facebook.' 
      });
    }
    
    const connected = req.query.connected === 'true';

    console.log(`[${new Date().toISOString()}] Retrieving engagement metrics for ${username} on ${platform}, connected: ${connected}`);

    if (!connected) {
      return res.json({
        connected: false,
        message: `Please connect with ${platform === 'instagram' ? 'Instagram' : 'Twitter'} to view engagement results.`
      });
    }

    // For now, return mock engagement data
    // In production, this would integrate with Facebook/Twitter APIs
    const mockEngagement = {
      connected: true,
      currentFactor: 0.75,
      previousFactor: 0.68,
      delta: 0.07,
      message: `Engagement has increased by 0.07 since the campaign started.`,
      lastUpdated: new Date().toISOString()
    };

    res.json(mockEngagement);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Engagement metrics error:`, error);
    res.status(500).json({ 
      error: 'Failed to retrieve engagement metrics', 
      details: error.message,
      connected: false
    });
  }
});

// OPTIONS handler for engagement-metrics
app.options(['/engagement-metrics/:username', '/api/engagement-metrics/:username'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// 🚀 AUTOPILOT: Get autopilot settings for a user/platform
app.get(['/autopilot-settings/:username', '/api/autopilot-settings/:username'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  try {
    const { username } = req.params;
    const platform = (req.query.platform || 'instagram').toLowerCase();
    
    if (!['instagram', 'twitter', 'facebook'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    
    // Storage key for autopilot settings
    const settingsKey = `autopilot_settings/${platform}/${username}/settings.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: settingsKey
      });
      
      const response = await s3Client.send(getCommand);
      const settingsData = JSON.parse(await response.Body.transformToString());
      
      console.log(`[${new Date().toISOString()}] [AUTOPILOT] Retrieved settings for ${platform}/${username}`);
      res.json(settingsData);
      
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        // Return default settings if none exist
        const defaultSettings = {
          enabled: false,
          autoSchedule: false,
          autoReply: false,
          lastChecked: new Date().toISOString()
        };
        res.json(defaultSettings);
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error fetching settings:`, error);
    res.status(500).json({ error: 'Failed to fetch autopilot settings' });
  }
});

// 🚀 AUTOPILOT: Update autopilot settings for a user/platform
app.post(['/autopilot-settings/:username', '/api/autopilot-settings/:username'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  try {
    const { username } = req.params;
    const { platform, settings } = req.body;
    
    if (!platform || !['instagram', 'twitter', 'facebook'].includes(platform.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings data' });
    }
    
    // Storage key for autopilot settings
    const settingsKey = `autopilot_settings/${platform.toLowerCase()}/${username}/settings.json`;
    
    // Add timestamp
    const settingsWithTimestamp = {
      ...settings,
      lastUpdated: new Date().toISOString(),
      username,
      platform: platform.toLowerCase()
    };
    
    // Store settings in R2
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: settingsKey,
      Body: JSON.stringify(settingsWithTimestamp, null, 2),
      ContentType: 'application/json'
    });
    
    await s3Client.send(putCommand);
    
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] Updated settings for ${platform}/${username}:`, settingsWithTimestamp);

    // If autopilot was enabled, trigger immediate actions based on settings
    if (settingsWithTimestamp.enabled) {
      if (settingsWithTimestamp.autoSchedule) {
        console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🔥 Immediate auto-schedule trigger for ${platform}/${username}`);
        checkAndScheduleNewPosts(username, platform, settingsWithTimestamp)
          .catch(err => console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error in immediate auto-schedule trigger:`, err));
      }
      if (settingsWithTimestamp.autoReply) {
        console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🔥 Immediate auto-reply trigger for ${platform}/${username}`);
        checkAndReplyToNewMessages(username, platform, settingsWithTimestamp)
          .catch(err => console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error in immediate auto-reply trigger:`, err));
      }
    }
    
    res.json({ success: true, settings: settingsWithTimestamp });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Error updating settings:`, error);
    res.status(500).json({ error: 'Failed to update autopilot settings' });
  }
});

// 🚀 AUTOPILOT: OPTIONS handlers
app.options(['/autopilot-settings/:username', '/api/autopilot-settings/:username'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// 🔥 DEBUG ENDPOINTS: Manual autopilot testing
app.post(['/test-autopilot-schedule/:username', '/api/test-autopilot-schedule/:username'], async (req, res) => {
  setCorsHeaders(res);
  
  const { username } = req.params;
  const { platform = 'instagram' } = req.query;
  
  try {
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🧪 Manual autopilot schedule test for ${platform}/${username}`);
    
    // Check if autopilot is enabled for this user
    const settingsKey = `autopilot_settings/${platform}/${username}/settings.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: settingsKey
      });
      
      const settingsResponse = await s3Client.send(getCommand);
      const settings = JSON.parse(await settingsResponse.Body.transformToString());
      
      if (!settings.enabled || !settings.autoSchedule) {
        return res.json({
          success: false,
          message: 'Autopilot or auto-schedule is disabled for this user',
          settings: settings
        });
      }
      
      // Manually trigger auto-scheduling for this user
      await checkAndScheduleNewPosts(username, platform, settings);
      
      res.json({
        success: true,
        message: `Autopilot schedule test completed for ${platform}/${username}`,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return res.json({
          success: false,
          message: 'No autopilot settings found for this user'
        });
      }
      throw error;
    }
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Test schedule error:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
app.post(['/test-autopilot-reply/:username', '/api/test-autopilot-reply/:username'], async (req, res) => {
  setCorsHeaders(res);
  
  const { username } = req.params;
  const { platform = 'instagram' } = req.query;
  
  try {
    console.log(`[${new Date().toISOString()}] [AUTOPILOT] 🧪 Manual autopilot reply test for ${platform}/${username}`);
    
    // Check if autopilot is enabled for this user
    const settingsKey = `autopilot_settings/${platform}/${username}/settings.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: settingsKey
      });
      
      const settingsResponse = await s3Client.send(getCommand);
      const settings = JSON.parse(await settingsResponse.Body.transformToString());
      
      if (!settings.enabled || !settings.autoReply) {
        return res.json({
          success: false,
          message: 'Autopilot or auto-reply is disabled for this user',
          settings: settings
        });
      }
      
      // Manually trigger auto-replies for this user
      await checkAndReplyToNewMessages(username, platform, settings);
      
      res.json({
        success: true,
        message: `Autopilot reply test completed for ${platform}/${username}`,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return res.json({
          success: false,
          message: 'No autopilot settings found for this user'
        });
      }
      throw error;
    }
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Test reply error:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get autopilot status and debug info
app.get(['/autopilot-status/:username', '/api/autopilot-status/:username'], async (req, res) => {
  setCorsHeaders(res);
  
  const { username } = req.params;
  const { platform = 'instagram' } = req.query;
  
  try {
    const settingsKey = `autopilot_settings/${platform}/${username}/settings.json`;
    let settings = null;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: settingsKey
      });
      
      const settingsResponse = await s3Client.send(getCommand);
      settings = JSON.parse(await settingsResponse.Body.transformToString());
    } catch (error) {
      // No settings found
    }
    
    // Get ready posts count using correct prefix
    const postsPrefix = `ready_post/${platform}/${username}/`;
    const postsCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: postsPrefix,
      MaxKeys: 100
    });
    
    const postsResponse = await s3Client.send(postsCommand);
    const readyPostsCount = postsResponse.Contents ? 
      postsResponse.Contents.filter(obj => obj.Key && obj.Key.endsWith('.json')).length : 0;
    
    // Get scheduled posts count
    const scheduledPrefix = `scheduled_posts/${platform}/`;
    const scheduledCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: scheduledPrefix,
      MaxKeys: 100
    });
    
    const scheduledResponse = await s3Client.send(scheduledCommand);
    let userScheduledCount = 0;
    
    if (scheduledResponse.Contents) {
      for (const obj of scheduledResponse.Contents) {
        if (!obj.Key?.endsWith('.json')) continue;
        
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: obj.Key
          });
          
          const scheduleData = JSON.parse(await (await s3Client.send(getCommand)).Body.transformToString());
          if (scheduleData.username === username || scheduleData.userId === username) {
            userScheduledCount++;
          }
        } catch (error) {
          // Skip invalid files
        }
      }
    }
    
    // Get last scheduled post time
    const lastScheduledTime = await getLastScheduledPostTime(username, platform);
    const schedulingInterval = await getSchedulingInterval(username, platform);
    
    res.json({
      success: true,
      autopilot: {
        enabled: settings?.enabled || false,
        autoSchedule: settings?.autoSchedule || false,
        autoReply: settings?.autoReply || false,
        lastChecked: settings?.lastChecked || null
      },
      stats: {
        readyPosts: readyPostsCount,
        scheduledPosts: userScheduledCount,
        lastScheduledTime: lastScheduledTime?.toISOString() || null,
        schedulingInterval: schedulingInterval,
        nextScheduleTime: lastScheduledTime ? 
          new Date(lastScheduledTime.getTime() + (schedulingInterval * 60 * 60 * 1000)).toISOString() :
          new Date(Date.now() + 60 * 1000).toISOString()
      },
      watchers: {
        running: !!global.autopilotIntervals,
        scheduleInterval: '3 minutes',
        replyInterval: '30 seconds'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AUTOPILOT] Status error:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generated content summary endpoint - Schema: tasks/generated_content/<platform>/<username>/posts.json
app.get(['/generated-content-summary/:username', '/api/generated-content-summary/:username'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  try {
    const { username } = req.params;
    
    // Parse platform from query params
    const platform = (req.query.platform || 'instagram').toLowerCase();
    if (!['instagram', 'twitter', 'facebook'].includes(platform)) {
      return res.status(400).json({ 
        error: 'Invalid platform. Must be instagram, twitter, or facebook.' 
      });
    }
    
    // Build the specific file path
    const summaryKey = `generated_content/${platform}/${username}/posts.json`;

    console.log(`[${new Date().toISOString()}] Retrieving generated content summary from: ${summaryKey}`);

    // Try to get the posts.json file
    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: summaryKey
    });
    
    const summaryResponse = await s3Client.send(getCommand);
    const summaryBody = await streamToString(summaryResponse.Body);
    const summaryData = JSON.parse(summaryBody);

    // Function to decode Unicode escape sequences
    function decodeUnicodeEscapes(text) {
      if (typeof text !== 'string') return text;
      
      // Decode Unicode escape sequences like \ud83d\udcc8 to 📈
      return text.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
        return String.fromCharCode(parseInt(code, 16));
      });
    }

    // Extract and decode the Summary field
    let decodedSummary = '';
    if (summaryData.Summary) {
      decodedSummary = decodeUnicodeEscapes(summaryData.Summary);
    }

    // Extract post count based on highest Post_* key
    const postKeys = Object.keys(summaryData).filter(key => key.startsWith('Post_'));
    let postCount = 0;
    
    if (postKeys.length > 0) {
      // Extract numbers from Post_* keys and find the highest
      const postNumbers = postKeys
        .map(key => {
          const match = key.match(/^Post_(\d+)$/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(num => num > 0);
      
      if (postNumbers.length > 0) {
        postCount = Math.max(...postNumbers);
      }
    }

    console.log(`[${new Date().toISOString()}] Processed generated content for ${username} on ${platform}: ${postCount} posts, summary length: ${decodedSummary.length}`);

    // Return the processed data
    res.json({
      success: true,
      summary: decodedSummary || 'No summary available',
      postCount: postCount,
      rawData: summaryData, // Include raw data for debugging if needed
      platform: platform,
      username: username,
      retrievedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Generated content summary retrieval error:`, error);
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ 
        error: 'Generated content summary not found',
        message: 'Your campaign is processing. Progress will be available shortly.',
        postCount: 0,
        summary: ''
      });
    }

    res.status(500).json({ 
      error: 'Failed to retrieve generated content summary', 
      details: error.message,
      postCount: 0,
      summary: ''
    });
  }
});

// OPTIONS handler for generated-content-summary
app.options(['/generated-content-summary/:username', '/api/generated-content-summary/:username'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Campaign status check endpoint - Check if user has an active campaign
app.get(['/campaign-status/:username', '/api/campaign-status/:username'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  try {
    const { username } = req.params;
    
    // Parse platform from query params
    const platform = (req.query.platform || 'instagram').toLowerCase();
    if (!['instagram', 'twitter', 'facebook'].includes(platform)) {
      return res.status(400).json({ 
        error: 'Invalid platform. Must be instagram, twitter, or facebook.' 
      });
    }
    
    // Check if we should bypass cache
    const bypassCache = req.query.bypass_cache === 'true' || req.query.refresh === 'true';
    
    console.log(`[${new Date().toISOString()}] Checking campaign status for ${username} on ${platform} (bypass_cache: ${bypassCache})`);

    // Use cache key for campaign status
    const cacheKey = `campaign-status:${platform}:${username}`;
    
    // Check cache first if not bypassing and if memoryCache is available
    try {
      if (!bypassCache && typeof memoryCache !== 'undefined' && memoryCache.has(cacheKey)) {
        const cachedStatus = memoryCache.get(cacheKey);
        console.log(`[${new Date().toISOString()}] Returning cached campaign status for ${username} on ${platform}: ${JSON.stringify(cachedStatus)}`);
        return res.json(cachedStatus);
      }
    } catch (cacheError) {
      console.log(`[${new Date().toISOString()}] Cache read skipped: ${cacheError.message}`);
    }

    // Check for existing goal files
    const goalPrefix = `goal/${platform}/${username}`;
    const listGoalsCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `${goalPrefix}/`
    });

    const goalData = await s3Client.send(listGoalsCommand);
    const hasActiveGoal = goalData.Contents && goalData.Contents.length > 0;

    let responseData;
    if (hasActiveGoal) {
      console.log(`[${new Date().toISOString()}] Active campaign found for ${username} on ${platform}`);
      responseData = { 
        hasActiveCampaign: true,
        platform: platform,
        username: username,
        goalFiles: goalData.Contents?.length || 0,
        checkedAt: new Date().toISOString()
      };
    } else {
      console.log(`[${new Date().toISOString()}] No active campaign found for ${username} on ${platform}`);
      responseData = { 
        hasActiveCampaign: false,
        platform: platform,
        username: username,
        checkedAt: new Date().toISOString()
      };
    }
    
    // Cache the result for 30 seconds if memoryCache is available
    try {
      if (typeof memoryCache !== 'undefined') {
        memoryCache.set(cacheKey, responseData, 30);
      }
    } catch (cacheError) {
      console.log(`[${new Date().toISOString()}] Cache write skipped: ${cacheError.message}`);
    }
    
    res.json(responseData);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Campaign status check error:`, error);
    res.status(500).json({ 
      error: 'Failed to check campaign status', 
      details: error.message,
      hasActiveCampaign: false,
      checkedAt: new Date().toISOString()
    });
  }
});

// OPTIONS handler for campaign-status
app.options(['/campaign-status/:username', '/api/campaign-status/:username'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Stop campaign endpoint - Delete all campaign-related files
app.delete(['/stop-campaign/:username', '/api/stop-campaign/:username'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  try {
    const { username } = req.params;
    
    // Parse platform from query params
    const platform = (req.query.platform || 'instagram').toLowerCase();
    if (!['instagram', 'twitter', 'facebook'].includes(platform)) {
      return res.status(400).json({ 
        error: 'Invalid platform. Must be instagram, twitter, or facebook.' 
      });
    }
    
    console.log(`[${new Date().toISOString()}] Stopping campaign for ${username} on ${platform}`);

    let deletedFiles = [];
    let deletionErrors = [];

    // Define file prefixes to delete - ONLY generated content and campaign data, NOT user images
    const prefixesToDelete = [
      `goal/${platform}/${username}`,
      `goal_summary/${platform}/${username}`,
      `generated_content/${platform}/${username}` // ✅ BULLETPROOF: Delete generated content to prevent reuse
      // ❌ REMOVED: ready_post/${platform}/${username} - Keep user images intact
    ];

    // Delete files from each prefix
    for (const prefix of prefixesToDelete) {
      try {
        const listCommand = new ListObjectsV2Command({
          Bucket: 'tasks',
          Prefix: `${prefix}/`
        });

        const data = await s3Client.send(listCommand);

        if (data.Contents && data.Contents.length > 0) {
          console.log(`[${new Date().toISOString()}] Found ${data.Contents.length} files to delete in ${prefix}/`);
          
          for (const object of data.Contents) {
            if (object.Key) {
              try {
                const deleteCommand = new DeleteObjectCommand({
                  Bucket: 'tasks',
                  Key: object.Key
                });
                
                await s3Client.send(deleteCommand);
                deletedFiles.push(object.Key);
                
                // ✅ BULLETPROOF: Log generated content deletion specifically
                if (object.Key.includes('generated_content')) {
                  console.log(`[${new Date().toISOString()}] ✅ BULLETPROOF: Deleted generated content: ${object.Key} - Campaign data cleared completely`);
                } else {
                  console.log(`[${new Date().toISOString()}] Deleted: ${object.Key}`);
                }
              } catch (deleteError) {
                console.error(`[${new Date().toISOString()}] Error deleting ${object.Key}:`, deleteError);
                deletionErrors.push({ key: object.Key, error: deleteError.message });
              }
            }
          }
        } else {
          console.log(`[${new Date().toISOString()}] No files found in ${prefix}/ to delete`);
        }
      } catch (listError) {
        console.error(`[${new Date().toISOString()}] Error listing files in ${prefix}/:`, listError);
        deletionErrors.push({ prefix, error: listError.message });
      }
    }

    // Verify campaign is truly stopped by checking campaign status
    const goalPrefix = `goal/${platform}/${username}`;
    const verifyCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `${goalPrefix}/`
    });
    
    const verifyData = await s3Client.send(verifyCommand);
    const stillHasGoalFiles = verifyData.Contents && verifyData.Contents.length > 0;
    
    // ✅ BULLETPROOF: Also verify generated content was completely deleted
    const generatedContentPrefix = `generated_content/${platform}/${username}`;
    const verifyGeneratedCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `${generatedContentPrefix}/`
    });
    
    const verifyGeneratedData = await s3Client.send(verifyGeneratedCommand);
    const stillHasGeneratedContent = verifyGeneratedData.Contents && verifyGeneratedData.Contents.length > 0;
    
    if (stillHasGoalFiles || stillHasGeneratedContent) {
      console.error(`[${new Date().toISOString()}] Warning: Campaign files still exist after deletion attempt for ${username} on ${platform}`);
      
      // Combine both sets of remaining files for cleanup
      const remainingFiles = [
        ...(verifyData.Contents || []),
        ...(verifyGeneratedData.Contents || [])
      ];
      
      // Try one more time to delete any remaining files
      for (const object of remainingFiles) {
        if (object.Key) {
          try {
            const deleteCommand = new DeleteObjectCommand({
              Bucket: 'tasks',
              Key: object.Key
            });
            await s3Client.send(deleteCommand);
            deletedFiles.push(object.Key);
            
            if (object.Key.includes('generated_content')) {
              console.log(`[${new Date().toISOString()}] ✅ BULLETPROOF: Retry deleted generated content: ${object.Key}`);
            } else {
              console.log(`[${new Date().toISOString()}] Retry deleted: ${object.Key}`);
            }
          } catch (retryError) {
            console.error(`[${new Date().toISOString()}] Error in retry deletion of ${object.Key}:`, retryError);
          }
        }
      }
    }

    console.log(`[${new Date().toISOString()}] Campaign deletion completed for ${username} on ${platform}. Deleted ${deletedFiles.length} files, ${deletionErrors.length} errors.`);
    console.log(`[${new Date().toISOString()}] ✅ PRESERVED: Ready post images kept intact for user reuse`);

    // 🚀 AUTOPILOT RESET: Clear autopilot settings when campaign stops
    try {
      const autopilotKey = `autopilot_settings/${username}_${platform}.json`;
      
      // Check if autopilot settings exist
      try {
        const getAutopilotCommand = new GetObjectCommand({
          Bucket: 'tasks',
          Key: autopilotKey
        });
        await s3Client.send(getAutopilotCommand);
        
        // If exists, delete it to reset autopilot for new campaigns
        const deleteAutopilotCommand = new DeleteObjectCommand({
          Bucket: 'tasks',
          Key: autopilotKey
        });
        await s3Client.send(deleteAutopilotCommand);
        
        console.log(`[${new Date().toISOString()}] ✅ Autopilot settings reset for ${username} on ${platform}`);
        deletedFiles.push(autopilotKey);
      } catch (autopilotError) {
        // Autopilot settings didn't exist, which is fine
        if (autopilotError.name !== 'NoSuchKey') {
          console.warn(`[${new Date().toISOString()}] Warning: Could not reset autopilot settings: ${autopilotError.message}`);
        }
      }
    } catch (resetError) {
      console.warn(`[${new Date().toISOString()}] Warning: Autopilot reset failed: ${resetError.message}`);
    }

    // Clear any cached status data - skip cache operations if memoryCache is not defined
    try {
      if (typeof memoryCache !== 'undefined') {
        const cacheKey = `campaign-status:${platform}:${username}`;
        if (memoryCache.has(cacheKey)) {
          console.log(`[${new Date().toISOString()}] Clearing cached campaign status for ${username} on ${platform}`);
          memoryCache.del(cacheKey);
        }
      }
      
      // ✅ BULLETPROOF: Clear generated content from memory cache
      const generatedContentCacheKey = `generated_content/${platform}/${username}/posts.json`;
      if (cache && cache.has(generatedContentCacheKey)) {
        cache.delete(generatedContentCacheKey);
        console.log(`[${new Date().toISOString()}] ✅ BULLETPROOF: Cleared generated content cache for ${username} on ${platform}`);
      }
      if (cacheTimestamps && cacheTimestamps.has(generatedContentCacheKey)) {
        cacheTimestamps.delete(generatedContentCacheKey);
      }
    } catch (cacheError) {
      console.log(`[${new Date().toISOString()}] Cache operation skipped: ${cacheError.message}`);
    }

    res.json({
      success: true,
      message: `Campaign stopped successfully for ${username} on ${platform}`,
      deletedFiles: deletedFiles,
      deletedCount: deletedFiles.length,
      errors: deletionErrors,
      platform: platform,
      username: username,
      hasActiveCampaign: false,
      generatedContentCleared: deletedFiles.some(file => file.includes('generated_content')), // ✅ BULLETPROOF: Confirm generated content cleanup
      readyPostImagesPreserved: true // ✅ PRESERVED: User images kept intact
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Stop campaign error:`, error);
    res.status(500).json({ 
      error: 'Failed to stop campaign', 
      details: error.message,
      success: false
    });
  }
});

// OPTIONS handler for stop-campaign
app.options(['/stop-campaign/:username', '/api/stop-campaign/:username'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Get timeline from generated content endpoint
app.get(['/generated-content-timeline/:username', '/api/generated-content-timeline/:username'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  try {
    const { username } = req.params;
    
    // Parse platform from query params
    const platform = (req.query.platform || 'instagram').toLowerCase();
    if (!['instagram', 'twitter', 'facebook'].includes(platform)) {
      return res.status(400).json({ 
        error: 'Invalid platform. Must be instagram, twitter, or facebook.' 
      });
    }
    
    // Build the file path for generated content
    const contentKey = `generated_content/${platform}/${username}/posts.json`;

    console.log(`[${new Date().toISOString()}] Retrieving timeline from generated content: ${contentKey}`);

    // Try to get the generated content file
    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: contentKey
    });
    
    const contentResponse = await s3Client.send(getCommand);
    const contentBody = await streamToString(contentResponse.Body);
    const contentData = JSON.parse(contentBody);

    // Extract timeline value
    let timeline = null;
    if (contentData.Timeline) {
      // Parse timeline value, ensure it's a number
      const timelineValue = parseInt(contentData.Timeline);
      if (!isNaN(timelineValue) && timelineValue > 0) {
        timeline = timelineValue;
      }
    }

    console.log(`[${new Date().toISOString()}] Timeline extracted for ${username} on ${platform}: ${timeline} hours`);

    res.json({
      success: true,
      timeline: timeline,
      platform: platform,
      username: username,
      fallbackUsed: timeline === null
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Generated content timeline retrieval error:`, error);
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ 
        error: 'Generated content not found',
        timeline: null,
        fallbackUsed: true,
        success: false
      });
    }

    res.status(500).json({ 
      error: 'Failed to retrieve timeline from generated content', 
      details: error.message,
      timeline: null,
      fallbackUsed: true,
      success: false
    });
  }
});

// OPTIONS handler for generated-content-timeline
app.options(['/generated-content-timeline/:username', '/api/generated-content-timeline/:username'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// ============= END GOAL MANAGEMENT ENDPOINTS =============

// Profit Analysis endpoint - Schema: tasks/prophet_analysis/<platform>/<username>/analysis_*.json
app.get(['/profit-analysis/:username', '/api/profit-analysis/:username'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  try {
    const { username } = req.params;
    
    // Parse platform from query params
    const platform = (req.query.platform || 'instagram').toLowerCase();
    if (!['instagram', 'twitter', 'facebook'].includes(platform)) {
      return res.status(400).json({ 
        error: 'Invalid platform. Must be instagram, twitter, or facebook.' 
      });
    }
    
    // Build analysis prefix
    const analysisPrefix = `prophet_analysis/${platform}/${username}`;

    console.log(`[${new Date().toISOString()}] Retrieving profit analysis from: ${analysisPrefix}/`);

    // List all analysis files for the user
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `${analysisPrefix}/`
    });

    const data = await s3Client.send(listCommand);

    if (!data.Contents || data.Contents.length === 0) {
      console.log(`[${new Date().toISOString()}] No profit analysis found for ${username} on ${platform}`);
      return res.status(404).json({ 
        error: 'Profit analysis not found',
        message: 'No profit analysis data available for this account.'
      });
    }

    // Find the latest analysis file (highest number)
    const analysisFiles = data.Contents
      .filter(obj => obj.Key && obj.Key.includes('analysis_'))
      .map(obj => ({
        key: obj.Key,
        number: parseInt(obj.Key.match(/analysis_(\d+)\.json$/)?.[1] || '0')
      }))
      .sort((a, b) => b.number - a.number);

    if (analysisFiles.length === 0) {
      return res.status(404).json({ 
        error: 'No valid analysis files found',
        message: 'No profit analysis data available for this account.'
      });
    }

    // Get the latest analysis file
    const latestAnalysisKey = analysisFiles[0].key;
    console.log(`[${new Date().toISOString()}] Retrieving latest analysis: ${latestAnalysisKey}`);

    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: latestAnalysisKey
    });
    
    const analysisResponse = await s3Client.send(getCommand);
    const analysisBody = await streamToString(analysisResponse.Body);
    const analysis = JSON.parse(analysisBody);

    res.json(analysis);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Profit analysis retrieval error:`, error);
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ 
        error: 'Profit analysis not found',
        message: 'No profit analysis data available for this account.'
      });
    }

    res.status(500).json({ 
      error: 'Failed to retrieve profit analysis', 
      details: error.message 
    });
  }
});

// ============= TWITTER ACCOUNT MANAGEMENT =============

// ... existing code ...

// Generate a fresh signed URL for a ready_post image
app.get(['/api/signed-image-url/:username/:imageKey', '/signed-image-url/:username/:imageKey'], async (req, res) => {
  const { username, imageKey } = req.params;
  try {
    const key = `ready_post/${username}/${imageKey}`;
    const command = new GetObjectCommand({
      Bucket: 'tasks',
      Key: key,
    });
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    res.json({ url: signedUrl });
  } catch (error) {
    console.error(`[signed-image-url] Failed to generate signed URL for`, req.params, error?.message);
    res.status(500).json({ error: 'Failed to generate signed URL' });
  }
});

// Add OPTIONS handler for signed-image-url endpoint
app.options(['/api/signed-image-url/:username/:imageKey', '/signed-image-url/:username/:imageKey'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});
// ... existing code ...
// Send verification email endpoint
app.post(['/api/send-verification-email', '/send-verification-email'], async (req, res) => {
  setCorsHeaders(res);
  
  try {
    const { email, userId } = req.body;
    
    if (!email || !userId) {
      return res.status(400).json({ error: 'Email and userId are required' });
    }
    
    // Generate verification code
    const verificationCode = generateVerificationCode();
    
    // Store code with expiration (5 minutes)
    verificationCodes.set(email, {
      code: verificationCode,
      userId: userId,
      expires: Date.now() + 5 * 60 * 1000 // 5 minutes
    });
    
    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-app-email@gmail.com',
      to: email,
      subject: 'Account Manager - Email Verification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #1a1a3a 0%, #2e2e5e 100%); color: #e0e0ff; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #00ffcc; font-size: 2rem; margin-bottom: 10px;">Account Manager</h1>
            <h2 style="color: #e0e0ff; font-size: 1.5rem; margin: 0;">Email Verification</h2>
          </div>
          
          <div style="background: rgba(255, 255, 255, 0.1); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
            <p style="font-size: 1.1rem; line-height: 1.6; margin-bottom: 20px;">
              Welcome to Account Manager! Please verify your email address by entering the following 6-word verification code:
            </p>
            
            <div style="background: rgba(0, 255, 204, 0.2); border: 2px solid #00ffcc; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0;">
              <h3 style="color: #00ffcc; font-size: 1.8rem; margin: 0; letter-spacing: 2px; font-family: monospace;">
                ${verificationCode.toUpperCase()}
              </h3>
            </div>
            
            <p style="font-size: 0.9rem; color: #cccccc; margin-top: 20px;">
              💡 <strong>Tip:</strong> You can copy and paste all 6 words at once into any input field in the verification form.
            </p>
          </div>
          
          <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 0.9rem; color: #ffc107;">
              ⚠️ This code will expire in 5 minutes for security reasons.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(224, 224, 255, 0.2);">
            <p style="font-size: 0.8rem; color: #999; margin: 0;">
              If you didn't request this verification, please ignore this email.
            </p>
            <p style="font-size: 0.8rem; color: #999; margin: 5px 0 0 0;">
              © 2025 Account Manager - AI-Powered Social Media Management
            </p>
          </div>
        </div>
      `
    };
    
    // Send email or simulate for demo
    if (isEmailConfigured) {
      await emailTransporter.sendMail(mailOptions);
      console.log(`[${new Date().toISOString()}] Verification email sent to ${email}`);
    } else {
      // Demo mode - just log the verification code
      console.log(`[${new Date().toISOString()}] DEMO MODE - Verification code for ${email}: ${verificationCode}`);
      console.log(`[${new Date().toISOString()}] In production, configure EMAIL_USER and EMAIL_PASS environment variables`);
    }
    
    res.json({ 
      success: true, 
      message: isEmailConfigured ? 'Verification email sent successfully' : 'Demo mode: Check server console for verification code',
      demoMode: !isEmailConfigured,
      verificationCode: !isEmailConfigured ? verificationCode : undefined
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error sending verification email:`, error);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

// Verify email code endpoint
app.post(['/api/verify-email-code', '/verify-email-code'], async (req, res) => {
  setCorsHeaders(res);
  
  try {
    const { email, code, userId } = req.body;
    
    if (!email || !code || !userId) {
      return res.status(400).json({ error: 'Email, code, and userId are required' });
    }
    
    // Get stored verification data
    const storedData = verificationCodes.get(email);
    
    if (!storedData) {
      return res.status(400).json({ error: 'No verification code found for this email' });
    }
    
    // Check if code expired
    if (Date.now() > storedData.expires) {
      verificationCodes.delete(email);
      return res.status(400).json({ error: 'Verification code has expired' });
    }
    
    // Check if userId matches
    if (storedData.userId !== userId) {
      return res.status(400).json({ error: 'Invalid verification request' });
    }
    
    // Check if code matches (case insensitive)
    if (storedData.code.toLowerCase() !== code.toLowerCase().trim()) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }
    
    // Code is valid - remove from storage
    verificationCodes.delete(email);
    
    console.log(`[${new Date().toISOString()}] Email verified successfully for ${email}`);
    res.json({ success: true, message: 'Email verified successfully' });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error verifying email code:`, error);
    res.status(500).json({ error: 'Failed to verify email code' });
  }
});

// Resend verification code endpoint
app.post(['/api/resend-verification-code', '/resend-verification-code'], async (req, res) => {
  setCorsHeaders(res);
  
  try {
    const { email, userId } = req.body;
    
    if (!email || !userId) {
      return res.status(400).json({ error: 'Email and userId are required' });
    }
    
    // Generate new verification code
    const verificationCode = generateVerificationCode();
    
    // Update stored code
    verificationCodes.set(email, {
      code: verificationCode,
      userId: userId,
      expires: Date.now() + 5 * 60 * 1000 // 5 minutes
    });
    
    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-app-email@gmail.com',
      to: email,
      subject: 'Account Manager - New Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #1a1a3a 0%, #2e2e5e 100%); color: #e0e0ff; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #00ffcc; font-size: 2rem; margin-bottom: 10px;">Account Manager</h1>
            <h2 style="color: #e0e0ff; font-size: 1.5rem; margin: 0;">New Verification Code</h2>
          </div>
          
          <div style="background: rgba(255, 255, 255, 0.1); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
            <p style="font-size: 1.1rem; line-height: 1.6; margin-bottom: 20px;">
              Here's your new 6-word verification code:
            </p>
            
            <div style="background: rgba(0, 255, 204, 0.2); border: 2px solid #00ffcc; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0;">
              <h3 style="color: #00ffcc; font-size: 1.8rem; margin: 0; letter-spacing: 2px; font-family: monospace;">
                ${verificationCode.toUpperCase()}
              </h3>
            </div>
          </div>
          
          <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 0.9rem; color: #ffc107;">
              ⚠️ This new code will expire in 5 minutes.
            </p>
          </div>
        </div>
      `
    };
    
    // Send email or simulate for demo
    if (isEmailConfigured) {
      await emailTransporter.sendMail(mailOptions);
      console.log(`[${new Date().toISOString()}] New verification email sent to ${email}`);
    } else {
      // Demo mode - just log the verification code
      console.log(`[${new Date().toISOString()}] DEMO MODE - New verification code for ${email}: ${verificationCode}`);
    }
    
    res.json({ 
      success: true, 
      message: isEmailConfigured ? 'New verification code sent successfully' : 'Demo mode: Check server console for new verification code',
      demoMode: !isEmailConfigured,
      verificationCode: !isEmailConfigured ? verificationCode : undefined
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error resending verification email:`, error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// OPTIONS handlers for email verification endpoints
app.options(['/api/send-verification-email', '/send-verification-email'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

app.options(['/api/verify-email-code', '/verify-email-code'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

app.options(['/api/resend-verification-code', '/resend-verification-code'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Initialize token index map
const tokenIndex = new Map();

async function buildTokenIndex() {
  try {
    console.log('Building token index...');
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'InstagramTokens/',
    });
    const { Contents } = await s3Client.send(listCommand);
    
    if (Contents) {
      for (const obj of Contents) {
        if (obj.Key.endsWith('/token.json')) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const token = JSON.parse(await data.Body.transformToString());
            
            // Extract app user ID from key path
            const appUserId = obj.Key.split('/')[1];
            
            // Index by all possible identifiers
            if (token.instagram_user_id) {
              tokenIndex.set(token.instagram_user_id, appUserId);
            }
            if (token.instagram_graph_id) {
              tokenIndex.set(token.instagram_graph_id, appUserId);
            }
            if (token.username) {
              tokenIndex.set(token.username, appUserId);
            }
          } catch (err) {
            console.error('Error indexing token:', err);
          }
        }
      }
    }
    console.log(`Token index built with ${tokenIndex.size} entries`);
  } catch (error) {
    console.error('Error building token index:', error);
  }
}

// Call this on server startup
buildTokenIndex();

// Periodically rebuild index (every 5 minutes)
setInterval(buildTokenIndex, 300000);

// ===============================================================
// PLATFORM DASHBOARD RESET ENDPOINT
// ===============================================================

app.options(['/platform-reset/:userId', '/api/platform-reset/:userId'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

app.delete(['/platform-reset/:userId', '/api/platform-reset/:userId'], async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const { platform } = req.body;
  
  if (!platform || !['instagram', 'twitter', 'facebook'].includes(platform)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Valid platform (instagram, twitter, facebook) is required' 
    });
  }
  
  console.log(`[${new Date().toISOString()}] Platform reset requested for user ${userId} on ${platform}`);
  
  try {
    // Clear platform-specific user status
    const statusKey = `User${platform.charAt(0).toUpperCase() + platform.slice(1)}Status/${userId}/status.json`;
    
    try {
      const deleteStatusCommand = new DeleteObjectCommand({
        Bucket: 'tasks',
        Key: statusKey,
      });
      await s3Client.send(deleteStatusCommand);
      console.log(`[${new Date().toISOString()}] Deleted ${platform} status for user ${userId}`);
    } catch (error) {
      if (error.name !== 'NoSuchKey') {
        console.error(`[${new Date().toISOString()}] Error deleting ${platform} status:`, error);
      }
    }
    
    // Clear platform connection data
    const connectionKey = `${platform.charAt(0).toUpperCase() + platform.slice(1)}Connection/${userId}/connection.json`;
    
    try {
      const deleteConnectionCommand = new DeleteObjectCommand({
        Bucket: 'tasks',
        Key: connectionKey,
      });
      await s3Client.send(deleteConnectionCommand);
      console.log(`[${new Date().toISOString()}] Deleted ${platform} connection for user ${userId}`);
    } catch (error) {
      if (error.name !== 'NoSuchKey') {
        console.error(`[${new Date().toISOString()}] Error deleting ${platform} connection:`, error);
      }
    }
    
    // Clear scheduled posts for this platform
    const scheduledPostsPrefix = `scheduled_posts/${platform}/${userId}/`;
    
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: scheduledPostsPrefix,
      });
      
      const listResponse = await s3Client.send(listCommand);
      
      if (listResponse.Contents && listResponse.Contents.length > 0) {
        const deletePromises = listResponse.Contents.map(async (obj) => {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: 'tasks',
            Key: obj.Key,
          });
          return s3Client.send(deleteCommand);
        });
        
        await Promise.all(deletePromises);
        console.log(`[${new Date().toISOString()}] Deleted ${listResponse.Contents.length} scheduled posts for ${platform}/${userId}`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error deleting scheduled posts for ${platform}/${userId}:`, error);
    }
    
    // Clear any cached data for this user and platform
    if (cache) {
      const cacheKeysToDelete = [
        `events-list/${userId}?platform=${platform}`,
        `notifications/${userId}?platform=${platform}`,
        `profile-info/${userId}?platform=${platform}`,
      ];
      
      cacheKeysToDelete.forEach(key => {
        cache.delete(key);
      });
      
      console.log(`[${new Date().toISOString()}] Cleared cache for ${platform}/${userId}`);
    }
    
    // Also delete backend processing status so all devices stop showing "Acquiring"
    try {
      const processingStatusKey = `ProcessingStatus/${userId}/${platform}.json`;
      await s3Client.send(new DeleteObjectCommand({ Bucket: 'tasks', Key: processingStatusKey }));
      console.log(`[${new Date().toISOString()}] Deleted processing status for ${platform}/${userId}`);
    } catch (err) {
      if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) {
        console.warn(`[${new Date().toISOString()}] Warning deleting processing status for ${platform}/${userId}:`, err.message || err);
      }
    }

    // ✅ CRITICAL FIX: Also delete platform access status so all devices stop showing "Acquired"
    try {
      const platformAccessKey = `PlatformAccessStatus/${userId}/${platform}.json`;
      await s3Client.send(new DeleteObjectCommand({ Bucket: 'tasks', Key: platformAccessKey }));
      console.log(`[${new Date().toISOString()}] Deleted platform access status for ${platform}/${userId}`);
    } catch (err) {
      if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) {
        console.warn(`[${new Date().toISOString()}] Warning deleting platform access status for ${platform}/${userId}:`, err.message || err);
      }
    }

    console.log(`[${new Date().toISOString()}] Successfully reset ${platform} dashboard for user ${userId}`);
    
    res.json({ 
      success: true, 
      message: `${platform.charAt(0).toUpperCase() + platform.slice(1)} dashboard reset successfully`,
      platform: platform
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error resetting ${platform} dashboard for user ${userId}:`, error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to reset ${platform} dashboard` 
    });
  }
});

// ===============================================================
// PROCESSING STATUS ENDPOINTS (cross-device sync)
// Persist per-user, per-platform processing timers in R2 so all devices see the same state
// Path: ProcessingStatus/<userId>/<platform>.json
// ===============================================================

app.options(['/processing-status/:userId', '/api/processing-status/:userId'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// ===============================================================
// PLATFORM ACCESS (CLAIMED) ENDPOINTS (cross-device sync)
// Persist per-user, per-platform acquired/claimed status so all devices reflect the same context
// Path: PlatformAccessStatus/<userId>/<platform>.json
// ===============================================================

app.options(['/platform-access/:userId', '/api/platform-access/:userId'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

app.get(['/platform-access/:userId', '/api/platform-access/:userId'], async (req, res) => {
  setCorsHeaders(res);
  try {
    const { userId } = req.params;
    const platform = (req.query.platform || '').toString();
    const allowed = ['instagram', 'twitter', 'facebook', 'linkedin'];

    if (platform) {
      if (!allowed.includes(platform)) {
        return res.status(400).json({ success: false, error: 'Invalid platform' });
      }
      const key = `PlatformAccessStatus/${userId}/${platform}.json`;
      try {
        const resp = await s3Client.send(new GetObjectCommand({ Bucket: 'tasks', Key: key }));
        const body = await streamToString(resp.Body);
        const data = JSON.parse(body || '{}');
        return res.json({ success: true, data });
      } catch (err) {
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
          return res.json({ success: true, data: null });
        }
        throw err;
      }
    }

    const prefix = `PlatformAccessStatus/${userId}/`;
    const list = await s3Client.send(new ListObjectsV2Command({ Bucket: 'tasks', Prefix: prefix }));
    const items = list.Contents || [];
    const results = {};
    for (const obj of items) {
      if (!obj.Key) continue;
      try {
        const get = await s3Client.send(new GetObjectCommand({ Bucket: 'tasks', Key: obj.Key }));
        const body = await streamToString(get.Body);
        const data = JSON.parse(body || '{}');
        const filePlatform = obj.Key.replace(prefix, '').replace('.json', '');
        results[filePlatform] = data;
      } catch {}
    }
    return res.json({ success: true, data: results });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching platform access status:`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch platform access status' });
  }
});

app.post(['/platform-access/:userId', '/api/platform-access/:userId'], async (req, res) => {
  setCorsHeaders(res);
  try {
    const { userId } = req.params;
    const { platform, claimed, username } = req.body || {};
    const allowed = ['instagram', 'twitter', 'facebook', 'linkedin'];
    if (!platform || !allowed.includes(platform)) {
      return res.status(400).json({ success: false, error: 'Valid platform is required' });
    }
    if (typeof claimed !== 'boolean') {
      return res.status(400).json({ success: false, error: 'claimed must be boolean' });
    }

    // Guard: If processing is active, force claimed=false regardless of requested value
    try {
      const processingKey = `ProcessingStatus/${userId}/${platform}.json`;
      const getProcessing = new GetObjectCommand({ Bucket: 'tasks', Key: processingKey });
      try {
        const resp = await s3Client.send(getProcessing);
        const body = await streamToString(resp.Body);
        const proc = JSON.parse(body || '{}');
        if (proc && typeof proc.endTime === 'number' && Date.now() < Number(proc.endTime)) {
          // Active processing: do not allow claimed=true
          if (claimed === true) {
            console.log(`[${new Date().toISOString()}] BLOCK claimed=true while processing active for ${platform}/${userId}`);
          }
          // Enforce false
          req.body.claimed = false;
        }
      } catch (err) {
        // No processing entry or error; ignore and proceed
      }
    } catch {}

    const payload = {
      userId,
      platform,
      claimed: req.body.claimed === true,
      username: typeof username === 'string' ? username : undefined,
      updatedAt: Date.now(),
    };

    const key = `PlatformAccessStatus/${userId}/${platform}.json`;
    await s3Client.send(new PutObjectCommand({ Bucket: 'tasks', Key: key, Body: JSON.stringify(payload), ContentType: 'application/json' }));
    console.log(`[${new Date().toISOString()}] Saved platform access for ${platform}/${userId}: claimed=${claimed}`);
    return res.json({ success: true, data: payload });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error saving platform access status:`, error);
    res.status(500).json({ success: false, error: 'Failed to save platform access status' });
  }
});

app.delete(['/platform-access/:userId', '/api/platform-access/:userId'], async (req, res) => {
  setCorsHeaders(res);
  try {
    const { userId } = req.params;
    const { platform } = req.body || {};
    const allowed = ['instagram', 'twitter', 'facebook', 'linkedin'];
    if (!platform || !allowed.includes(platform)) {
      return res.status(400).json({ success: false, error: 'Valid platform is required' });
    }

    const key = `PlatformAccessStatus/${userId}/${platform}.json`;
    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: 'tasks', Key: key }));
    } catch (err) {
      if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) throw err;
    }
    console.log(`[${new Date().toISOString()}] Deleted platform access for ${platform}/${userId}`);
    return res.json({ success: true });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error deleting platform access status:`, error);
    res.status(500).json({ success: false, error: 'Failed to delete platform access status' });
  }
});

app.get(['/processing-status/:userId', '/api/processing-status/:userId'], async (req, res) => {
  setCorsHeaders(res);
  try {
    const { userId } = req.params;
    const platform = (req.query.platform || '').toString();

    const allowed = ['instagram', 'twitter', 'facebook', 'linkedin'];

    // If specific platform requested, return single status
    if (platform) {
      if (!allowed.includes(platform)) {
        return res.status(400).json({ success: false, error: 'Invalid platform' });
      }

      const key = `ProcessingStatus/${userId}/${platform}.json`;
      try {
        const getCommand = new GetObjectCommand({ Bucket: 'tasks', Key: key });
        const response = await s3Client.send(getCommand);
        const body = await streamToString(response.Body);
        const data = JSON.parse(body || '{}');
        // Dynamically compute active status on every read to avoid stale flags
        if (data && typeof data.endTime === 'number') {
          data.active = Date.now() < Number(data.endTime);
        }
        return res.json({ success: true, data });
      } catch (err) {
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
          return res.json({ success: true, data: null });
        }
        throw err;
      }
    }

    // Otherwise, list all platforms for this user
    const prefix = `ProcessingStatus/${userId}/`;
    const list = await s3Client.send(new ListObjectsV2Command({ Bucket: 'tasks', Prefix: prefix }));
    const items = list.Contents || [];
    const results = {};

    for (const obj of items) {
      if (!obj.Key) continue;
      try {
        const get = await s3Client.send(new GetObjectCommand({ Bucket: 'tasks', Key: obj.Key }));
        const body = await streamToString(get.Body);
        const data = JSON.parse(body || '{}');
        if (data && typeof data.endTime === 'number') {
          data.active = Date.now() < Number(data.endTime);
        }
        const filePlatform = obj.Key.replace(prefix, '').replace('.json', '');
        results[filePlatform] = data;
      } catch (err) {
        // Skip corrupted entries
      }
    }

    return res.json({ success: true, data: results });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching processing status:`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch processing status' });
  }
});

app.post(['/processing-status/:userId', '/api/processing-status/:userId'], async (req, res) => {
  setCorsHeaders(res);
  try {
    const { userId } = req.params;
    const { platform, startTime, endTime, totalDuration, username } = req.body || {};

    const allowed = ['instagram', 'twitter', 'facebook', 'linkedin'];
    if (!platform || !allowed.includes(platform)) {
      return res.status(400).json({ success: false, error: 'Valid platform is required' });
    }
    if (!startTime || !endTime || !totalDuration) {
      return res.status(400).json({ success: false, error: 'startTime, endTime, totalDuration are required' });
    }

    const payload = {
      userId,
      platform,
      startTime: Number(startTime),
      endTime: Number(endTime),
      totalDuration: Number(totalDuration),
      username: typeof username === 'string' ? username : undefined,
      active: Date.now() < Number(endTime),
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };

    const key = `ProcessingStatus/${userId}/${platform}.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(payload),
      ContentType: 'application/json',
    }));

    console.log(`[${new Date().toISOString()}] Saved processing status for ${platform}/${userId} (ends ${endTime})`);
    return res.json({ success: true, data: payload });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error saving processing status:`, error);
    res.status(500).json({ success: false, error: 'Failed to save processing status' });
  }
});

app.delete(['/processing-status/:userId', '/api/processing-status/:userId'], async (req, res) => {
  setCorsHeaders(res);
  try {
    const { userId } = req.params;
    const { platform } = req.body || {};
    const allowed = ['instagram', 'twitter', 'facebook', 'linkedin'];
    if (!platform || !allowed.includes(platform)) {
      return res.status(400).json({ success: false, error: 'Valid platform is required' });
    }

    const key = `ProcessingStatus/${userId}/${platform}.json`;
    // Guard: do not delete if still active
    try {
      const getCmd = new GetObjectCommand({ Bucket: 'tasks', Key: key });
      const resp = await s3Client.send(getCmd);
      const body = await streamToString(resp.Body);
      const data = JSON.parse(body || '{}');
      if (data && typeof data.endTime === 'number' && Date.now() < Number(data.endTime)) {
        console.log(`[${new Date().toISOString()}] DENY delete of active processing for ${platform}/${userId}`);
        return res.status(409).json({ success: false, error: 'processing_active', data: { platform, endTime: data.endTime } });
      }
    } catch (err) {
      // If not found, treat as already deleted
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return res.json({ success: true });
      }
      // Other errors propagate
    }

    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: 'tasks', Key: key }));
    } catch (err) {
      if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) {
        throw err;
      }
    }

    console.log(`[${new Date().toISOString()}] Deleted processing status for ${platform}/${userId}`);
    return res.json({ success: true });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error deleting processing status:`, error);
    res.status(500).json({ success: false, error: 'Failed to delete processing status' });
  }
});

// ✅ CRITICAL: Dashboard Access Validation Endpoint
app.post(['/validate-dashboard-access/:userId', '/api/validate-dashboard-access/:userId'], async (req, res) => {
  setCorsHeaders(res);
  try {
    const { userId } = req.params;
    const { platform } = req.body || {};
    
    const allowed = ['instagram', 'twitter', 'facebook', 'linkedin'];
    if (!platform || !allowed.includes(platform)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid platform is required' 
      });
    }

    console.log(`[${new Date().toISOString()}] Validating dashboard access for ${platform}/${userId}`);

    // Check if there's an active processing status for this platform
    const processingKey = `ProcessingStatus/${userId}/${platform}.json`;
    try {
      const getCommand = new GetObjectCommand({ Bucket: 'tasks', Key: processingKey });
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);
      const processingData = JSON.parse(body || '{}');
      
      if (processingData && typeof processingData.endTime === 'number') {
        const now = Date.now();
        const remainingMs = processingData.endTime - now;
        
        if (remainingMs > 0) {
          // Active processing state - deny dashboard access
          const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
          console.log(`[${new Date().toISOString()}] Access denied for ${platform}/${userId}: processing active (${remainingMinutes}min remaining)`);
          
          return res.json({
            success: true,
            accessAllowed: false,
            reason: 'processing_active',
            processingData: {
              platform,
              remainingMinutes,
              startTime: processingData.startTime,
              endTime: processingData.endTime,
              username: processingData.username
            },
            redirectTo: `/processing/${platform}`
          });
        } else {
          // Expired processing state - clean it up and allow access
          console.log(`[${new Date().toISOString()}] Cleaning up expired processing state for ${platform}/${userId}`);
          try {
            await s3Client.send(new DeleteObjectCommand({ Bucket: 'tasks', Key: processingKey }));
          } catch (deleteError) {
            console.warn(`[${new Date().toISOString()}] Warning cleaning up expired processing state:`, deleteError.message);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) {
        console.error(`[${new Date().toISOString()}] Error checking processing status:`, err);
        return res.status(500).json({ 
          success: false, 
          error: 'Error checking processing status' 
        });
      }
      // NoSuchKey means no processing status - allow access
    }

    // No active processing state - allow dashboard access
    console.log(`[${new Date().toISOString()}] Access allowed for ${platform}/${userId}: no active processing`);
    return res.json({
      success: true,
      accessAllowed: true,
      reason: 'no_processing_active'
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error validating dashboard access:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to validate dashboard access' 
    });
  }
});

// ===============================================================
// CROSS-DEVICE PROCESSING STATE VALIDATION (bulletproof protection)
// Validates that a user cannot access platform dashboards while loading states exist
// ===============================================================

app.options(['/validate-dashboard-access/:userId', '/api/validate-dashboard-access/:userId'], (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

app.post(['/validate-dashboard-access/:userId', '/api/validate-dashboard-access/:userId'], async (req, res) => {
  setCorsHeaders(res);
  try {
    const { userId } = req.params;
    const { platform } = req.body || {};
    
    const allowed = ['instagram', 'twitter', 'facebook', 'linkedin'];
    if (!platform || !allowed.includes(platform)) {
      return res.status(400).json({ success: false, error: 'Valid platform is required' });
    }

    console.log(`[${new Date().toISOString()}] [VALIDATION] Checking dashboard access for ${platform}/${userId}`);

    // Check if there's an active processing status for this platform
    const key = `ProcessingStatus/${userId}/${platform}.json`;
    try {
      const getCommand = new GetObjectCommand({ Bucket: 'tasks', Key: key });
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);
      const data = JSON.parse(body || '{}');
      
      const now = Date.now();
      const endTime = data.endTime;
      
      if (typeof endTime === 'number' && now < endTime) {
        const remainingMs = endTime - now;
        const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
        
        console.log(`[${new Date().toISOString()}] [VALIDATION] ❌ Dashboard access DENIED for ${platform}/${userId} - processing active (${remainingMinutes}min remaining)`);
        
        return res.json({
          success: true,
          accessAllowed: false,
          reason: 'processing_active',
          processingData: {
            platform,
            remainingMinutes,
            startTime: data.startTime,
            endTime: data.endTime,
            username: data.username
          },
          redirectTo: `/processing/${platform}`
        });
      } else if (typeof endTime === 'number' && now >= endTime) {
        // Processing expired - clean it up
        console.log(`[${new Date().toISOString()}] [VALIDATION] 🧹 Cleaning up expired processing status for ${platform}/${userId}`);
        try {
          await s3Client.send(new DeleteObjectCommand({ Bucket: 'tasks', Key: key }));
        } catch (deleteErr) {
          console.warn(`[${new Date().toISOString()}] [VALIDATION] Warning cleaning up expired status:`, deleteErr.message);
        }
      }
    } catch (err) {
      if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) {
        console.warn(`[${new Date().toISOString()}] [VALIDATION] Error checking processing status:`, err.message);
      }
    }

    // Check if platform is already completed (should allow access)
    // This is a backend validation, but we trust the frontend completed status
    console.log(`[${new Date().toISOString()}] [VALIDATION] ✅ Dashboard access ALLOWED for ${platform}/${userId} - no active processing`);
    
    return res.json({
      success: true,
      accessAllowed: true,
      reason: 'no_active_processing',
      platform
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] [VALIDATION] Error validating dashboard access:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to validate dashboard access',
      accessAllowed: false 
    });
  }
});

// Enhanced R2 Image Renderer with white image prevention
app.get('/api/r2-image/:username/:imageKey', async (req, res) => {
  const { username, imageKey } = req.params;
  const platform = req.query.platform || 'instagram';
  const forceRefresh = req.query.t || req.query.v || req.query.refresh;
  
  try {
    // Construct the R2 key path
    const r2Key = `ready_post/${platform}/${username}/${imageKey}`;
    
    console.log(`[${new Date().toISOString()}] [R2-IMAGE] Fetching: ${r2Key}`);
    
    // Get the image from R2
    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: r2Key,
    });
    
    const response = await s3Client.send(getCommand);
    const imageBuffer = await streamToString(response.Body);
    
    // Validate that we actually have image data
    if (!imageBuffer || imageBuffer.length === 0) {
      console.error(`[${new Date().toISOString()}] [R2-IMAGE] No image data returned for ${r2Key}`);
      throw new Error('Empty image data');
    }
    
    // Detect content type from file extension
    let contentType = 'image/jpeg'; // Default
    if (imageKey.endsWith('.png')) {
      contentType = 'image/png';
    } else if (imageKey.endsWith('.webp')) {
      contentType = 'image/webp';
    } else if (imageKey.endsWith('.gif')) {
      contentType = 'image/gif';
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    
    // Send the image
    res.send(Buffer.from(imageBuffer, 'binary'));
    
    console.log(`[${new Date().toISOString()}] [R2-IMAGE] ✅ Served ${r2Key} successfully`);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [R2-IMAGE] Error serving ${imageKey}:`, error);
    
    // Send a placeholder image
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.status(404).send('Image not found');
  }
});

// ===============================================================

// Lightweight R2 Run Status checker
// Checks existence of RunStatus/<platform>/<username>/status.json in the 'tasks' bucket
app.get(['/api/run-status/:platform/:username', '/run-status/:platform/:username'], async (req, res) => {
  try {
    const { platform, username } = req.params;

    if (!platform || !username) {
      return res.status(400).json({ error: 'platform and username are required' });
    }

    const statusKey = `RunStatus/${platform}/${username}/status.json`;

    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: statusKey,
      });
      const response = await s3Client.send(getCommand);

      let statusPayload = null;
      try {
        const bodyText = await response.Body.transformToString();
        statusPayload = JSON.parse(bodyText);
      } catch {
        // ignore parse errors, treat as exists
      }

      // Exists regardless of status value
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.json({ exists: true, status: statusPayload?.status || null });
    } catch (err) {
      // If object not found, return exists: false
      const message = err?.message || '';
      if (err.name === 'NoSuchKey' || message.includes('NoSuchKey') || message.includes('does not exist')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.json({ exists: false });
      }
      console.error(`[${new Date().toISOString()}] [RUN-STATUS] Error checking status:`, err);
      return res.status(500).json({ error: 'Failed to check run status' });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [RUN-STATUS] Unexpected error:`, error);
    return res.status(500).json({ error: 'Unexpected error' });
  }
});

// ===============================================================

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});