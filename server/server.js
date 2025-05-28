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
import schedule from 'node-schedule';
const app = express();
const port = 3000;

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
  'ProfileInfo': CACHE_CONFIG.STANDARD,
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

// Enhanced data fetching with improved caching strategy
async function fetchDataForModule(username, prefixTemplate, forceRefresh = false, platform = 'instagram') {
  if (!username) {
    console.error('No username provided, cannot fetch data');
    return [];
  }

  // Create platform-specific prefix using new schema: <module>/<platform>/<username>
  let prefix;
  if (prefixTemplate.includes('{username}')) {
    // Replace {username} placeholder and add platform directory
    const modulePrefix = prefixTemplate.replace('/{username}', '').replace('{username}', '');
    prefix = `${modulePrefix}/${platform}/${username}`;
  } else {
    // For templates without placeholder, assume it ends with the module name
    prefix = `${prefixTemplate}/${platform}/${username}`;
  }
  
  // Check if we should use cache based on the enhanced caching rules
  if (!forceRefresh && shouldUseCache(prefix)) {
    return cache.get(prefix);
  }

  try {
    console.log(`[${new Date().toISOString()}] Fetching fresh ${platform} data from R2 for prefix: ${prefix}`);
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: prefix,
    });
    const listResponse = await s3Client.send(listCommand);

    const files = listResponse.Contents || [];
    
    // Special handling for ready_post directory since it contains both JSON and JPG files
    if (prefix.includes('ready_post/')) {
      // For ready_post, we need a different approach to properly handle both JSON and image files
      // This is handled separately by the /posts/:username endpoint
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
    console.error(`Error fetching ${platform} data for prefix ${prefix}:`, error);
    // Return cached data as fallback if available
    if (cache.has(prefix)) {
      console.log(`[${new Date().toISOString()}] Using cached ${platform} data as fallback for ${prefix} due to fetch error`);
      return cache.get(prefix);
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
  
  // Create platform-specific key using new schema: ProfileInfo/<platform>/<username>.json
  const key = `ProfileInfo/${platform}/${username}.json`;
  const prefix = `ProfileInfo/${platform}/${username}`;

  try {
    let data;
    if (!forceRefresh && cache.has(prefix)) {
      console.log(`Cache hit for profile info: ${prefix}`);
      const cachedData = cache.get(prefix);
      data = cachedData.find(item => item.key === key)?.data;
    }

    if (!data || forceRefresh) {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);

      if (!body || body.trim() === '') {
        console.warn(`Empty file detected at ${key}`);
        return res.status(404).json({ error: 'Profile info is empty' });
      }

      data = JSON.parse(body);
      cache.set(prefix, [{ key, data }]);
      cacheTimestamps.set(prefix, Date.now());
    }

    res.json(data);
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      console.log(`Profile info not found for ${key}`);
      return res.status(404).json({ error: 'Profile info not found' });
    }
    console.error(`Error fetching profile info for ${key}:`, error.message);
    res.status(500).json({ error: 'Error retrieving profile info', details: error.message });
  }
});

