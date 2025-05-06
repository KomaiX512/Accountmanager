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
  endpoint: 'https://9069781eea9a108d41848d73443b3a87.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: 'b94be077bc48dcc2aec3e4331233327e',
    secretAccessKey: '791d5eeddcd8ed5bf3f41bfaebbd37e58af7dcb12275b1422747605d7dc75bc4',
  },
  maxAttempt: 3,
  httpOptions: {
    connectTimeout: 50000,
    timeout: 100000,
  },
});

// Add this helper after your imports, before routes
function setCorsHeaders(res, origin = '*') {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type');
}

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: '*',
  exposedHeaders: ['Content-Type'],
}));

app.use(express.json());

app.options('*', (req, res) => {
  console.log(`[${new Date().toISOString()}] OPTIONS request received for ${req.url}`);
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'Content-Type',
  });
  res.status(204).send();
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
      const match = key.match(/^(.*?)\/(.*?)\/(.*)$/);
      if (match) {
        const [, prefix, username] = match;
        const cacheKey = `${prefix}/${username}`;
        console.log(`Invalidating cache for ${cacheKey}`);
        cache.delete(cacheKey);

        // Enhanced broadcast with tracking
        const result = broadcastUpdate(username, { 
          type: 'update', 
          prefix: cacheKey,
          timestamp: Date.now(),
          key: key
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
async function fetchDataForModule(username, prefixTemplate, forceRefresh = false) {
  if (!username) {
    console.error('No username provided, cannot fetch data');
    return [];
  }

  const prefix = prefixTemplate.replace('{username}', username);
  
  // Check if we should use cache based on the enhanced caching rules
  if (!forceRefresh && shouldUseCache(prefix)) {
    return cache.get(prefix);
  }

  try {
    console.log(`[${new Date().toISOString()}] Fetching fresh data from R2 for prefix: ${prefix}`);
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: prefix,
    });
    const listResponse = await s3Client.send(listCommand);

    const files = listResponse.Contents || [];
    const data = await Promise.all(
      files.map(async (file) => {
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
          return { key: file.Key, data: parsedData };
        } catch (error) {
          console.error(`Failed to process file ${file.Key}:`, error.message);
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
    console.error(`Error fetching data for prefix ${prefix}:`, error);
    // Return cached data as fallback if available
    if (cache.has(prefix)) {
      console.log(`[${new Date().toISOString()}] Using cached data as fallback for ${prefix} due to fetch error`);
      return cache.get(prefix);
    }
    return [];
  }
}

// Add OPTIONS handler for proxy-image endpoint
app.options('/proxy-image', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.sendStatus(204);
});

// Completely revamped proxy-image endpoint to handle Instagram CORS issues
app.get('/proxy-image', async (req, res) => {
  let { url, t, fallback } = req.query;
  if (!url) return res.status(400).send('Image URL is required');
  
  try {
    if (Array.isArray(url)) url = url[0];
    const decodedUrl = decodeURIComponent(url);
    
    // Log the request
    console.log(`[proxy-image] Processing request for: ${decodedUrl.substring(0, 100)}...`);
    
    // Check if the URL is from Instagram
    const isInstagramUrl = decodedUrl.includes('cdninstagram.com') || 
                          decodedUrl.includes('fbcdn.net') || 
                          decodedUrl.includes('instagram.com');
    
    // If we're dealing with an Instagram URL, store it in a local cache file
    // to avoid repeated downloads and potential rate limiting
    let imageData;
    if (isInstagramUrl) {
      // Create a unique filename based on the URL hash
      const crypto = require('crypto');
      const urlHash = crypto.createHash('md5').update(decodedUrl).digest('hex');
      const cachePath = `./temp_image_cache/${urlHash}.jpg`;
      
      // Ensure temp directory exists
      const fs = require('fs');
      try {
        if (!fs.existsSync('./temp_image_cache')) {
          fs.mkdirSync('./temp_image_cache', { recursive: true });
        }
      } catch (fsError) {
        console.error('[proxy-image] Error creating cache directory:', fsError);
      }
      
      try {
        // Check if we have a cached version that's less than 24 hours old
        if (fs.existsSync(cachePath)) {
          const stats = fs.statSync(cachePath);
          const fileAge = Date.now() - stats.mtimeMs;
          
          // Use cache if file is less than 24 hours old
          if (fileAge < 24 * 60 * 60 * 1000) {
            console.log(`[proxy-image] Using cached image for ${urlHash}`);
            imageData = fs.readFileSync(cachePath);
          }
        }
      } catch (cacheError) {
        console.error('[proxy-image] Cache access error:', cacheError);
      }
      
      // If we don't have cached data, download the image
      if (!imageData) {
        console.log(`[proxy-image] Downloading Instagram image: ${urlHash}`);
        
        // Configure axios with Instagram-friendly headers
        const config = {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.instagram.com/',
            'Origin': 'https://www.instagram.com',
            'Cache-Control': 'no-cache'
          }
        };
        
        try {
          const response = await axios.get(decodedUrl, config);
          imageData = response.data;
          
          // Save to cache
          try {
            fs.writeFileSync(cachePath, imageData);
          } catch (writeError) {
            console.error('[proxy-image] Cache write error:', writeError);
          }
        } catch (downloadError) {
          console.error('[proxy-image] Download error:', downloadError.message);
          try {
            // Try one more time with different User-Agent
            config.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
            const retryResponse = await axios.get(decodedUrl, config);
            imageData = retryResponse.data;
            
            // Save to cache
            try {
              fs.writeFileSync(cachePath, imageData);
            } catch (writeError) {
              console.error('[proxy-image] Cache write error:', writeError);
            }
          } catch (retryError) {
            console.error('[proxy-image] Retry download error:', retryError.message);
            throw retryError; // Re-throw to trigger fallback
          }
        }
      }
    } else {
      // For non-Instagram URLs, just fetch directly
      const response = await axios.get(decodedUrl, {
        responseType: 'arraybuffer',
        timeout: 10000
      });
      imageData = response.data;
    }
    
    // Determine content type
    let contentType = 'image/jpeg'; // Default
    try {
      const fileTypeResult = await fileTypeFromBuffer(imageData);
      if (fileTypeResult && fileTypeResult.mime) {
        contentType = fileTypeResult.mime;
      }
    } catch (typeError) {
      console.error('[proxy-image] Error detecting file type:', typeError);
    }
    
    // Process the image with Sharp to validate it, potentially resize/optimize if needed
    try {
      const sharp = require('sharp');
      const processedImage = await sharp(imageData)
        .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
        .toBuffer();
      
      // Set response headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      
      // Send the processed image
      res.send(processedImage);
    } catch (sharpError) {
      console.error('[proxy-image] Image processing error:', sharpError);
      throw sharpError; // Re-throw to trigger fallback
    }
  } catch (error) {
    console.error('[proxy-image] Error fetching or processing image:', error.message);
    
    // If fallback=pixel is specified, return a transparent 1x1 pixel
    if (fallback === 'pixel') {
      const transparentPixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(transparentPixel);
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).send('Error fetching image');
  }
});

app.get('/profile-info/:username', async (req, res) => {
  const { username } = req.params;
  const forceRefresh = req.query.forceRefresh === 'true';
  const key = `ProfileInfo/${username}.json`;
  const prefix = `ProfileInfo/${username}`;

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
    const { username, accountType, postingStyle, competitors } = req.body;

    if (!username || !accountType || !postingStyle) {
      return res.status(400).json({ error: 'Username, account type, and posting style are required' });
    }

    // Normalize the username to lowercase
    const normalizedUsername = username.trim().toLowerCase();

    // Check if the username is already in use (for logging purposes)
    const key = `AccountInfo/${normalizedUsername}/info.json`;
    let isUsernameAlreadyInUse = false;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      await s3Client.send(getCommand);
      isUsernameAlreadyInUse = true;
      console.warn(`Warning: Username '${normalizedUsername}' is already in use by another account, but allowing save operation`);
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
      ...(competitors && { competitors: competitors.map(c => c.trim().toLowerCase()) }),
      timestamp: new Date().toISOString(),
    };

    console.log(`Saving account info to: ${key}`);
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(payload, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);

    const cacheKey = `AccountInfo/${normalizedUsername}`;
    cache.delete(cacheKey);

    res.json({ 
      success: true, 
      message: 'Account info saved successfully',
      isUsernameAlreadyInUse
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
        const prefix = `${prefixTemplate}/${currentUsername}`;
        console.log(`Clearing cache for ${prefix}`);
        cache.delete(prefix);
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

  if (!competitorsParam || typeof competitorsParam !== 'string') {
    return res.status(400).json({ error: 'Competitors query parameter is required and must be a string' });
  }

  const competitors = competitorsParam.split(',').map(c => c.trim()).filter(c => c.length > 0);

  try {
    const results = await Promise.all(
      competitors.map(async (competitor) => {
        try {
          const data = await fetchDataForModule(accountHolder, `competitor_analysis/{username}/${competitor}`, forceRefresh);
          return { competitor, data };
        } catch (error) {
          console.error(`Error fetching data for ${accountHolder}/${competitor}:`, error);
          // Try to use cached data as fallback
          const prefix = `competitor_analysis/${accountHolder}/${competitor}`;
          if (cache.has(prefix)) {
            console.log(`[${new Date().toISOString()}] Using cached data as fallback for ${prefix}`);
            return { competitor, data: cache.get(prefix) };
          }
          return { competitor, data: [], error: error.message };
        }
      })
    );
    res.json(results);
  } catch (error) {
    console.error(`Retrieve multiple endpoint error for ${accountHolder}:`, error);
    res.status(500).json({ error: 'Error retrieving data for multiple competitors', details: error.message });
  }
});

app.get('/retrieve-strategies/:accountHolder', async (req, res) => {
  const { accountHolder } = req.params;
  const forceRefresh = req.query.forceRefresh === 'true';

  try {
    const data = await fetchDataForModule(accountHolder, 'recommendations/{username}', forceRefresh);
    if (data.length === 0) {
      res.status(404).json({ error: 'No recommendation files found' });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error(`Retrieve strategies endpoint error for ${accountHolder}:`, error);
    
    // Try to use cached data as fallback
    const prefix = `recommendations/${accountHolder}`;
    if (cache.has(prefix)) {
      console.log(`[${new Date().toISOString()}] Using cached recommendations as fallback for ${accountHolder}`);
      const cachedData = cache.get(prefix);
      if (cachedData && cachedData.length > 0) {
        return res.json(cachedData);
      }
    }
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: 'Data not ready yet' });
    } else {
      res.status(500).json({ error: 'Error retrieving data', details: error.message });
    }
  }
});

app.get('/retrieve-engagement-strategies/:accountHolder', async (req, res) => {
  const { accountHolder } = req.params;
  const forceRefresh = req.query.forceRefresh === 'true';

  try {
    const data = await fetchDataForModule(accountHolder, 'engagement_strategies/{username}', forceRefresh);
    if (data.length === 0) {
      res.status(404).json({ error: 'No engagement strategy files found' });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error(`Retrieve engagement strategies endpoint error for ${accountHolder}:`, error);
    
    // Try to use cached data as fallback
    const prefix = `engagement_strategies/${accountHolder}`;
    if (cache.has(prefix)) {
      console.log(`[${new Date().toISOString()}] Using cached engagement strategies as fallback for ${accountHolder}`);
      const cachedData = cache.get(prefix);
      if (cachedData && cachedData.length > 0) {
        return res.json(cachedData);
      }
    }
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: 'Data not ready yet' });
    } else {
      res.status(500).json({ error: 'Error retrieving data', details: error.message });
    }
  }
});

