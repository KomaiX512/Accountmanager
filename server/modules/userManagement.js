import express from 'express';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { randomUUID } from 'crypto';

// Import utilities from shared module
import {
  streamToString,
  streamToBuffer,
  setCorsHeaders,
  generateVerificationCode,
  s3Client,
  sseClients,
  activeConnections,
  cache,
  cacheTimestamps,
  cacheHits,
  cacheMisses,
  currentUsername,
  setCurrentUsername,
  getCurrentUsername,
  broadcastUpdate,
  shouldUseCache,
  PlatformSchemaManager
} from '../shared/utils.js';

// Local utility functions
function handleErrorResponse(res, error) {
  console.error(`[${new Date().toISOString()}] Error:`, error);
  res.status(500).json({ error: 'Internal server error', details: error.message });
}

async function getExistingData() {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'InstagramTokens/',
    });
    const { Contents } = await s3Client.send(listCommand);
    if (!Contents) return [];
    
    const data = [];
    for (const obj of Contents) {
      if (obj.Key.endsWith('/token.json')) {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: obj.Key,
          });
          const response = await s3Client.send(getCommand);
          const json = await streamToString(response.Body);
          const token = JSON.parse(json);
          data.push({
            username: token.username,
            timestamp: obj.LastModified?.toISOString() || new Date().toISOString()
          });
        } catch (error) {
          console.error(`Error reading token file ${obj.Key}:`, error);
        }
      }
    }
    return data;
  } catch (error) {
    console.error('Error getting existing data:', error);
    return [];
  }
}

// Create Express Router
const router = express.Router();

// S3 Client for admin bucket operations
const adminS3Client = new S3Client({
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
  maxAttempts: 3,
  httpOptions: {
    connectTimeout: 50000,
    timeout: 100000,
  },
});

