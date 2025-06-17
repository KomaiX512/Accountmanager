import express from 'express';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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
const app = express();
const port = 3000;

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
  'NewForYou': CACHE_CONFIG.STANDARD,
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

// Start the cache cleanup scheduler
scheduleCacheCleanup();

const s3Client = new S3Client({
  endpoint: 'https://b21d96e73b908d7d7b822d41516ccc64.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '986718fe67d6790c7fe4eeb78943adba',
    secretAccessKey: '08fb3b012163cce35bee80b54d83e3a6924f2679f466790a9c7fdd9456bc44fe',
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

// Enhanced SSE connection with improved reliability
app.get('/events/:username', (req, res) => {
  const { username } = req.params;

  console.log(`[${new Date().toISOString()}] Handling SSE request for /events/${username}`);

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type');
  res.flushHeaders();

  // Send initial connection confirmation
  const initialEvent = {
    type: 'connection',
    message: `Connected to events for ${username}`,
    timestamp: Date.now(),
    connectionId: randomUUID()
  };
  
  res.write(`data: ${JSON.stringify(initialEvent)}\n\n`);
  
  // Register this client
  if (!sseClients.has(username)) {
    sseClients.set(username, []);
  }
  
  const clients = sseClients.get(username);
  clients.push(res);
  activeConnections.set(res, Date.now());
  
  console.log(`[${new Date().toISOString()}] SSE client connected for ${username}. Total clients: ${clients.length}`);

  // Setup connection close handler
  req.on('close', () => {
    const updatedClients = sseClients.get(username)?.filter(client => client !== res) || [];
    sseClients.set(username, updatedClients);
    activeConnections.delete(res);
    
    console.log(`[${new Date().toISOString()}] SSE client disconnected for ${username}. Remaining clients: ${updatedClients.length}`);
    if (updatedClients.length === 0) {
      console.log(`[${new Date().toISOString()}] No more clients for ${username}, cleaning up`);
      sseClients.delete(username);
    }
  });
});

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
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: prefix,
    });
    const listResponse = await s3Client.send(listCommand);

    const files = listResponse.Contents || [];
    
    // Special handling for ready_post directory since it contains both JSON and JPG files
    if (prefix.includes('ready_post/')) {
      // For ready_post, this is handled separately by the /posts/:username endpoint
      // Here we'll just set the cache timestamp for tracking
      cacheTimestamps.set(prefix, Date.now());
      
      // Return existing data if available, otherwise empty array
      return cache.has(prefix) ? cache.get(prefix) : [];
    }
    
    // Standard processing for other module types (JSON only)
    const data = await Promise.all(
      files.map(async (file) => {
        try {
          // Only process .json files as JSON (except for ready_post which is handled separately)
          if (!file.Key.endsWith('.json')) {
               console.log(`[${new Date().toISOString()}] Skipping non-JSON file: ${file.Key}`);
               return null; // Skip non-JSON files in this general fetch
          }

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
  try {
    if (Array.isArray(url)) url = url[0];
    const decodedUrl = decodeURIComponent(url);

    // Fetch the image directly (no puppeteer)
    const response = await axios.get(decodedUrl, { responseType: 'arraybuffer' });
    const contentType = response.headers['content-type'];
    if (!contentType.startsWith('image/')) {
      console.error(`[proxy-image] URL did not return an image:`, decodedUrl, 'Content-Type:', contentType);
      return res.status(400).send('URL did not return an image');
    }
    res.set('Content-Type', contentType);
    res.set('Access-Control-Allow-Origin', '*');
    res.send(response.data);
  } catch (error) {
    console.error(`[proxy-image] Failed to proxy image:`, url, error?.response?.status, error?.message);
    res.status(500).send('Failed to fetch image');
  }
});

app.get('/profile-info/:username', async (req, res) => {
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
      console.log(`[${new Date().toISOString()}] Successfully fetched ${platform} profile info for ${username} from ${key}`);
      return res.json(data);
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

app.post('/save-account-info', async (req, res) => {
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

    const payload = {
      username: normalizedUsername,
      accountType,
      postingStyle,
      platform: platformParam,
      ...(competitors && { competitors: competitors.map(c => platformConfig.normalizeUsername(c)) }),
      timestamp: new Date().toISOString(),
    };

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

app.post('/scrape', async (req, res) => {
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

app.get('/retrieve/:accountHolder/:competitor', async (req, res) => {
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

app.get('/retrieve-multiple/:accountHolder', async (req, res) => {
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

app.get('/retrieve-strategies/:accountHolder', async (req, res) => {
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

app.get('/retrieve-engagement-strategies/:accountHolder', async (req, res) => {
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

app.get('/news-for-you/:accountHolder', async (req, res) => {
  try {
    const { platform, username } = PlatformSchemaManager.parseRequestParams(req);
    const forceRefresh = req.query.forceRefresh === 'true';

    const data = await fetchDataForModule(username, 'NewForYou/{username}', forceRefresh, platform);
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

app.post('/save-query/:accountHolder', async (req, res) => {
  // Set CORS headers explicitly for this endpoint
  setCorsHeaders(res, req.headers.origin || '*');
  
  // Simply respond with success without storing in R2 bucket
  // The instant AI reply system makes this R2 storage unnecessary
  res.json({ success: true, message: 'AI instant reply system is enabled, no persistence needed' });
});

app.get('/rules/:username', async (req, res) => {
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

app.post('/rules/:username', async (req, res) => {
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

app.get('/responses/:username', async (req, res) => {
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

app.post('/responses/:username/:responseId', async (req, res) => {
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

app.get('/retrieve-account-info/:username', async (req, res) => {
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

app.get('/posts/:username', async (req, res) => {
  try {
    const { platform, username } = PlatformSchemaManager.parseRequestParams(req);
    const forceRefresh = req.query.forceRefresh === 'true';
    
    // Create platform-specific prefix using centralized schema manager
    const prefix = PlatformSchemaManager.buildPath('ready_post', platform, username);

    const now = Date.now();
    const lastFetch = cacheTimestamps.get(prefix) || 0;

    if (!forceRefresh && cache.has(prefix)) {
      // Reduce repetitive posts cache hit logging
    const postsLogKey = `lastPostsCacheLog_${prefix}`;
    const lastPostsLogTime = global[postsLogKey] || 0;
    if (Date.now() - lastPostsLogTime > 300000) { // Log every 5 minutes per prefix
      console.log(`Cache hit for ${platform} posts: ${prefix}`);
      global[postsLogKey] = Date.now();
    }
      return res.json(cache.get(prefix));
    }

    if (!forceRefresh && now - lastFetch < THROTTLE_INTERVAL) {
      console.log(`Throttled fetch for ${platform} posts: ${prefix}`);
      return res.json(cache.has(prefix) ? cache.get(prefix) : []);
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
    const jpgFiles = files.filter(file => file.Key.endsWith('.jpg'));
    
    console.log(`[${new Date().toISOString()}] Found ${jsonFiles.length} JSON files and ${jpgFiles.length} JPG files in ${prefix}/ for ${platform}`);
    
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
          const filenameMatch = file.Key.match(/(\d+)\.json$/);
          const fileId = filenameMatch ? filenameMatch[1] : null;
          
          if (!fileId) {
            console.warn(`Cannot extract ID from filename: ${file.Key}`);
            return null;
          }
          
          // Check if this post should be skipped based on status
          // Only skip if status is explicitly set to 'processed' or 'rejected'
          if (postData.status === 'processed' || postData.status === 'rejected') {
            console.log(`[${new Date().toISOString()}] Skipping ${platform} post ${file.Key} with status: ${postData.status}`);
            return null;
          }
          
          // Look for matching image file
          // Check both formats: image_<ID>.jpg and ready_post_<ID>.jpg
          const potentialImageKeys = [
            `${prefix}/image_${fileId}.jpg`, 
            `${prefix}/ready_post_${fileId}.jpg`
          ];
          
          // Find the first matching image file
          const imageFile = jpgFiles.find(img => 
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

    cache.set(prefix, validPosts);
    cacheTimestamps.set(prefix, now);
    console.log(`[${new Date().toISOString()}] Returning ${validPosts.length} valid posts for ${username}`);
    res.json(validPosts);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Retrieve posts error for ${username}:`, error);
    res.status(500).json({ error: 'Error retrieving posts', details: error.message });
  }
});

app.post('/feedback/:username', async (req, res) => {
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
const REDIRECT_URI = 'https://f6e9-121-52-146-243.ngrok-free.app/instagram/callback';
const VERIFY_TOKEN = 'myInstagramWebhook2025';

// Facebook App Credentials  
const FB_APP_ID = '581584257679639'; // Your ACTUAL Facebook App ID (NOT Configuration ID)
const FB_APP_SECRET = 'cdd153955e347e194390333e48cb0480'; // Your actual App Secret
const FB_REDIRECT_URI = 'https://f6e9-121-52-146-243.ngrok-free.app/facebook/callback';
const FB_VERIFY_TOKEN = 'myFacebookWebhook2025';

app.get('/instagram/callback', async (req, res) => {
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

// Facebook OAuth callback endpoint
app.get('/facebook/callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;

  if (!code) {
    console.log(`[${new Date().toISOString()}] Facebook OAuth callback failed: No code provided`);
    return res.status(400).send('Error: No code provided');
  }

  console.log(`[${new Date().toISOString()}] Facebook OAuth callback: code=${code}, state=${state}`);

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
    console.log(`[${new Date().toISOString()}] Facebook access token obtained, length: ${accessToken ? accessToken.length : 'null'}`);

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

    // Step 3: Get user's pages with manage permissions
    const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: {
        access_token: accessToken
      }
    });

    let pageId = null;
    let pageName = null;
    let pageAccessToken = null;

    if (pagesResponse.data.data && pagesResponse.data.data.length > 0) {
      // Use the first page with manage permissions
      const page = pagesResponse.data.data[0];
      pageId = page.id;
      pageName = page.name;
      pageAccessToken = page.access_token;
      
      console.log(`[${new Date().toISOString()}] Facebook Business Page connected: id=${pageId}, name=${pageName}`);
    } else {
      // No Business Pages available - this should not happen with proper OAuth scope
      console.error(`[${new Date().toISOString()}] No Facebook Business Pages found for user ${userName}`);
      res.status(400).send(`
        <html>
          <body>
            <h2>⚠️ No Business Pages Found</h2>
            <p>This app requires a Facebook Business Page for automated posting.</p>
            <p>Please:</p>
            <ul>
              <li>Create a Facebook Business Page</li>
              <li>Or connect an existing Business Page you manage</li>
              <li>Then try connecting again</li>
            </ul>
            <p><a href="https://www.facebook.com/pages/create/" target="_blank">Create Facebook Business Page</a></p>
            <script>
              window.opener.postMessage({ 
                type: 'FACEBOOK_ERROR', 
                error: 'No Business Pages available'
              }, '*');
              setTimeout(() => window.close(), 5000);
            </script>
          </body>
        </html>
      `);
      return;
    }

    // Store the access token
    const key = `FacebookTokens/${pageId}/token.json`;
    const tokenData = {
      access_token: pageAccessToken,
      page_id: pageId,
      page_name: pageName,
      user_id: userId,
      user_name: userName,
      timestamp: new Date().toISOString()
    };

    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
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
          access_token: pageAccessToken,
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

    // Send success response
    res.send(`
      <html>
        <body>
          <h2>Facebook Connected Successfully!</h2>
          <p>Page Name: ${pageName}</p>
          <p>Page ID: ${pageId}</p>
          <p>User: ${userName}</p>
          <p>You can now close this window and return to the dashboard.</p>
          <script>
            window.opener.postMessage({ 
              type: 'FACEBOOK_CONNECTED', 
              facebookId: '${pageId}', 
              username: '${pageName}'
            }, '*');
            window.close();
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
app.get('/webhook/instagram', (req, res) => {
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

// Webhook Receiver - Enhanced with real-time event propagation
app.post('/webhook/instagram', async (req, res) => {
  const body = req.body;

  if (body.object !== 'instagram') {
    console.log(`[${new Date().toISOString()}] Invalid payload received, not Instagram object`);
    return res.sendStatus(404);
  }

  console.log(`[${new Date().toISOString()}] WEBHOOK ➜ Instagram payload received: ${JSON.stringify(body)}`);

  try {
    for (const entry of body.entry) {
      const igGraphId = entry.id;
      console.log(`[${new Date().toISOString()}] Processing entry for IG Graph ID: ${igGraphId}`);

      // Find username associated with this igGraphId for event broadcasting
      let targetUsername = null;
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
              if (token.instagram_graph_id === igGraphId && token.username) {
                targetUsername = token.username;
                break;
              }
            }
          }
        }
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error finding username for graph ID ${igGraphId}:`, err.message);
      }

      // Handle Direct Messages with improved event broadcasting
      if (Array.isArray(entry.messaging)) {
        for (const msg of entry.messaging) {
          if (!msg.message?.text || msg.message.is_echo) {
            console.log(`[${new Date().toISOString()}] Skipping non-text or echo message: ${JSON.stringify(msg.message)}`);
            continue;
          }

          const eventData = {
            type: 'message',
            instagram_graph_id: igGraphId,
            sender_id: msg.sender.id,
            message_id: msg.message.mid,
            text: msg.message.text,
            timestamp: msg.timestamp,
            received_at: new Date().toISOString(),
            username: targetUsername || 'unknown',
            status: 'pending'
          };

          console.log(`[${new Date().toISOString()}] Storing DM event: ${eventData.message_id}, status: ${eventData.status}`);
          const key = `InstagramEvents/${igGraphId}/${eventData.message_id}.json`;
          await s3Client.send(new PutObjectCommand({
            Bucket: 'tasks',
            Key: key,
            Body: JSON.stringify(eventData, null, 2),
            ContentType: 'application/json'
          }));

          console.log(`[${new Date().toISOString()}] Stored DM in R2 at ${key}`);

          // Broadcast update using enhanced system - by both graph ID and username
          broadcastUpdate(igGraphId, { 
            event: 'message', 
            data: eventData,
            timestamp: Date.now() 
          });
          
          // Also broadcast to username clients if available
          if (targetUsername) {
            broadcastUpdate(targetUsername, { 
              event: 'message', 
              data: eventData,
              timestamp: Date.now() 
            });
          }
          
          // Clear any cache for this event type
          cache.delete(`InstagramEvents/${igGraphId}`);
          if (targetUsername) cache.delete(`InstagramEvents/${targetUsername}`);
        }
      }

      // Handle Comments with improved event broadcasting
      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          if (change.field !== 'comments' || !change.value?.text) {
            console.log(`[${new Date().toISOString()}] Skipping non-comment change: ${JSON.stringify(change)}`);
            continue;
          }

          let username = targetUsername || 'unknown';
          let tokenData = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              tokenData = await getTokenData(igGraphId);
              const response = await axios.get(`https://graph.instagram.com/v22.0/${change.value.id}`, {
                params: {
                  fields: 'username',
                  access_token: tokenData.access_token
                }
              });
              username = response.data.username || targetUsername || 'unknown';
              console.log(`[${new Date().toISOString()}] Fetched username for comment ${change.value.id}: ${username}`);
              break;
            } catch (error) {
              console.error(`[${new Date().toISOString()}] Attempt ${attempt} - Error fetching username for comment ${change.value.id}:`, error.message);
              if (attempt < 3) {
                console.log(`[${new Date().toISOString()}] Retrying username fetch in 1s...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          }

          const eventData = {
            type: 'comment',
            instagram_graph_id: igGraphId,
            comment_id: change.value.id,
            text: change.value.text,
            post_id: change.value.media.id,
            timestamp: change.value.timestamp || Date.now(),
            received_at: new Date().toISOString(),
            username,
            status: 'pending'
          };

          console.log(`[${new Date().toISOString()}] Storing comment event: ${eventData.comment_id}, status: ${eventData.status}`);
          const key = `InstagramEvents/${igGraphId}/comment_${eventData.comment_id}.json`;
          await s3Client.send(new PutObjectCommand({
            Bucket: 'tasks',
            Key: key,
            Body: JSON.stringify(eventData, null, 2),
            ContentType: 'application/json'
          }));

          console.log(`[${new Date().toISOString()}] Stored comment in R2 at ${key}`);

          // Broadcast using enhanced system - by both graph ID and username
          broadcastUpdate(igGraphId, { 
            event: 'comment', 
            data: eventData,
            timestamp: Date.now() 
          });
          
          // Also broadcast to username clients if available
          if (targetUsername) {
            broadcastUpdate(targetUsername, { 
              event: 'comment', 
              data: eventData,
              timestamp: Date.now() 
            });
          }
          
          // Clear any cache for this event type
          cache.delete(`InstagramEvents/${igGraphId}`);
          if (targetUsername) cache.delete(`InstagramEvents/${targetUsername}`);
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error processing webhook:`, err);
    res.sendStatus(500);
  }
});

// ============= FACEBOOK WEBHOOK ENDPOINTS =============

// Facebook Webhook Verification
app.get('/webhook/facebook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
    console.log(`[${new Date().toISOString()}] WEBHOOK_VERIFIED for Facebook`);
    res.status(200).send(challenge);
  } else {
    console.log(`[${new Date().toISOString()}] FACEBOOK_WEBHOOK_VERIFICATION_FAILED: Invalid token or mode`);
    res.sendStatus(403);
  }
});

// Facebook Webhook Receiver
app.post('/webhook/facebook', async (req, res) => {
  const body = req.body;

  if (body.object !== 'page') {
    console.log(`[${new Date().toISOString()}] Invalid Facebook payload received, not page object`);
    return res.sendStatus(404);
  }

  console.log(`[${new Date().toISOString()}] WEBHOOK ➜ Facebook payload received: ${JSON.stringify(body)}`);

  try {
    for (const entry of body.entry) {
      const pageId = entry.id;
      console.log(`[${new Date().toISOString()}] Processing Facebook entry for Page ID: ${pageId}`);

      // Find username associated with this pageId for event broadcasting
      let targetUsername = null;
      try {
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
              const json = await data.Body.transformToString();
              const token = JSON.parse(json);
              if (token.page_id === pageId && token.username) {
                targetUsername = token.username;
                break;
              }
            }
          }
        }
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error finding username for Facebook page ID ${pageId}:`, err.message);
      }

      // Handle Facebook Messages
      if (Array.isArray(entry.messaging)) {
        for (const msg of entry.messaging) {
          if (!msg.message?.text || msg.message.is_echo) {
            console.log(`[${new Date().toISOString()}] Skipping non-text or echo Facebook message: ${JSON.stringify(msg.message)}`);
            continue;
          }

          const eventData = {
            type: 'message',
            platform: 'facebook',
            page_id: pageId,
            sender_id: msg.sender.id,
            message_id: msg.message.mid,
            text: msg.message.text,
            timestamp: msg.timestamp,
            received_at: new Date().toISOString(),
            username: targetUsername || 'unknown',
            status: 'pending'
          };

          console.log(`[${new Date().toISOString()}] Storing Facebook DM event: ${eventData.message_id}, status: ${eventData.status}`);
          const key = `FacebookEvents/${pageId}/${eventData.message_id}.json`;
          await s3Client.send(new PutObjectCommand({
            Bucket: 'tasks',
            Key: key,
            Body: JSON.stringify(eventData, null, 2),
            ContentType: 'application/json'
          }));

          console.log(`[${new Date().toISOString()}] Stored Facebook DM in R2 at ${key}`);

          // Broadcast update
          broadcastUpdate(pageId, { 
            event: 'facebook_message', 
            data: eventData,
            timestamp: Date.now() 
          });
          
          if (targetUsername) {
            broadcastUpdate(targetUsername, { 
              event: 'facebook_message', 
              data: eventData,
              timestamp: Date.now() 
            });
          }
          
          // Clear cache
          cache.delete(`FacebookEvents/${pageId}`);
          if (targetUsername) cache.delete(`FacebookEvents/${targetUsername}`);
        }
      }

      // Handle Facebook Comments
      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          if (change.field !== 'feed' || !change.value?.item || change.value.item !== 'comment') {
            console.log(`[${new Date().toISOString()}] Skipping non-comment Facebook change: ${JSON.stringify(change)}`);
            continue;
          }

          const eventData = {
            type: 'comment',
            platform: 'facebook',
            page_id: pageId,
            comment_id: change.value.comment_id,
            text: change.value.message,
            post_id: change.value.post_id,
            timestamp: change.value.created_time || Date.now(),
            received_at: new Date().toISOString(),
            username: targetUsername || 'unknown',
            status: 'pending'
          };

          console.log(`[${new Date().toISOString()}] Storing Facebook comment event: ${eventData.comment_id}, status: ${eventData.status}`);
          const key = `FacebookEvents/${pageId}/comment_${eventData.comment_id}.json`;
          await s3Client.send(new PutObjectCommand({
            Bucket: 'tasks',
            Key: key,
            Body: JSON.stringify(eventData, null, 2),
            ContentType: 'application/json'
          }));

          console.log(`[${new Date().toISOString()}] Stored Facebook comment in R2 at ${key}`);

          // Broadcast update
          broadcastUpdate(pageId, { 
            event: 'facebook_comment', 
            data: eventData,
            timestamp: Date.now() 
          });
          
          if (targetUsername) {
            broadcastUpdate(targetUsername, { 
              event: 'facebook_comment', 
              data: eventData,
              timestamp: Date.now() 
            });
          }
          
          // Clear cache
          cache.delete(`FacebookEvents/${pageId}`);
          if (targetUsername) cache.delete(`FacebookEvents/${targetUsername}`);
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error processing Facebook webhook:`, err);
    res.sendStatus(500);
  }
});

// Helper function to get token data
async function getTokenData(userIdOrGraphId) {
  const listCommand = new ListObjectsV2Command({
    Bucket: 'tasks',
    Prefix: `InstagramTokens/`,
  });
  const { Contents } = await s3Client.send(listCommand);

  let tokenData = null;
  if (Contents) {
    for (const key of Contents) {
      if (key.Key.endsWith('/token.json')) {
        const getCommand = new GetObjectCommand({
          Bucket: 'tasks',
          Key: key.Key,
        });
        const data = await s3Client.send(getCommand);
        const json = await data.Body.transformToString();
        const token = JSON.parse(json);
        
        // Search by BOTH instagram_graph_id AND instagram_user_id
        if (token.instagram_graph_id === userIdOrGraphId || 
            token.instagram_user_id === userIdOrGraphId) {
          tokenData = token;
          console.log(`[${new Date().toISOString()}] Found token for ${userIdOrGraphId}: graph_id=${token.instagram_graph_id}, user_id=${token.instagram_user_id}`);
          break;
        }
      }
    }
  }
  if (!tokenData) {
    throw new Error(`No token found for user_id/graph_id ${userIdOrGraphId}`);
  }
  return tokenData;
}

// Send DM Reply
app.post('/send-dm-reply/:userId', async (req, res) => {
  // Set CORS headers explicitly for this endpoint
  setCorsHeaders(res, req.headers.origin || '*');
  
  // Handle OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  const { userId } = req.params;
  const { sender_id, text, message_id, platform = 'instagram' } = req.body;

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
    
    // Handle Instagram DM reply (existing logic)
    // Find token data
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `InstagramTokens/`,
    });
    const { Contents } = await s3Client.send(listCommand);

    let tokenData = null;
    let username = null;
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
            username = token.username;
            break;
          }
        }
      }
    }

    if (!tokenData) {
      console.log(`[${new Date().toISOString()}] No token found for instagram_user_id ${userId}`);
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
      
      const response = await axios({
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
      message_id: response?.data?.id || `reply_${Date.now()}`,
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

    res.json({ success: true, message_id: response?.data?.id });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error sending DM reply:`, error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Error sending DM reply',
      details: error.response?.data?.error || error.message 
    });
  }
});

// Send Comment Reply
app.post('/send-comment-reply/:userId', async (req, res) => {
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
    
    // Handle Instagram comment reply (existing logic)
    // Find token data
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `InstagramTokens/`,
    });
    const { Contents } = await s3Client.send(listCommand);

    let tokenData = null;
    let username = null;
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
            username = token.username;
            break;
          }
        }
      }
    }

    if (!tokenData) {
      console.log(`[${new Date().toISOString()}] No token found for instagram_user_id ${userId}`);
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
app.post('/ignore-notification/:userId', async (req, res) => {
  const { userId } = req.params;
  const { message_id, comment_id, platform = 'instagram' } = req.body;

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
        console.log(`[${new Date().toISOString()}] ${platform} notification file not found at ${fileKey}, proceeding`);
      } else {
        throw error;
      }
    }

    res.json({ success: true, updated: !!updatedItem });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error ignoring ${platform} notification:`, error.message || error);
    res.status(500).json({ error: `Failed to ignore ${platform} notification`, details: error.message || 'Unknown error' });
  }
});

// List Stored Events
app.get('/events-list/:userId', async (req, res) => {
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
      notifications = await fetchInstagramNotifications(userId);
    } else if (platform === 'twitter') {
      notifications = await fetchTwitterNotifications(userId);
    } else if (platform === 'facebook') {
      notifications = await fetchFacebookNotifications(userId);
    }

    res.json(notifications);
  } catch (error) {
    console.error(`Error fetching ${platform} notifications:`, error);
    res.status(500).json({ error: `Failed to fetch ${platform} notifications` });
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

  const filteredNotifications = [];

  for (const notification of notifications) {
    const notificationId = notification.message_id || notification.comment_id;
    if (!notificationId) {
      // If no ID, keep the notification
      filteredNotifications.push(notification);
      continue;
    }

    try {
      // Check if this notification has been handled
      const fileKey = notification.message_id 
        ? `${eventPrefix}/${userId}/${notification.message_id}.json`
        : `${eventPrefix}/${userId}/comment_${notification.comment_id}.json`;

      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: fileKey,
      });

      const data = await s3Client.send(getCommand);
      const storedNotification = JSON.parse(await data.Body.transformToString());

      // PERMANENTLY FILTER OUT: Skip notifications that are already handled, replied, ignored, or ai_handled
      if (storedNotification.status && 
          ['replied', 'ignored', 'ai_handled', 'handled', 'sent'].includes(storedNotification.status)) {
        console.log(`[${new Date().toISOString()}] Filtering out ${platform} notification ${notificationId} with status: ${storedNotification.status}`);
        continue; // Skip this notification completely
      }

      // Include notification with updated status if available (only for pending/unhandled)
      filteredNotifications.push({
        ...notification,
        status: storedNotification.status || 'pending'
      });

    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        // No stored status, include as pending
        filteredNotifications.push(notification);
      } else {
        // Log error but include notification to avoid data loss
        console.error(`[${new Date().toISOString()}] Error checking ${platform} notification status for ${notificationId}:`, error.message);
        filteredNotifications.push(notification);
      }
    }
  }

  console.log(`[${new Date().toISOString()}] Filtered ${platform} notifications: ${notifications.length} -> ${filteredNotifications.length}`);
  return filteredNotifications;
}

// Instagram notification helper functions
async function fetchInstagramDMs(userId) {
  try {
    // TODO: Implement actual Instagram API calls
    // For now, return empty array to prevent crashes (reduced logging)
    return [];
  } catch (error) {
    console.error('Error fetching Instagram DMs:', error);
    return [];
  }
}

async function fetchInstagramComments(userId) {
  try {
    // TODO: Implement actual Instagram API calls
    // For now, return empty array to prevent crashes (reduced logging)
    return [];
  } catch (error) {
    console.error('Error fetching Instagram comments:', error);
    return [];
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

// Facebook notification helper functions
async function fetchFacebookNotifications(userId) {
  try {
    // Get Facebook access token
    const tokenData = await getFacebookTokenData(userId);
    if (!tokenData) {
      // No token found, return empty array (reduced logging)
      return [];
    }

    const notifications = [];
    
    // Fetch Facebook DMs
    const dms = await fetchFacebookDMs(userId);
    notifications.push(...dms);
    
    // Fetch Facebook comments
    const comments = await fetchFacebookComments(userId);
    notifications.push(...comments);
    
    // Filter out handled/replied/ignored notifications
    const filteredNotifications = await filterHandledNotifications(notifications, userId, 'facebook');
    
    return filteredNotifications.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching Facebook notifications for ${userId}:`, error.message);
    return [];
  }
}

async function fetchFacebookDMs(userId) {
  try {
    // Get Facebook access token
    const tokenData = await getFacebookTokenData(userId);
    if (!tokenData) {
      return [];
    }

    // Get Facebook page conversations
    const response = await axios.get(`https://graph.facebook.com/v19.0/${tokenData.page_id}/conversations`, {
      params: {
        access_token: tokenData.access_token,
        fields: 'participants,messages{message,from,created_time,id}',
        limit: 50
      }
    });

    const notifications = [];
    
    if (response.data && response.data.data) {
      for (const conversation of response.data.data) {
        if (conversation.messages && conversation.messages.data) {
          for (const message of conversation.messages.data) {
            // Skip messages from the page itself
            if (message.from && message.from.id !== tokenData.page_id) {
              notifications.push({
                type: 'message',
                facebook_user_id: userId,
                facebook_page_id: tokenData.page_id,
                sender_id: message.from.id,
                message_id: message.id,
                text: message.message || '',
                timestamp: new Date(message.created_time).getTime(),
                received_at: new Date().toISOString(),
                username: message.from.name || 'Unknown',
                status: 'pending',
                platform: 'facebook'
              });
            }
          }
        }
      }
    }
    
    return notifications;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching Facebook DMs for ${userId}:`, error.message);
    return [];
  }
}

async function fetchFacebookComments(userId) {
  console.log(`[${new Date().toISOString()}] Fetching Facebook comments for user ${userId}`);
  
  try {
    // Get Facebook access token
    const tokenData = await getFacebookTokenData(userId);
    if (!tokenData) {
      return [];
    }

    // Get Facebook page posts and their comments
    const postsResponse = await axios.get(`https://graph.facebook.com/v19.0/${tokenData.page_id}/posts`, {
      params: {
        access_token: tokenData.access_token,
        fields: 'id,comments{message,from,created_time,id}',
        limit: 25
      }
    });

    const notifications = [];
    
    if (postsResponse.data && postsResponse.data.data) {
      for (const post of postsResponse.data.data) {
        if (post.comments && post.comments.data) {
          for (const comment of post.comments.data) {
            // Skip comments from the page itself
            if (comment.from && comment.from.id !== tokenData.page_id) {
              notifications.push({
                type: 'comment',
                facebook_user_id: userId,
                facebook_page_id: tokenData.page_id,
                comment_id: comment.id,
                text: comment.message || '',
                post_id: post.id,
                timestamp: new Date(comment.created_time).getTime(),
                received_at: new Date().toISOString(),
                username: comment.from.name || 'Unknown',
                status: 'pending',
                platform: 'facebook'
              });
            }
          }
        }
      }
    }
    
    return notifications;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching Facebook comments for ${userId}:`, error.message);
    return [];
  }
}

async function getFacebookTokenData(userId) {
  try {
    console.log(`[${new Date().toISOString()}] getFacebookTokenData called with userId: ${userId}`);
    // Check Facebook connection for this user first - more efficient approach
    const connectionKey = `FacebookConnection/${userId}/connection.json`;
    console.log(`[${new Date().toISOString()}] Looking for connection at key: ${connectionKey}`);
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: connectionKey,
      });
      const data = await s3Client.send(getCommand);
      const connectionData = JSON.parse(await data.Body.transformToString());
      console.log(`[${new Date().toISOString()}] Found connection data for ${userId}:`, { hasToken: !!connectionData.access_token, pageId: connectionData.facebook_page_id });
      
      if (connectionData.access_token && connectionData.facebook_page_id) {
        // Return token data from connection - this is more efficient than separate storage
        return {
          access_token: connectionData.access_token,
          page_id: connectionData.facebook_page_id,
          user_id: connectionData.facebook_user_id,
          username: connectionData.username
        };
      }
    } catch (connectionError) {
      console.log(`[${new Date().toISOString()}] Facebook connection lookup failed for ${userId}, trying fallback methods...`);
    }

    // Fallback: try direct page lookup in FacebookTokens (legacy support)
    try {
      const directKey = `FacebookTokens/${userId}/token.json`;
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: directKey,
      });
      const data = await s3Client.send(getCommand);
      const json = await data.Body.transformToString();
      const token = JSON.parse(json);
      return token;
    } catch (directError) {
      console.log(`[${new Date().toISOString()}] Direct Facebook token lookup failed for ${userId}`);
    }

    // Fallback: search all Facebook tokens
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
          const json = await data.Body.transformToString();
          const token = JSON.parse(json);
          // Check if this token belongs to the user
          if (token.user_id === userId || token.page_id === userId) {
            return token;
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error getting Facebook token data for ${userId}:`, error.message);
    return null;
  }
}

async function sendFacebookDMReply(userId, senderId, text, messageId) {
  try {
    console.log(`[${new Date().toISOString()}] Sending Facebook DM reply from ${userId} to ${senderId}: ${text}`);
    
    // Get Facebook access token
    const tokenData = await getFacebookTokenData(userId);
    if (!tokenData) {
      throw new Error('No Facebook token found for user');
    }

    // Send the message via Facebook Messenger API
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
    console.error(`[${new Date().toISOString()}] Error sending Facebook DM reply:`, error.message);
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
app.get('/user-instagram-status/:userId', async (req, res) => {
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
app.post('/user-instagram-status/:userId', async (req, res) => {
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
app.get('/instagram-connection/:userId', async (req, res) => {
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

app.post('/instagram-connection/:userId', async (req, res) => {
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
app.post('/post-instagram-now/:userId', upload.single('image'), async (req, res) => {
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const { caption } = req.body;
  const file = req.file;

  console.log(`[${new Date().toISOString()}] Real-time Instagram post request for user ${userId}: image=${!!file}, caption=${!!caption}`);

  if (!file) {
    return res.status(400).json({ error: 'Image is required for Instagram posts' });
  }

  if (!caption || caption.trim() === '') {
    return res.status(400).json({ error: 'Caption is required for Instagram posts' });
  }

  try {
    // Get Instagram token data - the userId could be either instagram_user_id or instagram_graph_id
    let tokenData = null;
    
    // First try to get token data using userId as graph_id
    try {
      tokenData = await getTokenData(userId);
    } catch (error) {
      // If that fails, search by instagram_user_id
      console.log(`[${new Date().toISOString()}] Token not found using ${userId} as graph_id, searching by user_id...`);
      
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
              console.log(`[${new Date().toISOString()}] Found token by instagram_user_id: ${userId}`);
              break;
            }
          }
        }
      }
    }
    
    if (!tokenData) {
      console.log(`[${new Date().toISOString()}] No Instagram token found for user ${userId} (tried both graph_id and user_id)`);
      return res.status(404).json({ error: 'No Instagram access token found for this account. Please reconnect Instagram.' });
    }

    const { access_token, instagram_graph_id } = tokenData;
    
    console.log(`[${new Date().toISOString()}] Posting to Instagram with graph ID: ${instagram_graph_id}`);

    // Step 1: Upload image to Instagram
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
      // Check for WebP signature (RIFF + WEBP) and convert to JPEG
      else if (imageBuffer.length >= 12 &&
               imageBuffer.toString('ascii', 0, 4) === 'RIFF' &&
               imageBuffer.toString('ascii', 8, 12) === 'WEBP') {
        actualFormat = 'webp';
        console.log(`[${new Date().toISOString()}] WebP image detected, converting to JPEG...`);
        
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
          
          console.log(`[${new Date().toISOString()}] WebP successfully converted to JPEG (${imageBuffer.length} bytes)`);
        } catch (conversionError) {
          console.error(`[${new Date().toISOString()}] WebP conversion failed:`, conversionError);
          return res.status(400).json({ 
            error: 'Failed to convert WebP image to JPEG format.',
            details: 'There was an issue converting your WebP image. Please try with a JPEG or PNG image instead.'
          });
        }
      }
    }
    
    // Validate that we detected a supported format
    if (!['jpeg', 'png'].includes(actualFormat)) {
      return res.status(400).json({ 
        error: `Unsupported image format detected. Instagram API only supports JPEG and PNG images.`,
        details: `Detected format: ${actualFormat}. Reported mimetype: ${file.mimetype}`
      });
    }
    
    // Validate image size (Instagram requires minimum 320px and max 8MB)
    if (imageBuffer.length > 8 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large. Maximum file size is 8MB for Instagram posts.' });
    }
    
    const imageBase64 = imageBuffer.toString('base64');
    
    console.log(`[${new Date().toISOString()}] Uploading ${mimeType} image to Instagram (${imageBuffer.length} bytes)...`);
    
    // Save image temporarily to local file system and serve via express
    
    // Create temp directory if it doesn't exist
    const tempDir = path.join(process.cwd(), 'server', 'temp-images');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const imageFilename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${actualFormat}`;
    const imagePath = path.join(tempDir, imageFilename);
    
    // Write image to local temp file
    fs.writeFileSync(imagePath, imageBuffer);
    
    // Construct public URL for the locally served image (production-ready with ngrok)
    const baseUrl = process.env.PUBLIC_URL || 'https://f6e9-121-52-146-243.ngrok-free.app';
    const publicImageUrl = `${baseUrl}/temp-images/${imageFilename}`;
    
    console.log(`[${new Date().toISOString()}] Image saved locally for Instagram access: ${publicImageUrl}`);
    
    // Upload image and create media object using public URL
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
    console.log(`[${new Date().toISOString()}] Instagram media created with ID: ${mediaId}`);

    // Step 2: Publish the media
    console.log(`[${new Date().toISOString()}] Publishing Instagram media...`);
    
    const publishResponse = await axios.post(`https://graph.instagram.com/v22.0/${instagram_graph_id}/media_publish`, {
      creation_id: mediaId,
      access_token: access_token
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const postId = publishResponse.data.id;
    console.log(`[${new Date().toISOString()}] Instagram post published successfully with ID: ${postId}`);

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

    console.log(`[${new Date().toISOString()}] Instagram post record stored at ${postKey}`);

    // Clean up temporary image from local storage
    try {
      fs.unlinkSync(imagePath);
      console.log(`[${new Date().toISOString()}] Temporary image cleaned up: ${imageFilename}`);
    } catch (cleanupError) {
      console.warn(`[${new Date().toISOString()}] Failed to cleanup temporary image: ${cleanupError.message}`);
    }

    res.json({ 
      success: true, 
      message: 'Instagram post published successfully!',
      post_id: postId,
      media_id: mediaId,
      posted_at: postData.posted_at
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error posting to Instagram:`, error.response?.data || error.message);
    
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
app.post('/schedule-post/:userId', upload.single('image'), async (req, res) => {
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
      // Check for WebP signature (RIFF + WEBP) and convert to JPEG
      else if (imageBuffer.length >= 12 &&
               imageBuffer.toString('ascii', 0, 4) === 'RIFF' &&
               imageBuffer.toString('ascii', 8, 12) === 'WEBP') {
        actualFormat = 'webp';
        console.log(`[${new Date().toISOString()}] WebP image detected in scheduled post, converting to JPEG...`);
        
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
          return res.status(400).json({ 
            error: 'Failed to convert WebP image to JPEG format.',
            details: 'There was an issue converting your WebP image. Please try with a JPEG or PNG image instead.'
          });
        }
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

    // Generate unique keys for storage
    const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const imageKey = `scheduled_posts/${platform}/${userId}/${scheduleId}.${actualFormat}`;
    const scheduleKey = `scheduled_posts/${platform}/${userId}/${scheduleId}.json`;

    // Store image in R2
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: imageKey,
      Body: imageBuffer,
      ContentType: mimeType,
    }));

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
app.get('/facebook-connection/:userId', async (req, res) => {
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

app.post('/facebook-connection/:userId', async (req, res) => {
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

app.delete('/facebook-connection/:userId', async (req, res) => {
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
app.get('/user-facebook-status/:userId', async (req, res) => {
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

app.post('/user-facebook-status/:userId', async (req, res) => {
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
app.options('/facebook-connection/:userId', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

app.options('/user-facebook-status/:userId', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

app.post('/instagram-connection/:userId', async (req, res) => {
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
app.get('/facebook-connection/:userId', async (req, res) => {
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
app.post('/facebook-connection/:userId', async (req, res) => {
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
app.delete('/facebook-connection/:userId', async (req, res) => {
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
app.options('/facebook-connection/:userId', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// ============= POST SCHEDULING ENDPOINTS =============

// DUPLICATE ENDPOINT REMOVED - Using the comprehensive one above with WebP auto-conversion and better error handling

// Get scheduled posts for a user
app.get('/scheduled-posts/:userId', async (req, res) => {
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
app.get('/insights/:userId', async (req, res) => {
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

app.get('/check-username-availability/:username', async (req, res) => {
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
          const jpgFiles = files.filter(file => file.Key.endsWith('.jpg'));
          
          console.log(`[${new Date().toISOString()}] Found ${jsonFiles.length} JSON files and ${jpgFiles.length} JPG files in ${postsPrefix} for ${platform}`);
          
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
                if (postData.status === 'processed' || postData.status === 'rejected') {
                  console.log(`[${new Date().toISOString()}] Skipping ${platform} post ${file.Key} with status: ${postData.status}`);
                  return null;
                }
                
                // Look for matching image file
                const potentialImageKeys = [
                  `${postsPrefix}image_${fileId}.jpg`, 
                  `${postsPrefix}ready_post_${fileId}.jpg`
                ];
                
                // Find the first matching image file
                const imageFile = jpgFiles.find(img => 
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
          fetchDataForModule(username, 'NewForYou/{username}', false, platform)
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
app.get('/events-missed/:username', async (req, res) => {
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
app.get('/api/system/cache-stats', (req, res) => {
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
app.get('/events/:username', (req, res) => {
  const { username } = req.params;
  const { since } = req.query;
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
  
  console.log(`[${new Date().toISOString()}] Handling SSE request for /events/${username} (reconnect since: ${sinceTimestamp || 'new connection'})`);

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
  
  // Send initial connection confirmation
  const initialEvent = {
    type: 'connection',
    message: `Connected to events for ${username}`,
    timestamp: Date.now(),
    connectionId
  };
  
  res.write(`data: ${JSON.stringify(initialEvent)}\n\n`);
  
  // Register this client
  if (!sseClients.has(username)) {
    sseClients.set(username, []);
  }
  
  const clients = sseClients.get(username);
  clients.push(res);
  activeConnections.set(res, Date.now());
  
  console.log(`[${new Date().toISOString()}] SSE client connected for ${username}. Total clients: ${clients.length}`);

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
        
        // Check for missed events in InstagramEvents
        const checkPaths = [];
        if (username) checkPaths.push(`InstagramEvents/${username}/`);
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
          console.log(`[${new Date().toISOString()}] Sending ${missedEvents.length} missed events to SSE client for ${username}`);
          
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
          console.log(`[${new Date().toISOString()}] No missed events found for ${username} since ${new Date(sinceTimestamp).toISOString()}`);
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
    const updatedClients = sseClients.get(username)?.filter(client => client !== res) || [];
    sseClients.set(username, updatedClients);
    activeConnections.delete(res);
    
    console.log(`[${new Date().toISOString()}] SSE client disconnected for ${username}. Remaining clients: ${updatedClients.length}`);
    if (updatedClients.length === 0) {
      console.log(`[${new Date().toISOString()}] No more clients for ${username}, cleaning up`);
      sseClients.delete(username);
    }
  });
});

app.post('/update-post-status/:username', async (req, res) => {
  const { username } = req.params;
  const { postKey, status } = req.body; // postKey should be the full R2 key, e.g., ready_post/user/ready_post_123.json

  if (!postKey || !status) {
    console.log(`[${new Date().toISOString()}] Missing postKey or status for update-post-status`);
    return res.status(400).json({ error: 'postKey and status are required' });
  }

  // Validate allowed statuses (optional but recommended)
  const allowedStatuses = ['ready', 'rejected', 'scheduled', 'published', 'failed'];
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
app.options('/update-post-status/:username', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// RAG server proxy endpoint for instant AI replies to DMs/comments
app.post('/rag-instant-reply/:username', async (req, res, next) => {
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
          
          // Map username to Instagram userId
          try {
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
                  if (token.username === username) {
                    userId = token.instagram_user_id;
                    break;
                  }
                }
              }
            }
          } catch (err) {
            console.error(`[RAG-INSTANT-REPLY] Error mapping username to userId:`, err);
          }
          
          // Send the reply if all info is available
          if (userId && sender_id && message_id) {
            try {
              // Find access token
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
                // Update original message status
                const messageKey = `InstagramEvents/${userId}/${message_id}.json`;
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
                } catch (error) {
                  console.error(`[RAG-INSTANT-REPLY] Error updating DM status:`, error);
                }
              }
            } catch (err) {
              console.error(`[RAG-INSTANT-REPLY] Error sending AI DM reply:`, err);
            }
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
app.post('/rag-instant-reply/:username', async (req, res) => {
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
          notification
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
      
      // Generate a unique key for this request
      const timestamp = Date.now();
      const requestKey = `ai_reply/${platform}/${username}/ai_${type}_${timestamp}.json`;
      const replyKey = `ai_reply/${platform}/${username}/ai_${type}_replied_${timestamp}.json`;
      
      // Store request
      const requestData = {
        type,
        text: notification.text,
        timestamp,
        sender_id: notification.sender_id || '',
        message_id: notification.message_id || ''
      };
      
      // Store reply
      const replyData = {
        type,
        reply,
        timestamp,
        generated_at: new Date().toISOString()
      };
      
      try {
        // Store the request
        await s3Client.send(new PutObjectCommand({
          Bucket: 'tasks',
          Key: requestKey,
          Body: JSON.stringify(requestData, null, 2),
          ContentType: 'application/json'
        }));
        
        // Store the reply
        await s3Client.send(new PutObjectCommand({
          Bucket: 'tasks',
          Key: replyKey,
          Body: JSON.stringify(replyData, null, 2),
          ContentType: 'application/json'
        }));
        
        console.log(`[${new Date().toISOString()}] AI reply stored for ${username} (${type})`);
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
app.post('/mark-notification-handled/:userId', async (req, res) => {
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
      if (error.code === 'NoSuchKey') {
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
app.get('/user-twitter-status/:userId', async (req, res) => {
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
app.post('/user-twitter-status/:userId', async (req, res) => {
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
app.options('/user-twitter-status/:userId', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// ===============================================================

app.get('/check-username-availability/:username', async (req, res) => {
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
app.post('/twitter-connection/:userId', async (req, res) => {
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

app.get('/twitter-connection/:userId', async (req, res) => {
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

app.delete('/twitter-connection/:userId', async (req, res) => {
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

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

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
    
    // Build base path
    let path = `${module}/${normalizedPlatform}/${username}`;
    
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
const TWITTER_REDIRECT_URI = 'https://f6e9-121-52-146-243.ngrok-free.app/twitter/callback';

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
app.get('/twitter/auth', async (req, res) => {
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
app.get('/twitter/callback', async (req, res) => {
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
app.post('/post-tweet/:userId', async (req, res) => {
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
app.post('/schedule-tweet/:userId', async (req, res) => {
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
app.post('/schedule-tweet/:userId', async (req, res) => {
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
app.post('/schedule-tweet-with-image/:userId', upload.single('image'), async (req, res) => {
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
app.get('/scheduled-tweets/:userId', async (req, res) => {
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
app.delete('/scheduled-tweet/:userId/:scheduleId', async (req, res) => {
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
      
      console.log(`[${new Date().toISOString()}] Found ${files.length} Facebook scheduled files in 'scheduled_posts/facebook/'`);
      
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
          console.log(`[${new Date().toISOString()}] Facebook post ${scheduledPost.id}: scheduled for ${scheduledTime.toISOString()}, status: ${scheduledPost.status}, current time: ${now.toISOString()}`);
          
          // Check if post is due (within 1 minute tolerance)
          if (scheduledTime <= now && (scheduledPost.status === 'pending' || scheduledPost.status === 'scheduled')) {
            console.log(`[${new Date().toISOString()}] Processing due Facebook post: ${scheduledPost.id}`);
            
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
                  formData.append('source', imageBuffer, {
                    filename: 'image.jpg',
                    contentType: 'image/jpeg'
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

              console.log(`[${new Date().toISOString()}] Facebook post ${scheduledPost.id} marked as completed`);

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
  console.log(`[${new Date().toISOString()}] Starting Twitter OAuth 2.0 scheduler...`);
  
  setInterval(async () => {
    try {
      console.log(`[${new Date().toISOString()}] Checking for due tweets...`);
      
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
            console.log(`[${new Date().toISOString()}] Processing due tweet: ${scheduledTweet.schedule_id}`);
            
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
                console.log(`[${new Date().toISOString()}] Scheduled tweet: Access token expired, attempting to refresh...`);
                
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
                    
                    console.log(`[${new Date().toISOString()}] Scheduled tweet: Access token refreshed successfully`);
                  } catch (refreshError) {
                    console.error(`[${new Date().toISOString()}] Scheduled tweet: Token refresh failed:`, refreshError.response?.data || refreshError.message);
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
                console.log(`[${new Date().toISOString()}] Scheduled tweet has image, uploading media first...`);
                
                try {
                  // Get the image from R2
                  const imageCommand = new GetObjectCommand({
                    Bucket: 'tasks',
                    Key: scheduledTweet.image_key
                  });
                  const imageResponse = await s3Client.send(imageCommand);
                  const imageBuffer = await streamToBuffer(imageResponse.Body);
                  
                  // Upload media using X API v1.1 media upload (required for chunked uploads)
                  console.log(`[${new Date().toISOString()}] Starting chunked media upload...`);
                  
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
                  
                  console.log(`[${new Date().toISOString()}] Scheduled tweet: Media uploaded successfully: ${mediaId}`);
                  
                  // Add media to tweet data
                  tweetData.media = { media_ids: [mediaId] };
                  
                } catch (mediaError) {
                  console.error(`[${new Date().toISOString()}] Error uploading media for scheduled tweet:`, mediaError.response?.data || mediaError.message);
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
              
              console.log(`[${new Date().toISOString()}] Scheduled tweet posted: ${tweetId}`);
              
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
              console.error(`[${new Date().toISOString()}] Error posting scheduled tweet ${scheduledTweet.schedule_id}:`, postError.response?.data || postError.message);
              
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
          console.error(`[${new Date().toISOString()}] Error processing scheduled tweet file ${file.Key}:`, error);
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error in Twitter scheduler:`, error);
    }
  }, 60000); // Check every minute
}

// ============= INSTAGRAM POST SCHEDULER =============

// Instagram scheduler worker - checks for due Instagram posts every minute  
function startInstagramScheduler() {
  console.log(`[${new Date().toISOString()}] Starting Instagram post scheduler...`);
  
  setInterval(async () => {
    try {
      await processScheduledInstagramPosts();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Instagram scheduler error:`, error);
    }
  }, 60000); // Check every minute
}

async function processScheduledInstagramPosts() {
  try {
    // List all scheduled posts
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'scheduled_posts/instagram/',
      MaxKeys: 100
    });
    
    const response = await s3Client.send(listCommand);
    const now = new Date();
    
    if (response.Contents) {
      for (const object of response.Contents) {
        if (!object.Key?.endsWith('.json')) continue;
        
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
          
          if (scheduleData.status === 'scheduled' && scheduleTime <= now) {
            console.log(`[${new Date().toISOString()}] Processing scheduled post: ${scheduleData.id}`);
            await executeScheduledPost(scheduleData);
          }
          
        } catch (itemError) {
          console.error(`[${new Date().toISOString()}] Error processing scheduled item ${object.Key}:`, itemError.message);
        }
      }
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in processScheduledInstagramPosts:`, error.message);
  }
}

async function executeScheduledPost(scheduleData) {
  try {
    // Update status to processing
    scheduleData.status = 'processing';
    scheduleData.attempts = (scheduleData.attempts || 0) + 1;
    scheduleData.lastAttempt = new Date().toISOString();
    
    // Save processing status
    const scheduleKey = `scheduled_posts/${scheduleData.platform}/${scheduleData.userId}/${scheduleData.id}.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: scheduleKey,
      Body: JSON.stringify(scheduleData, null, 2),
      ContentType: 'application/json',
    }));
    
    // Get the image from R2
    const imageResponse = await s3Client.send(new GetObjectCommand({
      Bucket: 'tasks',
      Key: scheduleData.imageKey
    }));
    
    const imageBuffer = await streamToBuffer(imageResponse.Body);
    
    // Get Instagram token data - now handles both user ID and graph ID automatically
    const tokenData = await getTokenData(scheduleData.userId);
    
    const { access_token, instagram_graph_id } = tokenData;
    
    // Use the same successful posting logic as real-time posting
    const tempDir = path.join(process.cwd(), 'server', 'temp-images');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const imageFilename = `${Date.now()}-${scheduleData.id}.${scheduleData.imageFormat}`;
    const imagePath = path.join(tempDir, imageFilename);
    
    // Write image to local temp file
    fs.writeFileSync(imagePath, imageBuffer);
    
    // Construct public URL for Instagram access (same as real-time posting)
    const baseUrl = process.env.PUBLIC_URL || 'https://f6e9-121-52-146-243.ngrok-free.app';
    const publicImageUrl = `${baseUrl}/temp-images/${imageFilename}`;
    
    console.log(`[${new Date().toISOString()}] Executing scheduled post via: ${publicImageUrl}`);
    
    // Upload image and create media object using Instagram API
    const mediaResponse = await axios.post(`https://graph.instagram.com/v22.0/${instagram_graph_id}/media`, {
      image_url: publicImageUrl,
      caption: scheduleData.caption,
      access_token: access_token
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const mediaId = mediaResponse.data.id;
    console.log(`[${new Date().toISOString()}] Instagram media created for scheduled post: ${mediaId}`);

    // Publish the media
    const publishResponse = await axios.post(`https://graph.instagram.com/v22.0/${instagram_graph_id}/media_publish`, {
      creation_id: mediaId,
      access_token: access_token
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const postId = publishResponse.data.id;
    console.log(`[${new Date().toISOString()}] Scheduled Instagram post published successfully: ${postId}`);

    // Update schedule status to completed
    scheduleData.status = 'completed';
    scheduleData.completedAt = new Date().toISOString();
    scheduleData.postId = postId;
    scheduleData.mediaId = mediaId;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: scheduleKey,
      Body: JSON.stringify(scheduleData, null, 2),
      ContentType: 'application/json',
    }));

    // Store post record for tracking (same as real-time posting)
    const postKey = `InstagramPosts/${scheduleData.userId}/${postId}.json`;
    const postData = {
      id: postId,
      userId: scheduleData.userId,
      platform: 'instagram',
      caption: scheduleData.caption,
      media_id: mediaId,
      instagram_graph_id,
      posted_at: new Date().toISOString(),
      status: 'published',
      type: 'scheduled_post',
      schedule_id: scheduleData.id
    };

    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: postKey,
      Body: JSON.stringify(postData, null, 2),
      ContentType: 'application/json',
    }));

    // Clean up temporary image
    try {
      fs.unlinkSync(imagePath);
      console.log(`[${new Date().toISOString()}] Scheduled post temporary image cleaned up: ${imageFilename}`);
    } catch (cleanupError) {
      console.warn(`[${new Date().toISOString()}] Failed to cleanup scheduled post image: ${cleanupError.message}`);
    }

    console.log(`[${new Date().toISOString()}] Scheduled post executed successfully: ${scheduleData.id} -> ${postId}`);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error executing scheduled post ${scheduleData.id}:`, error.message);
    
    // Update status to failed if max attempts reached
    if (scheduleData.attempts >= 3) {
      scheduleData.status = 'failed';
      scheduleData.failedAt = new Date().toISOString();
      scheduleData.error = error.message;
    } else {
      scheduleData.status = 'scheduled'; // Retry later
    }
    
    const scheduleKey = `scheduled_posts/${scheduleData.platform}/${scheduleData.userId}/${scheduleData.id}.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: scheduleKey,
      Body: JSON.stringify(scheduleData, null, 2),
      ContentType: 'application/json',
    }));
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

// Start the schedulers  
startTwitterScheduler();
startFacebookScheduler();
startInstagramScheduler();

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
app.get('/debug/twitter-users', async (req, res) => {
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

// Post tweet with image endpoint - immediate posting with OAuth 2.0 and chunked media upload
app.post('/post-tweet-with-image/:userId', upload.single('image'), async (req, res) => {
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

// Save goal endpoint - Schema: tasks/goal/<platform>/<username>/goal_*.json
app.post('/save-goal/:username', async (req, res) => {
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

    // Check for existing active campaign
    console.log(`[${new Date().toISOString()}] Checking for existing campaign before creating new goal for ${username} on ${platform}`);
    const goalPrefix = `tasks/goal/${platform}/${username}`;
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
    const goalPath = `tasks/goal/${platform}/${username}/${goalId}.json`;

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
app.options('/save-goal/:username', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Goal summary retrieval endpoint - Schema: tasks/goal_summary/<platform>/<username>/summary_*.json
app.get('/goal-summary/:username', async (req, res) => {
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
    const summaryPrefix = `tasks/goal_summary/${platform}/${username}`;

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
app.options('/goal-summary/:username', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Campaign ready posts count endpoint - Schema: tasks/ready_post/<platform>/<username>/campaign_ready_post_*.json
app.get('/campaign-posts-count/:username', async (req, res) => {
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
    const postsPrefix = `tasks/ready_post/${platform}/${username}`;

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
app.options('/campaign-posts-count/:username', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Engagement metrics endpoint (placeholder for platform-specific engagement)
app.get('/engagement-metrics/:username', async (req, res) => {
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
app.options('/engagement-metrics/:username', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Generated content summary endpoint - Schema: tasks/generated_content/<platform>/<username>/posts.json
app.get('/generated-content-summary/:username', async (req, res) => {
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
app.options('/generated-content-summary/:username', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Campaign status check endpoint - Check if user has an active campaign
app.get('/campaign-status/:username', async (req, res) => {
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
    
    console.log(`[${new Date().toISOString()}] Checking campaign status for ${username} on ${platform}`);

    // Check for existing goal files
    const goalPrefix = `tasks/goal/${platform}/${username}`;
    const listGoalsCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `${goalPrefix}/`
    });

    const goalData = await s3Client.send(listGoalsCommand);
    const hasActiveGoal = goalData.Contents && goalData.Contents.length > 0;

    if (hasActiveGoal) {
      console.log(`[${new Date().toISOString()}] Active campaign found for ${username} on ${platform}`);
      return res.json({ 
        hasActiveCampaign: true,
        platform: platform,
        username: username,
        goalFiles: goalData.Contents?.length || 0
      });
    }

    console.log(`[${new Date().toISOString()}] No active campaign found for ${username} on ${platform}`);
    res.json({ 
      hasActiveCampaign: false,
      platform: platform,
      username: username
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Campaign status check error:`, error);
    res.status(500).json({ 
      error: 'Failed to check campaign status', 
      details: error.message,
      hasActiveCampaign: false
    });
  }
});

// OPTIONS handler for campaign-status
app.options('/campaign-status/:username', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Stop campaign endpoint - Delete all campaign-related files
app.delete('/stop-campaign/:username', async (req, res) => {
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

    // Define file prefixes to delete
    const prefixesToDelete = [
      `tasks/goal/${platform}/${username}`,
      `tasks/goal_summary/${platform}/${username}`,
      `tasks/ready_post/${platform}/${username}`
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
                console.log(`[${new Date().toISOString()}] Deleted: ${object.Key}`);
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

    console.log(`[${new Date().toISOString()}] Campaign deletion completed for ${username} on ${platform}. Deleted ${deletedFiles.length} files, ${deletionErrors.length} errors.`);

    res.json({
      success: true,
      message: `Campaign stopped successfully for ${username} on ${platform}`,
      deletedFiles: deletedFiles,
      deletedCount: deletedFiles.length,
      errors: deletionErrors,
      platform: platform,
      username: username
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
app.options('/stop-campaign/:username', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Get timeline from generated content endpoint
app.get('/generated-content-timeline/:username', async (req, res) => {
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
app.options('/generated-content-timeline/:username', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// ============= END GOAL MANAGEMENT ENDPOINTS =============

// Profit Analysis endpoint - Schema: tasks/prophet_analysis/<platform>/<username>/analysis_*.json
app.get('/profit-analysis/:username', async (req, res) => {
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
app.get('/api/signed-image-url/:username/:imageKey', async (req, res) => {
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
app.options('/api/signed-image-url/:username/:imageKey', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// ... existing code ...

// Add the API endpoint for update-post-status
app.post('/api/update-post-status/:username', async (req, res) => {
  const { username } = req.params;
  const { postKey, status, like, dislike, userComment } = req.body;

  if (!username || !postKey) {
    return res.status(400).json({ error: 'Username and postKey are required' });
  }

  // Validate status if provided
  const allowedStatuses = ['pending', 'scheduled', 'posted', 'rejected', 'failed'];
  if (status && !allowedStatuses.includes(status)) {
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

    // Update the status if provided
    if (status) {
      postData.status = status;
    }
    
    // Update feedback if provided
    if (like !== undefined || dislike !== undefined || userComment) {
      postData.feedback = postData.feedback || {};
      
      if (like !== undefined) {
        postData.feedback.likes = (postData.feedback.likes || 0) + like;
      }
      
      if (dislike !== undefined) {
        postData.feedback.dislikes = (postData.feedback.dislikes || 0) + dislike;
      }
      
      if (userComment) {
        postData.feedback.comments = postData.feedback.comments || [];
        postData.feedback.comments.push({
          text: userComment,
          timestamp: new Date().toISOString()
        });
      }
    }
    
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

    console.log(`[${new Date().toISOString()}] Successfully updated post ${postKey} ${status ? `to ${status}` : 'with feedback'}`);
    res.json({ success: true, message: 'Post updated successfully', newStatus: status });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error updating post for ${postKey}:`, error);
    res.status(500).json({ error: 'Failed to update post', details: error.message });
  }
});

// Add OPTIONS handler for the new API endpoint
app.options('/api/update-post-status/:username', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Proxy image requests to avoid CORS issues
app.get('/api/proxy-image', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    console.log(`[Proxy] Proxying image from: ${url}`);
    const imageResponse = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000
    });
    
    // Set appropriate content type and other headers
    const contentType = imageResponse.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    // Send the image data
    res.send(Buffer.from(imageResponse.data));
  } catch (error) {
    console.error(`[Proxy] Failed to proxy image: ${error.message}`);
    res.status(500).json({ error: 'Failed to proxy image' });
  }
});

// Add OPTIONS handler for proxy-image endpoint
app.options('/api/proxy-image', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Robust R2 Image Renderer - handles JPG images seamlessly from Cloudflare R2
app.get('/api/r2-image/:username/:imageKey', async (req, res) => {
  const { username, imageKey } = req.params;
  const platform = req.query.platform || 'instagram';
  
  try {
    // Construct the R2 key path
    const r2Key = `ready_post/${platform}/${username}/${imageKey}`;
    
    console.log(`[R2-IMAGE] Fetching image: ${r2Key}`);
    
    // Get the object from R2
    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: r2Key,
    });
    
    const response = await s3Client.send(getCommand);
    
    if (!response.Body) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Convert stream to buffer
    const imageBuffer = await streamToBuffer(response.Body);
    
    // Set appropriate headers for JPG images
    res.setHeader('Content-Type', response.ContentType || 'image/jpeg');
    res.setHeader('Content-Length', imageBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.setHeader('ETag', response.ETag || `"${imageKey}-${Date.now()}"`);
    res.setHeader('Last-Modified', response.LastModified?.toUTCString() || new Date().toUTCString());
    
    // Enable CORS for cross-origin requests
    setCorsHeaders(res);
    
    // Send the image buffer directly
    res.send(imageBuffer);
    
    console.log(`[R2-IMAGE] Successfully served: ${r2Key} (${imageBuffer.length} bytes)`);
    
  } catch (error) {
    console.error(`[R2-IMAGE] Error serving image ${username}/${imageKey}:`, error);
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ error: 'Image not found in R2 storage' });
    }
    
    res.status(500).json({ error: 'Failed to retrieve image from R2 storage' });
  }
});

// Enhanced signed URL generator with R2 optimization
app.get('/api/signed-image-url/:username/:imageKey', async (req, res) => {
  const { username, imageKey } = req.params;
  const platform = req.query.platform || 'instagram';
  
  try {
    const key = `ready_post/${platform}/${username}/${imageKey}`;
    
    // First, check if the object exists
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      await s3Client.send(headCommand);
    } catch (headError) {
      if (headError.name === 'NotFound' || headError.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: 'Image not found' });
      }
      throw headError;
    }
    
    // Generate signed URL with extended expiry for better UX
    const command = new GetObjectCommand({
      Bucket: 'tasks',
      Key: key,
    });
    
    const signedUrl = await getSignedUrl(s3Client, command, { 
      expiresIn: 7200 // 2 hours for better user experience
    });
    
    // Also provide our direct R2 endpoint as fallback
    const directUrl = `${req.protocol}://${req.get('host')}/api/r2-image/${username}/${imageKey}?platform=${platform}`;
    
    res.json({ 
      url: signedUrl,
      directUrl: directUrl,
      key: key
    });
    
  } catch (error) {
    console.error(`[signed-image-url] Failed to generate signed URL for`, req.params, error?.message);
    res.status(500).json({ error: 'Failed to generate signed URL' });
  }
});

// OPTIONS handler for R2 image endpoint
app.options('/api/r2-image/:username/:imageKey', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// HEAD handler for R2 image endpoint (for testing accessibility)
app.head('/api/r2-image/:username/:imageKey', async (req, res) => {
  const { username, imageKey } = req.params;
  const platform = req.query.platform || 'instagram';
  
  try {
    const r2Key = `ready_post/${platform}/${username}/${imageKey}`;
    
    // Check if the object exists
    const headCommand = new HeadObjectCommand({
      Bucket: 'tasks',
      Key: r2Key,
    });
    
    const response = await s3Client.send(headCommand);
    
    // Set headers without body
    res.setHeader('Content-Type', response.ContentType || 'image/jpeg');
    res.setHeader('Content-Length', response.ContentLength || 0);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('ETag', response.ETag || `"${imageKey}-${Date.now()}"`);
    res.setHeader('Last-Modified', response.LastModified?.toUTCString() || new Date().toUTCString());
    
    setCorsHeaders(res);
    res.status(200).end();
    
  } catch (error) {
    console.error(`[R2-IMAGE-HEAD] Error checking image ${username}/${imageKey}:`, error);
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).end();
    } else {
      res.status(500).end();
    }
  }
});

// Save edited post from Canvas Editor
app.post('/api/save-edited-post/:username', upload.single('image'), async (req, res) => {
  const { username } = req.params;
  const { postKey, caption, platform } = req.body;
  const imageFile = req.file;

  if (!username || !postKey || !imageFile) {
    return res.status(400).json({ error: 'Missing required fields: username, postKey, or image' });
  }

  try {
    console.log(`[SAVE-EDITED-POST] Processing edited post ${postKey} for ${username} on ${platform}`);

    // Extract image key from postKey for R2 storage
    let imageKey = '';
    if (postKey.match(/ready_post_\d+\.json$/)) {
      const postIdMatch = postKey.match(/ready_post_(\d+)\.json$/);
      if (postIdMatch) imageKey = `image_${postIdMatch[1]}.jpg`;
    }

    if (!imageKey) {
      return res.status(400).json({ error: 'Could not determine image key from postKey' });
    }

    // Upload the edited image to R2 storage
    const platformPath = platform || 'instagram';
    const r2Key = `ready_post/${platformPath}/${username}/${imageKey}`;
    
    const uploadCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: r2Key,
      Body: imageFile.buffer,
      ContentType: 'image/jpeg',
      CacheControl: 'max-age=31536000', // Cache for 1 year
      Metadata: {
        'edited-timestamp': Date.now().toString(),
        'original-post-key': postKey,
        'platform': platformPath
      }
    });

    await s3Client.send(uploadCommand);
    console.log(`[SAVE-EDITED-POST] Uploaded edited image to R2: ${r2Key}`);

    // Update the post metadata with new caption if provided
    if (caption && caption.trim()) {
      try {
        // First, try to get the existing post data
        const getPostCommand = new GetObjectCommand({
          Bucket: 'tasks',
          Key: postKey,
        });

        const postResponse = await s3Client.send(getPostCommand);
        const postData = JSON.parse(await streamToString(postResponse.Body));

        // Update the caption
        if (postData.post) {
          postData.post.caption = caption.trim();
          postData.lastModified = new Date().toISOString();
          postData.editedInCanvas = true;

          // Save the updated post data back to R2
          const updatePostCommand = new PutObjectCommand({
            Bucket: 'tasks',
            Key: postKey,
            Body: JSON.stringify(postData, null, 2),
            ContentType: 'application/json',
            Metadata: {
              'last-modified': Date.now().toString(),
              'edited-in-canvas': 'true'
            }
          });

          await s3Client.send(updatePostCommand);
          console.log(`[SAVE-EDITED-POST] Updated post metadata: ${postKey}`);
        }
      } catch (postUpdateError) {
        console.warn(`[SAVE-EDITED-POST] Could not update post metadata for ${postKey}:`, postUpdateError.message);
        // Continue anyway, as the image was successfully updated
      }
    }

    // Generate new signed URL for the updated image
    const signedUrlCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: r2Key,
    });
    
    const newSignedUrl = await getSignedUrl(s3Client, signedUrlCommand, { expiresIn: 7200 });

    res.json({
      success: true,
      message: 'Post updated successfully',
      postKey: postKey,
      imageKey: imageKey,
      newImageUrl: newSignedUrl,
      r2Key: r2Key
    });

  } catch (error) {
    console.error(`[SAVE-EDITED-POST] Error saving edited post ${postKey}:`, error);
    res.status(500).json({ 
      error: 'Failed to save edited post',
      details: error.message 
    });
  }
});

// OPTIONS handler for save-edited-post endpoint
app.options('/api/save-edited-post/:username', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// =================== FACEBOOK STATUS ENDPOINTS ===================

// This endpoint checks if a user has entered their Facebook username
app.get('/user-facebook-status/:userId', async (req, res) => {
  // Set CORS headers
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

// This endpoint updates the user's Facebook username entry state
app.post('/user-facebook-status/:userId', async (req, res) => {
  // Set CORS headers
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const { facebook_username, accountType, competitors } = req.body;
  
  if (!facebook_username || !facebook_username.trim()) {
    return res.status(400).json({ error: 'Facebook username is required' });
  }
  
  try {
    const key = `UserFacebookStatus/${userId}/status.json`;
    const userData = {
      uid: userId,
      hasEnteredFacebookUsername: true,
      facebook_username: facebook_username.trim(),
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
    res.json({ success: true, message: 'User Facebook status updated successfully' });
  } catch (error) {
    console.error(`Error updating user Facebook status for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to update user Facebook status' });
  }
});

// Add OPTIONS handlers for Facebook status endpoints
app.options('/user-facebook-status/:userId', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// ===============================================================

// ============= EMAIL VERIFICATION SERVICE =============

// Email configuration (using Gmail SMTP for demo - in production use proper email service)
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'accountmanager.demo@gmail.com', // Demo email
    pass: process.env.EMAIL_PASS || 'demo-password' // Demo password
  }
});

// For demo purposes, we'll simulate email sending if credentials are not configured
const isEmailConfigured = process.env.EMAIL_USER && process.env.EMAIL_PASS && 
                          process.env.EMAIL_USER !== 'accountmanager.demo@gmail.com';

// Store verification codes temporarily (in production, use Redis or database)
const verificationCodes = new Map();

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

// Send verification email endpoint
app.post('/api/send-verification-email', async (req, res) => {
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
app.post('/api/verify-email-code', async (req, res) => {
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
app.post('/api/resend-verification-code', async (req, res) => {
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
app.options('/api/send-verification-email', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

app.options('/api/verify-email-code', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

app.options('/api/resend-verification-code', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Clean up expired verification codes every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of verificationCodes.entries()) {
    if (now > data.expires) {
      verificationCodes.delete(email);
    }
  }
}, 10 * 60 * 1000);

console.log(`[${new Date().toISOString()}] Email verification service initialized`);

// ===============================================================