app.get('/news-for-you/:accountHolder', async (req, res) => {
  const { accountHolder } = req.params;
  const forceRefresh = req.query.forceRefresh === 'true';

  try {
    const data = await fetchDataForModule(accountHolder, 'NewForYou/{username}', forceRefresh);
    if (data.length === 0) {
      res.status(404).json({ error: 'No news files found' });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error(`Retrieve news endpoint error for ${accountHolder}:`, error);
    
    // Try to use cached data as fallback
    const prefix = `NewForYou/${accountHolder}`;
    if (cache.has(prefix)) {
      console.log(`[${new Date().toISOString()}] Using cached news as fallback for ${accountHolder}`);
      const cachedData = cache.get(prefix);
      if (cachedData && cachedData.length > 0) {
        return res.json(cachedData);
      }
    }
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: 'Data not ready yet' });
    } else {
      res.status(500).json({ error: 'Error retrieving data', details: error.message });
    }
  }
});

app.post('/save-query/:accountHolder', async (req, res) => {
  const { accountHolder } = req.params;
  const { query } = req.body;

  const prefix = `queries/${accountHolder}/`;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query must be a non-empty string' });
  }

  try {
    let queryNumber = 1;
    if (cache.has(prefix)) {
      const cachedData = cache.get(prefix);
      const queryNumbers = cachedData
        .filter(obj => obj.key.match(/query_\d+\.json$/))
        .map(file => {
          const match = file.key.match(/query_(\d+)\.json$/);
          return match ? parseInt(match[1]) : 0;
        });
      queryNumber = queryNumbers.length ? Math.max(...queryNumbers) + 1 : 1;
    }

    const queryKey = `${prefix}query_${queryNumber}.json`;
    const queryData = {
      query: query.trim(),
      status: 'pending',
      timestamp: new Date().toISOString(),
    };
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: queryKey,
      Body: JSON.stringify(queryData, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);

    cache.delete(prefix);

    res.json({ success: true, message: 'Query saved successfully' });
  } catch (error) {
    console.error(`Save query error for ${prefix}:`, error);
    res.status(500).json({ error: 'Error saving query', details: error.message });
  }
});

app.get('/rules/:username', async (req, res) => {
  const { username } = req.params;

  const key = `rules/${username}/rules.json`;
  const prefix = `rules/${username}/`;

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

  const key = `rules/${username}/rules.json`;
  const prefix = `rules/${username}/`;

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

  try {
    const data = await fetchDataForModule(username, 'queries/{username}', forceRefresh);
    res.json(data);
  } catch (error) {
    console.error(`Retrieve responses error for ${username}:`, error);
    
    // Try to use cached data as fallback if available
    const prefix = `queries/${username}`;
    if (cache.has(prefix)) {
      console.log(`[${new Date().toISOString()}] Using cached responses as fallback for ${username}`);
      return res.json(cache.get(prefix));
    }
    
    res.status(500).json({ error: 'Error retrieving responses', details: error.message });
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
  
  // Normalize the username to lowercase
  const normalizedUsername = username.trim().toLowerCase();
  
  const key = `AccountInfo/${normalizedUsername}/info.json`;
  const prefix = `AccountInfo/${normalizedUsername}`;

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
  const prefix = `ready_post/${username}/`;

  try {
    // Check if we should use cache based on PostCooked TTL config (3 hours)
    if (!forceRefresh && shouldUseCache(prefix)) {
      console.log(`[${new Date().toISOString()}] Serving posts from cache for ${username}`);
      return res.json(cache.get(prefix));
    }

    console.log(`[${new Date().toISOString()}] Fetching posts from R2 for prefix: ${prefix}`);
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: prefix,
    });
    const listResponse = await s3Client.send(listCommand);

    const files = listResponse.Contents || [];
    const postFiles = files.filter(file => file.Key.match(/ready_post_\d+\.json$/));
    const imageFiles = files.filter(file => file.Key.match(/image_\d+\.jpg$/));

    const posts = await Promise.all(
      postFiles.map(async (file) => {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: file.Key,
          });
          const data = await s3Client.send(getCommand);
          const body = await streamToString(data.Body);

          if (!body || body.trim() === '') {
            console.warn(`[${new Date().toISOString()}] Empty file detected at ${file.Key}, skipping...`);
            return null;
          }

          const postData = JSON.parse(body);
          const postIdMatch = file.Key.match(/ready_post_(\d+)\.json$/);
          const postId = postIdMatch ? postIdMatch[1] : null;

          if (!postId) return null;

          const imageFile = imageFiles.find(img => img.Key === `${prefix}image_${postId}.jpg`);
          if (!imageFile) {
            console.warn(`[${new Date().toISOString()}] No matching image found for post ${file.Key}, skipping...`);
            return null;
          }

          const imageCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: imageFile.Key,
          });
          const signedUrl = await getSignedUrl(s3Client, imageCommand, { expiresIn: 3600 });

          return {
            key: file.Key,
            data: {
              ...postData,
              image_url: signedUrl,
            },
          };
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Failed to process post ${file.Key}:`, error.message);
          return null;
        }
      })
    );

    const validPosts = posts.filter(post => post !== null);
    
    // Update cache with PostCooked TTL (3 hours)
    cache.set(prefix, validPosts);
    cacheTimestamps.set(prefix, Date.now());
    
    console.log(`[${new Date().toISOString()}] Returning ${validPosts.length} posts for ${username}`);
    res.json(validPosts);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Retrieve posts error for ${username}:`, error);
    
    // Fallback to cache if available
    if (cache.has(prefix)) {
      console.log(`[${new Date().toISOString()}] Using cached posts as fallback for ${username}`);
      return res.json(cache.get(prefix));
    }
    
    res.status(500).json({ error: 'Error retrieving posts', details: error.message });
  }
});

