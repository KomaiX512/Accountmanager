import express from 'express';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import axios from 'axios';
import cors from 'cors';
import multer from 'multer';
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
const app = express();
const port = 3000;

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
    console.log(`[${new Date().toISOString()}] Cache HIT for ${prefix} (age: ${Math.round(cacheAge/1000)}s, TTL: ${Math.round(cacheConfig.TTL/1000)}s)`);
    return true;
  }
  
  // Increment cache miss counter if applicable
  if (cache.has(prefix)) {
    const misses = cacheMisses.get(prefix) || 0;
    cacheMisses.set(prefix, misses + 1);
    console.log(`[${new Date().toISOString()}] Cache EXPIRED for ${prefix} (age: ${Math.round(cacheAge/1000)}s, TTL: ${Math.round(cacheConfig.TTL/1000)}s)`);
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
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
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

    console.log(`[${new Date().toISOString()}] Fetching fresh ${platform} data from R2 for prefix: ${prefix}`);
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
      console.log(`[${new Date().toISOString()}] Cache hit for account info: ${prefix}`);
      const cachedData = cache.get(prefix);
      data = cachedData?.find(item => item.key === key)?.data;
      
      if (data) {
        console.log(`[${new Date().toISOString()}] Returning cached account info for ${normalizedUsername}`);
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
      console.log(`Cache hit for ${platform} posts: ${prefix}`);
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
const REDIRECT_URI = 'https://a0ee-121-52-146-243.ngrok-free.app/instagram/callback';
const VERIFY_TOKEN = 'myInstagramWebhook2025';


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

// Helper function to get token data
async function getTokenData(instagram_graph_id) {
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
        if (token.instagram_graph_id === instagram_graph_id) {
          tokenData = token;
          break;
        }
      }
    }
  }
  if (!tokenData) {
    throw new Error(`No token found for instagram_graph_id ${instagram_graph_id}`);
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
  const { sender_id, text, message_id } = req.body;

  if (!sender_id || !text || !message_id) {
    console.log(`[${new Date().toISOString()}] Missing required fields for DM reply`);
    return res.status(400).json({error: 'Missing sender_id, text, or message_id'});
  }

  try {
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
  const { comment_id, text } = req.body;

  if (!comment_id || !text) {
    console.log(`[${new Date().toISOString()}] Missing required fields for comment reply`);
    return res.status(400).json({error: 'Missing comment_id or text'});
  }

  try {
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
      const tokenPrefix = platform === 'twitter' ? 'TwitterTokens/' : 'InstagramTokens/';
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
            const userIdField = platform === 'twitter' ? 'twitter_user_id' : 'instagram_user_id';
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
    
    const eventPrefix = platform === 'twitter' ? 'TwitterEvents' : 'InstagramEvents';
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
      
      // Invalidate cache
      cache.delete(`${eventPrefix}/${userId}`);
      if (username) cache.delete(`${eventPrefix}/${username}`);
      
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

  try {
    let notifications = [];
    if (platform === 'instagram') {
      notifications = await fetchInstagramNotifications(userId);
    } else if (platform === 'twitter') {
      notifications = await fetchTwitterNotifications(userId);
    }

    res.json(notifications);
  } catch (error) {
    console.error(`Error fetching ${platform} notifications:`, error);
    res.status(500).json({ error: `Failed to fetch ${platform} notifications` });
  }
});

async function fetchInstagramNotifications(userId) {
  try {
    // Fetch Instagram DMs
    const dms = await fetchInstagramDMs(userId);
    
    // Fetch Instagram comments
    const comments = await fetchInstagramComments(userId);
    
    // Combine and format notifications
    const notifications = [
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
    const notifications = [
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

    return notifications;
  } catch (error) {
    console.error('Error fetching Twitter notifications:', error);
    throw error;
  }
}

// Twitter notification helper functions (placeholder implementations)
async function fetchTwitterDMs(userId) {
  try {
    console.log(`[${new Date().toISOString()}] Fetching Twitter DMs for user ${userId}`);
    // TODO: Implement actual Twitter API calls
    // For now, return empty array to prevent crashes
    return [];
  } catch (error) {
    console.error('Error fetching Twitter DMs:', error);
    return [];
  }
}

async function fetchTwitterMentions(userId) {
  try {
    console.log(`[${new Date().toISOString()}] Fetching Twitter mentions for user ${userId}`);
    // TODO: Implement actual Twitter API calls
    // For now, return empty array to prevent crashes
    return [];
  } catch (error) {
    console.error('Error fetching Twitter mentions:', error);
    return [];
  }
}

async function sendTwitterDMReply(userId, senderId, text, messageId) {
  try {
    console.log(`[${new Date().toISOString()}] Sending Twitter DM reply from ${userId} to ${senderId}: ${text}`);
    // TODO: Implement actual Twitter API calls
    // For now, just log the action
    console.log(`[${new Date().toISOString()}] Twitter DM reply would be sent (placeholder implementation)`);
    return { success: true, message: 'Twitter DM reply sent (placeholder)' };
  } catch (error) {
    console.error('Error sending Twitter DM reply:', error);
    throw error;
  }
}

async function sendTwitterMentionReply(userId, commentId, text) {
  try {
    console.log(`[${new Date().toISOString()}] Sending Twitter mention reply from ${userId} to comment ${commentId}: ${text}`);
    // TODO: Implement actual Twitter API calls
    // For now, just log the action
    console.log(`[${new Date().toISOString()}] Twitter mention reply would be sent (placeholder implementation)`);
    return { success: true, message: 'Twitter mention reply sent (placeholder)' };
  } catch (error) {
    console.error('Error sending Twitter mention reply:', error);
    throw error;
  }
}

app.post('/send-dm-reply/:userId', async (req, res) => {
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
    const eventPrefix = platform === 'twitter' ? 'TwitterEvents' : 'InstagramEvents';
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
    if (!['instagram', 'twitter'].includes(normalizedPlatform)) {
      throw new Error(`Unsupported platform: ${platform}. Must be 'instagram' or 'twitter'`);
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
      isValidPlatform: ['instagram', 'twitter'].includes(platform.toLowerCase())
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
const TWITTER_REDIRECT_URI = 'https://a257-121-52-146-243.ngrok-free.app/twitter/callback';

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

// Start the Twitter scheduler
startTwitterScheduler();

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
    if (!['instagram', 'twitter'].includes(platform)) {
      return res.status(400).json({ 
        error: 'Invalid platform. Must be instagram or twitter.' 
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
    if (!['instagram', 'twitter'].includes(platform)) {
      return res.status(400).json({ 
        error: 'Invalid platform. Must be instagram or twitter.' 
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
    if (!['instagram', 'twitter'].includes(platform)) {
      return res.status(400).json({ 
        error: 'Invalid platform. Must be instagram or twitter.' 
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
    if (!['instagram', 'twitter'].includes(platform)) {
      return res.status(400).json({ 
        error: 'Invalid platform. Must be instagram or twitter.' 
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

// ============= END GOAL MANAGEMENT ENDPOINTS =============