// ============================================================
// USER MANAGEMENT & USAGE TRACKING ENDPOINTS
// ============================================================

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
      const data = await adminS3Client.send(getCommand);
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
      await adminS3Client.send(putCommand);
      
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
        const data = await adminS3Client.send(getCommand);
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
      const data = await adminS3Client.send(getCommand);
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
    const statsUpdate = req.body;
    const currentPeriod = new Date().toISOString().substring(0, 7);
    
    try {
      console.log(`[${new Date().toISOString()}] [USER-API] Updating usage stats for ${userId}/${currentPeriod}`);
      
      // Get current stats or create default
      let currentStats;
      try {
        const params = {
          Bucket: 'admin',
          Key: `usage/${userId}/${currentPeriod}.json`
        };
        const getCommand = new GetObjectCommand(params);
        const data = await adminS3Client.send(getCommand);
        currentStats = JSON.parse(await streamToString(data.Body));
      } catch (error) {
        if (error.code === 'NoSuchKey') {
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
      const updatedStats = {
        ...currentStats,
        ...statsUpdate,
        lastUpdated: new Date().toISOString()
      };
      
      // Save updated stats
      const params = {
        Bucket: 'admin',
        Key: `usage/${userId}/${currentPeriod}.json`,
        Body: JSON.stringify(updatedStats, null, 2),
        ContentType: 'application/json'
      };
      
      const putCommand = new PutObjectCommand(params);
      await adminS3Client.send(putCommand);
      
      console.log(`[${new Date().toISOString()}] [USER-API] Updated usage stats for ${userId}/${currentPeriod}`);
      res.json({ success: true });
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [USER-API] Error updating usage stats:`, error);
      res.status(500).json({ error: 'Failed to update usage stats' });
    }
  });
  
  // Test endpoint for debugging
  router.get('/api/test', (req, res) => {
    res.json({ message: 'User management module is working', timestamp: new Date().toISOString() });
  });

  // Check access for a specific feature
  router.post(['/api/access-check/:userId', '/access-check/:userId'], async (req, res) => {
    const { userId } = req.params;
    const { feature } = req.body;
    
    try {
      console.log(`[${new Date().toISOString()}] [ACCESS-CHECK] Checking ${feature} access for ${userId}`);
      
      // Get user data and usage stats directly from R2
      let userData = null;
      let usageStats = null;
      
      try {
        // Get user data from admin bucket
        const userParams = {
          Bucket: 'admin',
          Key: `users/${userId}.json`
        };
        console.log(`[${new Date().toISOString()}] [ACCESS-CHECK] Attempting to get user data from R2`);
        const userCommand = new GetObjectCommand(userParams);
        const userResponse = await adminS3Client.send(userCommand);
        userData = JSON.parse(await streamToString(userResponse.Body));
        console.log(`[${new Date().toISOString()}] [ACCESS-CHECK] Successfully retrieved user data`);
      } catch (userError) {
        console.log(`[${new Date().toISOString()}] [ACCESS-CHECK] User data error:`, userError.message);
        if (userError.code === 'NoSuchKey') {
          // Create default freemium user
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
          try {
            const saveParams = {
              Bucket: 'admin',
              Key: `users/${userId}.json`,
              Body: JSON.stringify(userData, null, 2),
              ContentType: 'application/json'
            };
            const saveCommand = new PutObjectCommand(saveParams);
            await adminS3Client.send(saveCommand);
            console.log(`[${new Date().toISOString()}] [ACCESS-CHECK] Created new user data`);
          } catch (saveError) {
            console.error(`[${new Date().toISOString()}] [ACCESS-CHECK] Error saving user data:`, saveError.message);
          }
        } else {
          throw userError;
        }
      }
      
      try {
        // Get usage stats from admin bucket
        const currentPeriod = new Date().toISOString().substring(0, 7);
        const usageParams = {
          Bucket: 'admin',
          Key: `usage/${userId}/${currentPeriod}.json`
        };
        console.log(`[${new Date().toISOString()}] [ACCESS-CHECK] Attempting to get usage stats from R2`);
        const usageCommand = new GetObjectCommand(usageParams);
        const usageResponse = await adminS3Client.send(usageCommand);
        usageStats = JSON.parse(await streamToString(usageResponse.Body));
        console.log(`[${new Date().toISOString()}] [ACCESS-CHECK] Successfully retrieved usage stats`);
      } catch (usageError) {
        console.log(`[${new Date().toISOString()}] [ACCESS-CHECK] Usage stats error:`, usageError.message);
        if (usageError.code === 'NoSuchKey') {
          // Create default usage stats
          const currentPeriod = new Date().toISOString().substring(0, 7);
          usageStats = {
            userId,
            period: currentPeriod,
            postsUsed: 0,
            discussionsUsed: 0,
            aiRepliesUsed: 0,
            campaignsUsed: 0,
            lastUpdated: new Date().toISOString()
          };
          console.log(`[${new Date().toISOString()}] [ACCESS-CHECK] Created default usage stats`);
        } else {
          throw usageError;
        }
      }
      
      // Default usage stats if not found
      if (!usageStats) {
        const currentPeriod = new Date().toISOString().substring(0, 7);
        usageStats = {
          userId,
          period: currentPeriod,
          postsUsed: 0,
          discussionsUsed: 0,
          aiRepliesUsed: 0,
          campaignsUsed: 0,
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
  
  // Increment usage counter
  router.post(['/api/usage/increment/:userId', '/usage/increment/:userId'], async (req, res) => {
    const { userId } = req.params;
    const { feature } = req.body;
    
    try {
      console.log(`[${new Date().toISOString()}] [USAGE-INCREMENT] Incrementing ${feature} usage for ${userId}`);
      
      // Get current usage stats directly from R2
      let usageStats;
      const currentPeriod = new Date().toISOString().substring(0, 7);
      
      try {
        const usageParams = {
          Bucket: 'admin',
          Key: `usage/${userId}/${currentPeriod}.json`
        };
        const usageCommand = new GetObjectCommand(usageParams);
        const usageResponse = await adminS3Client.send(usageCommand);
        usageStats = JSON.parse(await streamToString(usageResponse.Body));
      } catch (error) {
        if (error.code === 'NoSuchKey') {
          usageStats = {
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
        default:
          console.warn(`[${new Date().toISOString()}] [USAGE-INCREMENT] Unknown feature: ${feature}`);
          return res.json({ success: true, message: 'Unknown feature, no increment performed' });
      }
      
      // Update usage stats directly in R2
      const updatedStats = {
        ...usageStats,
        ...update
      };
      
      const updateParams = {
        Bucket: 'admin',
        Key: `usage/${userId}/${currentPeriod}.json`,
        Body: JSON.stringify(updatedStats, null, 2),
        ContentType: 'application/json'
      };
      
      const updateCommand = new PutObjectCommand(updateParams);
      await adminS3Client.send(updateCommand);
      
      console.log(`[${new Date().toISOString()}] [USAGE-INCREMENT] Successfully incremented ${feature} usage for ${userId}`);
      res.json({ success: true, newCount: usageStats[feature + 'Used'] + 1 });
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [USAGE-INCREMENT] Error incrementing usage:`, error);
      // Don't fail the request - usage tracking is not critical
      res.json({ success: true, message: 'Usage tracking error, but operation continued' });
    }
  });
  
  
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
        setCurrentUsername(latestEntry.username);
        console.log(`Initialized currentUsername to ${getCurrentUsername()} on server startup`);
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