app.post('/feedback/:username', async (req, res) => {
  const { username } = req.params;
  const { responseKey, feedback, type } = req.body;

  const prefix = `feedbacks/${username}/`;

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
const REDIRECT_URI = 'https://b697-121-52-146-243.ngrok-free.app/instagram/callback';
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
  const { userId } = req.params;
  const { sender_id, text, message_id } = req.body;

  if (!sender_id || !text || !message_id) {
    console.log(`[${new Date().toISOString()}] Missing required fields for DM reply`);
    return res.status(400).send('Missing sender_id, text, or message_id');
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
    const instagram_graph_id = tokenData.instagram_graph_id;

    // Send the DM reply
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
      message_id: response.data.id || `reply_${Date.now()}`,
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

    res.json({ success: true, message_id: response.data.id });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error sending DM reply:`, error.response?.data || error.message);
    res.status(500).send('Error sending DM reply');
  }
});

// Send Comment Reply
app.post('/send-comment-reply/:userId', async (req, res) => {
  const { userId } = req.params;
  const { comment_id, text } = req.body;

  if (!comment_id || !text) {
    console.log(`[${new Date().toISOString()}] Missing required fields for comment reply`);
    return res.status(400).send('Missing comment_id or text');
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
  const { message_id, comment_id } = req.body;

  if (!message_id && !comment_id) {
    console.log(`[${new Date().toISOString()}] Missing message_id or comment_id for ignore action`);
    return res.status(400).json({ error: 'Missing message_id or comment_id' });
  }

  try {
    // Find username if available
    let username = null;
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
            if (token.instagram_user_id === userId) {
              username = token.username;
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error finding username for user ID ${userId}:`, err.message);
    }
    
    const fileKey = message_id 
      ? `InstagramEvents/${userId}/${message_id}.json`
      : `InstagramEvents/${userId}/comment_${comment_id}.json`;

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
      console.log(`[${new Date().toISOString()}] Updated notification status to ignored at ${fileKey}`);
      
      // Invalidate cache
      cache.delete(`InstagramEvents/${userId}`);
      if (username) cache.delete(`InstagramEvents/${username}`);
      
      // Broadcast status update
      const statusUpdate = {
        type: message_id ? 'message_status' : 'comment_status',
        [message_id ? 'message_id' : 'comment_id']: message_id || comment_id,
        status: 'ignored',
        updated_at: notifData.updated_at,
        timestamp: Date.now()
      };
      
      broadcastUpdate(userId, { event: 'status_update', data: statusUpdate });
      if (username) broadcastUpdate(username, { event: 'status_update', data: statusUpdate });
      
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        console.log(`[${new Date().toISOString()}] Notification file not found at ${fileKey}, proceeding`);
      } else {
        throw error;
      }
    }

    res.json({ success: true, updated: !!updatedItem });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error ignoring notification:`, error.message || error);
    res.status(500).json({ error: 'Failed to ignore notification', details: error.message || 'Unknown error' });
  }
});

// List Stored Events
app.get('/events-list/:userId', async (req, res) => {
  setCorsHeaders(res);
  const userId = req.params.userId;

  try {
    // Real-time data should never be cached
    const prefix = `InstagramEvents/${userId}/`;
    console.log(`[${new Date().toISOString()}] Fetching fresh events list for user ${userId}`);
    
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: prefix
    });
    const { Contents } = await s3Client.send(listCommand);

    const events = [];
    if (Contents) {
      await Promise.all(Contents.map(async (obj) => {
        // Only process .json files and skip replies
        if (!obj.Key.endsWith('.json')) return;
        if (obj.Key.includes('reply_') || obj.Key.includes('comment_reply_')) return;
        
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: obj.Key
          });
          const { Body } = await s3Client.send(getCommand);
          const data = await Body.transformToString();
          const event = JSON.parse(data);
          if (event.status === 'pending') {
            events.push(event);
          }
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Error processing event file ${obj.Key}:`, error.message);
        }
      }));
    }

    // Sort events by timestamp (newest first)
    events.sort((a, b) => {
      const timeA = a.timestamp || Date.parse(a.received_at);
      const timeB = b.timestamp || Date.parse(b.received_at);
      return timeB - timeA;
    });

    console.log(`[${new Date().toISOString()}] Retrieved ${events.length} pending events for user ${userId}`);
    res.json(events);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error retrieving events for user ${userId}:`, error);
    res.status(500).send('Error retrieving events');
  }
});

// Add explicit OPTIONS handler for /events-list/:userId
app.options('/events-list/:userId', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// SSE Endpoint
app.get('/events/:userId', (req, res) => {
  const userId = req.params.userId;
  console.log(`[${new Date().toISOString()}] Handling SSE request for /events/${userId}`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type');
  res.flushHeaders();

  if (!sseClients[userId]) {
    sseClients[userId] = [];
  }

  sseClients[userId].push(res);
  console.log(`[${new Date().toISOString()}] SSE client connected for ${userId}. Total clients: ${sseClients[userId].length}`);

  const heartbeatInterval = setInterval(() => {
    res.write('data: {"type":"heartbeat"}\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeatInterval);
    sseClients[userId] = sseClients[userId].filter(client => client !== res);
    console.log(`[${new Date().toISOString()}] SSE client disconnected for ${userId}. Total clients: ${sseClients[userId].length}`);
    res.end();
  });
});

// Public R2.dev URL
const R2_PUBLIC_URL = 'https://pub-ba72672df3c041a3844f278dd3c32b22.r2.dev';

app.post('/schedule-post/:userId', upload.single('image'), async (req, res) => {
  const { userId } = req.params;
  let { caption, scheduleDate } = req.body;
  let file = req.file;
  let baseFilename = file.originalname.replace(/\.[^.]+$/, '');

  console.log(`[${new Date().toISOString()}] Received schedule-post request for user ${userId}: image=${!!file}, caption=${!!caption}, scheduleDate=${scheduleDate}`);

  if (!file || !caption || !scheduleDate) {
    console.log(`[${new Date().toISOString()}] Missing required fields: image=${!!file}, caption=${!!caption}, scheduleDate=${!!scheduleDate}`);
    return res.status(400).json({ error: 'Missing image, caption, or scheduleDate' });
  }

  try {
    // Validate image file type
    let format;
    let buffer = file.buffer;
    let fileInfo;
    try {
      fileInfo = await fileTypeFromBuffer(buffer);
      format = fileInfo?.mime.split('/')[1];
      console.log(`[${new Date().toISOString()}] Image format (file-type): ${format || 'unknown'}, mime: ${file.mimetype}, size: ${file.size} bytes, buffer_length: ${buffer.length}`);
    } catch (fileTypeError) {
      console.error(`[${new Date().toISOString()}] fileType validation failed:`, fileTypeError.message);
      format = file.mimetype.split('/')[1]; // Fallback to multer mime
    }
    // Convert to jpeg if not jpeg/png and ensure Instagram-compatible dimensions
    if (!['jpeg', 'png'].includes(format)) {
      console.log(`[${new Date().toISOString()}] Converting image from ${format} to jpeg using sharp...`);
      try {
        let image = sharp(buffer);
        const metadata = await image.metadata();
        let { width, height } = metadata;
        const minDim = 320;
        const maxDim = 1080;
        let aspect = width / height;
        if (width < minDim || height < minDim || width > maxDim || height > maxDim || aspect < 0.8 || aspect > 1.91) {
          console.log(`[${new Date().toISOString()}] Resizing and cropping image to 1080x1080 for Instagram compliance...`);
          image = image.resize(1080, 1080, { fit: 'cover', position: 'center' });
        }
        buffer = await image
          .jpeg({ progressive: false, force: true })
          .toColourspace('srgb')
          .withMetadata({ exif: undefined, icc: undefined })
          .toBuffer();
        fileInfo = await fileTypeFromBuffer(buffer);
        format = fileInfo?.mime.split('/')[1];
        file.mimetype = 'image/jpeg';
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        let uniqueFilename = `${baseFilename}_${uniqueSuffix}.jpg`;
        file.originalname = uniqueFilename;
        file.size = buffer.length;
        file.buffer = buffer;
        console.log(`[${new Date().toISOString()}] Conversion and resize successful. New format: ${format}, size: ${buffer.length}`);
      } catch (convertErr) {
        console.error(`[${new Date().toISOString()}] Failed to convert/resize image to jpeg:`, convertErr.message);
        return res.status(400).json({ error: 'Failed to convert/resize image to JPEG' });
      }
    }
    if (!format || !['jpeg', 'png'].includes(format)) {
      console.log(`[${new Date().toISOString()}] Invalid image format after conversion: ${format || 'unknown'}`);
      return res.status(400).json({ error: 'Image must be JPEG or PNG' });
    }
    if (file.size > 8 * 1024 * 1024) {
      console.log(`[${new Date().toISOString()}] Image size too large: ${file.size} bytes`);
      return res.status(400).json({ error: 'Image size exceeds 8MB' });
    }

    // Truncate caption to 2200 characters
    if (caption.length > 2200) {
      console.warn(`[${new Date().toISOString()}] Caption too long (${caption.length} chars), truncating to 2200 chars`);
      caption = caption.slice(0, 2200);
    }
    console.log(`[${new Date().toISOString()}] Caption length after truncation: ${caption.length} chars`);

    // Validate caption
    if (caption.length > 2200) {
      console.log(`[${new Date().toISOString()}] Caption still too long after truncation: ${caption.length} characters`);
      return res.status(400).json({ error: 'Caption exceeds 2200 characters after truncation' });
    }
    const hashtags = (caption.match(/#[^\s#]+/g) || []).length;
    if (hashtags > 30) {
      console.log(`[${new Date().toISOString()}] Too many hashtags: ${hashtags}`);
      return res.status(400).json({ error: 'Maximum 30 hashtags allowed' });
    }

    // Validate schedule date
    let scheduleTime = new Date(scheduleDate);
    const now = new Date();
    const minSchedule = new Date(now.getTime() + 60 * 1000); // at least 1 min in future
    const maxDate = new Date(now.getTime() + 75 * 24 * 60 * 60 * 1000);
    if (isNaN(scheduleTime.getTime()) || scheduleTime > maxDate) {
      console.log(`[${new Date().toISOString()}] Invalid schedule date: ${scheduleDate}`);
      return res.status(400).json({ error: 'Schedule date must be within 75 days from now' });
    }
    if (scheduleTime <= now) {
      console.warn(`[${new Date().toISOString()}] scheduleDate is in the past or now; auto-correcting to now + 1 min.`);
      scheduleTime = minSchedule;
    } else if (scheduleTime < minSchedule) {
      console.warn(`[${new Date().toISOString()}] scheduleDate is less than 1 min in the future; auto-correcting to now + 1 min.`);
      scheduleTime = minSchedule;
    }
    console.log(`[${new Date().toISOString()}] Scheduling post with scheduleDate: ${scheduleDate}, corrected scheduleTime: ${scheduleTime.toISOString()}`);

    // Fetch access token
    console.log(`[${new Date().toISOString()}] Fetching token for user ${userId}`);
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
          if (token.instagram_user_id === userId) {
            tokenData = token;
            break;
          }
        }
      }
    }

    if (!tokenData) {
      console.log(`[${new Date().toISOString()}] No token found for instagram_user_id ${userId}`);
      return res.status(404).json({ error: 'No access token found for this Instagram account' });
    }

    const access_token = tokenData.access_token;
    const instagram_graph_id = tokenData.instagram_graph_id;
    console.log(`[${new Date().toISOString()}] Token found: graph_id=${instagram_graph_id}`);

    // Robust R2 upload and validation
    let uploadAttempts = 0;
    let imageKey, imageUrl, validUpload = false;
    while (uploadAttempts < 3 && !validUpload) {
      uploadAttempts++;
      imageKey = `InstagramEvents/${userId}/${baseFilename}_${Date.now()}_${Math.round(Math.random() * 1e9)}.jpg`;
      console.log(`[${new Date().toISOString()}] Uploading image to R2: ${imageKey}, ContentType: image/jpeg`);
      const putCommand = new PutObjectCommand({
        Bucket: 'tasks',
        Key: imageKey,
        Body: file.buffer,
        ContentType: 'image/jpeg',
        ACL: 'public-read',
      });
      await s3Client.send(putCommand);

      imageUrl = `${R2_PUBLIC_URL}/${imageKey}`;
      console.log(`[${new Date().toISOString()}] Testing R2 image URL: ${imageUrl}`);
      try {
        const urlTest = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
        const contentType = urlTest.headers['content-type'];
        const testBuffer = Buffer.from(urlTest.data);
        const testType = await fileTypeFromBuffer(testBuffer);
        if (contentType === 'image/jpeg' && testType?.mime === 'image/jpeg') {
          console.log(`[${new Date().toISOString()}] R2 URL accessible and valid JPEG (attempt ${uploadAttempts}): 200`);
          validUpload = true;
        } else {
          console.warn(`[${new Date().toISOString()}] R2 URL not valid JPEG (attempt ${uploadAttempts}): contentType=${contentType}, fileType=${testType?.mime}`);
          file.buffer = await sharp(file.buffer)
            .jpeg({ progressive: false, force: true })
            .toColourspace('srgb')
            .withMetadata({ exif: undefined, icc: undefined })
            .toBuffer();
        }
      } catch (urlError) {
        console.error(`[${new Date().toISOString()}] R2 URL inaccessible (attempt ${uploadAttempts}):`, urlError.message);
        file.buffer = await sharp(file.buffer)
          .jpeg({ progressive: false, force: true })
          .toColourspace('srgb')
          .withMetadata({ exif: undefined, icc: undefined })
          .toBuffer();
      }
    }
    if (!validUpload) {
      return res.status(500).json({ error: 'Failed to upload a valid JPEG image to R2 after 3 attempts.' });
    }

    // Create media object
    console.log(`[${new Date().toISOString()}] Creating media object for graph_id ${instagram_graph_id}`);
    const mediaResponse = await axios.post(
      `https://graph.instagram.com/v21.0/${instagram_graph_id}/media`,
      {
        image_url: imageUrl,
        caption,
        is_carousel_item: false,
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const mediaId = mediaResponse.data.id;
    if (!mediaId) {
      console.log(`[${new Date().toISOString()}] Failed to create media object: ${JSON.stringify(mediaResponse.data)}`);
      throw new Error('Failed to create media object');
    }
    console.log(`[${new Date().toISOString()}] Media object created: media_id=${mediaId}`);

    // Store scheduled post details in R2 (before scheduling, using mediaId)
    const scheduledPostKey = `InstagramScheduledPosts/${userId}/${mediaId}.json`;
    const scheduledPostData = {
      userId,
      instagram_graph_id,
      media_id: mediaId,
      caption,
      image_key: imageKey,
      schedule_time: scheduleTime.toISOString(),
      created_at: new Date().toISOString(),
      status: 'scheduled',
      access_token, // Store for job execution
    };
    console.log(`[${new Date().toISOString()}] Storing scheduled post: ${scheduledPostKey}`);
    const putScheduledCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: scheduledPostKey,
      Body: JSON.stringify(scheduledPostData, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putScheduledCommand);

    // Schedule the publish job
    console.log(`[${new Date().toISOString()}] Scheduling publish job for media_id=${mediaId} at ${scheduleTime.toISOString()}`);
    const job = schedule.scheduleJob(scheduleTime, async () => {
      try {
        const publishResponse = await axios.post(
          `https://graph.instagram.com/v21.0/${instagram_graph_id}/media_publish`,
          {
            creation_id: mediaId,
          },
          {
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
          }
        );
        const postId = publishResponse.data.id;
        console.log(`[${new Date().toISOString()}] Post published successfully: post_id=${postId}, media_id=${mediaId}`);

        // Update scheduled post status to 'published'
        scheduledPostData.status = 'published';
        scheduledPostData.post_id = postId;
        scheduledPostData.published_at = new Date().toISOString();
        const updateCommand = new PutObjectCommand({
          Bucket: 'tasks',
          Key: scheduledPostKey,
          Body: JSON.stringify(scheduledPostData, null, 2),
          ContentType: 'application/json',
        });
        await s3Client.send(updateCommand);

        // Clean up image after successful publish
        console.log(`[${new Date().toISOString()}] Cleaning up image: ${imageKey}`);
        await s3Client.send(new DeleteObjectCommand({
          Bucket: 'tasks',
          Key: imageKey,
        }));
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Failed to publish post media_id=${mediaId} at ${scheduleTime.toISOString()}:`, error.response?.data || error.message);
        // Update status to 'failed'
        scheduledPostData.status = 'failed';
        scheduledPostData.error = error.response?.data?.error?.message || error.message;
        const updateCommand = new PutObjectCommand({
          Bucket: 'tasks',
          Key: scheduledPostKey,
          Body: JSON.stringify(scheduledPostData, null, 2),
          ContentType: 'application/json',
        });
        await s3Client.send(updateCommand);
      }
    });

    console.log(`[${new Date().toISOString()}] Post scheduled for user ${userId} with media_id=${mediaId} at ${scheduleTime.toISOString()}`);
    res.json({ success: true, media_id: mediaId, status: 'scheduled', message: 'Post scheduled successfully.' });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error scheduling post for user ${userId}:`, error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to schedule post', details: error.response?.data?.error?.message || error.message });
  }
});
import { metrics } from './insightConfigs.js';

app.get('/insights/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log(`[${new Date().toISOString()}] Received insights request for user ${userId}`);

  try {
    // Fetch access token
    console.log(`[${new Date().toISOString()}] Fetching token for user ${userId}`);
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
          if (token.instagram_user_id === userId) {
            tokenData = token;
            break;
          }
        }
      }
    }

    if (!tokenData) {
      console.log(`[${new Date().toISOString()}] No token found for instagram_user_id ${userId}`);
      return res.status(404).json({ error: 'No access token found for this Instagram account' });
    }

    const access_token = tokenData.access_token;
    const instagram_graph_id = tokenData.instagram_graph_id;
    console.log(`[${new Date().toISOString()}] Token found: graph_id=${instagram_graph_id}`);

    // Fetch follower_count directly
    let follower_count = 0;
    try {
      const profileResponse = await axios.get(`https://graph.instagram.com/v22.0/me`, {
        params: {
          fields: 'followers_count',
          access_token,
        },
      });
      follower_count = profileResponse.data.followers_count || 0;
      console.log(`[${new Date().toISOString()}] Fetched follower_count: ${follower_count}`);
    } catch (profileError) {
      console.error(`[${new Date().toISOString()}] Error fetching follower_count:`, profileError.response?.data || profileError.message);
    }

    // Initialize insights data
    const insightsData = {
      follower_count: { lifetime: follower_count },
      reach: { daily: [] },
      impressions: { daily: [] },
      online_followers: { daily: [] },
      accounts_engaged: { daily: [] },
      total_interactions: { daily: [] },
      follower_demographics: { lifetime: {} },
    };

    // Fetch insights
    console.log(`[${new Date().toISOString()}] Fetching insights from Instagram Graph API v22.0`);
    for (const metric of metrics) {
      for (const period of metric.periods) {
        try {
          const response = await axios.get(`https://graph.instagram.com/v22.0/${instagram_graph_id}/insights`, {
            params: {
              metric: metric.name,
              period,
              access_token,
            },
          });
          response.data.data.forEach((item) => {
            if (item.period === 'day') {
              insightsData[item.name].daily = item.values.map(v => ({
                value: v.value,
                end_time: v.end_time,
              }));
            } else if (item.period === 'lifetime') {
              insightsData[item.name].lifetime = item.values[0]?.value || {};
            }
          });
          console.log(`[${new Date().toISOString()}] Fetched metric: ${metric.name} (${period})`);
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Failed to fetch metric ${metric.name} (${period}):`, error.response?.data || error.message);
        }
      }
    }

    // Store in R2
    const insightsKey = `InstagramInsights/${userId}/${Date.now()}.json`;
    const insightsToStore = {
      data: insightsData,
      timestamp: new Date().toISOString(),
    };
    console.log(`[${new Date().toISOString()}] Storing insights in R2: ${insightsKey}`);
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: insightsKey,
      Body: JSON.stringify(insightsToStore, null, 2),
      ContentType: 'application/json',
      ACL: 'public-read',
    });
    await s3Client.send(putCommand);

    // Update latest cache
    console.log(`[${new Date().toISOString()}] Updating latest insights cache: InstagramInsights/${userId}/latest.json`);
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: `InstagramInsights/${userId}/latest.json`,
      Body: JSON.stringify(insightsToStore, null, 2),
      ContentType: 'application/json',
      ACL: 'public-read',
    }));

    console.log(`[${new Date().toISOString()}] Insights fetched and stored for user ${userId}`);
    res.json(insightsData);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching insights:`, error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch insights', details: error.response?.data?.error?.message || error.message });
  }
});
// Instagram Deauthorize Callback
app.post('/instagram/deauthorize', (req, res) => {
  console.log(`[${new Date().toISOString()}] Deauthorize callback received:`, JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// Instagram Data Deletion Request
app.get('/instagram/data-deletion', (req, res) => {
  const signedRequest = req.query.signed_request;
  console.log(`[${new Date().toISOString()}] Data deletion request received:`, signedRequest);
  res.json({
    url: 'https://b697-121-52-146-243.ngrok-free.app/instagram/data-deletion',
    confirmation_code: `delete_${Date.now()}`
  });
});

app.post('/instagram/data-deletion', (req, res) => {
  console.log(`[${new Date().toISOString()}] Data deletion POST request received:`, JSON.stringify(req.body, null, 2));
  res.json({
    url: 'https://b697-121-52-146-243.ngrok-free.app/instagram/data-deletion',
    confirmation_code: `delete_${Date.now()}`
  });
});

async function getExistingData() {
  const key = 'Usernames/instagram.json';
  const prefix = 'Usernames/';

  if (cache.has(prefix)) {
    console.log(`Cache hit for ${prefix}`);
    const cachedData = cache.get(prefix);
    const data = cachedData.find(item => item.key === key)?.data;
    return data || [];
  }

  try {
    const command = new GetObjectCommand({
      Bucket: 'tasks',
      Key: key,
    });
    const data = await s3Client.send(command);
    const body = await streamToString(data.Body);

    if (!body || body.trim() === '') {
      return [];
    }

    const parsedData = JSON.parse(body);
    cache.set(prefix, [{ key, data: parsedData }]);
    cacheTimestamps.set(prefix, Date.now());
    return Array.isArray(parsedData) ? parsedData : [];
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      return [];
    }
    throw error;
  }
}

async function saveToR2(data) {
  const key = 'Usernames/instagram.json';
  const prefix = 'Usernames/';
  const command = new PutObjectCommand({
    Bucket: 'tasks',
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json',
  });
  await s3Client.send(command);
  cache.delete(prefix);
}

function handleErrorResponse(res, error) {
  const statusCode = error.name === 'TimeoutError' ? 504 : 500;
  res.status(statusCode).json({
    error: error.name || 'Internal server error',
    message: error.message || 'An unexpected error occurred',
  });
}

app.post('/save-goal/:username', async (req, res) => {
  const { username } = req.params;
  const { persona = '', timeline, goal, instruction } = req.body;
  const prefix = `goal/${username}/`;

  // Validation
  if (!timeline || isNaN(Number(timeline))) {
    return res.status(400).json({ error: 'Timeline (days) is required and must be a number.' });
  }
  if (!goal || !goal.trim()) {
    return res.status(400).json({ error: 'Goal is required.' });
  }
  if (!instruction || !instruction.trim()) {
    return res.status(400).json({ error: 'Instruction is required.' });
  }

  try {
    // Generate unique filename
    const timestamp = Date.now();
    const key = `${prefix}goal_${timestamp}.json`;
    const fileContent = JSON.stringify({
      persona,
      timeline: Number(timeline),
      goal,
      instruction,
      createdAt: new Date().toISOString(),
    }, null, 2);

    // Upload to R2
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: fileContent,
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);

    // Invalidate cache for this user's goals
    cache.delete(prefix);

    res.json({ success: true, message: 'Goal saved successfully.' });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error saving goal for ${username}:`, err);
    res.status(500).json({ error: 'Failed to save goal. Please try again later.' });
  }
});


// AI Reply upload endpoint
app.post('/ai-reply/:username', async (req, res) => {
  const { username } = req.params;
  const notifType = req.body.type;
  let fileTypePrefix;
  if (notifType === 'message') {
    fileTypePrefix = 'ai_dm_';
  } else if (notifType === 'comment') {
    fileTypePrefix = 'ai_comment_';
  } else {
    return res.status(400).json({ error: 'Invalid notification type for AI reply' });
  }
  const prefix = `ai_reply/${username}/`;

  try {
    // --- Ensure sender_id and message_id are present for DM AI replies ---
    let patchedBody = { ...req.body };
    if (notifType === 'message' && (!patchedBody.sender_id || !patchedBody.message_id)) {
      // Try to find userId for this username
      let userId = null;
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
        console.error(`[AI-REPLY PATCH] Error mapping username to userId:`, err);
      }
      if (userId) {
        try {
          const listEvents = new ListObjectsV2Command({
            Bucket: 'tasks',
            Prefix: `InstagramEvents/${userId}/`,
          });
          const { Contents: eventContents } = await s3Client.send(listEvents);
          if (eventContents) {
            for (const obj of eventContents) {
              if (obj.Key.endsWith('.json')) {
                const getCommand = new GetObjectCommand({
                  Bucket: 'tasks',
                  Key: obj.Key,
                });
                const data = await s3Client.send(getCommand);
                const json = await data.Body.transformToString();
                const event = JSON.parse(json);
                // Match by text if message_id is missing, or by message_id if present
                if (
                  event.type === 'message' &&
                  ((patchedBody.text && event.text === patchedBody.text) ||
                   (patchedBody.message_id && event.message_id === patchedBody.message_id))
                ) {
                  if (!patchedBody.sender_id && event.sender_id) patchedBody.sender_id = event.sender_id;
                  if (!patchedBody.message_id && event.message_id) patchedBody.message_id = event.message_id;
                  break;
                }
              }
            }
          }
        } catch (err) {
          console.error(`[AI-REPLY PATCH] Error finding original DM event:`, err);
        }
      }
    }
    // List existing ai_dm_ or ai_comment_ files to determine next number
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
    const key = `${prefix}${fileTypePrefix}${nextNumber}.json`;
    const fileContent = JSON.stringify(patchedBody, null, 2);
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: fileContent,
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);
    cache.delete(prefix);

    // --- SSE update for AI replies ---
    const clients = sseClients.get(username) || [];
    for (const client of clients) {
      client.write(`data: ${JSON.stringify({ type: 'update', prefix })}\n\n`);
    }

    // --- Send AI reply as real DM if type is message ---
    if (notifType === 'message') {
      // Find the original DM file for this message_id
      const message_id = patchedBody.message_id;
      let sender_id = patchedBody.sender_id;
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
        console.error(`[AI-REPLY] Error mapping username to userId:`, err);
      }
      // If sender_id or message_id missing, try to find from InstagramEvents
      if ((!sender_id || !message_id) && userId) {
        try {
          const listEvents = new ListObjectsV2Command({
            Bucket: 'tasks',
            Prefix: `InstagramEvents/${userId}/`,
          });
          const { Contents: eventContents } = await s3Client.send(listEvents);
          if (eventContents) {
            for (const obj of eventContents) {
              if (obj.Key.endsWith('.json')) {
                const getCommand = new GetObjectCommand({
                  Bucket: 'tasks',
                  Key: obj.Key,
                });
                const data = await s3Client.send(getCommand);
                const json = await data.Body.transformToString();
                const event = JSON.parse(json);
                if (event.type === 'message' && event.text === patchedBody.text) {
                  sender_id = event.sender_id;
                  // message_id = event.message_id; // already set
                  break;
                }
              }
            }
          }
        } catch (err) {
          console.error(`[AI-REPLY] Error finding original DM event:`, err);
        }
      }
      // Send the reply if all info is available
      if (userId && sender_id && message_id && patchedBody.reply) {
        try {
          // Use the same logic as /send-dm-reply/:userId
          const axios = require('axios');
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
                const data = await s3Client.send(getCommand);
                const json = await data.Body.transformToString();
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
                message: { text: patchedBody.reply },
              },
            });
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
            } catch (error) {
              console.error(`[AI-REPLY] Error updating DM status:`, error);
            }
          }
        } catch (err) {
          console.error(`[AI-REPLY] Error sending AI DM reply:`, err);
        }
      } else {
        console.warn(`[AI-REPLY] Missing info to send AI DM reply: userId=${userId}, sender_id=${sender_id}, message_id=${message_id}`);
      }
    }

    res.json({ success: true, message: 'AI reply request saved', key });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error saving AI reply for ${username}:`, error);
    res.status(500).json({ error: 'Failed to save AI reply request', details: error.message });
  }
});