app.post('/save-account-info', async (req, res) => {
  try {
    const { username, accountType, postingStyle, competitors, platform } = req.body;
    const platformParam = req.query.platform || platform || 'instagram'; // Default to Instagram for backward compatibility

    if (!username || !accountType || !postingStyle) {
      return res.status(400).json({ error: 'Username, account type, and posting style are required' });
    }

    // Normalize the username
    const normalizedUsername = platformParam === 'twitter' ? username.trim() : username.trim().toLowerCase();

    // Create platform-specific key structure using new schema: AccountInfo/<platform>/<username>/info.json
    const key = `AccountInfo/${platformParam}/${normalizedUsername}/info.json`;

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
      ...(competitors && { competitors: competitors.map(c => platformParam === 'twitter' ? c.trim() : c.trim().toLowerCase()) }),
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

    const cacheKey = `AccountInfo/${platformParam}/${normalizedUsername}`;
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
  const { accountHolder, competitor } = req.params;
  const forceRefresh = req.query.forceRefresh === 'true';

  try {
    const data = await fetchDataForModule(accountHolder, `competitor_analysis/{username}/${competitor}`, forceRefresh);
    console.log(`Returning data for ${accountHolder}/${competitor}`);
    res.json(data);
  } catch (error) {
    console.error(`Retrieve endpoint error for ${accountHolder}/${competitor}:`, error);
    // Try to use cached data as fallback if available
    const prefix = `competitor_analysis/${accountHolder}/${competitor}`;
    if (cache.has(prefix)) {
      console.log(`[${new Date().toISOString()}] Using cached data as fallback for ${prefix} due to fetch error`);
      return res.json(cache.get(prefix));
    }
    res.status(500).json({ error: 'Error retrieving data', details: error.message });
  }
});

app.get('/retrieve-multiple/:accountHolder', async (req, res) => {
  const { accountHolder } = req.params;
  const competitorsParam = req.query.competitors;
  const forceRefresh = req.query.forceRefresh === 'true';
  const platform = req.query.platform || 'instagram'; // Default to Instagram

  if (!competitorsParam || typeof competitorsParam !== 'string') {
    return res.status(400).json({ error: 'Competitors query parameter is required and must be a string' });
  }

  const competitors = competitorsParam.split(',').map(c => c.trim()).filter(c => c.length > 0);

  try {
    const results = await Promise.all(
      competitors.map(async (competitor) => {
        try {
          const data = await fetchDataForModule(accountHolder, `competitor_analysis/{username}/${competitor}`, forceRefresh, platform);
          return { competitor, data };
        } catch (error) {
          console.error(`Error fetching ${platform} data for ${accountHolder}/${competitor}:`, error);
          // Try to use cached data as fallback
          let prefix;
          if (platform === 'twitter') {
            prefix = `competitor_analysis/twitter/${accountHolder}/${competitor}`;
          } else {
            prefix = `competitor_analysis/${accountHolder}/${competitor}`;
          }
          
          if (cache.has(prefix)) {
            console.log(`[${new Date().toISOString()}] Using cached ${platform} data as fallback for ${prefix}`);
            return { competitor, data: cache.get(prefix) };
          }
          return { competitor, data: [], error: error.message };
        }
      })
    );
    res.json(results);
  } catch (error) {
    console.error(`Retrieve multiple ${platform} endpoint error for ${accountHolder}:`, error);
    res.status(500).json({ error: `Error retrieving ${platform} data for multiple competitors`, details: error.message });
  }
});

app.get('/retrieve-strategies/:accountHolder', async (req, res) => {
  const { accountHolder } = req.params;
  const forceRefresh = req.query.forceRefresh === 'true';
  const platform = req.query.platform || 'instagram'; // Default to Instagram

  try {
    const data = await fetchDataForModule(accountHolder, 'recommendations/{username}', forceRefresh, platform);
    if (data.length === 0) {
      res.status(404).json({ error: `No ${platform} recommendation files found` });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error(`Retrieve ${platform} strategies endpoint error for ${accountHolder}:`, error);
    
    // Try to use cached data as fallback
    let prefix;
    if (platform === 'twitter') {
      prefix = `recommendations/twitter/${accountHolder}`;
    } else {
      prefix = `recommendations/${accountHolder}`;
    }
    
    if (cache.has(prefix)) {
      console.log(`[${new Date().toISOString()}] Using cached ${platform} recommendations as fallback for ${accountHolder}`);
      const cachedData = cache.get(prefix);
      if (cachedData && cachedData.length > 0) {
        return res.json(cachedData);
      }
    }
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: `${platform.charAt(0).toUpperCase() + platform.slice(1)} data not ready yet` });
    } else {
      res.status(500).json({ error: `Error retrieving ${platform} data`, details: error.message });
    }
  }
});

app.get('/retrieve-engagement-strategies/:accountHolder', async (req, res) => {
  const { accountHolder } = req.params;
  const forceRefresh = req.query.forceRefresh === 'true';
  const platform = req.query.platform || 'instagram'; // Default to Instagram

  try {
    const data = await fetchDataForModule(accountHolder, 'engagement_strategies/{username}', forceRefresh, platform);
    if (data.length === 0) {
      res.status(404).json({ error: `No ${platform} engagement strategy files found` });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error(`Retrieve ${platform} engagement strategies endpoint error for ${accountHolder}:`, error);
    
    // Try to use cached data as fallback
    let prefix;
    if (platform === 'twitter') {
      prefix = `engagement_strategies/twitter/${accountHolder}`;
    } else {
      prefix = `engagement_strategies/${accountHolder}`;
    }
    
    if (cache.has(prefix)) {
      console.log(`[${new Date().toISOString()}] Using cached ${platform} engagement strategies as fallback for ${accountHolder}`);
      const cachedData = cache.get(prefix);
      if (cachedData && cachedData.length > 0) {
        return res.json(cachedData);
      }
    }
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: `${platform.charAt(0).toUpperCase() + platform.slice(1)} data not ready yet` });
    } else {
      res.status(500).json({ error: `Error retrieving ${platform} data`, details: error.message });
    }
  }
});

