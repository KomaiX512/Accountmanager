import express from 'express';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import cors from 'cors';
import axios from 'axios';
import fetch from 'node-fetch';
import fs from 'fs';
import { promisify } from 'util';
import { pipeline } from 'stream';
import path from 'path';
import jpeg from 'jpeg-js';
import multer from 'multer';
import sharp from 'sharp';
import * as net from 'net';
import { exec } from 'child_process';

// Import utilities from shared module
import {
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
  activeConnections,
  s3Client,
  R2_PUBLIC_URL,
  CACHE_CONFIG,
  MODULE_CACHE_CONFIG,
  SSE_RECONNECT_TIMEOUT
} from './shared/utils.js';

// Import data management module
import dataManagementRouter from './modules/dataManagement.js';

// Import social media module
import socialMediaRouter from './modules/socialMedia.js';

// Import user management module
import userManagementRouter from './modules/userManagement.js';

// Import scheduler module
import schedulerRouter, { startFacebookScheduler, startTwitterScheduler, startInstagramScheduler } from './modules/scheduler.js';

// Import missing endpoints module
import missingEndpointsRouter from './modules/missingEndpoints.js';

const app = express();
const port = 3000;

console.log('Setting up new modular server with imported utilities...');

// Enterprise-grade process management
let server;
let isShuttingDown = false;

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  console.log(`\n${new Date().toISOString()} - Received ${signal}. Starting graceful shutdown...`);
  
  if (isShuttingDown) {
    console.log('Shutdown already in progress...');
    return;
  }
  
  isShuttingDown = true;
  
  if (server) {
    server.close((err) => {
      if (err) {
        console.error('Error during server shutdown:', err);
        process.exit(1);
      }
      
      console.log(`${new Date().toISOString()} - Server closed gracefully`);
      process.exit(0);
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

// Handle various shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // nodemon restart signal

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error(`${new Date().toISOString()} - Uncaught Exception:`, err);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`${new Date().toISOString()} - Unhandled Rejection at:`, promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Check if port is already in use before starting
const checkPortInUse = (port) => {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    
    server.listen(port, (err) => {
      if (err) {
        reject(err);
      } else {
        server.once('close', () => resolve(false));
        server.close();
      }
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        reject(err);
      }
    });
  });
};

// Configure AWS SDK v3 (Enterprise-grade with connection pooling)
const S3_CONFIG = {
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
  maxAttempts: 5,
  requestHandler: {
    connectionTimeout: 10000,
    requestTimeout: 15000,
  },
  retryMode: 'adaptive'
};

// Create enterprise-grade S3 client pool for load balancing
const S3_POOL_SIZE = 5;
const s3ClientPool = Array(S3_POOL_SIZE).fill(null).map(() => new S3Client(S3_CONFIG));

// Admin S3 client pool for 'admin' bucket operations
const adminS3ClientPool = Array(S3_POOL_SIZE).fill(null).map(() => new S3Client(S3_CONFIG));

// Get S3 client from pool with round-robin selection
let currentS3ClientIndex = 0;
function getS3Client() {
  const client = s3ClientPool[currentS3ClientIndex];
  currentS3ClientIndex = (currentS3ClientIndex + 1) % S3_POOL_SIZE;
  return client;
}

// Get Admin S3 client from pool
let currentAdminS3ClientIndex = 0;
function getAdminS3Client() {
  const client = adminS3ClientPool[currentAdminS3ClientIndex];
  currentAdminS3ClientIndex = (currentAdminS3ClientIndex + 1) % S3_POOL_SIZE;
  return client;
}

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

// Use data management router
app.use(dataManagementRouter);

// Use social media router
app.use(socialMediaRouter);

// Use user management router
app.use(userManagementRouter);

// Use scheduler router
app.use(schedulerRouter);

// Use missing endpoints router
app.use(missingEndpointsRouter);

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
      memoryUsage: process.memoryUsage(),
      port: port,
      pid: process.pid
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

// Initialize schedulers from utilities
console.log(`[${new Date().toISOString()}] Initializing schedulers from shared utilities...`);
scheduleSSEHeartbeats();
scheduleCacheCleanup();

// Initialize scheduler workers
console.log(`[${new Date().toISOString()}] Initializing scheduler workers...`);
startFacebookScheduler();
startTwitterScheduler();
startInstagramScheduler();

// Use all the imported routers
console.log(`[${new Date().toISOString()}] Setting up modular routers...`);

// Use data management router
app.use(dataManagementRouter);

// Use social media router
app.use(socialMediaRouter);

// Use user management router
app.use(userManagementRouter);

// Use scheduler router
app.use(schedulerRouter);

// Use missing endpoints router
app.use(missingEndpointsRouter);

// Enterprise-grade server startup with port conflict resolution
const startServer = async () => {
  try {
    // Check if port is in use
    const portInUse = await checkPortInUse(port);
    
    if (portInUse) {
      console.warn(`⚠️  Port ${port} is already in use. Attempting graceful recovery...`);
      
      // Try to kill any existing process on this port
      try {
        await new Promise((resolve, reject) => {
          exec(`lsof -ti:${port} | xargs kill -9`, (error, stdout, stderr) => {
            if (error) {
              console.log('No processes found on port or already cleaned up');
            }
            resolve();
          });
        });
        
        // Wait a moment for the port to be freed
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check again
        const stillInUse = await checkPortInUse(port);
        if (stillInUse) {
          throw new Error(`Port ${port} is still in use after cleanup attempt`);
        }
        
        console.log(`✅ Port ${port} cleaned up successfully`);
      } catch (cleanupError) {
        console.error(`Failed to clean up port ${port}:`, cleanupError.message);
        process.exit(1);
      }
    }
    
    // Start the server
    server = app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 New Modular Server running at http://localhost:${port}`);
      console.log('✅ Ready to receive requests with imported utilities');
      console.log(`📊 Process ID: ${process.pid}`);
      console.log(`🕒 Started at: ${new Date().toISOString()}`);
      
      // Set server timeout for better connection handling
      server.timeout = 300000; // 5 minutes
      server.keepAliveTimeout = 65000; // 65 seconds
      server.headersTimeout = 66000; // 66 seconds
    });
    
    // Enhanced error handling for the server
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use`);
        console.error('Please close other instances or use a different port');
        process.exit(1);
      } else {
        console.error('❌ Server error:', err);
        gracefulShutdown('SERVER_ERROR');
      }
    });
    
    server.on('close', () => {
      console.log('🔒 Server closed');
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server with enterprise-grade reliability
startServer();

console.log(`[${new Date().toISOString()}] New modular server initialized with imported utilities`);