// Fetch all AI replies for a user (DM and comment)
app.get('/ai-replies/:username', async (req, res) => {
  let { username } = req.params;
  // Support both username and userId as input
  // If the param is a userId, map it to the correct username using InstagramTokens
  if (/^\d+$/.test(username)) { // If all digits, likely a userId
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
            if (token.instagram_user_id === username || token.instagram_graph_id === username) {
              if (token.username) {
                username = token.username;
                break;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`[AI-REPLIES] Error mapping userId to username:`, err);
      // Continue with original username if mapping fails
    }
  }
  const prefix = `ai_reply/${username}/`;
  try {
    // List all files in the user's ai_reply directory
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: prefix,
    });
    const { Contents } = await s3Client.send(listCommand);
    if (!Contents || Contents.length === 0) {
      console.log(`[${new Date().toISOString()}] [AI-REPLIES] No files found for ${username}`);
      return res.json([]);
    }
    const allKeys = Contents.map(f => f.Key);
    console.log(`[${new Date().toISOString()}] [AI-REPLIES] Files found for ${username}:`, allKeys);

    // Add logging for each file
    Contents.forEach(obj => {
      console.log(`[${new Date().toISOString()}] [AI-REPLIES] File: ${obj.Key}`);
    });

    // Helper to group by type and number
    const groupFiles = (typePrefix, repliedPrefix) => {
      const requests = {};
      const replies = {};
      for (const obj of Contents) {
        const reqMatch = obj.Key.match(new RegExp(`${typePrefix}(\\d+)\\.json$`));
        if (reqMatch) {
          requests[reqMatch[1]] = obj.Key;
          console.log(`[${new Date().toISOString()}] [AI-REPLIES] Matched request: ${obj.Key} as number ${reqMatch[1]}`);
        }
        const repMatch = obj.Key.match(new RegExp(`${repliedPrefix}(\\d+)\\.json$`));
        if (repMatch) {
          replies[repMatch[1]] = obj.Key;
          console.log(`[${new Date().toISOString()}] [AI-REPLIES] Matched reply: ${obj.Key} as number ${repMatch[1]}`);
        }
      }
      return { requests, replies };
    };

    // Group DM and comment files
    const dm = groupFiles('ai_dm_', 'ai_dm_replied_');
    const comment = groupFiles('ai_comment_', 'ai_comment_replied_');
    console.log(`[${new Date().toISOString()}] [AI-REPLIES] DM requests:`, dm.requests);
    console.log(`[${new Date().toISOString()}] [AI-REPLIES] DM replies:`, dm.replies);
    console.log(`[${new Date().toISOString()}] [AI-REPLIES] Comment requests:`, comment.requests);
    console.log(`[${new Date().toISOString()}] [AI-REPLIES] Comment replies:`, comment.replies);

    // Helper to fetch file content
    const fetchFile = async (key) => {
      const getCommand = new GetObjectCommand({ Bucket: 'tasks', Key: key });
      const data = await s3Client.send(getCommand);
      const body = await data.Body.transformToString();
      return JSON.parse(body);
    };

    // Merge requests and replies for DM and comment
    const mergePairs = async (requests, replies, type) => {
      const pairs = [];
      for (const num in replies) {
        const replyKey = replies[num];
        const reqKey = requests[num];
        if (!reqKey) {
          console.warn(`[${new Date().toISOString()}] [AI-REPLIES] No original request for ${type} reply #${num} (${replyKey})`);
          continue;
        }
        try {
          const [request, reply] = await Promise.all([
            fetchFile(reqKey),
            fetchFile(replyKey),
          ]);
          pairs.push({
            type,
            number: num,
            request,
            reply,
            reqKey,
            replyKey,
          });
        } catch (err) {
          console.error(`[${new Date().toISOString()}] [AI-REPLIES] Error fetching files for pair #${num}:`, err);
        }
      }
      return pairs;
    };

    const dmPairs = await mergePairs(dm.requests, dm.replies, 'dm');
    const commentPairs = await mergePairs(comment.requests, comment.replies, 'comment');
    const allPairs = [...dmPairs, ...commentPairs];
    // Sort by number (descending, most recent first)
    allPairs.sort((a, b) => parseInt(b.number) - parseInt(a.number));
    console.log(`[${new Date().toISOString()}] [AI-REPLIES] Final pairs returned for ${username}:`, allPairs.map(p => ({ type: p.type, number: p.number, reqKey: p.reqKey, replyKey: p.replyKey })));
    res.json(allPairs);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching AI replies for ${username}:`, error);
    res.status(500).json({ error: 'Failed to fetch AI replies', details: error.message });
  }
});

// Ignore (delete) an AI reply pair for a user
app.post('/ignore-ai-reply/:username', async (req, res) => {
  const { username } = req.params;
  const { replyKey, reqKey } = req.body;
  if (!replyKey) {
    console.error(`[${new Date().toISOString()}] Ignore AI reply failed: replyKey missing for user ${username}`);
    return res.status(400).json({ error: 'replyKey is required' });
  }
  try {
    // Delete the reply file
    const delReply = new DeleteObjectCommand({
      Bucket: 'tasks',
      Key: replyKey,
    });
    await s3Client.send(delReply);
    console.log(`[${new Date().toISOString()}] Deleted AI reply file: ${replyKey} for user ${username}`);
    // Optionally, also delete the original request file
    if (reqKey) {
      const delReq = new DeleteObjectCommand({
        Bucket: 'tasks',
        Key: reqKey,
      });
      await s3Client.send(delReq);
      console.log(`[${new Date().toISOString()}] Deleted original AI request file: ${reqKey} for user ${username}`);
    }
    // Invalidate cache for this user's ai_reply directory
    const prefix = `ai_reply/${username}/`;
    cache.delete(prefix);
    res.json({ success: true });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error ignoring AI reply for ${username}:`, error);
    res.status(500).json({ error: 'Failed to ignore AI reply', details: error.message });
  }
});
// Generate a fresh signed URL for a ready_post image
app.get('/signed-image-url/:username/:imageKey', async (req, res) => {
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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Ready to receive account info at POST /save-account-info');
  console.log('Ready to handle R2 webhooks at POST /webhook/r2');
  console.log('Ready to stream events at GET /events/:username');
  console.log('Ready to receive hierarchical data at POST /scrape');
  console.log('Ready to retrieve data at GET /retrieve/:accountHolder/:competitor');
  console.log('Ready to retrieve strategies at GET /retrieve-strategies/:accountHolder');
  console.log('Ready to retrieve engagement strategies at GET /retrieve-engagement-strategies/:accountHolder');
  console.log('Ready to retrieve news at GET /news-for-you/:accountHolder');
  console.log('Ready to save queries at POST /save-query/:accountHolder');
  console.log('Ready to handle rules at GET/POST /rules/:username');
  console.log('Ready to handle responses at GET/POST /responses/:username');
  console.log('Ready to handle posts at GET /posts/:username');
  console.log('Ready to handle feedback at POST /feedback/:username');
  console.log('Ready to retrieve profile info at GET /profile-info/:username');
  console.log('Ready to handle Instagram OAuth at GET /instagram/callback');
  console.log('Ready to handle Instagram webhooks at GET/POST /webhook/instagram');
  console.log('Ready to handle Instagram deauthorization at POST /instagram/deauthorize');
  console.log('Ready to handle Instagram data deletion at GET/POST /instagram/data-deletion');
  console.log('Ready to fetch all AI replies for a user at GET /ai-replies/:username');
});

