import express from 'express';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

// Import shared utilities
import {
  s3Client,
  cache,
  cacheTimestamps,
  cacheHits,
  cacheMisses,
  sseClients,
  currentUsername,
  setCurrentUsername,
  activeConnections,
  R2_PUBLIC_URL,
  CACHE_CONFIG,
  MODULE_CACHE_CONFIG,
  SSE_RECONNECT_TIMEOUT,
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
  generateVerificationCode
} from '../shared/utils.js';

const router = express.Router();

// Constants
const THROTTLE_INTERVAL = 30000; // 30 seconds

// Get user data from admin R2 bucket
router.get(['/api/user/:userId', '/user/:userId'], async (req, res) => {
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
  router.put(['/api/user/:userId', '/user/:userId'], async (req, res) => {
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
  router.get(['/api/user/:userId/usage', '/user/:userId/usage'], async (req, res) => {
    const { userId } = req.params;
    const currentPeriod = new Date().toISOString().substring(0, 7); // YYYY-MM
    
    try {
      console.log(`[${new Date().toISOString()}] [USER-API] Getting usage stats for ${userId}/${currentPeriod}`);
      
      // Try R2 first
      try {
        console.log(`[${new Date().toISOString()}] [R2-OPERATION] Attempting to get usage stats from R2`);
        const params = {
          Bucket: 'admin',
          Key: `usage/${userId}/${currentPeriod}.json`
        };
        
        const getCommand = new GetObjectCommand(params);
        const data = await s3Client.send(getCommand);
        const usageStats = JSON.parse(await streamToString(data.Body));
        
        console.log(`[${new Date().toISOString()}] [USER-API] Found usage stats from R2 for ${userId}/${currentPeriod}`);
        res.json(usageStats);
        return;
      } catch (r2Error) {
        console.log(`[${new Date().toISOString()}] [R2-OPERATION] Error performing R2 operation: ${r2Error.message}`);
        
        if (r2Error.code === 'NoSuchKey' || r2Error.message.includes('does not exist')) {
          console.log(`[${new Date().toISOString()}] [USER-API] R2 failed for usage stats, trying fallbacks: ${r2Error.message}`);
          
          // Try local storage fallback
          const localStorageDir = path.join(process.cwd(), 'local_storage', 'usage', userId);
          const localStorageFile = path.join(localStorageDir, `${currentPeriod}.json`);
          
          if (fs.existsSync(localStorageFile)) {
            try {
              console.log(`[${new Date().toISOString()}] [LOCAL-FALLBACK] Found usage in local storage: ${localStorageFile}`);
              const localData = JSON.parse(fs.readFileSync(localStorageFile, 'utf8'));
              res.json(localData);
              return;
            } catch (localError) {
              console.error(`[${new Date().toISOString()}] [LOCAL-FALLBACK] Error reading local usage stats:`, localError);
            }
          }
          
          // If both R2 and local storage fail, create default stats
          console.log(`[${new Date().toISOString()}] [USER-API] Using default usage stats for ${userId}/${currentPeriod}`);
          const defaultStats = {
            userId,
            period: currentPeriod,
            postsUsed: 0,
            discussionsUsed: 0,
            aiRepliesUsed: 0,
            campaignsUsed: 0,
            lastUpdated: new Date().toISOString()
          };
          
          // Save default stats to local storage
          try {
            if (!fs.existsSync(localStorageDir)) {
              fs.mkdirSync(localStorageDir, { recursive: true });
            }
            fs.writeFileSync(localStorageFile, JSON.stringify(defaultStats, null, 2));
            console.log(`[${new Date().toISOString()}] [LOCAL-FALLBACK] Saved usage to local storage: ${localStorageFile}`);
          } catch (saveError) {
            console.error(`[${new Date().toISOString()}] [LOCAL-FALLBACK] Error saving to local storage:`, saveError);
          }
          
          console.log(`[${new Date().toISOString()}] [USER-API] Creating default usage stats for ${userId}/${currentPeriod}`);
          res.json(defaultStats);
          return;
        } else {
          // For other R2 errors, fall back to local storage if available
          const localStorageDir = path.join(process.cwd(), 'local_storage', 'usage', userId);
          const localStorageFile = path.join(localStorageDir, `${currentPeriod}.json`);
          
          if (fs.existsSync(localStorageFile)) {
            try {
              console.log(`[${new Date().toISOString()}] [LOCAL-FALLBACK] Using local storage due to R2 error: ${localStorageFile}`);
              const localData = JSON.parse(fs.readFileSync(localStorageFile, 'utf8'));
              res.json(localData);
              return;
            } catch (localError) {
              console.error(`[${new Date().toISOString()}] [LOCAL-FALLBACK] Error reading local storage:`, localError);
            }
          }
          
          throw r2Error; // Re-throw if no local fallback available
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [USER-API] Error getting usage stats:`, error);
      
      // Ultimate fallback - return default stats
      const defaultStats = {
        userId,
        period: currentPeriod,
        postsUsed: 0,
        discussionsUsed: 0,
        aiRepliesUsed: 0,
        campaignsUsed: 0,
        lastUpdated: new Date().toISOString()
      };
      
      res.json(defaultStats);
    }
  });
  
  // Get usage stats for specific period
  router.get(['/api/user/:userId/usage/:period', '/user/:userId/usage/:period'], async (req, res) => {
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
  router.patch(['/api/user/:userId/usage', '/user/:userId/usage'], async (req, res) => {
    const { userId } = req.params;
    const { postsUsed, discussionsUsed, aiRepliesUsed, campaignsUsed } = req.body;
    const currentPeriod = new Date().toISOString().substring(0, 7); // YYYY-MM
    
    try {
      console.log(`[${new Date().toISOString()}] [USER-API] Updating usage stats for ${userId}/${currentPeriod}`);
      
      // Get current usage stats
      let currentStats;
      try {
        const params = {
          Bucket: 'admin',
          Key: `usage/${userId}/${currentPeriod}.json`
        };
        
        const getCommand = new GetObjectCommand(params);
        const data = await s3Client.send(getCommand);
        currentStats = JSON.parse(await streamToString(data.Body));
      } catch (error) {
        if (error.code === 'NoSuchKey') {
          // Create new usage stats
          currentStats = {
            userId,
            period: currentPeriod,
            postsUsed: 0,
            discussionsUsed: 0,
            aiRepliesUsed: 0,
            campaignsUsed: 0,
            lastUpdated: new Date().toISOString()
          };
        } else {
          throw error;
        }
      }
      
      // Update stats
      if (postsUsed !== undefined) currentStats.postsUsed = (currentStats.postsUsed || 0) + postsUsed;
      if (discussionsUsed !== undefined) currentStats.discussionsUsed = (currentStats.discussionsUsed || 0) + discussionsUsed;
      if (aiRepliesUsed !== undefined) currentStats.aiRepliesUsed = (currentStats.aiRepliesUsed || 0) + aiRepliesUsed;
      if (campaignsUsed !== undefined) currentStats.campaignsUsed = (currentStats.campaignsUsed || 0) + campaignsUsed;
      
      currentStats.lastUpdated = new Date().toISOString();
      
      // Save updated stats
      const putParams = {
        Bucket: 'admin',
        Key: `usage/${userId}/${currentPeriod}.json`,
        Body: JSON.stringify(currentStats, null, 2),
        ContentType: 'application/json'
      };
      
      const putCommand = new PutObjectCommand(putParams);
      await s3Client.send(putCommand);
      
      console.log(`[${new Date().toISOString()}] [USER-API] Updated usage stats for ${userId}/${currentPeriod}`);
      res.json(currentStats);
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [USER-API] Error updating usage stats:`, error);
      res.status(500).json({ error: 'Failed to update usage stats' });
    }
  });
  
  // Increment usage
  router.post(['/api/usage/increment/:userId', '/usage/increment/:userId'], async (req, res) => {
    const { userId } = req.params;
    const { type, amount = 1 } = req.body;
    const currentPeriod = new Date().toISOString().substring(0, 7); // YYYY-MM
    
    try {
      console.log(`[${new Date().toISOString()}] [USER-API] Incrementing usage for ${userId}/${currentPeriod}, type: ${type}, amount: ${amount}`);
      
      // Get current usage stats
      let currentStats;
      try {
        const params = {
          Bucket: 'admin',
          Key: `usage/${userId}/${currentPeriod}.json`
        };
        
        const getCommand = new GetObjectCommand(params);
        const data = await s3Client.send(getCommand);
        currentStats = JSON.parse(await streamToString(data.Body));
      } catch (error) {
        if (error.code === 'NoSuchKey') {
          // Create new usage stats
          currentStats = {
            userId,
            period: currentPeriod,
            postsUsed: 0,
            discussionsUsed: 0,
            aiRepliesUsed: 0,
            campaignsUsed: 0,
            lastUpdated: new Date().toISOString()
          };
        } else {
          throw error;
        }
      }
      
      // Increment the specified type
      switch (type) {
        case 'posts':
          currentStats.postsUsed = (currentStats.postsUsed || 0) + amount;
          break;
        case 'discussions':
          currentStats.discussionsUsed = (currentStats.discussionsUsed || 0) + amount;
          break;
        case 'aiReplies':
          currentStats.aiRepliesUsed = (currentStats.aiRepliesUsed || 0) + amount;
          break;
        case 'campaigns':
          currentStats.campaignsUsed = (currentStats.campaignsUsed || 0) + amount;
          break;
        default:
          return res.status(400).json({ error: 'Invalid usage type' });
      }
      
      currentStats.lastUpdated = new Date().toISOString();
      
      // Save updated stats
      const putParams = {
        Bucket: 'admin',
        Key: `usage/${userId}/${currentPeriod}.json`,
        Body: JSON.stringify(currentStats, null, 2),
        ContentType: 'application/json'
      };
      
      const putCommand = new PutObjectCommand(putParams);
      await s3Client.send(putCommand);
      
      console.log(`[${new Date().toISOString()}] [USER-API] Incremented usage for ${userId}/${currentPeriod}, ${type}: ${currentStats[type + 'Used']}`);
      res.json(currentStats);
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [USER-API] Error incrementing usage:`, error);
      res.status(500).json({ error: 'Failed to increment usage' });
    }
  });
  
  // Access control check
  router.post(['/api/access-check/:userId', '/access-check/:userId'], async (req, res) => {
    const { userId } = req.params;
    const { feature } = req.body;
    
    try {
      console.log(`[${new Date().toISOString()}] [USER-API] Checking access for ${userId}, feature: ${feature}`);
      
      // Get user data
      const userParams = {
        Bucket: 'admin',
        Key: `users/${userId}.json`
      };
      
      const getUserCommand = new GetObjectCommand(userParams);
      const userData = await s3Client.send(getUserCommand);
      const user = JSON.parse(await streamToString(userData.Body));
      
      // Get current usage
      const currentPeriod = new Date().toISOString().substring(0, 7);
      let usageStats;
      
      try {
        const usageParams = {
          Bucket: 'admin',
          Key: `usage/${userId}/${currentPeriod}.json`
        };
        
        const getUsageCommand = new GetObjectCommand(usageParams);
        const usageData = await s3Client.send(getUsageCommand);
        usageStats = JSON.parse(await streamToString(usageData.Body));
      } catch (error) {
        if (error.code === 'NoSuchKey') {
          usageStats = {
            postsUsed: 0,
            discussionsUsed: 0,
            aiRepliesUsed: 0,
            campaignsUsed: 0
          };
        } else {
          throw error;
        }
      }
      
      // Check access based on user plan and usage
      const plan = user.plan || 'free';
      const limits = {
        free: { posts: 5, discussions: 3, aiReplies: 10, campaigns: 1 },
        basic: { posts: 20, discussions: 10, aiReplies: 50, campaigns: 5 },
        pro: { posts: 100, discussions: 50, aiReplies: 200, campaigns: 20 },
        enterprise: { posts: 1000, discussions: 500, aiReplies: 2000, campaigns: 200 }
      };
      
      const planLimits = limits[plan] || limits.free;
      const currentUsage = usageStats[feature + 'Used'] || 0;
      const limit = planLimits[feature];
      
      const hasAccess = currentUsage < limit;
      
      console.log(`[${new Date().toISOString()}] [USER-API] Access check result for ${userId}/${feature}: ${hasAccess} (${currentUsage}/${limit})`);
      
      res.json({
        hasAccess,
        currentUsage,
        limit,
        plan,
        remaining: Math.max(0, limit - currentUsage)
      });
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [USER-API] Error checking access:`, error);
      res.status(500).json({ error: 'Failed to check access' });
    }
  });
  
  // ... existing code continues ...
  
  router.use((req, res, next) => {
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
        setCurrentUsername(latestEntry.username);
        console.log(`Initialized currentUsername to ${currentUsername} on server startup`);
      }
    } catch (error) {
      console.error('Error initializing currentUsername:', error);
    }
  }
  
  initializeCurrentUsername();
  
  // Enhanced webhook handler with improved event broadcast
  router.post('/webhook/r2', async (req, res) => {
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
  
  router.get('/proxy-image', async (req, res) => {
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
  
  router.get(['/profile-info/:username', '/api/profile-info/:username'], async (req, res) => {
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
  
  router.post(['/save-account-info', '/api/save-account-info'], async (req, res) => {
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
  
  router.post(['/scrape', '/api/scrape'], async (req, res) => {
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
  
  router.get(['/retrieve/:accountHolder/:competitor', '/api/retrieve/:accountHolder/:competitor'], async (req, res) => {
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
  
  router.get(['/retrieve-multiple/:accountHolder', '/api/retrieve-multiple/:accountHolder'], async (req, res) => {
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
  
  router.get(['/retrieve-strategies/:accountHolder', '/api/retrieve-strategies/:accountHolder'], async (req, res) => {
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
  
  router.get(['/retrieve-engagement-strategies/:accountHolder', '/api/retrieve-engagement-strategies/:accountHolder'], async (req, res) => {
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
  
  router.get(['/news-for-you/:accountHolder', '/api/news-for-you/:accountHolder'], async (req, res) => {
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
  
  router.post(['/save-query/:accountHolder', '/api/save-query/:accountHolder'], async (req, res) => {
    // Set CORS headers explicitly for this endpoint
    setCorsHeaders(res, req.headers.origin || '*');
    
    // Simply respond with success without storing in R2 bucket
    // The instant AI reply system makes this R2 storage unnecessary
    res.json({ success: true, message: 'AI instant reply system is enabled, no persistence needed' });
  });

  router.get(['/rules/:username', '/api/rules/:username'], async (req, res) => {
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
  
  router.post(['/rules/:username', '/api/rules/:username'], async (req, res) => {
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
  
  router.get(['/responses/:username', '/api/responses/:username'], async (req, res) => {
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
  
  router.post(['/responses/:username/:responseId', '/api/responses/:username/:responseId'], async (req, res) => {
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
  
  router.get(['/retrieve-account-info/:username', '/api/retrieve-account-info/:username'], async (req, res) => {
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
  
  router.get(['/posts/:username', '/api/posts/:username'], async (req, res) => {
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
            if (['processed', 'rejected', 'scheduled', 'posted', 'published'].includes(postData.status)) {
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
  
  router.post(['/feedback/:username', '/api/feedback/:username'], async (req, res) => {
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
  


  // PlatformSchemaManager class
  class PlatformSchemaManager {
    static buildPath(module, platform = 'instagram', username, additional = '') {
      const normalizedUsername = this.normalizeUsername(username, platform);
      const basePath = `${module}/${platform}/${normalizedUsername}`;
      return additional ? `${basePath}/${additional}` : basePath;
    }

      static parseRequestParams(req) {
    const platform = req.query.platform || 'instagram';
    const username = req.params.username || req.params.accountHolder || req.params.userId;
    
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
          normalizeUsername: (username) => username.toLowerCase().replace(/[^a-z0-9._]/g, ''),
          defaultPrefix: 'instagram'
        },
        facebook: {
          normalizeUsername: (username) => username.toLowerCase().replace(/[^a-z0-9._]/g, ''),
          defaultPrefix: 'facebook'
        },
        twitter: {
          normalizeUsername: (username) => username.toLowerCase().replace(/[^a-z0-9._]/g, ''),
          defaultPrefix: 'twitter'
        }
      };
      return configs[platform] || configs.instagram;
    }

    static normalizeUsername(username, platform = 'instagram') {
      const config = this.getPlatformConfig(platform);
      return config.normalizeUsername(username);
    }
  }

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

// Export the router
export default router;