// ============= GOAL MANAGEMENT ENDPOINTS =============

// Save goal endpoint - Schema: goal/<platform>/<username>/goal_*.json
router.post(['/save-goal/:username', '/api/save-goal/:username'], async (req, res) => {
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
  router.options(['/save-goal/:username', '/api/save-goal/:username'], (req, res) => {
    setCorsHeaders(res);
    res.status(204).send();
  });
  
  // Goal summary retrieval endpoint - Schema: goal_summary/<platform>/<username>/summary_*.json
  router.get(['/goal-summary/:username', '/api/goal-summary/:username'], async (req, res) => {
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
  router.options(['/goal-summary/:username', '/api/goal-summary/:username'], (req, res) => {
    setCorsHeaders(res);
    res.status(204).send();
  });
  
  // Campaign ready posts count endpoint - Schema: tasks/ready_post/<platform>/<username>/campaign_ready_post_*.json
  router.get(['/campaign-posts-count/:username', '/api/campaign-posts-count/:username'], async (req, res) => {
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
  router.options(['/campaign-posts-count/:username', '/api/campaign-posts-count/:username'], (req, res) => {
    setCorsHeaders(res);
    res.status(204).send();
  });
  
  // Engagement metrics endpoint (placeholder for platform-specific engagement)
  router.get(['/engagement-metrics/:username', '/api/engagement-metrics/:username'], async (req, res) => {
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
  router.options(['/engagement-metrics/:username', '/api/engagement-metrics/:username'], (req, res) => {
    setCorsHeaders(res);
    res.status(204).send();
  });
  
  // Generated content summary endpoint - Schema: tasks/generated_content/<platform>/<username>/posts.json
  router.get(['/generated-content-summary/:username', '/api/generated-content-summary/:username'], async (req, res) => {
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
  router.options(['/generated-content-summary/:username', '/api/generated-content-summary/:username'], (req, res) => {
    setCorsHeaders(res);
    res.status(204).send();
  });
  
  // Campaign status check endpoint - Check if user has an active campaign
  router.get(['/campaign-status/:username', '/api/campaign-status/:username'], async (req, res) => {
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
  router.options(['/campaign-status/:username', '/api/campaign-status/:username'], (req, res) => {
    setCorsHeaders(res);
    res.status(204).send();
  });
  
  // Stop campaign endpoint - Delete all campaign-related files
  router.delete(['/stop-campaign/:username', '/api/stop-campaign/:username'], async (req, res) => {
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
        `goal/${platform}/${username}`,
        `goal_summary/${platform}/${username}`,
        `ready_post/${platform}/${username}`
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
  
      // Verify campaign is truly stopped by checking campaign status
      const goalPrefix = `goal/${platform}/${username}`;
      const verifyCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: `${goalPrefix}/`
      });
      
      const verifyData = await s3Client.send(verifyCommand);
      const stillHasGoalFiles = verifyData.Contents && verifyData.Contents.length > 0;
      
      if (stillHasGoalFiles) {
        console.error(`[${new Date().toISOString()}] Warning: Campaign files still exist after deletion attempt for ${username} on ${platform}`);
        // Try one more time to delete any remaining files
        for (const object of verifyData.Contents) {
          if (object.Key) {
            try {
              const deleteCommand = new DeleteObjectCommand({
                Bucket: 'tasks',
                Key: object.Key
              });
              await s3Client.send(deleteCommand);
              deletedFiles.push(object.Key);
              console.log(`[${new Date().toISOString()}] Retry deleted: ${object.Key}`);
            } catch (retryError) {
              console.error(`[${new Date().toISOString()}] Error in retry deletion of ${object.Key}:`, retryError);
            }
          }
        }
      }
  
      console.log(`[${new Date().toISOString()}] Campaign deletion completed for ${username} on ${platform}. Deleted ${deletedFiles.length} files, ${deletionErrors.length} errors.`);
  
      // Clear any cached status data - skip cache operations if memoryCache is not defined
      try {
        if (typeof memoryCache !== 'undefined') {
          const cacheKey = `campaign-status:${platform}:${username}`;
          if (memoryCache.has(cacheKey)) {
            console.log(`[${new Date().toISOString()}] Clearing cached campaign status for ${username} on ${platform}`);
            memoryCache.del(cacheKey);
          }
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
        hasActiveCampaign: false
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
  router.options(['/stop-campaign/:username', '/api/stop-campaign/:username'], (req, res) => {
    setCorsHeaders(res);
    res.status(204).send();
  });
  
  // Get timeline from generated content endpoint
  router.get(['/generated-content-timeline/:username', '/api/generated-content-timeline/:username'], async (req, res) => {
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
  router.options(['/generated-content-timeline/:username', '/api/generated-content-timeline/:username'], (req, res) => {
    setCorsHeaders(res);
    res.status(204).send();
  });
  
  // ============= END GOAL MANAGEMENT ENDPOINTS =============
  
  // Profit Analysis endpoint - Schema: tasks/prophet_analysis/<platform>/<username>/analysis_*.json
  router.get(['/profit-analysis/:username', '/api/profit-analysis/:username'], async (req, res) => {
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
  router.get(['/api/signed-image-url/:username/:imageKey', '/signed-image-url/:username/:imageKey'], async (req, res) => {
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
  router.options(['/api/signed-image-url/:username/:imageKey', '/signed-image-url/:username/:imageKey'], (req, res) => {
    setCorsHeaders(res);
    res.status(204).send();
  });
  
  // ... existing code ...
  
  // Add the API endpoint for update-post-status
  router.post(['/api/update-post-status/:username', '/update-post-status/:username'], async (req, res) => {
    const { username } = req.params;
    const { postKey, status, like, dislike, userComment } = req.body;
  
    if (!username || !postKey) {
      return res.status(400).json({ error: 'Username and postKey are required' });
    }
  
    // Validate status if provided
    const allowedStatuses = ['pending', 'scheduled', 'posted', 'rejected', 'failed', 'published'];
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
  router.options(['/api/update-post-status/:username', '/update-post-status/:username'], (req, res) => {
    setCorsHeaders(res);
    res.status(204).send();
  });
  
  // Proxy image requests to avoid CORS issues
  router.get(['/api/proxy-image', '/proxy-image'], async (req, res) => {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }
  
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s
    const TIMEOUT = 10000; // 10 seconds
    
    let lastError = null;
    
    // Retry loop with exponential backoff
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[Proxy] Attempt ${attempt + 1}/${MAX_RETRIES + 1} for: ${url}`);
        
        const imageResponse = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: TIMEOUT,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/*,*/*;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          validateStatus: (status) => status >= 200 && status < 400
        });
        
        // Success! Set headers and send image
        const contentType = imageResponse.headers['content-type'] || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Proxy-Attempts', attempt + 1);
        
        // Send the image data
        res.send(Buffer.from(imageResponse.data));
        
        console.log(`[Proxy] SUCCESS on attempt ${attempt + 1} for: ${url}`);
        return; // Exit successfully
        
      } catch (error) {
        lastError = error;
        console.warn(`[Proxy] Attempt ${attempt + 1} failed:`, error?.response?.status || error?.message);
        
        // Don't retry on 4xx errors (client errors)
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          console.log(`[Proxy] Client error (${error.response.status}), not retrying`);
          break;
        }
        
        // If this isn't the last attempt, wait before retry
        if (attempt < MAX_RETRIES) {
          console.log(`[Proxy] Waiting ${RETRY_DELAYS[attempt]}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
        }
      }
    }
    
    // All retries failed
    console.error(`[Proxy] All ${MAX_RETRIES + 1} attempts failed for: ${url}`, lastError?.message);
    res.status(500).json({ error: 'Failed to proxy image after retries' });
  });
  
  // Add OPTIONS handler for proxy-image endpoint
  router.options(['/api/proxy-image', '/proxy-image'], (req, res) => {
    setCorsHeaders(res);
    res.status(204).send();
  });
  
  // Robust R2 Image Renderer - handles JPG images seamlessly from Cloudflare R2
  router.get(['/api/r2-image/:username/:imageKey', '/r2-image/:username/:imageKey'], async (req, res) => {
    const { username, imageKey } = req.params;
    const platform = req.query.platform || 'instagram';
    
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [500, 1000, 2000]; // Faster retries for R2: 0.5s, 1s, 2s
    const r2Key = `ready_post/${platform}/${username}/${imageKey}`;
    
    let lastError = null;
    
    // Retry loop with exponential backoff for R2 fetching
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[R2-IMAGE] Attempt ${attempt + 1}/${MAX_RETRIES + 1} for: ${r2Key}`);
        
        // Get the object from R2 with timeout
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: r2Key,
      });
      
      const response = await s3Client.send(getCommand);
      
      if (!response.Body) {
          console.log(`[R2-IMAGE] No body in response for: ${r2Key}`);
        return res.status(404).json({ error: 'Image not found' });
      }
      
        // Convert stream to buffer
        const imageBuffer = await streamToBuffer(response.Body);
        
        if (!imageBuffer || imageBuffer.length === 0) {
          console.log(`[R2-IMAGE] Empty buffer for: ${r2Key}`);
          return res.status(404).json({ error: 'Empty image data' });
        }
        
        // Success! Set appropriate headers for JPG images
      res.setHeader('Content-Type', response.ContentType || 'image/jpeg');
        res.setHeader('Content-Length', imageBuffer.length);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        res.setHeader('ETag', response.ETag || `"${imageKey}-${Date.now()}"`);
        res.setHeader('Last-Modified', response.LastModified?.toUTCString() || new Date().toUTCString());
        res.setHeader('X-R2-Attempts', attempt + 1); // Debug header
        
        // Enable CORS for cross-origin requests
        setCorsHeaders(res);
        
        // Send the image buffer directly
        res.send(imageBuffer);
        
        console.log(`[R2-IMAGE] SUCCESS on attempt ${attempt + 1}: ${r2Key} (${imageBuffer.length} bytes)`);
        return; // Exit successfully
      
    } catch (error) {
        lastError = error;
        console.warn(`[R2-IMAGE] Attempt ${attempt + 1} failed for ${r2Key}:`, error?.name || error?.message);
      
        // Don't retry on 404/NoSuchKey errors
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
          console.log(`[R2-IMAGE] Image not found: ${r2Key}, not retrying`);
          return res.status(404).json({ error: 'Image not found in R2 storage' });
        }
        
        // If this isn't the last attempt, wait before retry
        if (attempt < MAX_RETRIES) {
          console.log(`[R2-IMAGE] Waiting ${RETRY_DELAYS[attempt]}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
        }
      }
    }
    
    // All retries failed
    console.error(`[R2-IMAGE] All ${MAX_RETRIES + 1} attempts failed for: ${r2Key}`, lastError?.message);
    res.status(500).json({ 
      error: 'Failed to retrieve image from R2 storage after retries',
      attempts: MAX_RETRIES + 1,
      lastError: lastError?.message 
    });
  });
  
  // Enhanced signed URL generator with R2 optimization
  router.get(['/api/signed-image-url/:username/:imageKey', '/signed-image-url/:username/:imageKey'], async (req, res) => {
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
  router.options(['/api/r2-image/:username/:imageKey', '/r2-image/:username/:imageKey'], (req, res) => {
    setCorsHeaders(res);
    res.status(204).send();
  });
  
  // NEW CLEAN R2 IMAGE ROUTE - BYPASSES CORRUPTION
  router.get(['/api/clean-image/:username/:imageKey', '/clean-image/:username/:imageKey'], async (req, res) => {
    const { username, imageKey } = req.params;
    const platform = req.query.platform || 'instagram';
    const r2Key = `ready_post/${platform}/${username}/${imageKey}`;
    
    try {
      console.log(`[CLEAN-IMAGE] Direct fetch: ${r2Key}`);
      
      // Direct fetch from R2 without any validation, caching, or processing
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: r2Key,
      });
      
      const response = await s3Client.send(getCommand);
      
      if (!response.Body) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      // Set headers and pipe directly
      res.setHeader('Content-Type', response.ContentType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Source', 'clean-direct');
      
      // Stream directly without any buffer conversion that could corrupt the data
      response.Body.pipe(res);
      
      console.log(`[CLEAN-IMAGE] ✅ Streaming complete: ${r2Key}`);
      
    } catch (error) {
      console.error(`[CLEAN-IMAGE] Error: ${r2Key}:`, error.message);
      
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      return res.status(500).json({ error: 'Failed to retrieve image' });
    }
  });
  
  // HEAD handler for R2 image endpoint (for testing accessibility)
  router.head(['/api/r2-image/:username/:imageKey', '/r2-image/:username/:imageKey'], async (req, res) => {
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
  
  // Fix-Image endpoint for local file serving (matching main server behavior)
  router.get('/fix-image/:username/:filename', async (req, res) => {
    const { username, filename } = req.params;
    const platform = req.query.platform || 'instagram';
    
    try {
      console.log(`[FIX-IMAGE-PROXY] Request for ${username}/${filename} (platform: ${platform})`);
      
      // Construct the local file path
      const localPath = path.join(process.cwd(), 'ready_post', platform, username, filename);
      
      // Check if file exists
      if (!fs.existsSync(localPath)) {
        console.log(`[FIX-IMAGE-PROXY] File not found: ${localPath}`);
        return res.status(404).json({ error: 'Image not found' });
      }
      
      // Read the file as binary data
      const imageData = fs.readFileSync(localPath);
      
      // Validate that we got a proper Buffer
      if (!Buffer.isBuffer(imageData)) {
        console.error(`[FIX-IMAGE-PROXY] Invalid file data type for ${localPath}`);
        return res.status(500).json({ error: 'Invalid image data' });
      }
      
      // Validate image data integrity
      if (!validateImageBuffer(imageData)) {
        console.error(`[FIX-IMAGE-PROXY] Invalid image format for ${localPath}`);
        return res.status(500).json({ error: 'Invalid image format' });
      }
      
      console.log(`[FIX-IMAGE-PROXY] Serving ${localPath} (${imageData.length} bytes)`);
      console.log(`[FIX-IMAGE-PROXY] First 12 bytes:`, Array.from(imageData.slice(0, 12)).map(b => b.toString(16).padStart(2, '0')).join(' '));
      
      // Detect content type from image data
      let contentType = 'image/jpeg'; // Default
      if (imageData.length > 12) {
        // Check for WebP signature (RIFF...WEBP)
        if (imageData[0] === 0x52 && imageData[1] === 0x49 && imageData[2] === 0x46 && imageData[3] === 0x46) {
          if (imageData.length > 12 && imageData[8] === 0x57 && imageData[9] === 0x45 && imageData[10] === 0x42 && imageData[11] === 0x50) {
            contentType = 'image/webp';
          }
        }
        // Check for JPEG signature (FF D8 FF)
        else if (imageData[0] === 0xFF && imageData[1] === 0xD8 && imageData[2] === 0xFF) {
          contentType = 'image/jpeg';
        }
        // Check for PNG signature (89 50 4E 47)
        else if (imageData[0] === 0x89 && imageData[1] === 0x50 && imageData[2] === 0x4E && imageData[3] === 0x47) {
          contentType = 'image/png';
        }
        // Check for GIF signature
        else if (imageData[0] === 0x47 && imageData[1] === 0x49 && imageData[2] === 0x46) {
          contentType = 'image/gif';
        }
        // Check for BMP signature
        else if (imageData[0] === 0x42 && imageData[1] === 0x4D) {
          contentType = 'image/bmp';
        }
      }
      
      // Set proper headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', imageData.length);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-Image-Source', 'local-file');
      
      // Enable CORS
      setCorsHeaders(res);
      
      // Send the binary data directly
      res.send(imageData);
      
      console.log(`[FIX-IMAGE-PROXY] ✅ Successfully served ${filename}`);
      
    } catch (error) {
      console.error(`[FIX-IMAGE-PROXY] Error serving ${username}/${filename}:`, error);
      res.status(500).json({ error: 'Failed to serve image' });
    }
  });
  // Enhance event streaming with reconnection support and event persistence for missed updates
  router.get(['/events-missed/:username', '/api/events-missed/:username'], async (req, res) => {
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
  router.get(['/api/system/cache-stats', '/system/cache-stats'], (req, res) => {
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
  router.get(['/events/:username', '/api/events/:username'], (req, res) => {
    const { username } = req.params;
    const { since } = req.query;
    
    // Normalize username according to platform rules (e.g., lowercase for Instagram)
    const normalizedUsername = PlatformSchemaManager.getPlatformConfig('instagram').normalizeUsername(username);
    
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
    
    console.log(`[${new Date().toISOString()}] Handling SSE request for /events/${normalizedUsername} (reconnect since: ${sinceTimestamp || 'new connection'})`);
  
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
      message: `Connected to events for ${normalizedUsername}`,
      timestamp: Date.now(),
      connectionId
    };
    
    res.write(`data: ${JSON.stringify(initialEvent)}\n\n`);
    
    // Register this client
    if (!sseClients.has(normalizedUsername)) {
      sseClients.set(normalizedUsername, []);
    }
    
    const clients = sseClients.get(normalizedUsername);
    clients.push(res);
    activeConnections.set(res, Date.now());
    
    console.log(`[${new Date().toISOString()}] SSE client connected for ${normalizedUsername}. Total clients: ${clients.length}`);
  
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

// Export the router
export default router;