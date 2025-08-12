import express from 'express';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import axios from 'axios';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
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

// Broadcast update to all connected clients for a user
function broadcastUpdate(username, data) {
  const clients = sseClients.get(username) || [];
  const activeCount = clients.length;
  
  if (activeCount > 0) {
    console.log(`[${new Date().toISOString()}] Broadcasting update to ${activeCount} clients for ${username}: ${data.type}`);
    
    clients.forEach(client => {
      try {
        client.write(`data: ${JSON.stringify(data)}\n\n`);
        // Update activity timestamp
        activeConnections.set(client, Date.now());
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error broadcasting to client:`, err.message);
        // Will be cleaned up by the heartbeat cycle
      }
    });
    return true;
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

// Add this helper after your imports, before routes
function setCorsHeaders(res, origin = '*') {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
}

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

// Helper function to validate image buffer integrity
function validateImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return false;
  }
  
  // Check for valid image signatures
  const firstBytes = buffer.slice(0, 12);
  
  // JPEG: FF D8 FF
  if (firstBytes[0] === 0xFF && firstBytes[1] === 0xD8 && firstBytes[2] === 0xFF) {
    return true;
  }
  
  // PNG: 89 50 4E 47
  if (firstBytes[0] === 0x89 && firstBytes[1] === 0x50 && firstBytes[2] === 0x4E && firstBytes[3] === 0x47) {
    return true;
  }
  
  // GIF: 47 49 46
  if (firstBytes[0] === 0x47 && firstBytes[1] === 0x49 && firstBytes[2] === 0x46) {
    return true;
  }
  
  // WebP: RIFF...WEBP
  if (firstBytes[0] === 0x52 && firstBytes[1] === 0x49 && firstBytes[2] === 0x46 && firstBytes[3] === 0x46) {
    if (firstBytes.length > 12 && firstBytes[8] === 0x57 && firstBytes[9] === 0x45 && firstBytes[10] === 0x42 && firstBytes[11] === 0x50) {
      return true;
    }
  }
  
  // BMP: 42 4D
  if (firstBytes[0] === 0x42 && firstBytes[1] === 0x4D) {
    return true;
  }
  
  return false;
}

// Generate 6-word verification code
function generateVerificationCode() {
  const words = [
    'apple', 'banana', 'cherry', 'dragon', 'eagle', 'forest', 'garden', 'happy',
    'island', 'jungle', 'kitten', 'lemon', 'magic', 'nature', 'ocean', 'peace',
    'quiet', 'river', 'sunset', 'tiger', 'unique', 'valley', 'wonder', 'yellow',
    'zebra', 'bright', 'cloud', 'dream', 'flame', 'grace', 'heart', 'light',
    'moon', 'night', 'power', 'quick', 'smile', 'trust', 'voice', 'water'
  ];
  
  const selectedWords = [];
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * words.length);
    selectedWords.push(words[randomIndex]);
  }
  
  return selectedWords.join(' ');
}

// Cache configuration constants
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

// Enhanced SSE client management for better connection stability
const sseClients = new Map();
let currentUsername = null;
const SSE_RECONNECT_TIMEOUT = 60000; // 60 seconds maximum client inactivity

// Function to set currentUsername
function setCurrentUsername(username) {
  currentUsername = username;
}

// Function to get currentUsername
function getCurrentUsername() {
  return currentUsername;
}

// Track active connections per client
const activeConnections = new Map();

// S3 Client configuration
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

// Add v2-style helper methods to native S3Client prototype so that
// s3Client.getObject / putObject etc. work even though we are
// using the AWS SDK v3 underneath. This keeps call-sites unchanged.
if (!S3Client.prototype.getObject) {
  const streamToBuffer = async (stream) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });

  S3Client.prototype.getObject = function (params) {
    return {
      promise: async () => {
        try {
          const response = await this.send(new GetObjectCommand(params));
          let bodyBuffer;
          if (typeof response.Body === 'string' || response.Body instanceof Uint8Array) {
            bodyBuffer = Buffer.from(response.Body);
          } else if (response.Body) {
            bodyBuffer = await streamToBuffer(response.Body);
          } else {
            bodyBuffer = Buffer.alloc(0);
          }
          return { ...response, Body: bodyBuffer };
        } catch (err) {
          // Normalise AWS SDK v3 error object to look like v2 (code property)
          if (err && err.Code && !err.code) err.code = err.Code;
          throw err;
        }
      },
    };
  };

  S3Client.prototype.putObject = function (params) {
    return {
      promise: async () => this.send(new PutObjectCommand(params)),
    };
  };

  const listObjectsImpl = function (params) {
    return {
      promise: async () => this.send(new ListObjectsV2Command(params)),
    };
  };
  S3Client.prototype.listObjectsV2 = listObjectsImpl;
  S3Client.prototype.listObjects = listObjectsImpl;

  S3Client.prototype.deleteObject = function (params) {
    return {
      promise: async () => this.send(new DeleteObjectCommand(params)),
    };
  };
}

// R2 public URL for direct image access
const R2_PUBLIC_URL = 'https://pub-ba72672df3c041a3844f278dd3c32b22.r2.dev';

// Platform schema management class
class PlatformSchemaManager {
  static buildPath(module, platform = 'instagram', username, additional = '') {
    if (!module || !username) {
      throw new Error('Module and username are required for R2 path generation');
    }
    
    const normalizedPlatform = platform.toLowerCase();
    if (!['instagram', 'twitter', 'facebook'].includes(normalizedPlatform)) {
      throw new Error(`Unsupported platform: ${platform}. Must be 'instagram', 'twitter', or 'facebook'`);
    }
    
    const normalizedUsername = PlatformSchemaManager.getPlatformConfig(normalizedPlatform).normalizeUsername(username);
    let path = `${module}/${normalizedPlatform}/${normalizedUsername}`;
    
    if (additional) {
      path += `/${additional}`;
    }
    
    return path;
  }

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
        normalizeUsername: (username) => username.trim(),
        eventPrefix: 'TwitterEvents', 
        tokenPrefix: 'TwitterTokens',
        maxUsernameLength: 15
      },
      facebook: {
        name: 'Facebook',
        normalizeUsername: (username) => username.trim(),
        eventPrefix: 'FacebookEvents', 
        tokenPrefix: 'FacebookTokens',
        maxUsernameLength: 50
      }
    };
    
    return configs[platform.toLowerCase()] || configs.instagram;
  }
}

// Export all utility functions and constants
export {
  convertWebPToJPEG,
  generatePlaceholderImage,
  shouldUseCache,
  scheduleSSEHeartbeats,
  broadcastUpdate,
  scheduleCacheCleanup,
  setCorsHeaders,
  streamToString,
  streamToBuffer,
  validateImageBuffer,
  generateVerificationCode,
  cache,
  cacheTimestamps,
  cacheHits,
  cacheMisses,
  sseClients,
  currentUsername,
  setCurrentUsername,
  getCurrentUsername,
  activeConnections,
  s3Client,
  R2_PUBLIC_URL,
  CACHE_CONFIG,
  MODULE_CACHE_CONFIG,
  SSE_RECONNECT_TIMEOUT,
  PlatformSchemaManager
};
  