app.options('/events/:userId', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});
app.options('/events/:username', (req, res) => {
  setCorsHeaders(res);
  res.status(204).send();
});

// Schedule a post
app.post('/schedule-post/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { imageData, scheduledFor, username } = req.body;
    
    if (!imageData || !scheduledFor || !username) {
      return res.status(400).json({ error: 'Missing required data' });
    }
    
    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // Detect file type
    const type = await fileTypeFromBuffer(imageBuffer);
    if (!type || !type.mime.startsWith('image/')) {
      return res.status(400).json({ error: 'Invalid image data' });
    }
    
    // Generate a unique filename
    const filename = `${username}_${randomUUID()}.${type.ext}`;
    const key = `scheduled/${username}/${filename}`;
    
    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: 'instagram-manager',
      Key: key,
      Body: imageBuffer,
      ContentType: type.mime
    }));
    
    // Schedule the post
    const scheduleTime = new Date(scheduledFor);
    const jobName = `post_${username}_${randomUUID()}`;
    
    // Store job info in memory (in a real app, this would be stored in a database)
    const jobs = global.scheduledJobs || {};
    global.scheduledJobs = jobs;
    
    jobs[jobName] = {
      userId,
      imageKey: key,
      scheduledFor: scheduleTime,
      status: 'scheduled'
    };
    
    // Schedule the job
    schedule.scheduleJob(jobName, scheduleTime, async function() {
      console.log(`Executing scheduled post: ${jobName}`);
      try {
        // In a real implementation, this would post to Instagram
        // For now, we'll just mark it as posted
        jobs[jobName].status = 'posted';
        console.log(`Post ${jobName} marked as posted`);
        
        // You would implement actual Instagram posting logic here
        // For example:
        // await axios.post('https://graph.instagram.com/v18.0/me/media', {
        //   image_url: imageUrl,
        //   caption: caption,
        //   access_token: accessToken
        // });
      } catch (error) {
        console.error(`Failed to post scheduled image: ${error}`);
        jobs[jobName].status = 'failed';
      }
    });
    
    return res.status(200).json({ 
      message: 'Post scheduled successfully',
      scheduledFor: scheduleTime,
      jobId: jobName
    });
  } catch (error) {
    console.error('Error scheduling post:', error);
    return res.status(500).json({ error: 'Failed to schedule post' });
  }
});