app.get('/news-for-you/:accountHolder', async (req, res) => {
  const { accountHolder } = req.params;
  const forceRefresh = req.query.forceRefresh === 'true';
  const platform = req.query.platform || 'instagram'; // Default to Instagram

  try {
    const data = await fetchDataForModule(accountHolder, 'NewForYou/{username}', forceRefresh, platform);
    if (data.length === 0) {
      res.status(404).json({ error: `No ${platform} news files found` });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error(`Retrieve ${platform} news endpoint error for ${accountHolder}:`, error);
    
    // Try to use cached data as fallback
    let prefix;
    if (platform === 'twitter') {
      prefix = `NewForYou/twitter/${accountHolder}`;
    } else {
      prefix = `NewForYou/${accountHolder}`;
    }
    
    if (cache.has(prefix)) {
      console.log(`[${new Date().toISOString()}] Using cached ${platform} news as fallback for ${accountHolder}`);
      const cachedData = cache.get(prefix);
      if (cachedData && cachedData.length > 0) {
        return res.json(cachedData);
      }
    }
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: `${platform.charAt(0).toUpperCase() + platform.slice(1)} data not ready yet` });
    } else {
      res.status(500).json({ error: `Error retrieving ${platform} data`, details: error.message });
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
  const { username } = req.params;
  const forceRefresh = req.query.forceRefresh === 'true';
  const platform = req.query.platform || 'instagram'; // Default to Instagram

  try {
    const data = await fetchDataForModule(username, 'queries/{username}', forceRefresh, platform);
    res.json(data);
  } catch (error) {
    console.error(`Retrieve ${platform} responses error for ${username}:`, error);
    
    // Try to use cached data as fallback if available
    let prefix;
    if (platform === 'twitter') {
      prefix = `queries/twitter/${username}`;
    } else {
      prefix = `queries/${username}`;
    }
    
    if (cache.has(prefix)) {
      console.log(`[${new Date().toISOString()}] Using cached ${platform} responses as fallback for ${username}`);
      return res.json(cache.get(prefix));
    }
    
    res.status(500).json({ error: `Error retrieving ${platform} responses`, details: error.message });
  }
});

app.post('/responses/:username/:responseId', async (req, res) => {
  const { username, responseId } = req.params;

  const key = `queries/${username}/response_${responseId}.json`;
  const prefix = `queries/${username}/`;

  try {
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

    cache.delete(prefix);

    res.json({ success: true, message: 'Response status updated' });
  } catch (error) {
    console.error(`Update response error for ${key}:`, error);
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: 'Response not found' });
    } else {
      res.status(500).json({ error: 'Error updating response', details: error.message });
    }
  }
});

app.get('/retrieve-account-info/:username', async (req, res) => {
  const { username } = req.params;
  const platform = req.query.platform || 'instagram'; // Default to Instagram
  
  // Normalize the username to lowercase for Instagram, keep original case for Twitter
  const normalizedUsername = platform === 'twitter' ? username.trim() : username.trim().toLowerCase();
  
  // Create platform-specific key using new schema: AccountInfo/<platform>/<username>/info.json
  const key = `AccountInfo/${platform}/${normalizedUsername}/info.json`;
  const prefix = `AccountInfo/${platform}/${normalizedUsername}`;

  try {
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
    if (cache.has(prefix)) {
      console.log(`[${new Date().toISOString()}] Using cached account info as fallback for ${normalizedUsername}`);
      const cachedData = cache.get(prefix);
      const cachedAccountInfo = cachedData?.find(item => item.key === key)?.data;
      if (cachedAccountInfo) {
        return res.json(cachedAccountInfo);
      }
    }
    
    console.error(`Error retrieving account info for ${key}:`, error.message);
    res.status(500).json({ error: 'Failed to retrieve account info', details: error.message });
  }
});

app.get('/posts/:username', async (req, res) => {
  const { username } = req.params;
  const forceRefresh = req.query.forceRefresh === 'true';
  const platform = req.query.platform || 'instagram'; // Default to Instagram
  
  // Create platform-specific prefix using new schema: ready_post/<platform>/<username>/
  const prefix = `ready_post/${platform}/${username}/`;

  try {
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

    console.log(`Fetching ${platform} posts from R2 for prefix: ${prefix}`);
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: prefix,
    });
    const listResponse = await s3Client.send(listCommand);

    const files = listResponse.Contents || [];
    
    // First, collect all files
    const jsonFiles = files.filter(file => file.Key.endsWith('.json'));
    const jpgFiles = files.filter(file => file.Key.endsWith('.jpg'));
    
    console.log(`[${new Date().toISOString()}] Found ${jsonFiles.length} JSON files and ${jpgFiles.length} JPG files in ${prefix} for ${platform}`);
    
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
            `${prefix}image_${fileId}.jpg`, 
            `${prefix}ready_post_${fileId}.jpg`
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

// This endpoint updates the user's Twitter username entry state
app.post('/user-twitter-status/:userId', async (req, res) => {
  // Set CORS headers
  setCorsHeaders(res);
  
  const { userId } = req.params;
  const { twitter_username } = req.body;
  
  if (!twitter_username || !twitter_username.trim()) {
    return res.status(400).json({ error: 'Twitter username is required' });
  }
  
  try {
    const key = `UserTwitterStatus/${userId}/status.json`;
    const userData = {
      uid: userId,
      hasEnteredTwitterUsername: true,
      twitter_username: twitter_username.trim(),
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