// Get scheduled posts for a user
app.get('/scheduled-posts/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const jobs = global.scheduledJobs || {};
    
    // Filter jobs for this user
    const userJobs = Object.entries(jobs)
      .filter(([key]) => key.includes(`post_${username}_`))
      .map(([key, value]) => ({
        jobId: key,
        ...value
      }));
    
    return res.status(200).json(userJobs);
  } catch (error) {
    console.error('Error getting scheduled posts:', error);
    return res.status(500).json({ error: 'Failed to get scheduled posts' });
  }
});

// This endpoint checks if a user has entered their Instagram username
app.get('/user-instagram-status/:userId', async (req, res) => {
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

// This endpoint retrieves the user's Instagram connection
app.get('/instagram-connection/:userId', async (req, res) => {
  // Set CORS headers
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

// This endpoint stores the user's Instagram connection
app.post('/instagram-connection/:userId', async (req, res) => {
  // Set CORS headers
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
    
    if (!username || username.trim() === '') {
      return res.status(400).json({ 
        available: false, 
        message: 'Username is required' 
      });
    }
    
    // Convert to lowercase to ensure case-insensitive matching
    const normalizedUsername = username.trim().toLowerCase();
    
    // Check for existing username in AccountInfo records
    const prefix = `AccountInfo/${normalizedUsername}`;
    const key = `AccountInfo/${normalizedUsername}/info.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      
      await s3Client.send(getCommand);
      
      // If we get here, the file exists, meaning the username is already in use
      return res.json({
        available: false,
        message: 'This username is already in use by another account. If you wish to proceed, you may continue, but you will be using an already assigned username.'
      });
      
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        // Username is available
        return res.json({
          available: true,
          message: 'Username is available'
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
    
    // Warm up cache for each recent user
    for (const username of recentUsers) {
      // Warm up critical modules (non-blocking)
      Promise.all([
        fetchDataForModule(username, 'ProfileInfo/{username}'),
        fetchDataForModule(username, 'ready_post/{username}'),
        fetchDataForModule(username, 'recommendations/{username}'),
        fetchDataForModule(username, 'NewForYou/{username}')
      ]).catch(err => {
        console.error(`[${new Date().toISOString()}] Error during cache warmup for ${username}:`, err.message);
      });
    }
    
    console.log(`[${new Date().toISOString()}] Cache warmup initiated for ${recentUsers.length} users`);
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
    let activeConnections = 0;
    
    sseClients.forEach((clients, username) => {
      totalConnections += clients.length;
      
      clients.forEach(client => {
        const lastActivity = activeConnections.get(client) || 0;
        const connectionAge = now - lastActivity;
        
        if (connectionAge > SSE_RECONNECT_TIMEOUT) {
          staleConnections++;
        } else {
          activeConnections++;
          
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
    
    console.log(`[${new Date().toISOString()}] SSE HEALTH: Total=${totalConnections}, Active=${activeConnections}, Stale=${staleConnections}`);
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

// Add a new API endpoint for tracking post status

// Endpoint to store post status (rejected/scheduled)
app.post('/post-status/:username', async (req, res) => {
  const { username } = req.params;
  const { postKeys, status, scheduledTimes } = req.body;
  
  if (!username || !postKeys || !status || !Array.isArray(postKeys) || !['rejected', 'scheduled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid request parameters' });
  }
  
  try {
    // First, try to get existing status data
    const normalizedUsername = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
    const key = `UserPostStatus/${normalizedUsername}/post_status.json`;
    let existingData = { rejected: [], scheduled: {} };
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      
      try {
        const response = await s3Client.send(getCommand);
        const body = await streamToString(response.Body);
        
        if (body && body.trim() !== '') {
          existingData = JSON.parse(body);
          // Ensure proper structure
          if (!existingData.rejected) existingData.rejected = [];
          if (!existingData.scheduled) existingData.scheduled = {};
        }
      } catch (error) {
        if (error.name !== 'NoSuchKey' && error.$metadata?.httpStatusCode !== 404) {
          throw error;
        }
        // If file doesn't exist, use default empty structure
      }
      
      // Update with new data
      if (status === 'rejected') {
        // Add new rejected posts (avoiding duplicates)
        const newRejected = [...new Set([...existingData.rejected, ...postKeys])];
        existingData.rejected = newRejected;
      } else if (status === 'scheduled') {
        // Update scheduled posts
        postKeys.forEach((postKey, index) => {
          const scheduleTime = scheduledTimes && scheduledTimes[index] ? scheduledTimes[index] : Date.now();
          existingData.scheduled[postKey] = {
            postKey,
            scheduledAt: scheduleTime,
            updatedAt: Date.now()
          };
        });
        
        // Clean up scheduled posts that should be posted by now
        const now = Date.now();
        Object.keys(existingData.scheduled).forEach(key => {
          const post = existingData.scheduled[key];
          if (post.scheduledAt < now) {
            delete existingData.scheduled[key];
          }
        });
      }
      
      // Save updated data
      const putCommand = new PutObjectCommand({
        Bucket: 'tasks',
        Key: key,
        Body: JSON.stringify(existingData, null, 2),
        ContentType: 'application/json',
      });
      
      await s3Client.send(putCommand);
      
      console.log(`[${new Date().toISOString()}] Updated post status for ${username}: ${status}, ${postKeys.length} posts`);
      res.json({ success: true, message: `Post status updated: ${postKeys.length} posts marked as ${status}` });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error updating post status for ${username}:`, error);
      res.status(500).json({ error: 'Failed to update post status', details: error.message });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Server error handling post status for ${username}:`, error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Endpoint to get post status
app.get('/post-status/:username', async (req, res) => {
  const { username } = req.params;
  
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }
  
  try {
    const normalizedUsername = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
    const key = `UserPostStatus/${normalizedUsername}/post_status.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);
      
      if (!body || body.trim() === '') {
        return res.json({ rejected: [], scheduled: {} });
      }
      
      const data = JSON.parse(body);
      
      // Clean up scheduled posts that should be posted by now
      const now = Date.now();
      let hasChanges = false;
      
      if (data.scheduled) {
        Object.keys(data.scheduled).forEach(key => {
          const post = data.scheduled[key];
          if (post.scheduledAt < now) {
            delete data.scheduled[key];
            hasChanges = true;
          }
        });
        
        // If we cleaned up any scheduled posts, save the changes
        if (hasChanges) {
          const putCommand = new PutObjectCommand({
            Bucket: 'tasks',
            Key: key,
            Body: JSON.stringify(data, null, 2),
            ContentType: 'application/json',
          });
          
          await s3Client.send(putCommand);
          console.log(`[${new Date().toISOString()}] Cleaned up expired scheduled posts for ${username}`);
        }
      }
      
      return res.json(data);
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return res.json({ rejected: [], scheduled: {} });
      }
      throw error;
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error retrieving post status for ${username}:`, error);
    res.status(500).json({ error: 'Failed to retrieve post status', details: error.message });
  }
});